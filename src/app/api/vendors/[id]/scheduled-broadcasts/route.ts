import { NextResponse } from 'next/server'
import { supabase, genId } from '@/lib/supabase'
import { requireVendor } from '@/lib/auth-helpers'

/**
 * /api/vendors/[id]/scheduled-broadcasts
 *
 * Task 5: VIP vendors can schedule broadcasts for automatic future execution.
 * The scheduler (runs in the realtime-service mini-service) polls every 60s
 * for rows where status='pending' AND scheduledAt <= now, executes them via
 * the shared `fanOutBroadcast` helper, and marks them 'sent'.
 *
 * Constraints enforced HERE (server-side):
 *   - scheduledAt must be in the future (>= now + 1 min)
 *   - scheduledAt must be <= now + 5 days
 *   - only 1 scheduled broadcast per (vendorId, DATE(scheduledAt)) — a vendor
 *     can have at most one scheduled broadcast fire on any given calendar day
 *
 * Endpoints:
 *   GET    — list this vendor's scheduled broadcasts (newest first)
 *   POST   — create a new scheduled broadcast
 *   DELETE — cancel a scheduled broadcast (by ?id= query param)
 */

// Maximum number of days in the future a broadcast can be scheduled.
const MAX_FUTURE_DAYS = 5

function parseDateSafe(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Returns the calendar-date string (YYYY-MM-DD) of a Date in UTC.
 * Scheduled-broadcast uniqueness is enforced per UTC date so a vendor can't
 * schedule two broadcasts for the "same day" by crossing midnight.
 */
function toUtcDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(
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

    // Ownership check
    const vendorRes = await supabase
      .from('Vendor')
      .select('id, userId')
      .eq('id', id)
      .maybeSingle()
    if (vendorRes.error || !vendorRes.data) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }
    if (vendorRes.data.userId !== authUser.userId) {
      return NextResponse.json(
        { success: false, error: 'Not your vendor account' },
        { status: 403 }
      )
    }

    const { data, error } = await supabase
      .from('ScheduledBroadcast')
      .select('id, title, message, dealId, scheduledAt, status, createdAt, sentAt, recipientCount')
      .eq('vendorId', id)
      .order('scheduledAt', { ascending: false })
      .limit(100)

    if (error) {
      console.error('List scheduled broadcasts error:', error.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { scheduled: data ?? [] },
    })
  } catch (error) {
    console.error('List scheduled broadcasts error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

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

    // Fetch vendor + user (need vipFlag)
    const vendorRes = await supabase
      .from('Vendor')
      .select('id, userId, businessName')
      .eq('id', id)
      .maybeSingle()
    if (vendorRes.error || !vendorRes.data) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }
    const vendor = vendorRes.data
    if (vendor.userId !== authUser.userId) {
      return NextResponse.json(
        { success: false, error: 'You can only schedule broadcasts for your own vendor account' },
        { status: 403 }
      )
    }

    // VIP flag check (same gate as the immediate broadcast route)
    const userRes = await supabase
      .from('User')
      .select('id, vipFlag, isBanned')
      .eq('id', authUser.userId)
      .maybeSingle()
    if (userRes.error || !userRes.data) {
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    if (!userRes.data.vipFlag) {
      return NextResponse.json(
        { success: false, error: 'Scheduling broadcasts requires VIP flag. Contact an admin.' },
        { status: 403 }
      )
    }

    // Parse body
    const body = await request.json().catch(() => ({}))
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const dealId = typeof body.dealId === 'string' && body.dealId.trim() ? body.dealId.trim() : null
    // Issue 6: optional title (max 100 chars, supports emojis via UTF-8).
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 100) : null
    const scheduledAtDate = parseDateSafe(body.scheduledAt)

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
    if (!scheduledAtDate) {
      return NextResponse.json(
        { success: false, error: 'scheduledAt is required' },
        { status: 400 }
      )
    }

    // Validate scheduling window: 1 minute in the future → 5 days max.
    const now = new Date()
    const minTime = new Date(now.getTime() + 60 * 1000) // +1 min
    const maxTime = new Date(now.getTime() + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000)
    if (scheduledAtDate < minTime) {
      return NextResponse.json(
        { success: false, error: 'Scheduled time must be at least 1 minute in the future' },
        { status: 400 }
      )
    }
    if (scheduledAtDate > maxTime) {
      return NextResponse.json(
        { success: false, error: `Scheduled time cannot be more than ${MAX_FUTURE_DAYS} days in the future` },
        { status: 400 }
      )
    }

    // Optional dealId ownership check
    if (dealId) {
      const dealCheck = await supabase
        .from('Deal')
        .select('id, vendorId')
        .eq('id', dealId)
        .maybeSingle()
      if (dealCheck.error || !dealCheck.data || dealCheck.data.vendorId !== id) {
        return NextResponse.json(
          { success: false, error: 'dealId does not belong to this vendor' },
          { status: 400 }
        )
      }
    }

    // Per-day uniqueness: only 1 scheduled broadcast per (vendorId, UTC date).
    // We query existing 'pending' rows scheduled for the same UTC date.
    const utcDate = toUtcDateString(scheduledAtDate)
    const dayStart = new Date(`${utcDate}T00:00:00.000Z`)
    const dayEnd = new Date(`${utcDate}T23:59:59.999Z`)
    const { data: existing, error: existingErr } = await supabase
      .from('ScheduledBroadcast')
      .select('id, scheduledAt')
      .eq('vendorId', id)
      .eq('status', 'pending')
      .gte('scheduledAt', dayStart.toISOString())
      .lte('scheduledAt', dayEnd.toISOString())
      .limit(1)
    if (existingErr) {
      console.error('Scheduled-broadcast conflict check error:', existingErr.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'You already have a scheduled broadcast for that date. Only 1 scheduled broadcast per day is allowed.',
        },
        { status: 409 }
      )
    }

    // Insert the scheduled broadcast row
    const insertRes = await supabase
      .from('ScheduledBroadcast')
      .insert({
        id: genId('sb'),
        vendorId: id,
        // Issue 6: store the title (nullable for backward compat).
        title,
        message,
        dealId,
        scheduledAt: scheduledAtDate.toISOString(),
        status: 'pending',
      })
      .select()
      .single()

    if (insertRes.error) {
      console.error('Scheduled-broadcast insert error:', insertRes.error.message)
      return NextResponse.json(
        { success: false, error: 'Failed to schedule broadcast' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: insertRes.data,
      message: `Broadcast scheduled for ${scheduledAtDate.toLocaleString()}`,
    }, { status: 201 })
  } catch (error) {
    console.error('Create scheduled broadcast error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    const { searchParams } = new URL(request.url)
    const broadcastId = searchParams.get('id')
    if (!broadcastId) {
      return NextResponse.json(
        { success: false, error: 'id query parameter is required' },
        { status: 400 }
      )
    }

    // Ownership: the scheduled broadcast must belong to a vendor owned by
    // this user. We join via vendorId.
    const { data: existing, error: fetchErr } = await supabase
      .from('ScheduledBroadcast')
      .select('id, vendorId, status')
      .eq('id', broadcastId)
      .maybeSingle()
    if (fetchErr) {
      console.error('Cancel scheduled-broadcast fetch error:', fetchErr.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Scheduled broadcast not found' },
        { status: 404 }
      )
    }
    if (existing.vendorId !== id) {
      return NextResponse.json(
        { success: false, error: 'Not your scheduled broadcast' },
        { status: 403 }
      )
    }
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Cannot cancel a broadcast that is already ${existing.status}` },
        { status: 409 }
      )
    }

    // Mark as cancelled (we don't hard-delete so the audit trail is preserved)
    const { error: updErr } = await supabase
      .from('ScheduledBroadcast')
      .update({ status: 'cancelled' })
      .eq('id', broadcastId)
    if (updErr) {
      console.error('Cancel scheduled-broadcast update error:', updErr.message)
      return NextResponse.json(
        { success: false, error: 'Failed to cancel scheduled broadcast' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Cancel scheduled broadcast error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
