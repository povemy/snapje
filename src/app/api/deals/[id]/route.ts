import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'
import { haversineDistance, DEFAULT_LOCATION } from '@/lib/distance'
import { cache } from '@/lib/cache'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const deal = unwrap(
      await supabase
        .from('Deal')
        .select('*, vendor:Vendor(id, businessName, description, latitude, longitude, address, logoUrl, coverImageUrl, rating, totalSales, foodCategories, operatingHours, verificationStatus)')
        .eq('id', id)
        .single(),
      'Get deal'
    )

    // Calculate distance if user provides location
    const { searchParams } = new URL(request.url)
    const lat = parseFloat(searchParams.get('lat') || '')
    const lng = parseFloat(searchParams.get('lng') || '')
    const userLocation = !isNaN(lat) && !isNaN(lng)
      ? { latitude: lat, longitude: lng }
      : DEFAULT_LOCATION

    const distance = haversineDistance(userLocation, {
      latitude: deal.vendor.latitude,
      longitude: deal.vendor.longitude,
    })

    return NextResponse.json({
      success: true,
      data: {
        ...deal,
        distance: Math.round(distance * 10) / 10,
      },
    })
  } catch (error) {
    // Check if it's a "not found" error from Supabase (PGRST116)
    if (error && typeof error === 'object' && 'message' in error && String(error.message).includes('0 rows')) {
      return NextResponse.json(
        { success: false, error: 'Deal not found' },
        { status: 404 }
      )
    }
    console.error('Get deal error:', error)
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

    // Find the deal with vendor
    const deal = unwrap(
      await supabase
        .from('Deal')
        .select('*, vendor:Vendor(*)')
        .eq('id', id)
        .single(),
      'Find deal for update'
    )

    // Check ownership
    if (deal.vendor.userId !== authUser.userId && !hasRole(authUser.roles.join(','), 'admin')) {
      return NextResponse.json(
        { success: false, error: 'You can only update your own deals' },
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
      status,
      expiresAt,
      pickupInstructions,
    } = body

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (title !== undefined) updateData.title = title.trim()
    if (description !== undefined) updateData.description = description.trim()
    if (category !== undefined) updateData.category = category
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl
    if (pickupInstructions !== undefined) updateData.pickupInstructions = pickupInstructions
    if (status !== undefined) updateData.status = status
    if (expiresAt !== undefined) updateData.expiresAt = new Date(expiresAt).toISOString()

    if (originalPrice !== undefined) updateData.originalPrice = parseFloat(originalPrice)
    if (dealPrice !== undefined) updateData.dealPrice = parseFloat(dealPrice)

    // Recalculate discount if prices changed
    if (originalPrice !== undefined || dealPrice !== undefined) {
      const origP = parseFloat(originalPrice ?? deal.originalPrice.toString())
      const dealP = parseFloat(dealPrice ?? deal.dealPrice.toString())
      if (dealP >= origP) {
        return NextResponse.json(
          { success: false, error: 'Deal price must be less than original price' },
          { status: 400 }
        )
      }
      updateData.discountPercent = Math.round(((origP - dealP) / origP) * 100)
    }

    // Recalculate availableQuantity if totalQuantity changed
    if (totalQuantity !== undefined) {
      const newTotal = parseInt(totalQuantity)
      if (newTotal < deal.soldQuantity + deal.reservedQuantity) {
        return NextResponse.json(
          { success: false, error: 'Cannot reduce total quantity below sold + reserved items' },
          { status: 400 }
        )
      }
      updateData.totalQuantity = newTotal
      updateData.availableQuantity = newTotal - deal.soldQuantity - deal.reservedQuantity
    }

    const updatedDeal = unwrap(
      await supabase
        .from('Deal')
        .update(updateData)
        .eq('id', id)
        .select('*, vendor:Vendor(id, businessName, latitude, longitude, address, logoUrl, rating)')
        .single(),
      'Update deal'
    )

    // Invalidate cache
    cache.delete('deals:active')

    return NextResponse.json({
      success: true,
      data: updatedDeal,
    })
  } catch (error) {
    // Check if it's a "not found" error from Supabase (PGRST116)
    if (error && typeof error === 'object' && 'message' in error && String(error.message).includes('0 rows')) {
      return NextResponse.json(
        { success: false, error: 'Deal not found' },
        { status: 404 }
      )
    }
    console.error('Update deal error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
