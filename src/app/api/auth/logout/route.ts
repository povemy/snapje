import { NextResponse } from 'next/server'
import { clearAuthCookies, getAuthUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    // Get current user to clean up refresh token
    const authUser = await getAuthUser()
    
    if (authUser) {
      // Delete all refresh tokens for this user (logout all sessions)
      await db.refreshToken.deleteMany({ where: { userId: authUser.userId } })
    } else {
      // Even if access token is expired, try to delete the specific refresh token
      const cookieStore = await cookies()
      const refreshToken = cookieStore.get('refresh_token')?.value
      if (refreshToken) {
        await db.refreshToken.deleteMany({ where: { token: refreshToken } })
      }
    }

    // Clear cookies
    await clearAuthCookies()

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    })
  } catch (error) {
    console.error('Logout error:', error)
    // Still clear cookies even if DB operation fails
    await clearAuthCookies()
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
