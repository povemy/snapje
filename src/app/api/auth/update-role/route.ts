import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { getAuthUser, generateAccessToken, generateRefreshToken, setAuthCookies, parseRoles, hasRole } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { role } = body

    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role is required' },
        { status: 400 }
      )
    }

    const validRoles = ['foodie', 'vendor', 'admin']
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role' },
        { status: 400 }
      )
    }

    // Fetch user from DB to verify roles
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('*')
      .eq('id', authUser.userId)
      .maybeSingle()

    if (userError) {
      console.error('Update role fetch user error:', userError.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if user has the requested role
    if (!hasRole(user.roles, role)) {
      return NextResponse.json(
        { success: false, error: 'You do not have this role assigned to your account' },
        { status: 403 }
      )
    }

    // Update active role
    const updatedUser = unwrap(
      await supabase
        .from('User')
        .update({ activeRole: role })
        .eq('id', user.id)
        .select()
        .single(),
      'Update user role'
    )

    // Generate new tokens with updated active role
    const roles = parseRoles(updatedUser.roles)
    const accessToken = await generateAccessToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      roles,
      activeRole: updatedUser.activeRole,
    })
    const refreshToken = await generateRefreshToken(updatedUser.id)

    // Delete old refresh tokens (all except the newly generated one)
    const { error: deleteError } = await supabase
      .from('RefreshToken')
      .delete()
      .eq('userId', updatedUser.id)
      .neq('token', refreshToken)

    if (deleteError) {
      console.error('Update role delete old tokens error:', deleteError.message)
    }

    // Set new cookies
    await setAuthCookies(accessToken, refreshToken)

    const { passwordHash: _, ...userWithoutPassword } = updatedUser
    return NextResponse.json({
      success: true,
      data: {
        ...userWithoutPassword,
        roles: parseRoles(updatedUser.roles),
      },
      tokens: { accessToken, refreshToken },
    })
  } catch (error) {
    console.error('Update role error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
