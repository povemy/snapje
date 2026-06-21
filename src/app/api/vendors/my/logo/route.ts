import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'
import { cache } from '@/lib/cache'
import { isAllowedMediaUrl } from '@/lib/media/storage'

/**
 * PUT /api/vendors/my/logo
 * Updates the authenticated vendor's logoUrl.
 * Auth: vendor role required.
 */
export async function PUT(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    if (!hasRole(authUser.roles.join(','), 'vendor')) {
      return NextResponse.json(
        { success: false, error: 'Vendor access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { logoUrl } = body

    if (!logoUrl || typeof logoUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'logoUrl is required' },
        { status: 400 }
      )
    }

    // HIGH 6: URL allowlist — block arbitrary external URLs.
    if (!isAllowedMediaUrl(logoUrl)) {
      return NextResponse.json(
        { success: false, error: 'logoUrl must be a valid media URL hosted on FlashBite storage' },
        { status: 400 }
      )
    }

    // Find the vendor profile for this user
    const { data: vendor, error: findError } = await supabase
      .from('Vendor')
      .select('id')
      .eq('userId', authUser.userId)
      .maybeSingle()

    if (findError || !vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor profile not found' },
        { status: 404 }
      )
    }

    // Update the logoUrl
    const { data: updated, error: updateError } = await supabase
      .from('Vendor')
      .update({ logoUrl })
      .eq('id', vendor.id)
      .select('id, businessName, logoUrl')
      .single()

    if (updateError) {
      console.error('Update vendor logo error:', updateError.message)
      return NextResponse.json(
        { success: false, error: 'Failed to update logo' },
        { status: 500 }
      )
    }

    // Invalidate deals cache (deals cache vendor logoUrl)
    cache.deleteByPrefix('deals:')

    return NextResponse.json({
      success: true,
      data: updated,
    })
  } catch (error) {
    console.error('Vendor logo update error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
