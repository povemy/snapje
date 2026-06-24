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

    // Fan out: create a Notification row for every user AND emit via socket.
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
      type: 'broadcast' as const,
      title,
      message,
      data: dataPayload,
      read: false,
    }))

    // Insert notifications in chunks
    const CHUNK = 500
    let inserted = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const ins = await supabase.from('Notification').insert(slice)
      if (ins.error) {
        console.error('Broadcast insert chunk error:', ins.error.message)
      } else {
        inserted += slice.length
      }
    }

    // Emit real-time notifications via the socket.io service.
    // The realtime service listens for HTTP POST on /broadcast which then
    // emits 'notification:new' to each user's personal room.
    // This is non-blocking — if the socket service is down, the DB
    // notifications still exist and will be picked up by polling.
    try {
      await fetch(`http://127.0.0.1:3003/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: users.map(u => u.id),
          notification: {
            type: 'broadcast',
            title,
            message,
            data: dataPayload,
            dealId: dealId || undefined,
          },
        }),
        signal: AbortSignal.timeout(3000),
      })
    } catch (socketErr) {
      console.warn('Socket emit failed (non-fatal — DB notifications still created):', socketErr instanceof Error ? socketErr.message : socketErr)
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
