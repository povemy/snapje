import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
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

    const notification = await db.notification.findUnique({
      where: { id },
    })

    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (notification.userId !== authUser.userId) {
      return NextResponse.json(
        { success: false, error: 'You can only mark your own notifications as read' },
        { status: 403 }
      )
    }

    const updatedNotification = await db.notification.update({
      where: { id },
      data: { read: true },
    })

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
