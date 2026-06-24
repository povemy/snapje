import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

/**
 * GET /api/vendors/[id]/subscription
 * Returns the authenticated user's subscription status for the given vendor.
 * Used by VendorPublicView to render the Subscribe / Subscribed button
 * correctly on page load.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ success: true, data: { subscribed: false } })
    }

    const { data, error } = await supabase
      .from('VendorSubscription')
      .select('id')
      .eq('userId', authUser.userId)
      .eq('vendorId', id)
      .maybeSingle()

    if (error) {
      console.error('Subscription status error:', error.message)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { subscribed: !!data },
    })
  } catch (error) {
    console.error('Subscription status error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
