import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth-helpers'
import { cache } from '@/lib/cache'

export async function GET() {
  try {
    const authUser = await requireAdmin()
    if (!authUser) {
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
      totalUsersRes,
      totalVendorsRes,
      totalDealsRes,
      totalOrdersRes,
      revenueRes,
      dealsStatusRes,
      recentUsersRes,
      recentVendorsRes,
      ordersStatusRes,
      topVendorsRes,
    ] = await Promise.all([
      supabase.from('User').select('*', { count: 'exact', head: true }),
      supabase.from('Vendor').select('*', { count: 'exact', head: true }),
      supabase.from('Deal').select('*', { count: 'exact', head: true }),
      supabase.from('Order').select('*', { count: 'exact', head: true }),
      supabase.from('Order').select('totalPrice').in('status', ['picked_up', 'completed']),
      supabase.from('Deal').select('status'),
      supabase.from('User').select('id, name, email, roles, createdAt').order('createdAt', { ascending: false }).limit(5),
      supabase.from('Vendor').select('id, businessName, verificationStatus, createdAt, user:User(name, email)').order('createdAt', { ascending: false }).limit(5),
      supabase.from('Order').select('status'),
      supabase.from('Vendor').select('id, businessName, totalSales, rating').gt('totalSales', 0).order('totalSales', { ascending: false }).limit(5),
    ])

    // Unwrap data responses
    const totalUsers = totalUsersRes.count ?? 0
    const totalVendors = totalVendorsRes.count ?? 0
    const totalDeals = totalDealsRes.count ?? 0
    const totalOrders = totalOrdersRes.count ?? 0

    // Calculate total revenue in-memory
    const revenueData = unwrap(revenueRes, 'Fetch revenue')
    const totalRevenue = revenueData.reduce((sum, o) => sum + (o.totalPrice || 0), 0)

    // Group deals by status in-memory
    const dealsData = unwrap(dealsStatusRes, 'Fetch deals status')
    const dealsByStatus = dealsData.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})

    // Group orders by status in-memory
    const ordersData = unwrap(ordersStatusRes, 'Fetch orders status')
    const ordersByStatus = ordersData.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})

    // Recent users
    const recentUsers = unwrap(recentUsersRes, 'Fetch recent users')

    // Recent vendors (flatten user relation for response compatibility)
    const recentVendorsRaw = unwrap(recentVendorsRes, 'Fetch recent vendors')
    const recentVendors = recentVendorsRaw.map((v) => ({
      id: v.id,
      businessName: v.businessName,
      verificationStatus: v.verificationStatus,
      createdAt: v.createdAt,
      user: v.user,
    }))

    // Top vendors
    const topVendors = unwrap(topVendorsRes, 'Fetch top vendors')

    // *** Historical Analysis: Daily active deals and total orders for the last 14 days ***
    const dailyDeals: { date: string; count: number }[] = []
    const dailyOrders: { date: string; count: number }[] = []

    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now)
      day.setDate(day.getDate() - i)
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
      const dateLabel = dayStart.toISOString().slice(0, 10) // YYYY-MM-DD

      dailyDeals.push({ date: dateLabel, count: 0 })
      dailyOrders.push({ date: dateLabel, count: 0 })
    }

    // Fetch all deals created in the last 14 days to count daily active
    const fourteenDaysAgo = new Date(now)
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString()

    const [recentDealsRes, recentOrdersRes] = await Promise.all([
      supabase
        .from('Deal')
        .select('createdAt, status')
        .gte('createdAt', fourteenDaysAgoStr),
      supabase
        .from('Order')
        .select('createdAt')
        .gte('createdAt', fourteenDaysAgoStr),
    ])

    // Count deals per day
    const recentDeals = unwrap(recentDealsRes, 'Fetch recent deals for chart')
    recentDeals.forEach((deal) => {
      const dateLabel = deal.createdAt.slice(0, 10)
      const entry = dailyDeals.find(d => d.date === dateLabel)
      if (entry) entry.count++
    })

    // Count orders per day
    const recentOrders = unwrap(recentOrdersRes, 'Fetch recent orders for chart')
    recentOrders.forEach((order) => {
      const dateLabel = order.createdAt.slice(0, 10)
      const entry = dailyOrders.find(d => d.date === dateLabel)
      if (entry) entry.count++
    })

    const analytics = {
      overview: {
        totalUsers,
        totalVendors,
        totalDeals,
        totalOrders,
        totalRevenue,
      },
      dealsByStatus,
      ordersByStatus,
      recentRegistrations: {
        users: recentUsers,
        vendors: recentVendors,
      },
      topVendors,
      historical: {
        dailyDeals,
        dailyOrders,
      },
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
