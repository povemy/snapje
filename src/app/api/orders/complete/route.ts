import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'
import { rateLimiter } from '@/lib/cache'

/**
 * POST /api/orders/complete
 * 
 * Completes an order after vendor scans the QR code and confirms.
 * 
 * Security & Race Condition Protections:
 * 1. Rate limited (5 completions/min per vendor)
 * 2. Auth required with vendor or admin role
 * 3. Ownership verification — order must belong to vendor's store
 * 4. Atomic status check — uses Supabase .eq('status', 'pending_pickup') 
 *    as a conditional update (optimistic lock). If status already changed
 *    by a concurrent request, the update matches 0 rows and we reject.
 * 5. Double-check after update — verifies the update actually applied
 * 6. Creates notification AFTER successful update only
 * 7. Updates vendor totalSales AFTER successful completion only
 */
export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    if (!hasRole(authUser.roles.join(','), 'vendor') && !hasRole(authUser.roles.join(','), 'admin')) {
      return NextResponse.json(
        { success: false, error: 'Only vendors can complete orders' },
        { status: 403 }
      )
    }

    // Strict rate limit for completion (prevent rapid retries)
    if (!rateLimiter.check(`complete:${authUser.userId}`, 5, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many completion attempts. Please wait.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { orderId } = body

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Order ID is required' },
        { status: 400 }
      )
    }

    // Step 1: Find the order and verify it exists
    const orderRes = await supabase
      .from('Order')
      .select('*, vendor:Vendor(id, businessName, userId, address), deal:Deal(id, title)')
      .eq('id', orderId)
      .maybeSingle()

    if (orderRes.error) {
      console.error('Complete order - lookup error:', orderRes.error.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!orderRes.data) {
      return NextResponse.json(
        { success: false, error: 'Order not found.' },
        { status: 404 }
      )
    }

    const order = orderRes.data

    // Step 2: Verify ownership
    const isAdmin = hasRole(authUser.roles.join(','), 'admin')
    if (!isAdmin && order.vendor.userId !== authUser.userId) {
      return NextResponse.json(
        { success: false, error: 'This order does not belong to your store.' },
        { status: 403 }
      )
    }

    // Step 3: Reject already-completed orders BEFORE attempting update
    if (order.status === 'completed') {
      return NextResponse.json(
        { success: false, error: 'This order has already been completed. Duplicate redemption is not allowed.' },
        { status: 400 }
      )
    }

    if (order.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'This order has been cancelled.' },
        { status: 400 }
      )
    }

    if (order.status === 'expired') {
      return NextResponse.json(
        { success: false, error: 'This order has expired.' },
        { status: 400 }
      )
    }

    // Only allow completing orders that are pending_pickup or picked_up
    if (order.status !== 'pending_pickup' && order.status !== 'picked_up') {
      return NextResponse.json(
        { success: false, error: `Cannot complete order with status: ${order.status}` },
        { status: 400 }
      )
    }

    // Step 4: ATOMIC CONDITIONAL UPDATE — this is the race condition guard
    // We update ONLY if status is still the expected value.
    // If another request already changed it, this update will match 0 rows.
    const now = new Date().toISOString()
    const updateRes = await supabase
      .from('Order')
      .update({
        status: 'completed',
        qrVerifiedAt: now,
        updatedAt: now,
      })
      .eq('id', orderId)
      .in('status', ['pending_pickup', 'picked_up'])  // Conditional: only if not already completed
      .select()
      .single()

    // If the update matched 0 rows, another request beat us to it
    if (updateRes.error) {
      // PGRST116 = 0 rows returned = another request already completed it
      if (updateRes.error.code === 'PGRST116' || updateRes.error.message.includes('0 rows') || updateRes.error.message.includes('single')) {
        // Double-check: fetch the order again to confirm
        const checkRes = await supabase
          .from('Order')
          .select('status')
          .eq('id', orderId)
          .maybeSingle()

        if (checkRes.data?.status === 'completed') {
          return NextResponse.json(
            { success: false, error: 'This order has already been completed by another action. Duplicate redemption prevented.' },
            { status: 409 }
          )
        }
      }
      console.error('Complete order - update error:', updateRes.error.message)
      return NextResponse.json(
        { success: false, error: 'Failed to complete order. It may have been processed already.' },
        { status: 500 }
      )
    }

    // Step 5: Verify the update actually applied
    if (updateRes.data.status !== 'completed') {
      console.error('Complete order - status not updated:', updateRes.data.status)
      return NextResponse.json(
        { success: false, error: 'Failed to complete order. Please try again.' },
        { status: 500 }
      )
    }

    // Step 6: Post-completion side effects (sequential, non-critical — failures logged but don't roll back)

    // 6a: Create notification for the customer
    try {
      await supabase.from('Notification').insert({
        id: genId('notif'),
        userId: order.userId,
        type: 'order_status_update',
        title: 'Order Completed! 🎉',
        message: `Your order "${order.deal?.title || 'your deal'}" from ${order.vendor.businessName} has been picked up and completed. Enjoy your meal!`,
        data: JSON.stringify({
          orderId: order.id,
          status: 'completed',
          vendorId: order.vendorId,
        }),
      })
    } catch (notifError) {
      console.error('Complete order - notification error (non-critical):', notifError)
    }

    // 6b: Increment vendor totalSales
    try {
      const vendorRes = await supabase
        .from('Vendor')
        .select('totalSales')
        .eq('id', order.vendorId)
        .maybeSingle()

      if (vendorRes.data) {
        await supabase
          .from('Vendor')
          .update({ totalSales: (vendorRes.data.totalSales || 0) + 1 })
          .eq('id', order.vendorId)
      }
    } catch (salesError) {
      console.error('Complete order - totalSales update error (non-critical):', salesError)
    }

    // 6c: Invalidate deal cache
    try {
      const { cache } = await import('@/lib/cache')
      cache.delete('deals:active')
    } catch {
      // Cache invalidation is non-critical
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'completed',
        completedAt: now,
        dealTitle: order.deal?.title,
        vendorName: order.vendor.businessName,
        totalPrice: order.totalPrice,
      },
      message: 'Order completed successfully!',
    })
  } catch (error) {
    console.error('Complete order error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
