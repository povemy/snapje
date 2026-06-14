import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
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

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ]
    }

    if (isBanned !== null && isBanned !== undefined && isBanned !== '') {
      where.isBanned = isBanned === 'true'
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          avatarUrl: true,
          roles: true,
          activeRole: true,
          emailVerified: true,
          isBanned: true,
          createdAt: true,
          updatedAt: true,
          vendor: {
            select: {
              id: true,
              businessName: true,
              verificationStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.user.count({ where }),
    ])

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
