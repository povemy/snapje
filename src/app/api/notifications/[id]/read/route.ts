import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return markAsRead(params)
}

// Also accept PUT — the client uses PUT for marking as read
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return markAsRead(params)
}

async function markAsRead(params: Promise<{ id: string }>) {
  try {
    const { id } = await params
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Use .eq('read', false) for idempotency — no-op if already read
    const { data: updatedNotification, error } = await supabase
      .from('Notification')
      .update({ read: true })
      .eq('id', id)
      .eq('userId', authUser.userId)
      .eq('read', false)
      .select()
      .single()

    if (error) {
      // PGRST116 = no rows (already read or not found) — treat as success
      if (error.code === 'PGRST116') {
        return NextResponse.json({ success: true, data: null })
      }
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: updatedNotification })
  } catch (error) {
    console.error('Mark notification read error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
