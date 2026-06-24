import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireVendor } from '@/lib/auth-helpers'
import { fanOutBroadcast } from '@/lib/broadcast'

/**
 * POST /api/vendors/[id]/broadcast
 *
 * VIP-gated vendor broadcast (IMMEDIATE send). Fans out a notification to
 * the vendor's subscribers via the shared `fanOutBroadcast` helper.
 *
 * Task 4: recipients = foodie users subscribed to this vendor (via
 * VendorSubscription table). Vendors, admins, and the broadcaster themselves
 * are excluded.
 *
 * Task 5: for scheduling a broadcast at a future date/time, see
 * /api/vendors/[id]/scheduled-broadcasts — the scheduler in realtime-service
 * polls every 60s for due rows and calls `fanOutBroadcast` to send them.
 *
 * Body: { message: string, dealId?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = await requireVendor()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Vendor access required' },
        { status: 403 }
      )
    }

    // Fetch vendor + user row (need vipFlag from User).
    const vendorRes = await supabase
      .from('Vendor')
      .select('id, userId, businessName')
      .eq('id', id)
      .maybeSingle()

    if (vendorRes.error) {
      console.error('Broadcast vendor fetch error:', vendorRes.error.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    if (!vendorRes.data) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

    const vendor = vendorRes.data

    // Ownership check — the authenticated vendor must own this vendor row.
    if (vendor.userId !== authUser.userId) {
      return NextResponse.json(
        { success: false, error: 'You can only broadcast from your own vendor account' },
        { status: 403 }
      )
    }

    // Fetch the user row to check vipFlag.
    const userRes = await supabase
      .from('User')
      .select('id, vipFlag, isBanned')
      .eq('id', authUser.userId)
      .maybeSingle()

    if (userRes.error || !userRes.data) {
      console.error('Broadcast user fetch error:', userRes.error?.message ?? 'no row')
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!userRes.data.vipFlag) {
      return NextResponse.json(
        { success: false, error: 'Broadcasting requires VIP flag. Contact an admin.' },
        { status: 403 }
      )
    }

    // Parse + validate body.
    const body = await request.json().catch(() => ({}))
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const dealId = typeof body.dealId === 'string' && body.dealId.trim() ? body.dealId.trim() : null

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'message is required' },
        { status: 400 }
      )
    }
    if (message.length > 500) {
      return NextResponse.json(
        { success: false, error: 'message must be 500 characters or fewer' },
        { status: 400 }
      )
    }

    // Optional: verify dealId belongs to this vendor (if provided).
    if (dealId) {
      const dealCheck = await supabase
        .from('Deal')
        .select('id, vendorId')
        .eq('id', dealId)
        .maybeSingle()
      if (dealCheck.error) {
        console.error('Broadcast deal check error:', dealCheck.error.message)
        return NextResponse.json(
          { success: false, error: 'Internal server error' },
          { status: 500 }
        )
      }
      if (!dealCheck.data || dealCheck.data.vendorId !== id) {
        return NextResponse.json(
          { success: false, error: 'dealId does not belong to this vendor' },
          { status: 400 }
        )
      }
    }

    // Task 4 + Task 5: delegate fan-out to the shared helper so the same
    // logic is reused by the scheduled-broadcast scheduler.
    const recipients = await fanOutBroadcast({
      vendorId: vendor.id,
      vendorBusinessName: vendor.businessName,
      message,
      dealId,
      senderUserId: authUser.userId,
    })

    return NextResponse.json({
      success: true,
      data: {
        recipients,
        vendorId: vendor.id,
        title: vendor.businessName,
        message,
        dealId,
      },
      message: recipients === 0
        ? 'No subscribers to broadcast to yet'
        : `Broadcast sent to ${recipients} subscriber${recipients === 1 ? '' : 's'}`,
    })
  } catch (error) {
    console.error('Vendor broadcast error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
