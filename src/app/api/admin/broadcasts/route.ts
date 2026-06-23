import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth-helpers'
import { clampPagination } from '@/lib/pagination'

/**
 * GET /api/admin/broadcasts
 *
 * Admin-only log of vendor broadcasts. Each broadcast fans out to N users
 * (one Notification row per recipient), so we DEDUPLICATE on the server by
 * (vendorId, message, title) and return one row per broadcast with a
 * `recipients` count and the sender's vendor businessName.
 *
 * Query params:
 *   page, pageSize — standard pagination (clamped to [1,100])
 */
export async function GET(request: Request) {
  try {
    const authUser = await requireAdmin()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const { page, pageSize } = clampPagination(
      searchParams.get('page'),
      searchParams.get('pageSize')
    )

    // Fetch broadcast notifications (most recent first). We over-fetch 10x the
    // page size because deduplication happens in JS — each broadcast produces
    // up to N rows (one per recipient). Capped at 500 for safety.
    const fetchLimit = Math.min(pageSize * 10, 500)
    const notifRes = await supabase
      .from('Notification')
      .select('id, userId, type, title, message, data, read, createdAt')
      .eq('type', 'broadcast')
      .order('createdAt', { ascending: false })
      .limit(fetchLimit)

    if (notifRes.error) {
      console.error('Admin broadcasts fetch error:', notifRes.error.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const rows = (notifRes.data ?? []) as Array<{
      id: string
      userId: string
      type: string
      title: string
      message: string
      data: string
      read: boolean
      createdAt: string
    }>

    // Deduplicate: group by (vendorId|message|title). Each group = one broadcast.
    interface BroadcastGroup {
      vendorId: string | null
      dealId: string | null
      senderUserId: string | null
      title: string
      message: string
      createdAt: string // most recent in the group
      recipients: number
      sampleId: string
    }
    const groups = new Map<string, BroadcastGroup>()
    for (const r of rows) {
      let parsed: { vendorId?: string; dealId?: string; senderUserId?: string } = {}
      try {
        parsed = JSON.parse(r.data || '{}')
      } catch {
        // ignore malformed data
      }
      const vendorId = parsed.vendorId ?? null
      const dealId = parsed.dealId ?? null
      const senderUserId = parsed.senderUserId ?? null
      const key = `${vendorId ?? ''}|${r.message}|${r.title}`
      const existing = groups.get(key)
      if (existing) {
        existing.recipients += 1
        if (r.createdAt > existing.createdAt) {
          existing.createdAt = r.createdAt
        }
      } else {
        groups.set(key, {
          vendorId,
          dealId,
          senderUserId,
          title: r.title,
          message: r.message,
          createdAt: r.createdAt,
          recipients: 1,
          sampleId: r.id,
        })
      }
    }

    let broadcasts = Array.from(groups.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )

    // Collect vendor IDs to look up business names in a single query.
    const vendorIds = Array.from(
      new Set(broadcasts.map((b) => b.vendorId).filter((v): v is string => !!v))
    )
    let vendorNames: Record<string, string> = {}
    if (vendorIds.length > 0) {
      const vRes = await supabase
        .from('Vendor')
        .select('id, businessName')
        .in('id', vendorIds)
      if (!vRes.error && vRes.data) {
        for (const v of vRes.data as Array<{ id: string; businessName: string }>) {
          vendorNames[v.id] = v.businessName
        }
      }
    }

    // Paginate the deduplicated list.
    const total = broadcasts.length
    const skip = (page - 1) * pageSize
    const pageItems = broadcasts.slice(skip, skip + pageSize)

    const data = pageItems.map((b) => ({
      ...b,
      vendorName: b.vendorId ? vendorNames[b.vendorId] ?? null : null,
    }))

    return NextResponse.json({
      success: true,
      data: {
        broadcasts: data,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    })
  } catch (error) {
    console.error('Admin broadcasts route error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
