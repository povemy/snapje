import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, hasRole } from '@/lib/auth'

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

    // Must be a vendor or admin
    if (!hasRole(authUser.roles.join(','), 'vendor') && !hasRole(authUser.roles.join(','), 'admin')) {
      return NextResponse.json(
        { success: false, error: 'Only vendors can verify pickups' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { qrCode } = body

    if (!qrCode) {
      return NextResponse.json(
        { success: false, error: 'QR code is required' },
        { status: 400 }
      )
    }

    // Find the order by QR code
    const order = await db.order.findUnique({
      where: { qrCode },
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            vendorId: true,
          },
        },
        vendor: {
          select: {
            id: true,
            businessName: true,
            userId: true,
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR code. Order not found.' },
        { status: 404 }
      )
    }

    // Verify the order belongs to this vendor
    if (order.vendor.userId !== authUser.userId && !hasRole(authUser.roles.join(','), 'admin')) {
      return NextResponse.json(
        { success: false, error: 'This order does not belong to your vendor' },
        { status: 403 }
      )
    }

    // State machine: pending_pickup -> picked_up -> completed
    let newStatus: string
    let message: string

    if (order.status === 'pending_pickup') {
      newStatus = 'picked_up'
      message = 'Order picked up successfully! Waiting for completion confirmation.'
    } else if (order.status === 'picked_up') {
      newStatus = 'completed'
      message = 'Order completed successfully!'
    } else if (order.status === 'completed') {
      return NextResponse.json(
        { success: false, error: 'This order has already been completed' },
        { status: 400 }
      )
    } else if (order.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'This order has been cancelled' },
        { status: 400 }
      )
    } else if (order.status === 'expired') {
      return NextResponse.json(
        { success: false, error: 'This order has expired' },
        { status: 400 }
      )
    } else {
      return NextResponse.json(
        { success: false, error: `Unknown order status: ${order.status}` },
        { status: 400 }
      )
    }

    // Update order
    const updatedOrder = await db.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: newStatus,
          ...(newStatus === 'picked_up' ? { qrVerifiedAt: new Date() } : {}),
        },
      })

      // Create notification for the customer
      const notifType = newStatus === 'picked_up' ? 'pickup_reminder' : 'order_status_update'
      const notifTitle = newStatus === 'picked_up' ? 'Order Picked Up!' : 'Order Completed!'
      const notifMessage = newStatus === 'picked_up'
        ? `Your order "${order.deal.title}" has been picked up from ${order.vendor.businessName}.`
        : `Your order "${order.deal.title}" from ${order.vendor.businessName} has been completed. Enjoy your meal!`

      await tx.notification.create({
        data: {
          userId: order.userId,
          type: notifType,
          title: notifTitle,
          message: notifMessage,
          data: JSON.stringify({
            orderId: order.id,
            status: newStatus,
          }),
        },
      })

      // If completed, update vendor totalSales
      if (newStatus === 'completed') {
        await tx.vendor.update({
          where: { id: order.vendorId },
          data: { totalSales: { increment: 1 } },
        })
      }

      return updated
    })

    return NextResponse.json({
      success: true,
      data: {
        order: updatedOrder,
        message,
        previousStatus: order.status,
        newStatus,
      },
    })
  } catch (error) {
    console.error('Verify pickup error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
