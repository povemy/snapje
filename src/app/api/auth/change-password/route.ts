import { NextResponse } from 'next/server'
import { getAuthUser, generateAccessToken, generateRefreshToken, setAuthCookies, parseRoles } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { rateLimiter } from '@/lib/cache'

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Rate limit password change attempts
    if (!rateLimiter.check(`pwd:${authUser.userId}`, 5, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current password and new password are required' },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: 'New password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Fetch user with password hash
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('id, passwordHash')
      .eq('id', authUser.userId)
      .single()

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 401 }
      )
    }

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, 10)

    // Update password
    const { error: updateError } = await supabase
      .from('User')
      .update({ passwordHash: newHash })
      .eq('id', authUser.userId)

    if (updateError) {
      console.error('Password update error:', updateError.message)
      return NextResponse.json(
        { success: false, error: 'Failed to update password' },
        { status: 500 }
      )
    }

    // MEDIUM FIX (session invalidation): delete ALL existing refresh tokens for
    // this user so any other logged-in sessions (other browsers, stolen tokens)
    // are immediately invalidated. Then issue a fresh access + refresh token
    // pair for THIS session so the caller stays logged in.
    await supabase.from('RefreshToken').delete().eq('userId', authUser.userId)

    // Fetch the full user record so we can sign tokens with current roles
    const { data: fullUser } = await supabase
      .from('User')
      .select('*')
      .eq('id', authUser.userId)
      .single()

    if (fullUser) {
      const roles = parseRoles(fullUser.roles)
      const accessToken = await generateAccessToken({
        userId: fullUser.id,
        email: fullUser.email,
        roles,
        activeRole: fullUser.activeRole,
      })
      const refreshToken = await generateRefreshToken(fullUser.id)
      await setAuthCookies(accessToken, refreshToken)

      // CRITICAL FIX: do NOT return the refresh token in the JSON body — it
      // lives only in the httpOnly cookie.
      return NextResponse.json({
        success: true,
        message: 'Password changed successfully. All other sessions have been signed out.',
        tokens: { accessToken },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully. All other sessions have been signed out.',
    })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
