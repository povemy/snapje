import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser || !hasRole(authUser.roles.join(','), 'admin')) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const isBanned = searchParams.get('isBanned')

    const skip = (page - 1) * pageSize

    // Build user query
    let userQuery = supabase
      .from('User')
      .select('id, email, name, phone, avatarUrl, roles, activeRole, emailVerified, isBanned, createdAt, updatedAt, vendor:Vendor(id, businessName, verificationStatus)')
      .order('createdAt', { ascending: false })
      .range(skip, skip + pageSize - 1)

    // Build count query
    let countQuery = supabase
      .from('User')
      .select('*', { count: 'exact', head: true })

    // Apply search filter
    if (search) {
      userQuery = userQuery.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
      countQuery = countQuery.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    // Apply isBanned filter
    if (isBanned !== null && isBanned !== undefined && isBanned !== '') {
      const isBannedBool = isBanned === 'true'
      userQuery = userQuery.eq('isBanned', isBannedBool)
      countQuery = countQuery.eq('isBanned', isBannedBool)
    }

    const [usersRes, countRes] = await Promise.all([
      userQuery,
      countQuery,
    ])

    const users = unwrap(usersRes, 'Fetch users')
    const total = countRes.count ?? 0

    return NextResponse.json({
      success: true,
      data: {
        users,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Admin list users error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
