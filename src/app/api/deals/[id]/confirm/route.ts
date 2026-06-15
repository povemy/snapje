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

    // Find the reservation
    const reservation = unwrap(
      await supabase
        .from('Reservation')
        .select('*')
        .eq('id', reservationId)
        .single(),
      'Find reservation'
    )

    // Verify reservation belongs to user
    if (reservation.userId !== authUser.userId) {
      return NextResponse.json(
        { success: false, error: 'This reservation does not belong to you' },
        { status: 403 }
      )
    }

    // Verify reservation is pending
    if (reservation.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Reservation is already ${reservation.status}` },
        { status: 400 }
      )
    }

    // Verify reservation hasn't expired
    if (new Date(reservation.expiresAt) < new Date()) {
      await supabase.from('Reservation').update({ status: 'expired' }).eq('id', reservationId)

      // Return reserved quantity back to available
      // Fetch current deal quantities
      const currentDeal = unwrap(
        await supabase.from('Deal').select('reservedQuantity, availableQuantity').eq('id', reservation.dealId).single(),
        'Fetch deal for expired reservation'
      )
      await supabase.from('Deal').update({
        reservedQuantity: currentDeal.reservedQuantity - 1,
        availableQuantity: currentDeal.availableQuantity + 1,
      }).eq('id', reservation.dealId)

      return NextResponse.json(
        { success: false, error: 'Your reservation has expired. Please claim the deal again.' },
        { status: 400 }
      )
    }

    // Verify the deal matches the route param
    if (reservation.dealId !== id) {
      return NextResponse.json(
        { success: false, error: 'Reservation does not match this deal' },
        { status: 400 }
      )
    }

    // Fetch deal with vendor
    const deal = unwrap(
      await supabase
        .from('Deal')
        .select('*, vendor:Vendor(*)')
        .eq('id', id)
        .single(),
      'Find deal for confirmation'
    )

    // Generate QR code and order number
    const qrCode = crypto.randomUUID()
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    const orderNumber = `FB-${timestamp}-${random}`

    // Calculate pickup deadline (2 hours from now)
    const pickupDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000)

    // Sequential operations (Supabase REST API doesn't support transactions)
    // 1. Create order
    const newOrder = unwrap(
      await supabase.from('Order').insert({
        id: genId('order'),
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
    const newSoldQuantity = deal.soldQuantity + 1
    const newReservedQuantity = deal.reservedQuantity - 1
    const remainingAvailable = deal.totalQuantity - newSoldQuantity - newReservedQuantity

    const dealUpdateData: Record<string, unknown> = {
      soldQuantity: newSoldQuantity,
      reservedQuantity: newReservedQuantity,
    }

    // Check if sold out after this order
    if (remainingAvailable <= 0) {
      dealUpdateData.status = 'sold_out'
    }

    await supabase.from('Deal').update(dealUpdateData).eq('id', deal.id)

    // 3. Update reservation status
    await supabase.from('Reservation').update({ status: 'confirmed' }).eq('id', reservationId)

    // 4. Create notification
    await supabase.from('Notification').insert({
      id: genId('notif'),
      userId: authUser.userId,
      type: 'claim_confirmed',
      title: 'Order Confirmed!',
      message: `Your order for "${deal.title}" from ${deal.vendor.businessName} is confirmed. Pick up before ${pickupDeadline.toLocaleTimeString()}.`,
      data: JSON.stringify({
        orderId: newOrder.id,
        dealId: deal.id,
        vendorId: deal.vendorId,
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
