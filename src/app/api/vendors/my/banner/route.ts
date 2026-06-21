import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'
import { cache } from '@/lib/cache'
import { isAllowedMediaUrl } from '@/lib/media/storage'

/**
 * PUT /api/vendors/my/banner
 * Updates the authenticated vendor's coverImageUrl (banner).
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
    const { bannerUrl } = body

    if (!bannerUrl || typeof bannerUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'bannerUrl is required' },
        { status: 400 }
      )
    }

    // HIGH 6: URL allowlist — block arbitrary external URLs.
    if (!isAllowedMediaUrl(bannerUrl)) {
      return NextResponse.json(
        { success: false, error: 'bannerUrl must be a valid media URL hosted on FlashBite storage' },
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

    // Update the coverImageUrl (banner)
    const { data: updated, error: updateError } = await supabase
      .from('Vendor')
      .update({ coverImageUrl: bannerUrl })
      .eq('id', vendor.id)
      .select('id, businessName, coverImageUrl')
      .single()

    if (updateError) {
      console.error('Update vendor banner error:', updateError.message)
      return NextResponse.json(
        { success: false, error: 'Failed to update banner' },
        { status: 500 }
      )
    }

    // Invalidate deals cache
    cache.deleteByPrefix('deals:')

    return NextResponse.json({
      success: true,
      data: updated,
    })
  } catch (error) {
    console.error('Vendor banner update error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
