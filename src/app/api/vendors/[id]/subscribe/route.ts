import { NextResponse } from 'next/server'
import { supabase, genId } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

/**
 * POST /api/vendors/[id]/subscribe
 * Subscribes the authenticated foodie to a vendor's broadcast notifications.
 * Inserts a row into the VendorSubscription table.
 *
 * Task 4: This replaces the old localStorage-only subscription model. Now
 * subscriptions are server-side, so the broadcast API can query
 * VendorSubscription to determine who receives a broadcast (instead of
 * fanning out to all users).
 *
 * Idempotent: if the user is already subscribed, returns 200 success (no-op).
 */
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

    // Verify the vendor exists.
    const vendorRes = await supabase
      .from('Vendor')
      .select('id, businessName')
      .eq('id', id)
      .maybeSingle()
    if (vendorRes.error) {
      console.error('Subscribe vendor fetch error:', vendorRes.error.message)
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

    // Insert the subscription. Use upsert so duplicate requests are a no-op
    // (the (userId, vendorId) UNIQUE constraint enforces idempotency).
    const { error: insertError } = await supabase
      .from('VendorSubscription')
      .upsert(
        {
          id: genId('vsub'),
          userId: authUser.userId,
          vendorId: id,
        },
        { onConflict: 'userId,vendorId', ignoreDuplicates: true }
      )

    if (insertError) {
      console.error('Subscribe insert error:', insertError.message)
      return NextResponse.json(
        { success: false, error: 'Failed to subscribe' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { vendorId: id, subscribed: true },
    })
  } catch (error) {
    console.error('Subscribe error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/vendors/[id]/subscribe
 * Unsubscribes the authenticated foodie from a vendor.
 */
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

    const { error: delError } = await supabase
      .from('VendorSubscription')
      .delete()
      .eq('userId', authUser.userId)
      .eq('vendorId', id)

    if (delError) {
      console.error('Unsubscribe delete error:', delError.message)
      return NextResponse.json(
        { success: false, error: 'Failed to unsubscribe' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { vendorId: id, subscribed: false },
    })
  } catch (error) {
    console.error('Unsubscribe error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
