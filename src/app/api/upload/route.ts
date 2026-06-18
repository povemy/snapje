import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { supabase, genId } from '@/lib/supabase'

/**
 * POST /api/upload
 * Uploads image variants (already compressed client-side to WebP) to the
 * Supabase Storage "SnapJe" bucket. Both the original file and each variant
 * are stored. Each stored file is logged in the MediaFile table for the
 * admin Media Monitoring dashboard.
 *
 * Auth: requires a valid access token (Bearer header or cookie).
 *
 * Request: multipart/form-data
 *   - group: string (profile | vendor_logo | vendor_banner | deal | notification)
 *   - original: File
 *   - variant_{key}: File (one per variant, e.g. variant_avatar, variant_thumb)
 *
 * Response: { success, data: { urls, originalUrl } }
 */
export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const group = formData.get('group') as string
    const original = formData.get('original') as File | null

    if (!group || !original) {
      return NextResponse.json(
        { success: false, error: 'Missing group or original file' },
        { status: 400 }
      )
    }

    const allowedGroups = ['profile', 'vendor_logo', 'vendor_banner', 'deal', 'notification']
    if (!allowedGroups.includes(group)) {
      return NextResponse.json(
        { success: false, error: 'Invalid group' },
        { status: 400 }
      )
    }

    const userId = authUser.userId
    const bucketName = 'SnapJe'
    const urls: Record<string, string> = {}

    // Helper: compute alert level based on file size
    // - < 200KB: none (green/ok)
    // - 200KB–700KB: info (baby blue)
    // - 700KB–1.5MB: warning (orange)
    // - > 1.5MB: critical (red)
    const computeAlertLevel = (sizeBytes: number): string => {
      if (sizeBytes > 1.5 * 1024 * 1024) return 'critical'
      if (sizeBytes > 700 * 1024) return 'warning'
      if (sizeBytes > 200 * 1024) return 'info'
      return 'none'
    }

    // Helper: upload a single file to SnapJe bucket + log to MediaFile
    const uploadOne = async (
      file: File,
      variantKey: string | null,
      ext: string
    ): Promise<string> => {
      const timestamp = Date.now()
      const rand = Math.random().toString(36).slice(2, 10)
      const fileName = variantKey
        ? `${variantKey}.${ext}`
        : `original.${ext}`
      const filePath = `${group}/${userId}/${timestamp}_${rand}/${fileName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          contentType: file.type || 'application/octet-stream',
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        console.error('Storage upload error:', uploadError.message)
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      // Get the public URL
      const { data: pub } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath)

      const publicUrl = pub.publicUrl
      const alertLevel = computeAlertLevel(file.size)

      // Log to MediaFile table (non-fatal if it fails)
      try {
        await supabase.from('MediaFile').insert({
          id: genId('media'),
          fileName,
          filePath,
          publicUrl,
          bucketName,
          group,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          variantKey,
          uploaderId: userId,
          alertLevel,
        })
      } catch (logErr) {
        console.warn('MediaFile log failed (non-fatal):', logErr)
      }

      return publicUrl
    }

    // Upload original
    const origExt = original.name.split('.').pop()?.toLowerCase() || 'webp'
    const originalUrl = await uploadOne(original, null, origExt)
    urls.original = originalUrl

    // Upload each variant (variant_{key} fields)
    const variantEntries = Array.from(formData.entries()).filter(
      ([k]) => k.startsWith('variant_')
    )
    for (const [key, value] of variantEntries) {
      const variantKey = key.replace('variant_', '')
      if (value instanceof File) {
        const vExt = value.name.split('.').pop()?.toLowerCase() || 'webp'
        const vUrl = await uploadOne(value, variantKey, vExt)
        urls[variantKey] = vUrl
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        urls,
        originalUrl,
      },
    })
  } catch (error) {
    console.error('Upload error:', error)
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
