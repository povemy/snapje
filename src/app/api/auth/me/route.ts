import { NextResponse } from 'next/server'
import { getAuthUser, parseRoles } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Fetch fresh user data from DB with vendor relation.
    // NOTE: vipFlag is included in the response so the client (VendorDashboard)
    // can gate the "Broadcast Deal" button on `vipFlag === true`.
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('*, vendor:Vendor(*)')
      .eq('id', authUser.userId)
      .maybeSingle()

    if (userError) {
      console.error('Get current user query error:', userError.message)
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

    if (user.isBanned) {
      return NextResponse.json(
        { success: false, error: 'Account has been suspended' },
        { status: 403 }
      )
    }

    const { passwordHash: _, ...userWithoutPassword } = user
    return NextResponse.json({
      success: true,
      data: {
        ...userWithoutPassword,
        roles: parseRoles(user.roles),
      },
    })
  } catch (error) {
    console.error('Get current user error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
