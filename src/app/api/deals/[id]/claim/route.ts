import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
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

    // Find the deal with vendor
    const deal = unwrap(
      await supabase
        .from('Deal')
        .select('*, vendor:Vendor(*)')
        .eq('id', id)
        .single(),
      'Find deal for claim'
    )

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
      await supabase.from('Deal').update({ status: 'expired' }).eq('id', id)
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
      await supabase.from('Deal').update({ status: 'sold_out' }).eq('id', id)
      return NextResponse.json(
        { success: false, error: 'This deal is sold out' },
        { status: 400 }
      )
    }

    // Run these checks in parallel to reduce latency
    const [existingReservationResponse, userClaimsCountResponse] = await Promise.all([
      // Check if user already has a pending reservation for this deal
      supabase
        .from('Reservation')
        .select('*')
        .eq('dealId', id)
        .eq('userId', authUser.userId)
        .eq('status', 'pending')
        .gt('expiresAt', new Date().toISOString())
        .limit(1)
        .single(),
      // Check user's total claims for this deal
      supabase
        .from('Reservation')
        .select('*', { count: 'exact', head: true })
        .eq('dealId', id)
        .eq('userId', authUser.userId)
        .in('status', ['pending', 'confirmed']),
    ])

    // existingReservation may return error if no rows found — that's the expected case
    const existingReservation = existingReservationResponse.error ? null : existingReservationResponse.data
    const userClaimsCount = userClaimsCountResponse.count ?? 0

    if (existingReservation) {
      return NextResponse.json(
        { success: false, error: 'You already have a pending reservation for this deal', data: existingReservation },
        { status: 409 }
      )
    }

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

      const reservation = unwrap(
        await supabase.from('Reservation').insert({
          id: genId('res'),
          dealId: id,
          userId: authUser.userId,
          quantity: 1,
          status: 'pending',
          expiresAt: expiresAt.toISOString(),
        }).select().single(),
        'Create reservation'
      )

      // Update deal quantities atomically
      // Fetch current values then update (Supabase REST API doesn't support atomic increment)
      const currentDeal = unwrap(
        await supabase.from('Deal').select('reservedQuantity, availableQuantity').eq('id', id).single(),
        'Fetch deal quantities for update'
      )

      await supabase.from('Deal').update({
        reservedQuantity: currentDeal.reservedQuantity + 1,
        availableQuantity: currentDeal.availableQuantity - 1,
      }).eq('id', id)

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
    // Check if it's a "not found" error from Supabase (PGRST116)
    if (error && typeof error === 'object' && 'message' in error && String(error.message).includes('0 rows')) {
      return NextResponse.json(
        { success: false, error: 'Deal not found' },
        { status: 404 }
      )
    }
    console.error('Claim deal error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
