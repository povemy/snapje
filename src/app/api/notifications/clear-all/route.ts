import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

/**
 * DELETE /api/notifications/clear-all
 * Deletes ALL notifications for the authenticated user.
 * Also marks the bell badge as 0.
 */
export async function DELETE() {
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
      .delete()
      .eq('userId', authUser.userId)

    if (error) {
      console.error('Clear all notifications error:', error.message)
      return NextResponse.json(
        { success: false, error: 'Failed to clear notifications' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Clear all notifications error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
