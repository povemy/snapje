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
      .select('id, email, name, phone, avatarUrl, roles, activeRole, emailVerified, isBanned, vipFlag, createdAt, updatedAt, vendor:Vendor(id, businessName, verificationStatus)')
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

/**
 * PATCH /api/admin/users
 *
 * Admin edits a user. Body:
 *   { userId: string, vipFlag?, isBanned?, roles?, activeRole? }
 *
 * - `roles` may be passed as a string[] (joined with commas) or as a
 *   pre-joined comma-separated string. We re-stringify before saving.
 * - `activeRole` must be one of the values present in `roles` after the
 *   update (best-effort validation — admins are trusted, but we still
 *   sanity-check the format).
 *
 * Returns the updated user row (passwordHash stripped) with the same
 * vendor join shape as the GET route so the client can drop-in replace.
 */
export async function PATCH(request: Request) {
  try {
    const authUser = await requireAdmin()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { userId } = body as { userId?: string }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      )
    }

    const update: Record<string, unknown> = {}

    if (body.vipFlag !== undefined) {
      update.vipFlag = !!body.vipFlag
    }
    if (body.isBanned !== undefined) {
      update.isBanned = !!body.isBanned
    }
    if (body.roles !== undefined) {
      // Accept string[] or comma-separated string. Normalize to a trimmed
      // comma-separated string.
      const arr = Array.isArray(body.roles)
        ? body.roles
        : typeof body.roles === 'string'
          ? body.roles.split(',')
          : []
      const cleaned = parseRoles(arr.join(','))
      if (cleaned.length === 0) {
        return NextResponse.json(
          { success: false, error: 'roles must contain at least one valid role' },
          { status: 400 }
        )
      }
      update.roles = cleaned.join(',')
    }
    if (body.activeRole !== undefined) {
      if (typeof body.activeRole !== 'string' || !body.activeRole.trim()) {
        return NextResponse.json(
          { success: false, error: 'activeRole must be a non-empty string' },
          { status: 400 }
        )
      }
      update.activeRole = body.activeRole.trim()
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No updatable fields supplied' },
        { status: 400 }
      )
    }

    // Verify the user exists before updating.
    const existing = await supabase
      .from('User')
      .select('id, roles, activeRole')
      .eq('id', userId)
      .maybeSingle()
    if (existing.error) {
      console.error('Admin PATCH user — lookup error:', existing.error.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    if (!existing.data) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // If activeRole is being changed, ensure it's in the new (or existing)
    // roles list — otherwise the user would be in an inconsistent state.
    if (update.activeRole !== undefined) {
      const rolesSource =
        typeof update.roles === 'string'
          ? update.roles
          : (existing.data.roles as string)
      const rolesList = parseRoles(rolesSource)
      if (!rolesList.includes(update.activeRole as string)) {
        return NextResponse.json(
          {
            success: false,
            error: `activeRole must be one of the user's roles: ${rolesList.join(', ')}`,
          },
          { status: 400 }
        )
      }
    }

    unwrap(
      await supabase.from('User').update(update).eq('id', userId),
      'Admin update user'
    )

    // Re-fetch the updated row with the same shape as the GET route so the
    // client can drop-in replace the user object in its list.
    const refreshedRes = await supabase
      .from('User')
      .select(
        'id, email, name, phone, avatarUrl, roles, activeRole, emailVerified, isBanned, vipFlag, createdAt, updatedAt, vendor:Vendor(id, businessName, verificationStatus)'
      )
      .eq('id', userId)
      .maybeSingle()

    if (refreshedRes.error || !refreshedRes.data) {
      // Update succeeded but re-fetch failed — return a minimal success.
      return NextResponse.json({
        success: true,
        data: { id: userId, ...update },
        message: 'User updated (refresh failed)',
      })
    }

    const refreshed = refreshedRes.data as Record<string, unknown>
    const userWithParsedRoles = {
      ...refreshed,
      roles: parseRoles(String(refreshed.roles || '')),
    }

    return NextResponse.json({
      success: true,
      data: userWithParsedRoles,
      message: 'User updated successfully',
    })
  } catch (error) {
    console.error('Admin PATCH user error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
