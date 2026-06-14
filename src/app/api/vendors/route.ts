import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, hasRole, parseRoles } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const my = searchParams.get('my')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: Record<string, unknown> = {}

    // If "my" parameter, return only the current user's vendor
    if (my === 'true') {
      const authUser = await getAuthUser()
      if (authUser) {
        where.userId = authUser.userId
      }
    }

    if (status) {
      where.verificationStatus = status
    }

    if (search) {
      where.OR = [
        { businessName: { contains: search } },
        { address: { contains: search } },
      ]
    }

    const [vendors, total] = await Promise.all([
      db.vendor.findMany({
        where,
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
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.vendor.count({ where }),
    ])

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
    const existingVendor = await db.vendor.findFirst({
      where: { userId: authUser.userId },
    })

    if (existingVendor) {
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

    // Add "vendor" role to user
    const user = await db.user.findUnique({ where: { id: authUser.userId } })
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const currentRoles = parseRoles(user.roles)
    if (!currentRoles.includes('vendor')) {
      currentRoles.push('vendor')
    }

    // Create vendor and update user roles in transaction
    const vendor = await db.$transaction(async (tx) => {
      // Update user roles
      await tx.user.update({
        where: { id: authUser.userId },
        data: {
          roles: currentRoles.join(','),
        },
      })

      // Create vendor profile
      const newVendor = await tx.vendor.create({
        data: {
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
        },
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

      return newVendor
    })

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
