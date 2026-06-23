import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { haversineDistance, DEFAULT_LOCATION } from '@/lib/distance'

/**
 * GET /api/vendors/[id]/public
 *
 * Public (no auth) vendor profile page data:
 *   - Vendor business name, description, logo, cover image, food categories,
 *     address, rating, total sales, operating hours (raw JSON string).
 *   - All the vendor's ACTIVE deals (status='active' AND expiresAt > now).
 *
 * PII is stripped: contactEmail / contactPhone / verificationDocs are NOT
 * returned. Anonymous visitors get only the public-facing storefront fields.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [vendorRes, dealsRes] = await Promise.all([
      supabase
        .from('Vendor')
        .select(
          'id, businessName, description, address, latitude, longitude, logoUrl, coverImageUrl, rating, totalSales, foodCategories, operatingHours, verificationStatus, createdAt'
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('Deal')
        .select(
          'id, title, description, category, imageUrl, originalPrice, dealPrice, discountPercent, totalQuantity, reservedQuantity, soldQuantity, availableQuantity, status, expiresAt, createdAt'
        )
        .eq('vendorId', id)
        .eq('status', 'active')
        .gt('expiresAt', new Date().toISOString())
        .order('createdAt', { ascending: false })
        .limit(50),
    ])

    if (vendorRes.error) {
      console.error('Public vendor fetch error:', vendorRes.error.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!vendorRes.data) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

    const vendor = vendorRes.data
    const deals = dealsRes.data ?? []

    // Optional distance calculation — only if the caller provides lat/lng.
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
    console.error('Public vendor route error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
