import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
import { generateAccessToken, generateRefreshToken, setAuthCookies, parseRoles } from '@/lib/auth'
import { rateLimiter } from '@/lib/cache'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
  try {
    // Rate limit check
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimiter.check(`register:${clientIp}`, 5, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { email, password, name, phone } = body

    // Validation
    if (!email || !password || !name) {
      return NextResponse.json(
        { success: false, error: 'Email, password, and name are required' },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    if (name.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Name must be at least 2 characters' },
        { status: 400 }
      )
    }

    // Check if email already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('User')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (checkError) {
      console.error('Register check error:', checkError.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email already registered' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user
    const user = unwrap(
      await supabase
        .from('User')
        .insert({
          id: genId('user'),
          email: email.toLowerCase(),
          passwordHash,
          name: name.trim(),
          phone: phone?.trim() || null,
          roles: 'foodie',
          activeRole: 'foodie',
        })
        .select()
        .single(),
      'Create user'
    )

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

    // Return user data (without passwordHash)
    const { passwordHash: _, ...userWithoutPassword } = user
    return NextResponse.json({
      success: true,
      data: {
        ...userWithoutPassword,
        roles: parseRoles(user.roles),
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
