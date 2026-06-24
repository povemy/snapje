import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'
import { reservationManager } from '@/lib/reservation'
import { rateLimiter } from '@/lib/cache'

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

    // Parse quantity + pickupDeadline from request body.
    // Task 2: foodie selects the pickup time when claiming. The pickupDeadline
    // is validated here (min 10 min from now, max = deal.expiresAt) and stored
    // on the Reservation row. The confirm endpoint copies it onto the Order.
    const body = await request.json().catch(() => ({} as { quantity?: number; pickupDeadline?: string }))
    const quantity = Math.max(1, Math.min(Math.floor(body.quantity || 1), 99))

    // ── Validate foodie-selected pickupDeadline ──
    // Min: 10 minutes from now (gives the vendor time to prepare).
    // Max: the deal's own expiry (can't pick up after the deal ends).
    // If not provided, fall back to now + 2h (legacy behavior) so older
    // clients don't break.
    const MIN_PICKUP_MS = 10 * 60 * 1000 // 10 minutes
    let pickupDeadlineIso: string | null = null
    if (typeof body.pickupDeadline === 'string' && body.pickupDeadline.trim()) {
      const ts = new Date(body.pickupDeadline).getTime()
      if (isNaN(ts)) {
        return NextResponse.json(
          { success: false, error: 'Invalid pickup time' },
          { status: 400 }
        )
      }
      const nowMs = Date.now()
      if (ts - nowMs < MIN_PICKUP_MS) {
        return NextResponse.json(
          { success: false, error: 'Pickup time must be at least 10 minutes from now' },
          { status: 400 }
        )
      }
      pickupDeadlineIso = new Date(body.pickupDeadline).toISOString()
    }

    // Rate limit per user
    if (!rateLimiter.check(`claim:${authUser.userId}`, 10, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many claim attempts. Please slow down.' },
        { status: 429 }
      )
    }

    // Find the deal with vendor
    const deal = unwrap(
      await supabase
        .from('Deal')
        .select('*, vendor:Vendor(*)')
        .eq('id', id)
        .single(),
      'Find deal for claim'
    )

    // Check deal status
    if (deal.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'This deal is no longer active' },
        { status: 400 }
      )
    }

    // Check if expired
    if (new Date(deal.expiresAt + 'Z') <= new Date()) {
      // Update deal status to expired
      await supabase.from('Deal').update({ status: 'expired' }).eq('id', id)
      return NextResponse.json(
        { success: false, error: 'This deal has expired' },
        { status: 400 }
      )
    }

    // Task 2: pickupDeadline cannot be later than the deal's own expiry.
    const dealExpiresMs = new Date(deal.expiresAt + 'Z').getTime()
    if (pickupDeadlineIso && new Date(pickupDeadlineIso).getTime() > dealExpiresMs) {
      return NextResponse.json(
        { success: false, error: 'Pickup time cannot be later than the deal expiry time' },
        { status: 400 }
      )
    }

    // Check public access time
    if (deal.publicAccessAt && new Date(deal.publicAccessAt + 'Z') > new Date()) {
      return NextResponse.json(
        { success: false, error: 'This deal is not yet available' },
        { status: 400 }
      )
    }

    // Check available quantity
    if (deal.availableQuantity <= 0) {
      // Update deal status to sold_out
      await supabase.from('Deal').update({ status: 'sold_out' }).eq('id', id)
      return NextResponse.json(
        { success: false, error: 'This deal is sold out' },
        { status: 400 }
      )
    }

    // Validate requested quantity against available stock
    if (quantity > deal.availableQuantity) {
      return NextResponse.json(
        { success: false, error: `Only ${deal.availableQuantity} left in stock` },
        { status: 400 }
      )
    }

    // Validate requested quantity against per-user max
    if (quantity > deal.maxClaimsPerUser) {
      return NextResponse.json(
        { success: false, error: `Maximum ${deal.maxClaimsPerUser} per user` },
        { status: 400 }
      )
    }

    // *** FIX: Clean up any expired pending reservations for this user+deal ***
    // This prevents stale reservations from blocking new claims
    const now = new Date().toISOString()
    const { data: expiredReservations } = await supabase
      .from('Reservation')
      .select('id, quantity')
      .eq('dealId', id)
      .eq('userId', authUser.userId)
      .eq('status', 'pending')
      .lt('expiresAt', now)

    if (expiredReservations && expiredReservations.length > 0) {
      // Mark them as expired
      const expiredIds = expiredReservations.map((r: { id: string }) => r.id)
      await supabase
        .from('Reservation')
        .update({ status: 'expired' })
        .in('id', expiredIds)

      // Return reserved quantities back to available
      const totalExpiredQty = expiredReservations.reduce((sum: number, r: { quantity: number }) => sum + r.quantity, 0)
      if (totalExpiredQty > 0) {
        const currentDeal = unwrap(
          await supabase.from('Deal').select('reservedQuantity, availableQuantity').eq('id', id).single(),
          'Fetch deal for expired reservation cleanup'
        )
        await supabase.from('Deal').update({
          reservedQuantity: Math.max(0, currentDeal.reservedQuantity - totalExpiredQty),
          availableQuantity: currentDeal.availableQuantity + totalExpiredQty,
        }).eq('id', id)
      }
    }

    // Run these checks in parallel to reduce latency
    const [existingReservationResponse, userClaimsCountResponse] = await Promise.all([
      // Check if user already has a pending reservation for this deal (non-expired)
      supabase
        .from('Reservation')
        .select('*')
        .eq('dealId', id)
        .eq('userId', authUser.userId)
        .eq('status', 'pending')
        .gt('expiresAt', now)
        .limit(1)
        .maybeSingle(),
      // Check user's total confirmed claims for this deal
      supabase
        .from('Reservation')
        .select('*', { count: 'exact', head: true })
        .eq('dealId', id)
        .eq('userId', authUser.userId)
        .in('status', ['pending', 'confirmed']),
    ])

    // existingReservation may return null if no rows found — that's the expected case
    const existingReservation = existingReservationResponse.error ? null : existingReservationResponse.data
    const userClaimsCount = userClaimsCountResponse.count ?? 0

    if (existingReservation) {
      return NextResponse.json(
        { success: false, error: 'You already have a pending reservation for this deal', data: { reservationId: existingReservation.id } },
        { status: 409 }
      )
    }

    if (userClaimsCount >= deal.maxClaimsPerUser) {
      return NextResponse.json(
        { success: false, error: `You can only claim this deal up to ${deal.maxClaimsPerUser} time(s)` },
        { status: 400 }
      )
    }

    // Acquire reservation lock
    const acquired = reservationManager.acquire(id, authUser.userId, quantity)
    if (!acquired) {
      return NextResponse.json(
        { success: false, error: 'This deal is currently being claimed by someone else. Please try again in a moment.' },
        { status: 409 }
      )
    }

    try {
      // Create reservation with 5-minute TTL
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

      const reservation = unwrap(
        await supabase.from('Reservation').insert({
          id: genId('res'),
          dealId: id,
          userId: authUser.userId,
          quantity: quantity,
          status: 'pending',
          expiresAt: expiresAt.toISOString(),
          // Task 2: persist the foodie-selected pickup time on the reservation
          // so the confirm endpoint can copy it onto the Order. Null for
          // backward-compat with older clients that don't send a pickup time.
          pickupDeadline: pickupDeadlineIso,
        }).select().single(),
        'Create reservation'
      )

      // Update deal quantities atomically
      // Fetch current values then update (Supabase REST API doesn't support atomic increment)
      const currentDeal = unwrap(
        await supabase.from('Deal').select('reservedQuantity, availableQuantity').eq('id', id).single(),
        'Fetch deal quantities for update'
      )

      await supabase.from('Deal').update({
        reservedQuantity: currentDeal.reservedQuantity + quantity,
        availableQuantity: currentDeal.availableQuantity - quantity,
      }).eq('id', id)

      // CRITICAL FIX: release the in-memory reservation lock on the success
      // path too — previously it was only released on DB error, leaking the
      // lock on every successful claim and eventually wedging all claims.
      reservationManager.release(id)

      return NextResponse.json({
        success: true,
        data: {
          reservation,
          dealTitle: deal.title,
          dealPrice: deal.dealPrice,
          quantity,
          totalPrice: deal.dealPrice * quantity,
          vendorName: deal.vendor.businessName,
          expiresAt: expiresAt.toISOString(),
          message: 'Deal claimed! You have 5 minutes to confirm your order.',
        },
      }, { status: 201 })
    } catch (dbError) {
      // Release lock on DB error
      reservationManager.release(id)
      throw dbError
    }
  } catch (error) {
    // Check if it's a "not found" error from Supabase (PGRST116)
    if (error && typeof error === 'object' && 'message' in error && String(error.message).includes('0 rows')) {
      return NextResponse.json(
        { success: false, error: 'Deal not found' },
        { status: 404 }
      )
    }
    console.error('Claim deal error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
