import { NextResponse } from 'next/server'
import { supabase, unwrap } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth-helpers'

/**
 * PATCH /api/admin/vendors/[id]
 * Admin edits vendor details — all changes are saved to the database
 * and automatically reflected on the vendor's account.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = await requireAdmin()

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Verify vendor exists
    const vendorRes = await supabase
      .from('Vendor')
      .select('*, user:User(id, name, email, phone)')
      .eq('id', id)
      .maybeSingle()

    if (vendorRes.error || !vendorRes.data) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

    const vendor = vendorRes.data
    const body = await request.json()

    // Build vendor update data
    const vendorUpdate: Record<string, unknown> = {}
    if (body.businessName !== undefined) vendorUpdate.businessName = body.businessName.trim()
    if (body.description !== undefined) vendorUpdate.description = body.description?.trim() || null
    if (body.contactEmail !== undefined) vendorUpdate.contactEmail = body.contactEmail.trim()
    if (body.contactPhone !== undefined) vendorUpdate.contactPhone = body.contactPhone.trim()
    if (body.address !== undefined) vendorUpdate.address = body.address.trim()
    if (body.foodCategories !== undefined) vendorUpdate.foodCategories = typeof body.foodCategories === 'string' ? body.foodCategories : JSON.stringify(body.foodCategories)
    if (body.operatingHours !== undefined) vendorUpdate.operatingHours = typeof body.operatingHours === 'string' ? body.operatingHours : JSON.stringify(body.operatingHours)
    if (body.verificationStatus !== undefined) {
      const validStatuses = ['pending', 'approved', 'rejected', 'suspended']
      if (!validStatuses.includes(body.verificationStatus)) {
        return NextResponse.json(
          { success: false, error: `Invalid verification status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
      vendorUpdate.verificationStatus = body.verificationStatus
      if (body.verificationStatus === 'approved') {
        vendorUpdate.verifiedAt = new Date().toISOString()
        vendorUpdate.rejectionReason = null
      }
      if (body.verificationStatus === 'suspended' && body.rejectionReason) {
        vendorUpdate.rejectionReason = body.rejectionReason
      }
    }
    if (body.rejectionReason !== undefined) vendorUpdate.rejectionReason = body.rejectionReason || null
    if (body.subscriptionPlan !== undefined) vendorUpdate.subscriptionPlan = body.subscriptionPlan
    if (body.subscriptionStatus !== undefined) vendorUpdate.subscriptionStatus = body.subscriptionStatus

    // MEDIUM 5 FIX: previously the route returned early after updating the
    // vendor row, so any linked User fields (userName/userEmail/userPhone)
    // sent in the same PATCH were silently dropped. Apply BOTH updates before
    // returning.
    if (Object.keys(vendorUpdate).length > 0) {
      unwrap(
        await supabase
          .from('Vendor')
          .update(vendorUpdate)
          .eq('id', id),
        'Update vendor'
      )
    }

    // Also update linked user fields if provided
    const userUpdate: Record<string, unknown> = {}
    if (body.userName !== undefined) userUpdate.name = body.userName.trim()
    if (body.userEmail !== undefined) userUpdate.email = body.userEmail.trim().toLowerCase()
    if (body.userPhone !== undefined) userUpdate.phone = body.userPhone?.trim() || null

    if (Object.keys(userUpdate).length > 0) {
      unwrap(
        await supabase.from('User').update(userUpdate).eq('id', vendor.userId),
        'Update vendor user'
      )
    }

    // Re-fetch the updated vendor + user so the response reflects both changes
    const finalVendorRes = await supabase
      .from('Vendor')
      .select('*, user:User(id, name, email, phone, isBanned, createdAt)')
      .eq('id', id)
      .single()
    const finalVendor = finalVendorRes.data ?? vendorRes.data

    return NextResponse.json({
      success: true,
      data: finalVendor,
      message: 'Vendor updated successfully',
    })
  } catch (error) {
    console.error('Admin vendor edit error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
