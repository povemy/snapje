import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const skip = (page - 1) * pageSize

    let query = supabase
      .from('Notification')
      .select('*')
      .eq('userId', authUser.userId)
      .order('createdAt', { ascending: false })
      .range(skip, skip + pageSize - 1)

    if (unreadOnly) {
      query = query.eq('read', false)
    }

    // Count queries
    let totalQuery = supabase
      .from('Notification')
      .select('*', { count: 'exact', head: true })
      .eq('userId', authUser.userId)

    if (unreadOnly) {
      totalQuery = totalQuery.eq('read', false)
    }

    const unreadCountQuery = supabase
      .from('Notification')
      .select('*', { count: 'exact', head: true })
      .eq('userId', authUser.userId)
      .eq('read', false)

    const [notificationsRes, totalRes, unreadCountRes] = await Promise.all([
      query,
      totalQuery,
      unreadCountQuery,
    ])

    const notifications = unwrap(notificationsRes, 'List notifications')
    const total = totalRes.count ?? 0
    const unreadCount = unreadCountRes.count ?? 0

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        total,
        unreadCount,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('List notifications error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
