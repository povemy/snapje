import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'
import { haversineDistance, DEFAULT_LOCATION, getDistanceTier } from '@/lib/distance'
import { cache } from '@/lib/cache'
import { isAllowedMediaUrl } from '@/lib/media/storage'
import { clampPagination, escapeLike } from '@/lib/pagination'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const status = searchParams.get('status') || 'active'
    const vendorId = searchParams.get('vendorId')
    const lat = parseFloat(searchParams.get('lat') || '')
    const lng = parseFloat(searchParams.get('lng') || '')
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '50')
    const search = searchParams.get('search')
    const { page, pageSize } = clampPagination(
      searchParams.get('page'),
      searchParams.get('pageSize')
    )

    // Check cache (skip if vendorId or all status - vendor-specific data)
    const isVendorQuery = !!vendorId || status === 'all'
    const cacheKey = `deals:${status}:${category}:${search}:${page}:${pageSize}:${vendorId || ''}`
    if (!isVendorQuery) {
      const cached = cache.get<{ deals: unknown[]; total: number }>(cacheKey)
      if (cached && isNaN(lat) && isNaN(lng)) {
        return NextResponse.json({
          success: true,
          data: cached,
        })
      }
    }

    // Build Supabase query for deals
    const skip = (page - 1) * pageSize

    let dealsQuery = supabase
      .from('Deal')
      .select('*, vendor:Vendor(id, businessName, latitude, longitude, address, logoUrl, rating, verificationStatus)')
      .order('createdAt', { ascending: false })
      .range(skip, skip + pageSize - 1)

    let countQuery = supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true })

    // Apply status filter (skip if 'all')
    if (status !== 'all') {
      dealsQuery = dealsQuery.eq('status', status)
      countQuery = countQuery.eq('status', status)
    }

    // Apply vendorId filter
    if (vendorId) {
      dealsQuery = dealsQuery.eq('vendorId', vendorId)
      countQuery = countQuery.eq('vendorId', vendorId)
    }

    // Apply category filter
    if (category) {
      dealsQuery = dealsQuery.eq('category', category)
      countQuery = countQuery.eq('category', category)
    }

    // Apply search filter (LOW 6: escape LIKE wildcards)
    if (search) {
      const s = escapeLike(search)
      dealsQuery = dealsQuery.or(`title.ilike.%${s}%,description.ilike.%${s}%`)
      countQuery = countQuery.or(`title.ilike.%${s}%,description.ilike.%${s}%`)
    }

    const [dealsResponse, countResponse] = await Promise.all([
      dealsQuery,
      countQuery,
    ])

    const deals = unwrap(dealsResponse, 'List deals')
    const total = countResponse.count ?? 0

    // Calculate distance for each deal
    const userLocation = !isNaN(lat) && !isNaN(lng)
      ? { latitude: lat, longitude: lng }
      : DEFAULT_LOCATION

    let dealsWithDistance = deals.map((deal) => {
      const distance = haversineDistance(userLocation, {
        latitude: deal.vendor.latitude,
        longitude: deal.vendor.longitude,
      })

      return {
        ...deal,
        distance: Math.round(distance * 10) / 10,
        distanceTier: getDistanceTier(distance),
      }
    })

    // Filter by maxDistance — ONLY when the user provided a location.
    // When no lat/lng is provided (e.g. the Explore page), show ALL active deals
    // regardless of distance, so newly created deals from any vendor appear.
    const hasUserLocation = !isNaN(lat) && !isNaN(lng)
    if (hasUserLocation && !isNaN(maxDistance)) {
      dealsWithDistance = dealsWithDistance.filter(
        (deal) => deal.distance <= maxDistance
      )
    }

    // Sort by distance tier then discount
    dealsWithDistance.sort((a, b) => {
      if (a.distanceTier !== b.distanceTier) {
        return a.distanceTier - b.distanceTier
      }
      return b.discountPercent - a.discountPercent
    })

    const result = {
      deals: dealsWithDistance,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }

    // Cache for 30 seconds if no location (explore page) and not a vendor query.
    // Cache is properly invalidated via deleteByPrefix('deals:') on create/update/delete.
    if (!isVendorQuery && !hasUserLocation) {
      cache.set(cacheKey, result, 30_000)
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('List deals error:', error)
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

    if (!hasRole(authUser.roles.join(','), 'vendor')) {
      return NextResponse.json(
        { success: false, error: 'Only vendors can create deals' },
        { status: 403 }
      )
    }

    // Find vendor profile (use maybeSingle to handle 0 or 1 results gracefully)
    const vendorRes = await supabase.from('Vendor').select('*').eq('userId', authUser.userId).limit(1).maybeSingle()
    if (!vendorRes.data) {
      return NextResponse.json(
        { success: false, error: 'Vendor profile not found. Please create a vendor profile first.' },
        { status: 404 }
      )
    }
    if (vendorRes.error) {
      console.error('Find vendor profile error:', vendorRes.error.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    const vendor = vendorRes.data

    if (vendor.verificationStatus !== 'approved') {
      return NextResponse.json(
        { success: false, error: 'Your vendor account must be approved before creating deals' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      title,
      description,
      category,
      imageUrl,
      originalPrice,
      dealPrice,
      totalQuantity,
      maxClaimsPerUser,
      expiresAt,
      pickupInstructions,
    } = body

    // Validation
    if (!title || !description || !category || !originalPrice || !dealPrice || !totalQuantity || !expiresAt) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: title, description, category, originalPrice, dealPrice, totalQuantity, expiresAt' },
        { status: 400 }
      )
    }

    // HIGH 6: URL allowlist — block arbitrary external image URLs.
    if (imageUrl && !isAllowedMediaUrl(imageUrl)) {
      return NextResponse.json(
        { success: false, error: 'imageUrl must be a valid media URL hosted on FlashBite storage' },
        { status: 400 }
      )
    }

    // CRITICAL FIX: validate prices and quantities as positive finite numbers
    // before any comparison/storage. Prevents negative/zero/NaN/non-finite
    // inputs from being silently stored.
    const origPriceNum = Number(originalPrice)
    const dealPriceNum = Number(dealPrice)
    const totalQtyNum = Number(totalQuantity)

    if (!Number.isFinite(origPriceNum) || !Number.isFinite(dealPriceNum) || !Number.isFinite(totalQtyNum)) {
      return NextResponse.json(
        { success: false, error: 'originalPrice, dealPrice, and totalQuantity must be valid finite numbers' },
        { status: 400 }
      )
    }
    if (origPriceNum <= 0 || dealPriceNum <= 0) {
      return NextResponse.json(
        { success: false, error: 'originalPrice and dealPrice must be greater than 0' },
        { status: 400 }
      )
    }
    if (!Number.isInteger(totalQtyNum) || totalQtyNum < 1) {
      return NextResponse.json(
        { success: false, error: 'totalQuantity must be a positive integer (>= 1)' },
        { status: 400 }
      )
    }

    if (dealPriceNum >= origPriceNum) {
      return NextResponse.json(
        { success: false, error: 'Deal price must be less than original price' },
        { status: 400 }
      )
    }

    if (totalQtyNum < 1) {
      return NextResponse.json(
        { success: false, error: 'Total quantity must be at least 1' },
        { status: 400 }
      )
    }

    const expiresDate = new Date(expiresAt)
    if (expiresDate <= new Date()) {
      return NextResponse.json(
        { success: false, error: 'Expiration date must be in the future' },
        { status: 400 }
      )
    }

    // Calculate discount percent
    const discountPercent = Math.round(((origPriceNum - dealPriceNum) / origPriceNum) * 100)

    const deal = unwrap(
      await supabase.from('Deal').insert({
        id: genId('deal'),
        vendorId: vendor.id,
        title: title.trim(),
        description: description.trim(),
        category,
        imageUrl: imageUrl || null,
        originalPrice: origPriceNum,
        dealPrice: dealPriceNum,
        discountPercent,
        totalQuantity: totalQtyNum,
        reservedQuantity: 0,
        soldQuantity: 0,
        availableQuantity: totalQtyNum,
        maxClaimsPerUser: maxClaimsPerUser || 1,
        status: 'active',
        pickupOnly: true,
        pickupInstructions: pickupInstructions || null,
        publicAccessAt: new Date().toISOString(),
        expiresAt: expiresDate.toISOString(),
      }).select('*, vendor:Vendor(id, businessName, latitude, longitude, address, logoUrl, rating)').single(),
      'Create deal'
    )

    // Invalidate cache — clear ALL deal cache entries (the cache key format is
    // `deals:${status}:${category}:${search}:${page}:${pageSize}:${vendorId}`,
    // so a single delete('deals:active') would miss most keys).
    cache.deleteByPrefix('deals:')

    return NextResponse.json({
      success: true,
      data: deal,
    }, { status: 201 })
  } catch (error) {
    console.error('Create deal error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
