import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { supabase, unwrap } from '@/lib/supabase'

/**
 * GET /api/admin/upload-settings
 * Retrieve upload settings (admin only)
 */
export async function GET() {
  try {
    const authUser = await requireAdmin()
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    // Try to fetch from a settings table, fallback to defaults
    const { data, error } = await supabase
      .from('UploadSettings')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (error && !error.message.includes('does not exist')) {
      console.error('Fetch upload settings error:', error.message)
    }

    // Default settings
    const defaults = {
      maxFileSizeMB: 10,
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      autoResize: true,
      autoCompress: true,
      qualityProfile: 85,
      qualityDeal: 80,
      qualityVendor: 85,
      enableWatermark: false,
      watermarkText: 'SnapJe',
      moderationMode: 'auto' as const, // 'auto' | 'manual' | 'none'
      maxUploadsPerDay: 100,
      enableCDN: false,
      cdnUrl: '',
      storageLimitMB: 5000,
    }

    return NextResponse.json({
      success: true,
      data: data || defaults,
    })
  } catch (error) {
    console.error('Get upload settings error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/admin/upload-settings
 * Update upload settings (admin only)
 */
export async function PUT(request: Request) {
  try {
    const authUser = await requireAdmin()
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()

    // Validate the settings
    const allowedFields = [
      'maxFileSizeMB', 'allowedTypes', 'autoResize', 'autoCompress',
      'qualityProfile', 'qualityDeal', 'qualityVendor',
      'enableWatermark', 'watermarkText', 'moderationMode',
      'maxUploadsPerDay', 'enableCDN', 'cdnUrl', 'storageLimitMB',
    ]

    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Try to upsert into settings table
    try {
      const existing = await supabase.from('UploadSettings').select('id').limit(1).maybeSingle()

      if (existing.data) {
        await supabase.from('UploadSettings').update(updateData).eq('id', existing.data.id)
      } else {
        await supabase.from('UploadSettings').insert({
          id: 'upload_settings_1',
          ...updateData,
        })
      }
    } catch (dbError) {
      // If table doesn't exist, just return success with the data
      console.warn('UploadSettings table may not exist:', dbError)
    }

    return NextResponse.json({
      success: true,
      data: updateData,
    })
  } catch (error) {
    console.error('Update upload settings error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
