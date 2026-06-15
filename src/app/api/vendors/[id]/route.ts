import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'
import { haversineDistance, DEFAULT_LOCATION } from '@/lib/distance'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Split into two queries: vendor with user, and active deals
    const [vendorRes, dealsRes] = await Promise.all([
      supabase
        .from('Vendor')
        .select('*, user:User(id, name, email, phone, avatarUrl)')
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
    if (latitude !== undefined) updateData.latitude = parseFloat(latitude)
    if (longitude !== undefined) updateData.longitude = parseFloat(longitude)
    if (operatingHours !== undefined) updateData.operatingHours = JSON.stringify(operatingHours)
    if (foodCategories !== undefined) updateData.foodCategories = JSON.stringify(foodCategories)
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl
    if (coverImageUrl !== undefined) updateData.coverImageUrl = coverImageUrl

    const updatedVendor = unwrap(
      await supabase
        .from('Vendor')
        .update(updateData)
        .eq('id', id)
        .select('*, user:User(id, name, email)')
        .single(),
      'Update vendor'
    )

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
