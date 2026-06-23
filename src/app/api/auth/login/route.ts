import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateAccessToken, generateRefreshToken, setAuthCookies, parseRoles } from '@/lib/auth'
import { rateLimiter } from '@/lib/cache'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
  try {
    // Rate limit check
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimiter.check(`login:${clientIp}`, 10, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Find user. select('*') includes the vipFlag column added in
    // scripts/add-vipflag.mts — login response exposes it so the client can
    // gate VIP features (e.g. Broadcast Deal button in VendorDashboard).
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (userError) {
      console.error('Login query error:', userError.message)
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Check if banned
    if (user.isBanned) {
      return NextResponse.json(
        { success: false, error: 'Account has been suspended' },
        { status: 403 }
      )
    }

    // Compare password
    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Generate tokens
    const roles = parseRoles(user.roles)
    const accessToken = await generateAccessToken({
      userId: user.id,
      email: user.email,
      roles,
      activeRole: user.activeRole,
    })
    const refreshToken = await generateRefreshToken(user.id)

    // Set cookies
    await setAuthCookies(accessToken, refreshToken)

    // CRITICAL FIX (tokens in localStorage): do NOT return the refresh token
    // in the JSON body. The refresh token is only sent via the httpOnly
    // cookie (Secure + SameSite) so it can never be exfiltrated from JS.
    // The short-lived access token (15 min) is returned in the body so the
    // client can persist it in localStorage for the Bearer-token flow used
    // in the preview iframe where third-party cookies are blocked.
    const { passwordHash: _, ...userWithoutPassword } = user
    return NextResponse.json({
      success: true,
      data: {
        ...userWithoutPassword,
        roles: parseRoles(user.roles),
      },
      tokens: { accessToken },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
