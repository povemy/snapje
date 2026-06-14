import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { reservationManager } from '@/lib/reservation'
import { rateLimiter } from '@/lib/cache'

export async function POST(
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

    // Rate limit per user
    if (!rateLimiter.check(`claim:${authUser.userId}`, 10, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many claim attempts. Please slow down.' },
        { status: 429 }
      )
    }

    // Find the deal
    const deal = await db.deal.findUnique({
      where: { id },
      include: { vendor: true },
    })

    if (!deal) {
      return NextResponse.json(
        { success: false, error: 'Deal not found' },
        { status: 404 }
      )
    }

    // Check deal status
    if (deal.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'This deal is no longer active' },
        { status: 400 }
      )
    }

    // Check if expired
    if (new Date(deal.expiresAt) <= new Date()) {
      // Update deal status to expired
      await db.deal.update({ where: { id }, data: { status: 'expired' } })
      return NextResponse.json(
        { success: false, error: 'This deal has expired' },
        { status: 400 }
      )
    }

    // Check public access time
    if (deal.publicAccessAt && new Date(deal.publicAccessAt) > new Date()) {
      return NextResponse.json(
        { success: false, error: 'This deal is not yet available' },
        { status: 400 }
      )
    }

    // Check available quantity
    if (deal.availableQuantity <= 0) {
      // Update deal status to sold_out
      await db.deal.update({ where: { id }, data: { status: 'sold_out' } })
      return NextResponse.json(
        { success: false, error: 'This deal is sold out' },
        { status: 400 }
      )
    }

    // Check if user already has a pending reservation for this deal
    const existingReservation = await db.reservation.findFirst({
      where: {
        dealId: id,
        userId: authUser.userId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    })

    if (existingReservation) {
      return NextResponse.json(
        { success: false, error: 'You already have a pending reservation for this deal', data: existingReservation },
        { status: 409 }
      )
    }

    // Check user's total claims for this deal
    const userClaimsCount = await db.reservation.count({
      where: {
        dealId: id,
        userId: authUser.userId,
        status: { in: ['pending', 'confirmed'] },
      },
    })

    if (userClaimsCount >= deal.maxClaimsPerUser) {
      return NextResponse.json(
        { success: false, error: `You can only claim this deal up to ${deal.maxClaimsPerUser} time(s)` },
        { status: 400 }
      )
    }

    // Acquire reservation lock
    const acquired = reservationManager.acquire(id, authUser.userId, 1)
    if (!acquired) {
      return NextResponse.json(
        { success: false, error: 'This deal is currently being claimed by someone else. Please try again in a moment.' },
        { status: 409 }
      )
    }

    try {
      // Create reservation with 5-minute TTL
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

      const reservation = await db.reservation.create({
        data: {
          dealId: id,
          userId: authUser.userId,
          quantity: 1,
          status: 'pending',
          expiresAt,
        },
      })

      // Update deal quantities atomically
      await db.deal.update({
        where: { id },
        data: {
          reservedQuantity: { increment: 1 },
          availableQuantity: { decrement: 1 },
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          reservation,
          dealTitle: deal.title,
          dealPrice: deal.dealPrice,
          vendorName: deal.vendor.businessName,
          expiresAt: expiresAt.toISOString(),
          message: 'Deal claimed! You have 5 minutes to confirm your order.',
        },
      }, { status: 201 })
    } catch (dbError) {
      // Release lock on DB error
      reservationManager.release(id)
      throw dbError
    }
  } catch (error) {
    console.error('Claim deal error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
