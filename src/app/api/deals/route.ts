import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, hasRole } from '@/lib/auth'
import { haversineDistance, DEFAULT_LOCATION, getDistanceTier } from '@/lib/distance'
import { cache } from '@/lib/cache'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const status = searchParams.get('status') || 'active'
    const lat = parseFloat(searchParams.get('lat') || '')
    const lng = parseFloat(searchParams.get('lng') || '')
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '50')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    // Build where clause
    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (category) {
      where.category = category
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ]
    }

    // Check cache
    const cacheKey = `deals:${status}:${category}:${search}:${page}:${pageSize}`
    const cached = cache.get<{ deals: unknown[]; total: number }>(cacheKey)
    if (cached && isNaN(lat) && isNaN(lng)) {
      return NextResponse.json({
        success: true,
        data: cached,
      })
    }

    const [deals, total] = await Promise.all([
      db.deal.findMany({
        where,
        include: {
          vendor: {
            select: {
              id: true,
              businessName: true,
              latitude: true,
              longitude: true,
              address: true,
              logoUrl: true,
              rating: true,
              verificationStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.deal.count({ where }),
    ])

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

    // Filter by maxDistance
    if (!isNaN(maxDistance)) {
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

    // Cache for 30 seconds if no location
    if (isNaN(lat) && isNaN(lng)) {
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

    // Find vendor profile
    const vendor = await db.vendor.findFirst({
      where: { userId: authUser.userId },
    })

    if (!vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor profile not found' },
        { status: 404 }
      )
    }

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

    if (dealPrice >= originalPrice) {
      return NextResponse.json(
        { success: false, error: 'Deal price must be less than original price' },
        { status: 400 }
      )
    }

    if (totalQuantity < 1) {
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
    const discountPercent = Math.round(((originalPrice - dealPrice) / originalPrice) * 100)

    const deal = await db.deal.create({
      data: {
        vendorId: vendor.id,
        title: title.trim(),
        description: description.trim(),
        category,
        imageUrl: imageUrl || null,
        originalPrice: parseFloat(originalPrice),
        dealPrice: parseFloat(dealPrice),
        discountPercent,
        totalQuantity: parseInt(totalQuantity),
        reservedQuantity: 0,
        soldQuantity: 0,
        availableQuantity: parseInt(totalQuantity),
        maxClaimsPerUser: maxClaimsPerUser || 1,
        status: 'active',
        pickupOnly: true,
        pickupInstructions: pickupInstructions || null,
        publicAccessAt: new Date(),
        expiresAt: expiresDate,
      },
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            latitude: true,
            longitude: true,
            address: true,
            logoUrl: true,
            rating: true,
          },
        },
      },
    })

    // Invalidate cache
    cache.delete('deals:active')

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
