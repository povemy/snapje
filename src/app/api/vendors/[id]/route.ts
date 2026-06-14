import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, hasRole } from '@/lib/auth'
import { haversineDistance, DEFAULT_LOCATION } from '@/lib/distance'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const vendor = await db.vendor.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
        deals: {
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

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

    const vendor = await db.vendor.findUnique({
      where: { id },
    })

    if (!vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

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

    const updatedVendor = await db.vendor.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

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
