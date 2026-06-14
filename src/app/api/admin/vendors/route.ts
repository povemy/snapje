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
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: Record<string, unknown> = {}

    if (status) {
      where.verificationStatus = status
    }

    if (search) {
      where.OR = [
        { businessName: { contains: search } },
        { address: { contains: search } },
        { contactEmail: { contains: search } },
      ]
    }

    const [vendors, total] = await Promise.all([
      db.vendor.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              isBanned: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              deals: {
                where: { status: 'active' },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.vendor.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        vendors,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Admin list vendors error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
