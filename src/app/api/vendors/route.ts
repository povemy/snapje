import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
import { getAuthUser, hasRole, parseRoles } from '@/lib/auth'
import { clampPagination, escapeLike } from '@/lib/pagination'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const my = searchParams.get('my')
    const { page, pageSize } = clampPagination(
      searchParams.get('page'),
      searchParams.get('pageSize')
    )

    // LOW 7: lat/lng range validation (used by some clients for proximity queries)
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    if (lat !== null) {
      const latNum = Number(lat)
      if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
        return NextResponse.json(
          { success: false, error: 'lat must be a number in [-90, 90]' },
          { status: 400 }
        )
      }
    }
    if (lng !== null) {
      const lngNum = Number(lng)
      if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
        return NextResponse.json(
          { success: false, error: 'lng must be a number in [-180, 180]' },
          { status: 400 }
        )
      }
    }

    // HIGH 4 (PII leak): public vendor listings MUST NOT expose the vendor's
    // personal user email/phone. Select only public business fields. When the
    // caller requests their OWN vendor (`?my=true`) and is authenticated, we
    // additionally include the linked User fields so the vendor dashboard can
    // render the user's name/email/phone/avatar.
    const publicVendorSelect =
      'id, businessName, description, address, latitude, longitude, logoUrl, coverImageUrl, rating, totalSales, foodCategories, operatingHours, verificationStatus, createdAt'
    const ownVendorSelect =
      '*, user:User(id, name, email, phone, avatarUrl)'

    // If "my" parameter, return only the current user's vendor.
    // HIGH 4: if not authenticated, fall through to an empty result so we
    // don't leak all vendors when an unauthenticated caller sends ?my=true.
    let authenticatedUserId: string | null = null
    if (my === 'true') {
      const authUser = await getAuthUser()
      if (authUser) {
        authenticatedUserId = authUser.userId
      } else {
        return NextResponse.json({
          success: true,
          data: { vendors: [], total: 0, page, pageSize, totalPages: 0 },
        })
      }
    }

    const selectFields = my === 'true' ? ownVendorSelect : publicVendorSelect

    let query = supabase
      .from('Vendor')
      .select(selectFields)
      .order('createdAt', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (my === 'true' && authenticatedUserId) {
      query = query.eq('userId', authenticatedUserId)
    }

    if (status) {
      query = query.eq('verificationStatus', status)
    }

    if (search) {
      // LOW 6: escape LIKE wildcards to prevent injection.
      const s = escapeLike(search)
      query = query.or(`businessName.ilike.%${s}%,address.ilike.%${s}%`)
    }

    // Build count query (same filters, but no pagination)
    let countQuery = supabase
      .from('Vendor')
      .select('*', { count: 'exact', head: true })

    if (my === 'true' && authenticatedUserId) {
      countQuery = countQuery.eq('userId', authenticatedUserId)
    }

    if (status) {
      countQuery = countQuery.eq('verificationStatus', status)
    }

    if (search) {
      const s = escapeLike(search)
      countQuery = countQuery.or(`businessName.ilike.%${s}%,address.ilike.%${s}%`)
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

    // LOW 7: validate lat/lng ranges before storage.
    const latNum = Number(latitude)
    const lngNum = Number(longitude)
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      return NextResponse.json(
        { success: false, error: 'latitude must be a finite number in [-90, 90]' },
        { status: 400 }
      )
    }
    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      return NextResponse.json(
        { success: false, error: 'longitude must be a finite number in [-180, 180]' },
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
          latitude: latNum,
          longitude: lngNum,
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
