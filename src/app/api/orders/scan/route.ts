import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'
import { rateLimiter } from '@/lib/cache'

/**
 * POST /api/orders/scan
 * 
 * Vendor scans a QR code → returns order details for the modal.
 * This is the LOOKUP step — it does NOT modify any data.
 * 
 * Security:
 * - Rate limited (20 scans/min per vendor)
 * - Auth required with vendor or admin role
 * - Only returns orders belonging to the vendor's store
 * - Does NOT reveal the full qrCode value back (prevents reuse)
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
        { success: false, error: 'Only vendors can scan QR codes' },
        { status: 403 }
      )
    }

    // Rate limit
    if (!rateLimiter.check(`scan:${authUser.userId}`, 20, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many scan attempts. Please slow down.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { qrCode } = body

    if (!qrCode || typeof qrCode !== 'string' || qrCode.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'QR code is required' },
        { status: 400 }
      )
    }

    // Find order by QR code with deal and vendor info
    const orderRes = await supabase
      .from('Order')
      .select('*, deal:Deal(id, title, description, imageUrl, category, pickupInstructions, originalPrice, dealPrice), vendor:Vendor(id, businessName, address, logoUrl, userId, contactPhone)')
      .eq('qrCode', qrCode.trim())
      .maybeSingle()

    if (orderRes.error) {
      console.error('Scan lookup error:', orderRes.error.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!orderRes.data) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR code. No matching order found.' },
        { status: 404 }
      )
    }

    const order = orderRes.data

    // Verify the order belongs to THIS vendor (unless admin)
    const isAdmin = hasRole(authUser.roles.join(','), 'admin')
    if (!isAdmin && order.vendor.userId !== authUser.userId) {
      return NextResponse.json(
        { success: false, error: 'This order does not belong to your store.' },
        { status: 403 }
      )
    }

    // Check if order is already completed — reject with clear message
    if (order.status === 'completed') {
      return NextResponse.json(
        { success: false, error: 'This order has already been completed and cannot be redeemed again.', data: { orderId: order.id, status: order.status, orderNumber: order.orderNumber } },
        { status: 400 }
      )
    }

    if (order.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'This order has been cancelled.', data: { orderId: order.id, status: order.status } },
        { status: 400 }
      )
    }

    if (order.status === 'expired') {
      return NextResponse.json(
        { success: false, error: 'This order has expired.', data: { orderId: order.id, status: order.status } },
        { status: 400 }
      )
    }

    // Return order details for the vendor modal (lookup only, no mutation)
    return NextResponse.json({
      success: true,
      data: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          quantity: order.quantity,
          originalPrice: order.originalPrice,
          dealPrice: order.dealPrice,
          totalPrice: order.totalPrice,
          pickupDeadline: order.pickupDeadline,
          createdAt: order.createdAt,
          qrVerifiedAt: order.qrVerifiedAt,
          // Do NOT return qrCode — prevents client-side reuse
        },
        deal: order.deal,
        vendor: {
          id: order.vendor.id,
          businessName: order.vendor.businessName,
          address: order.vendor.address,
        },
        user: {
          // We'll add customer name lookup below
        },
        canComplete: order.status === 'pending_pickup' || order.status === 'picked_up',
      },
    })
  } catch (error) {
    console.error('Scan order error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
