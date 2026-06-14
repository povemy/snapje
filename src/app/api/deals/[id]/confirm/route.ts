import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
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
    const reservation = await db.reservation.findUnique({
      where: { id: reservationId },
      include: {
        deal: {
          include: {
            vendor: true,
          },
        },
      },
    })

    if (!reservation) {
      return NextResponse.json(
        { success: false, error: 'Reservation not found' },
        { status: 404 }
      )
    }

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
    if (reservation.expiresAt < new Date()) {
      await db.reservation.update({
        where: { id: reservationId },
        data: { status: 'expired' },
      })
      // Return reserved quantity back to available
      await db.deal.update({
        where: { id: reservation.dealId },
        data: {
          reservedQuantity: { decrement: 1 },
          availableQuantity: { increment: 1 },
        },
      })
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

    const deal = reservation.deal

    // Generate QR code and order number
    const qrCode = crypto.randomUUID()
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    const orderNumber = `FB-${timestamp}-${random}`

    // Calculate pickup deadline (2 hours from now)
    const pickupDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000)

    // Use a transaction for atomic operations
    const order = await db.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
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
          pickupDeadline,
        },
      })

      // Update deal: soldQuantity++, reservedQuantity--
      await tx.deal.update({
        where: { id: deal.id },
        data: {
          soldQuantity: { increment: 1 },
          reservedQuantity: { decrement: 1 },
          // Check if sold out
          ...(deal.totalQuantity - deal.soldQuantity - deal.reservedQuantity + deal.reservedQuantity - 1 <= 0
            ? { status: 'sold_out' }
            : {}),
        },
      })

      // Update reservation status
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'confirmed' },
      })

      // Create notification
      await tx.notification.create({
        data: {
          userId: authUser.userId,
          type: 'claim_confirmed',
          title: 'Order Confirmed!',
          message: `Your order for "${deal.title}" from ${deal.vendor.businessName} is confirmed. Pick up before ${pickupDeadline.toLocaleTimeString()}.`,
          data: JSON.stringify({
            orderId: newOrder.id,
            dealId: deal.id,
            vendorId: deal.vendorId,
          }),
        },
      })

      return newOrder
    })

    return NextResponse.json({
      success: true,
      data: {
        order,
        qrCode,
        pickupDeadline: pickupDeadline.toISOString(),
        dealTitle: deal.title,
        vendorName: deal.vendor.businessName,
        vendorAddress: deal.vendor.address,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Confirm reservation error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
