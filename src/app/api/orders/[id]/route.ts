import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
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

    const orderRes = await supabase
      .from('Order')
      .select('*, deal:Deal(id, title, description, imageUrl, category, pickupInstructions), vendor:Vendor(id, businessName, address, logoUrl, coverImageUrl, latitude, longitude, contactPhone)')
      .eq('id', id)
      .single()

    if (orderRes.error || !orderRes.data) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    const order = orderRes.data

    // Check ownership (user who placed order) or vendor who owns the deal or admin
    const isOrderOwner = order.userId === authUser.userId
    const isAdmin = hasRole(authUser.roles.join(','), 'admin')

    // For vendor check, we need to verify the vendor belongs to this user
    const vendorRes = await supabase
      .from('Vendor')
      .select('*')
      .eq('id', order.vendorId)
      .single()

    const isActualVendorOwner = vendorRes.data?.userId === authUser.userId

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
