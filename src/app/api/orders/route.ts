import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: Record<string, unknown> = {
      userId: authUser.userId,
    }

    if (status) {
      where.status = status
    }

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        include: {
          deal: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              category: true,
            },
          },
          vendor: {
            select: {
              id: true,
              businessName: true,
              address: true,
              logoUrl: true,
              latitude: true,
              longitude: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.order.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        orders,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('List orders error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
