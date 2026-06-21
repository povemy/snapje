import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth-helpers'
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
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const { page, pageSize } = clampPagination(
      searchParams.get('page'),
      searchParams.get('pageSize')
    )

    const skip = (page - 1) * pageSize

    // Build vendor query with user join
    let vendorQuery = supabase
      .from('Vendor')
      .select('*, user:User(id, name, email, phone, isBanned, createdAt)')
      .order('createdAt', { ascending: false })
      .range(skip, skip + pageSize - 1)

    // Build count query
    let countQuery = supabase
      .from('Vendor')
      .select('*', { count: 'exact', head: true })

    // Apply status filter
    if (status) {
      vendorQuery = vendorQuery.eq('verificationStatus', status)
      countQuery = countQuery.eq('verificationStatus', status)
    }

    // Apply search filter (LOW 6: escape LIKE wildcards)
    if (search) {
      const s = escapeLike(search)
      vendorQuery = vendorQuery.or(`businessName.ilike.%${s}%,address.ilike.%${s}%,contactEmail.ilike.%${s}%`)
      countQuery = countQuery.or(`businessName.ilike.%${s}%,address.ilike.%${s}%,contactEmail.ilike.%${s}%`)
    }

    const [vendorsRes, countRes] = await Promise.all([
      vendorQuery,
      countQuery,
    ])

    const vendors = unwrap(vendorsRes, 'Fetch vendors')
    const total = countRes.count ?? 0

    // Get active deal counts for all vendor IDs
    const vendorIds = vendors.map((v) => v.id)
    let activeDealsByVendor: Record<string, number> = {}

    if (vendorIds.length > 0) {
      const activeDealsRes = await supabase
        .from('Deal')
        .select('vendorId')
        .eq('status', 'active')
        .in('vendorId', vendorIds)

      const activeDeals = unwrap(activeDealsRes, 'Fetch active deals count')
      activeDealsByVendor = activeDeals.reduce<Record<string, number>>((acc, item) => {
        acc[item.vendorId] = (acc[item.vendorId] || 0) + 1
        return acc
      }, {})
    }

    // Merge active deal counts into vendor objects as _count
    const vendorsWithCount = vendors.map((v) => ({
      ...v,
      _count: {
        deals: activeDealsByVendor[v.id] || 0,
      },
    }))

    return NextResponse.json({
      success: true,
      data: {
        vendors: vendorsWithCount,
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
