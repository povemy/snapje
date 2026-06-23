import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
import { requireVendor } from '@/lib/auth-helpers'

/**
 * POST /api/vendors/[id]/broadcast
 *
 * VIP-gated vendor broadcast. A vendor with `vipFlag === true` on their User
 * row may send a one-shot broadcast message that fans out to ALL users as a
 * Notification row (type='broadcast', title=`<businessName> broadcast`).
 *
 * Subscriptions are localStorage-only for MVP — there is no server-side
 * subscriber list — so we fan out to every user. Future work: replace the
 * full fan-out with a Subscription-table lookup.
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

    // Fan out: create a Notification row for every user.
    // NOTE: For MVP, subscriptions live in localStorage on the client. There's
    // no server-side subscriber list, so we create a notification for ALL
    // users (they will see the broadcast in their notification feed; clients
    // can choose to filter by type='broadcast' if they only want subscribed
    // vendors). This is intentionally simple — a future iteration should
    // replace this with a Subscription-table lookup.
    const { data: allUsers, error: usersError } = await supabase
      .from('User')
      .select('id')
      .eq('isBanned', false)

    if (usersError) {
      console.error('Broadcast user list error:', usersError.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const users = (allUsers ?? []) as { id: string }[]
    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        data: { recipients: 0, message: 'No users to broadcast to' },
      })
    }

    const title = `${vendor.businessName} broadcast`
    const dataPayload = JSON.stringify({
      vendorId: vendor.id,
      dealId,
      senderUserId: authUser.userId,
    })

    const rows = users.map((u) => ({
      id: genId('notif'),
      userId: u.id,
      type: 'broadcast',
      title,
      message,
      data: dataPayload,
      read: false,
    }))

    // Supabase can batch insert up to a few thousand rows in one call. If the
    // user base grows large, chunk this.
    const CHUNK = 500
    let inserted = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const ins = await supabase.from('Notification').insert(slice)
      if (ins.error) {
        console.error('Broadcast insert chunk error:', ins.error.message)
        // Continue with the next chunk — partial fan-out is better than none.
      } else {
        inserted += slice.length
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        recipients: inserted,
        vendorId: vendor.id,
        title,
        message,
        dealId,
      },
      message: `Broadcast sent to ${inserted} user${inserted === 1 ? '' : 's'}`,
    })
  } catch (error) {
    console.error('Vendor broadcast error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
