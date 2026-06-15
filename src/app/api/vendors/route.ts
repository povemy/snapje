import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
import { getAuthUser, hasRole, parseRoles } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const my = searchParams.get('my')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    let query = supabase
      .from('Vendor')
      .select('*, user:User(id, name, email, phone, avatarUrl)')
      .order('createdAt', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    // If "my" parameter, return only the current user's vendor
    if (my === 'true') {
      const authUser = await getAuthUser()
      if (authUser) {
        query = query.eq('userId', authUser.userId)
      }
    }

    if (status) {
      query = query.eq('verificationStatus', status)
    }

    if (search) {
      query = query.or(`businessName.ilike.%${search}%,address.ilike.%${search}%`)
    }

    // Build count query (same filters, but no pagination)
    let countQuery = supabase
      .from('Vendor')
      .select('*', { count: 'exact', head: true })

    if (my === 'true') {
      const authUser = await getAuthUser()
      if (authUser) {
        countQuery = countQuery.eq('userId', authUser.userId)
      }
    }

    if (status) {
      countQuery = countQuery.eq('verificationStatus', status)
    }

    if (search) {
      countQuery = countQuery.or(`businessName.ilike.%${search}%,address.ilike.%${search}%`)
    }

    const [vendorsRes, countRes] = await Promise.all([
      query,
      countQuery,
    ])

    const vendors = unwrap(vendorsRes, 'List vendors')
    const total = countRes.count ?? 0

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
    console.error('List vendors error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Check if user already has a vendor profile
    const existingVendorRes = await supabase
      .from('Vendor')
      .select('*')
      .eq('userId', authUser.userId)
      .limit(1)
      .maybeSingle()

    if (existingVendorRes.data) {
      return NextResponse.json(
        { success: false, error: 'You already have a vendor profile' },
        { status: 409 }
      )
    }

    const body = await request.json()
    const {
      businessName,
      description,
      contactEmail,
      contactPhone,
      address,
      latitude,
      longitude,
      operatingHours,
      foodCategories,
    } = body

    // Validation
    if (!businessName || !contactEmail || !contactPhone || !address || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: businessName, contactEmail, contactPhone, address, latitude, longitude' },
        { status: 400 }
      )
    }

    // Get user
    const user = unwrap(
      await supabase.from('User').select('*').eq('id', authUser.userId).single(),
      'Find user for vendor registration'
    )

    const currentRoles = parseRoles(user.roles)
    if (!currentRoles.includes('vendor')) {
      currentRoles.push('vendor')
    }

    // Sequential: update user roles, then create vendor
    unwrap(
      await supabase
        .from('User')
        .update({ roles: currentRoles.join(',') })
        .eq('id', authUser.userId),
      'Update user roles'
    )

    const vendor = unwrap(
      await supabase
        .from('Vendor')
        .insert({
          id: genId('vendor'),
          userId: authUser.userId,
          businessName: businessName.trim(),
          description: description?.trim() || null,
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          address: address.trim(),
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          operatingHours: operatingHours ? JSON.stringify(operatingHours) : '{}',
          foodCategories: foodCategories ? JSON.stringify(foodCategories) : '[]',
          verificationStatus: 'pending',
        })
        .select('*, user:User(id, name, email)')
        .single(),
      'Create vendor'
    )

    return NextResponse.json({
      success: true,
      data: vendor,
    }, { status: 201 })
  } catch (error) {
    console.error('Register vendor error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
