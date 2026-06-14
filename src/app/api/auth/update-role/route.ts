import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
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
    const user = await db.user.findUnique({ where: { id: authUser.userId } })
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
    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: { activeRole: role },
    })

    // Generate new tokens with updated active role
    const roles = parseRoles(updatedUser.roles)
    const accessToken = await generateAccessToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      roles,
      activeRole: updatedUser.activeRole,
    })
    const refreshToken = await generateRefreshToken(updatedUser.id)

    // Delete old refresh tokens
    await db.refreshToken.deleteMany({ where: { userId: updatedUser.id, token: { not: refreshToken } } })

    // Set new cookies
    await setAuthCookies(accessToken, refreshToken)

    const { passwordHash: _, ...userWithoutPassword } = updatedUser
    return NextResponse.json({
      success: true,
      data: {
        ...userWithoutPassword,
        roles: parseRoles(updatedUser.roles),
      },
    })
  } catch (error) {
    console.error('Update role error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
