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
    if (imageUrl !== undefined) {
      // HIGH 6: URL allowlist for media URLs.
      if (imageUrl && !isAllowedMediaUrl(imageUrl)) {
        return NextResponse.json(
          { success: false, error: 'imageUrl must be a valid media URL hosted on SnapJe storage' },
          { status: 400 }
        )
      }
      updateData.imageUrl = imageUrl
    }
    if (pickupInstructions !== undefined) updateData.pickupInstructions = pickupInstructions
    if (expiresAt !== undefined) updateData.expiresAt = new Date(expiresAt).toISOString()

    // MEDIUM FIX: status enum validation. Without this, clients could set
    // arbitrary status strings.
    if (status !== undefined) {
      const validStatuses = ['active', 'paused', 'expired', 'sold_out', 'cancelled']
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.status = status
    }

    // CRITICAL FIX: validate price/quantity positivity when provided.
    if (originalPrice !== undefined) {
      const n = Number(originalPrice)
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(
          { success: false, error: 'originalPrice must be a positive finite number' },
          { status: 400 }
        )
      }
      updateData.originalPrice = n
    }
    if (dealPrice !== undefined) {
      const n = Number(dealPrice)
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(
          { success: false, error: 'dealPrice must be a positive finite number' },
          { status: 400 }
        )
      }
      updateData.dealPrice = n
    }

    // Recalculate discount if prices changed
    if (originalPrice !== undefined || dealPrice !== undefined) {
      const origP = Number(originalPrice ?? deal.originalPrice)
      const dealP = Number(dealPrice ?? deal.dealPrice)
      if (!Number.isFinite(origP) || !Number.isFinite(dealP)) {
        return NextResponse.json(
          { success: false, error: 'Invalid price values' },
          { status: 400 }
        )
      }
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
      // MEDIUM FIX: validate totalQuantity is a positive integer
      const newTotal = Number(totalQuantity)
      if (!Number.isInteger(newTotal) || newTotal < 1) {
        return NextResponse.json(
          { success: false, error: 'totalQuantity must be a positive integer (>= 1)' },
          { status: 400 }
        )
      }
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

    // Invalidate cache — clear ALL deal cache entries
    cache.deleteByPrefix('deals:')

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

export async function DELETE(
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

    // Find the deal with vendor to check ownership
    const deal = unwrap(
      await supabase
        .from('Deal')
        .select('*, vendor:Vendor(userId)')
        .eq('id', id)
        .single(),
      'Find deal for deletion'
    )

    // Check ownership
    if (deal.vendor.userId !== authUser.userId && !hasRole(authUser.roles.join(','), 'admin')) {
      return NextResponse.json(
        { success: false, error: 'You can only delete your own deals' },
        { status: 403 }
      )
    }

    // Delete the deal (cascades to reservations and orders)
    unwrap(
      await supabase
        .from('Deal')
        .delete()
        .eq('id', id)
        .select('id')
        .single(),
      'Delete deal'
    )

    // Invalidate cache — clear ALL deal cache entries
    cache.deleteByPrefix('deals:')

    return NextResponse.json({
      success: true,
      data: { id },
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error && String(error.message).includes('0 rows')) {
      return NextResponse.json(
        { success: false, error: 'Deal not found' },
        { status: 404 }
      )
    }
    console.error('Delete deal error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
