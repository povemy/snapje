import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, hasRole } from '@/lib/auth'

export async function GET(
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

    const order = await db.order.findUnique({
      where: { id },
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            description: true,
            imageUrl: true,
            category: true,
            pickupInstructions: true,
          },
        },
        vendor: {
          select: {
            id: true,
            businessName: true,
            address: true,
            logoUrl: true,
            coverImageUrl: true,
            latitude: true,
            longitude: true,
            contactPhone: true,
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    // Check ownership (user who placed order) or vendor who owns the deal or admin
    const isOrderOwner = order.userId === authUser.userId
    const isVendorOwner = order.vendor.userId === authUser.userId // This would need a join - let's check via vendor
    const isAdmin = hasRole(authUser.roles.join(','), 'admin')

    // For vendor check, we need to verify the vendor belongs to this user
    const vendor = await db.vendor.findUnique({ where: { id: order.vendorId } })
    const isActualVendorOwner = vendor?.userId === authUser.userId

    if (!isOrderOwner && !isActualVendorOwner && !isAdmin) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to view this order' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: order,
    })
  } catch (error) {
    console.error('Get order error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
