import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'
import { clampPagination } from '@/lib/pagination'

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
    const vendorMode = searchParams.get('vendor') === 'true'
    const { page, pageSize } = clampPagination(
      searchParams.get('page'),
      searchParams.get('pageSize')
    )
    const skip = (page - 1) * pageSize

    let query = supabase
      .from('Order')
      .select('*, deal:Deal(id, title, imageUrl, category, pickupInstructions), vendor:Vendor(id, businessName, address, logoUrl, latitude, longitude, userId)')
      .order('createdAt', { ascending: false })
      .range(skip, skip + pageSize - 1)

    let countQuery = supabase
      .from('Order')
      .select('*', { count: 'exact', head: true })

    if (vendorMode && hasRole(authUser.roles.join(','), 'vendor')) {
      // Vendor mode: show orders for this vendor's store
      // First find the vendor profile
      const vendorRes = await supabase
        .from('Vendor')
        .select('id')
        .eq('userId', authUser.userId)
        .limit(1)
        .maybeSingle()

      if (vendorRes.data) {
        query = query.eq('vendorId', vendorRes.data.id)
        countQuery = countQuery.eq('vendorId', vendorRes.data.id)
      } else {
        // No vendor profile — return empty
        return NextResponse.json({
          success: true,
          data: { orders: [], total: 0, page, pageSize, totalPages: 0 },
        })
      }
    } else {
      // Default: show user's own orders (foodie mode)
      query = query.eq('userId', authUser.userId)
      countQuery = countQuery.eq('userId', authUser.userId)
    }

    if (status) {
      query = query.eq('status', status)
      countQuery = countQuery.eq('status', status)
    }

    const [ordersRes, countRes] = await Promise.all([
      query,
      countQuery,
    ])

    const orders = unwrap(ordersRes, 'List orders')
    const total = countRes.count ?? 0

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
