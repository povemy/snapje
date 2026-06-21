import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
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

    // Find the order by QR code AND route id (LOW 1: previously the route `id`
    // was ignored, allowing the QR to match an order from a different URL).
    const orderRes = await supabase
      .from('Order')
      .select('*, deal:Deal(id, title, vendorId), vendor:Vendor(id, businessName, userId)')
      .eq('id', id)
      .eq('qrCode', qrCode)
      .single()

    if (orderRes.error || !orderRes.data) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR code. Order not found.' },
        { status: 404 }
      )
    }

    const order = orderRes.data

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

    // Sequential operations (replacing transaction)
    const now = new Date().toISOString()
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: now,
    }
    if (newStatus === 'picked_up') {
      updateData.qrVerifiedAt = now
    }

    // 1. Update order — ATOMIC conditional update (HIGH 1 + LOW 3).
    // Only the expected previous status will match, so two concurrent scans
    // cannot both transition the same order. We also strip the qrCode from the
    // returned row (LOW 3) so the response doesn't leak the secret.
    const atomicUpdate = await supabase
      .from('Order')
      .update(updateData)
      .eq('id', order.id)
      .eq('status', order.status)
      .select()
      .single()

    if (atomicUpdate.error || !atomicUpdate.data) {
      // 0 rows affected → another request already moved the status, or the
      // row was deleted. Treat as a conflict.
      return NextResponse.json(
        { success: false, error: 'Order status could not be updated (it may have already changed). Please rescan.' },
        { status: 409 }
      )
    }
    const updatedOrder = atomicUpdate.data
    // LOW 3: strip qrCode from the response so a compromised vendor client
    // cannot reuse the captured token for a replay attack.
    if (updatedOrder && typeof updatedOrder === 'object' && 'qrCode' in updatedOrder) {
      delete (updatedOrder as Record<string, unknown>).qrCode
    }

    // 2. Create notification for the customer
    const notifType = newStatus === 'picked_up' ? 'pickup_reminder' : 'order_status_update'
    const notifTitle = newStatus === 'picked_up' ? 'Order Picked Up!' : 'Order Completed!'
    const notifMessage = newStatus === 'picked_up'
      ? `Your order "${order.deal.title}" has been picked up from ${order.vendor.businessName}.`
      : `Your order "${order.deal.title}" from ${order.vendor.businessName} has been completed. Enjoy your meal!`

    unwrap(
      await supabase
        .from('Notification')
        .insert({
          id: genId('notif'),
          userId: order.userId,
          type: notifType,
          title: notifTitle,
          message: notifMessage,
          data: JSON.stringify({
            orderId: order.id,
            status: newStatus,
          }),
        }),
      'Create notification'
    )

    // 3. If completed, update vendor totalSales
    if (newStatus === 'completed') {
      const vendorRes = await supabase
        .from('Vendor')
        .select('totalSales')
        .eq('id', order.vendorId)
        .single()

      const currentSales = vendorRes.data?.totalSales ?? 0
      unwrap(
        await supabase
          .from('Vendor')
          .update({ totalSales: currentSales + 1 })
          .eq('id', order.vendorId),
        'Update vendor totalSales'
      )
    }

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
