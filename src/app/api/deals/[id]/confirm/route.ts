import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { reservationId } = body

    if (!reservationId) {
      return NextResponse.json(
        { success: false, error: 'Reservation ID is required' },
        { status: 400 }
      )
    }

    // CRITICAL FIX (race condition): atomic conditional update on the
    // reservation row. We only confirm if ALL of the following hold at the
    // moment of the update:
    //   - id matches reservationId
    //   - userId matches the authenticated user (prevents IDOR)
    //   - dealId matches the route param (prevents mismatched reservations)
    //   - status is still 'pending' (prevents double-confirm)
    //   - expiresAt is still in the future (prevents confirming expired)
    // We join the Deal (+ Vendor) in the SAME query so the deal snapshot used
    // for order creation comes from the atomic row — no separate fetch, no
    // TOCTOU window between reading the deal and confirming the reservation.
    // If any predicate fails, 0 rows are affected and we fall through to the
    // granular error branch below.
    const claimRes = await supabase
      .from('Reservation')
      .update({ status: 'confirmed' })
      .eq('id', reservationId)
      .eq('status', 'pending')
      .eq('userId', authUser.userId)
      .eq('dealId', id)
      .gt('expiresAt', new Date().toISOString())
      .select('*, deal:Deal(*, vendor:Vendor(*))')
      .single()

    if (claimRes.error || !claimRes.data) {
      // Distinguish "not found" vs "already confirmed" vs "expired" vs "not
      // owned / wrong deal" so the client can surface a useful error instead
      // of a generic 409 for every failure mode.
      const existing = await supabase
        .from('Reservation')
        .select('id, status, expiresAt')
        .eq('id', reservationId)
        .maybeSingle()
      if (!existing.data) {
        return NextResponse.json(
          { success: false, error: 'Reservation not found' },
          { status: 404 }
        )
      }
      if (existing.data.status !== 'pending') {
        return NextResponse.json(
          { success: false, error: 'Reservation already confirmed or expired' },
          { status: 409 }
        )
      }
      // TZ-safe parse: Supabase returns TIMESTAMP WITHOUT TZ as a naive
      // datetime string (no 'Z'). Without appending 'Z', `new Date()` would
      // parse it as LOCAL server time — which on a UTC+8 server would make
      // the comparison wrong by 8 hours.
      const expiresAtStr = existing.data.expiresAt as string
      const expiresAtDate = expiresAtStr && !/[Zz]$|[+-]\d{2}:?\d{2}$/.test(expiresAtStr.trim())
        ? new Date(expiresAtStr + 'Z')
        : new Date(expiresAtStr)
      if (expiresAtDate <= new Date()) {
        return NextResponse.json(
          { success: false, error: 'Reservation has expired' },
          { status: 410 }
        )
      }
      // Row exists, is pending, and is not expired — the only remaining reason
      // for 0 rows affected is ownership/dealId mismatch (IDOR attempt) or a
      // hard DB error. Either way, do NOT leak which — return a generic 409.
      return NextResponse.json(
        { success: false, error: 'Reservation could not be confirmed' },
        { status: 409 }
      )
    }
    const reservation = claimRes.data
    const deal = reservation.deal

    // TODO: SECURITY — prices should be snapshotted on the Reservation at claim time,
    // not re-read from the Deal at confirm time. A vendor can change the price between
    // claim and confirm (5-min window). See audit finding HIGH-5.
    // (Requires a schema migration to add dealPrice + originalPrice columns to
    // Reservation; intentionally not done in this pass.)

    // Generate order ID and number
    const orderId = genId('order')
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    const orderNumber = `FB-${timestamp}-${random}`
    // CRITICAL FIX (LOW 4): qrCode was previously the orderId (predictable).
    // Use a long random token so external scanners cannot enumerate orders.
    const qrCode = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')

    // Task 2: use the foodie-selected pickup deadline from the Reservation
    // (chosen at claim time). Fall back to now + 2h for legacy reservations
    // that don't have a pickupDeadline column populated.
    const reservationPickup = (reservation as { pickupDeadline?: string | null }).pickupDeadline
    const pickupDeadline = reservationPickup
      ? new Date(reservationPickup)
      : new Date(Date.now() + 2 * 60 * 60 * 1000)

    // Sequential operations (Supabase REST API doesn't support transactions)
    // 1. Create order
    const newOrder = unwrap(
      await supabase.from('Order').insert({
        id: orderId,
        orderNumber,
        userId: authUser.userId,
        vendorId: deal.vendorId,
        dealId: deal.id,
        quantity: reservation.quantity,
        originalPrice: deal.originalPrice,
        dealPrice: deal.dealPrice,
        totalPrice: deal.dealPrice * reservation.quantity,
        status: 'pending_pickup',
        qrCode,
        pickupDeadline: pickupDeadline.toISOString(),
      }).select().single(),
      'Create order'
    )

    // 2. Update deal: soldQuantity++, reservedQuantity-- + check sold out
    const newSoldQuantity = deal.soldQuantity + reservation.quantity
    const newReservedQuantity = deal.reservedQuantity - reservation.quantity
    const remainingAvailable = deal.totalQuantity - newSoldQuantity - newReservedQuantity

    const dealUpdateData: Record<string, unknown> = {
      soldQuantity: newSoldQuantity,
      reservedQuantity: Math.max(0, newReservedQuantity),
    }

    // Check if sold out after this order
    if (remainingAvailable <= 0) {
      dealUpdateData.status = 'sold_out'
      dealUpdateData.availableQuantity = 0
    } else {
      dealUpdateData.availableQuantity = remainingAvailable
    }

    await supabase.from('Deal').update(dealUpdateData).eq('id', deal.id)

    // 3. Create notification
    // Issue 4: do NOT format the pickup time in the message — the server runs
    // in UTC so toLocaleTimeString() would show UTC time (8 hours off for
    // Malaysia). Instead, store the pickupDeadline ISO in the `data` JSON and
    // let the client (NotificationBell) format it in the viewer's local
    // timezone when displaying the notification. The message now just says
    // "is confirmed" without a time, since the order-id card already shows
    // the correctly-formatted pickup time.
    await supabase.from('Notification').insert({
      id: genId('notif'),
      userId: authUser.userId,
      type: 'claim_confirmed',
      title: 'Order Confirmed!',
      message: `Your order for "${deal.title}" from ${deal.vendor.businessName} is confirmed. Tap to view your pickup time.`,
      data: JSON.stringify({
        orderId: newOrder.id,
        dealId: deal.id,
        vendorId: deal.vendorId,
        pickupDeadline: pickupDeadline.toISOString(),
      }),
    })

    return NextResponse.json({
      success: true,
      data: {
        order: newOrder,
        qrCode,
        pickupDeadline: pickupDeadline.toISOString(),
        dealTitle: deal.title,
        vendorName: deal.vendor.businessName,
        vendorAddress: deal.vendor.address,
      },
    }, { status: 201 })
  } catch (error) {
    // Check if it's a "not found" error from Supabase (PGRST116)
    if (error && typeof error === 'object' && 'message' in error && String(error.message).includes('0 rows')) {
      return NextResponse.json(
        { success: false, error: 'Reservation not found' },
        { status: 404 }
      )
    }
    console.error('Confirm reservation error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
