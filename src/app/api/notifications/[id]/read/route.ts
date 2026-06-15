import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const notifRes = await supabase
      .from('Notification')
      .select('*')
      .eq('id', id)
      .single()

    if (notifRes.error || !notifRes.data) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      )
    }

    const notification = notifRes.data

    // Verify ownership
    if (notification.userId !== authUser.userId) {
      return NextResponse.json(
        { success: false, error: 'You can only mark your own notifications as read' },
        { status: 403 }
      )
    }

    const updatedNotification = unwrap(
      await supabase
        .from('Notification')
        .update({ read: true })
        .eq('id', id)
        .select()
        .single(),
      'Mark notification as read'
    )

    return NextResponse.json({
      success: true,
      data: updatedNotification,
    })
  } catch (error) {
    console.error('Mark notification read error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
