import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, hasRole } from '@/lib/auth'
import { cache } from '@/lib/cache'

export async function GET() {
  try {
    const authUser = await getAuthUser()
    if (!authUser || !hasRole(authUser.roles.join(','), 'admin')) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Check cache
    const cacheKey = 'admin:analytics'
    const cached = cache.get<Record<string, unknown>>(cacheKey)
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
      })
    }

    // Run all analytics queries in parallel
    const [
      totalUsers,
      totalVendors,
      totalDeals,
      totalOrders,
      totalRevenue,
      dealsByStatus,
      recentUsers,
      recentVendors,
      ordersByStatus,
      topVendors,
    ] = await Promise.all([
      db.user.count(),
      db.vendor.count(),
      db.deal.count(),
      db.order.count(),
      db.order.aggregate({
        where: { status: { in: ['picked_up', 'completed'] } },
        _sum: { totalPrice: true },
      }),
      db.deal.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      db.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          roles: true,
          createdAt: true,
        },
      }),
      db.vendor.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          businessName: true,
          verificationStatus: true,
          createdAt: true,
          user: {
            select: { name: true, email: true },
          },
        },
      }),
      db.order.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      db.vendor.findMany({
        where: { totalSales: { gt: 0 } },
        take: 5,
        orderBy: { totalSales: 'desc' },
        select: {
          id: true,
          businessName: true,
          totalSales: true,
          rating: true,
        },
      }),
    ])

    const analytics = {
      overview: {
        totalUsers,
        totalVendors,
        totalDeals,
        totalOrders,
        totalRevenue: totalRevenue._sum.totalPrice || 0,
      },
      dealsByStatus: dealsByStatus.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = item._count.status
        return acc
      }, {}),
      ordersByStatus: ordersByStatus.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = item._count.status
        return acc
      }, {}),
      recentRegistrations: {
        users: recentUsers,
        vendors: recentVendors,
      },
      topVendors,
    }

    // Cache for 60 seconds
    cache.set(cacheKey, analytics, 60_000)

    return NextResponse.json({
      success: true,
      data: analytics,
    })
  } catch (error) {
    console.error('Admin analytics error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
