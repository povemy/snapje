import { NextResponse } from 'next/server'
import { rotateRefreshToken, generateAccessToken, setAuthCookies, parseRoles } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    // Accept refresh token from request body (Bearer-token flow) OR cookie
    let refreshToken: string | undefined

    // 1) Try request body first ({ refreshToken: "..." })
    try {
      const body = await request.json()
      if (body?.refreshToken && typeof body.refreshToken === 'string') {
        refreshToken = body.refreshToken
      }
    } catch {
      // Body might be empty (cookie-only flow) — that's fine
    }

    // 2) Fall back to cookie
    if (!refreshToken) {
      const cookieStore = await cookies()
      refreshToken = cookieStore.get('refresh_token')?.value
    }

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, error: 'No refresh token provided' },
        { status: 401 }
      )
    }

    // Verify and rotate refresh token
    const result = await rotateRefreshToken(refreshToken)
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired refresh token' },
        { status: 401 }
      )
    }

    const { user, refreshToken: newRefreshToken } = result

    // Check if user is banned
    if (user.isBanned) {
      return NextResponse.json(
        { success: false, error: 'Account has been suspended' },
        { status: 403 }
      )
    }

    // Generate new access token
    const roles = parseRoles(user.roles)
    const accessToken = await generateAccessToken({
      userId: user.id,
      email: user.email,
      roles,
      activeRole: user.activeRole,
    })

    // Set new cookies (for environments where cookies work)
    await setAuthCookies(accessToken, newRefreshToken)

    const { passwordHash: _, ...userWithoutPassword } = user
    return NextResponse.json({
      success: true,
      data: {
        ...userWithoutPassword,
        roles: parseRoles(user.roles),
      },
      // Return new tokens so the client can update localStorage
      tokens: { accessToken, refreshToken: newRefreshToken },
    })
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
