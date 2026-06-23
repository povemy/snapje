import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'
import { haversineDistance, DEFAULT_LOCATION } from '@/lib/distance'
import { cache } from '@/lib/cache'
import { isAllowedMediaUrl } from '@/lib/media/storage'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // HIGH 4 (PII leak): split into two queries — the vendor row is public, but
    // we MUST NOT join the user table and leak the vendor owner's personal
    // email/phone to anonymous visitors. We also strip contactEmail/contactPhone
    // from the public payload; those are surfaced only via the vendor's own
    // authenticated endpoints (`?my=true`).
    const [vendorRes, dealsRes] = await Promise.all([
      supabase
        .from('Vendor')
        .select(
          'id, businessName, description, address, latitude, longitude, logoUrl, coverImageUrl, rating, totalSales, foodCategories, operatingHours, verificationStatus, createdAt, userId'
        )
        .eq('id', id)
        .single(),
      supabase
        .from('Deal')
        .select('*')
        .eq('vendorId', id)
        .eq('status', 'active')
        .order('createdAt', { ascending: false })
        .limit(10),
    ])

    if (vendorRes.error || !vendorRes.data) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

    const vendor = vendorRes.data
    const deals = dealsRes.data ?? []

    // Calculate distance
    const { searchParams } = new URL(request.url)
    const lat = parseFloat(searchParams.get('lat') || '')
    const lng = parseFloat(searchParams.get('lng') || '')
    const userLocation = !isNaN(lat) && !isNaN(lng)
      ? { latitude: lat, longitude: lng }
      : DEFAULT_LOCATION

    const distance = haversineDistance(userLocation, {
      latitude: vendor.latitude,
      longitude: vendor.longitude,
    })

    return NextResponse.json({
      success: true,
      data: {
        ...vendor,
        deals,
        distance: Math.round(distance * 10) / 10,
      },
    })
  } catch (error) {
    console.error('Get vendor error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const vendorRes = await supabase
      .from('Vendor')
      .select('*')
      .eq('id', id)
      .single()

    if (vendorRes.error || !vendorRes.data) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

    const vendor = vendorRes.data

    // Check ownership or admin
    const isAdmin = hasRole(authUser.roles.join(','), 'admin')
    if (vendor.userId !== authUser.userId && !isAdmin) {
      return NextResponse.json(
        { success: false, error: 'You can only update your own vendor profile' },
        { status: 403 }
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
      logoUrl,
      coverImageUrl,
    } = body

    const updateData: Record<string, unknown> = {}

    if (businessName !== undefined) updateData.businessName = businessName.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail.trim()
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone.trim()
    if (address !== undefined) updateData.address = address.trim()
    if (latitude !== undefined) {
      // LOW 7: validate latitude range
      const latNum = Number(latitude)
      if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
        return NextResponse.json(
          { success: false, error: 'latitude must be a number in [-90, 90]' },
          { status: 400 }
        )
      }
      updateData.latitude = latNum
    }
    if (longitude !== undefined) {
      const lngNum = Number(longitude)
      if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
        return NextResponse.json(
          { success: false, error: 'longitude must be a number in [-180, 180]' },
          { status: 400 }
        )
      }
      updateData.longitude = lngNum
    }
    if (operatingHours !== undefined) updateData.operatingHours = JSON.stringify(operatingHours)
    if (foodCategories !== undefined) updateData.foodCategories = JSON.stringify(foodCategories)
    // HIGH 6: URL allowlist — only allow media URLs hosted on our Supabase
    // bucket or our portable /api/media/serve/ path. Blocks SSRF / arbitrary
    // external image injection.
    if (logoUrl !== undefined) {
      if (logoUrl && !isAllowedMediaUrl(logoUrl)) {
        return NextResponse.json(
          { success: false, error: 'logoUrl must be a valid media URL' },
          { status: 400 }
        )
      }
      updateData.logoUrl = logoUrl
    }
    if (coverImageUrl !== undefined) {
      if (coverImageUrl && !isAllowedMediaUrl(coverImageUrl)) {
        return NextResponse.json(
          { success: false, error: 'coverImageUrl must be a valid media URL' },
          { status: 400 }
        )
      }
      updateData.coverImageUrl = coverImageUrl
    }

    const updatedVendor = unwrap(
      await supabase
        .from('Vendor')
        .update(updateData)
        .eq('id', id)
        .select('*, user:User(id, name, email)')
        .single(),
      'Update vendor'
    )

    // Invalidate deals cache — deals cache the vendor's businessName/logoUrl,
    // so any vendor update must clear the cache to avoid stale names on cards.
    cache.deleteByPrefix('deals:')

    return NextResponse.json({
      success: true,
      data: updatedVendor,
    })
  } catch (error) {
    console.error('Update vendor error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Also export as PUT — the client (Vendor Settings Business Name save) sends
// PUT, but Next.js route handlers only match exact method names. Route the PUT
// to the same PATCH handler so both work.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return PATCH(request, { params })
}
