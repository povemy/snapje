import { NextResponse } from 'next/server'
import { clearAuthCookies, getAuthUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    // Get current user to clean up refresh token
    const authUser = await getAuthUser()

    if (authUser) {
      // Delete all refresh tokens for this user (logout all sessions)
      const { error: deleteError } = await supabase
        .from('RefreshToken')
        .delete()
        .eq('userId', authUser.userId)

      if (deleteError) {
        console.error('Logout delete tokens error:', deleteError.message)
      }
    } else {
      // Even if access token is expired, try to delete the specific refresh token
      // Accept from request body (Bearer flow) OR cookie
      let refreshToken: string | undefined
      try {
        const body = await request.json()
        if (body?.refreshToken && typeof body.refreshToken === 'string') {
          refreshToken = body.refreshToken
        }
      } catch {
        // Body might be empty
      }
      if (!refreshToken) {
        const cookieStore = await cookies()
        refreshToken = cookieStore.get('refresh_token')?.value
      }
      if (refreshToken) {
        const { error: deleteError } = await supabase
          .from('RefreshToken')
          .delete()
          .eq('token', refreshToken)

        if (deleteError) {
          console.error('Logout delete token error:', deleteError.message)
        }
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
