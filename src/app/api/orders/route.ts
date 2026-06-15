import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
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
    const skip = (page - 1) * pageSize

    let query = supabase
      .from('Order')
      .select('*, deal:Deal(id, title, imageUrl, category), vendor:Vendor(id, businessName, address, logoUrl, latitude, longitude)')
      .eq('userId', authUser.userId)
      .order('createdAt', { ascending: false })
      .range(skip, skip + pageSize - 1)

    // Build count query (same filters, no pagination)
    let countQuery = supabase
      .from('Order')
      .select('*', { count: 'exact', head: true })
      .eq('userId', authUser.userId)

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
