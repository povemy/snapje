import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

/**
 * PUT /api/notifications/read-all
 * Marks ALL unread notifications as read for the authenticated user.
 * Single DB query — much faster than marking each one individually.
 */
export async function PUT() {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { error } = await supabase
      .from('Notification')
      .update({ read: true })
      .eq('userId', authUser.userId)
      .eq('read', false)

    if (error) {
      console.error('Mark all read error:', error.message)
      return NextResponse.json(
        { success: false, error: 'Failed to mark all as read' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Mark all read error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
