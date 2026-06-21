import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth-helpers'
import { parseRoles } from '@/lib/auth'
import { clampPagination, escapeLike } from '@/lib/pagination'

export async function GET(request: Request) {
  try {
    const authUser = await requireAdmin()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const { page, pageSize } = clampPagination(
      searchParams.get('page'),
      searchParams.get('pageSize')
    )
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

    // Apply search filter (LOW 6: escape LIKE wildcards)
    if (search) {
      const s = escapeLike(search)
      userQuery = userQuery.or(`name.ilike.%${s}%,email.ilike.%${s}%`)
      countQuery = countQuery.or(`name.ilike.%${s}%,email.ilike.%${s}%`)
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

    const rawUsers = unwrap(usersRes, 'Fetch users')
    const total = countRes.count ?? 0

    // Parse roles from comma-separated string to array
    const users = rawUsers.map((u: Record<string, unknown>) => ({
      ...u,
      roles: parseRoles(String(u.roles || '')),
    }))

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
