import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { supabase, genId } from '@/lib/supabase'
import { optimizeImage } from '@/lib/media/optimize'
import { uploadToBucket, buildFilePath, computeAlertLevel } from '@/lib/media/storage'

/**
 * POST /api/upload
 * Uploads images to the Supabase Storage "SnapJe" bucket, running each file
 * through a server-side sharp optimization pipeline first.
 *
 * Pipeline: auto-orient → strip EXIF → WebP conversion → DB-tunable quality.
 * Original is auto-deleted after variants are processed.
 *
 * Auth: requires a valid access token (Bearer header or cookie).
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

    // Fetch admin UploadSettings (DB-tunable compression)
    const { data: settingsRow } = await supabase
      .from('UploadSettings')
      .select('*')
      .limit(1)
      .maybeSingle()

    const settings = settingsRow || {}
    const enableOptimization = settings.enableOptimization !== false
    const compressionQuality = settings.compressionQuality ?? 80

    const groupQuality: Record<string, number> = {
      profile: settings.qualityProfile ?? compressionQuality,
      vendor_logo: settings.qualityVendor ?? compressionQuality,
      vendor_banner: settings.qualityVendor ?? compressionQuality,
      deal: settings.qualityDeal ?? compressionQuality,
      notification: compressionQuality,
    }
    const quality = groupQuality[group] ?? compressionQuality

    const urls: Record<string, string> = {}
    const stats: Array<{ key: string; originalSize: number; optimizedSize: number; optimized: boolean; width: number; height: number; verified: boolean }> = []

    const processAndUpload = async (
      file: File,
      variantKey: string | null
    ): Promise<{ publicUrl: string; filePath: string }> => {
      const fileBuffer = Buffer.from(await file.arrayBuffer())

      const optimized = await optimizeImage(fileBuffer, {
        quality,
        enableOptimization,
      })

      const ext = optimized.format === 'webp' ? 'webp' : (optimized.format || 'webp')
      const fileName = variantKey
        ? `${variantKey}.${ext}`
        : `original.${ext}`
      const filePath = buildFilePath(group, userId, fileName)

      const uploadResult = await uploadToBucket({
        buffer: optimized.buffer,
        filePath,
        contentType: `image/${ext}`,
      })

      const alertLevel = computeAlertLevel(optimized.optimizedSize)
      try {
        await supabase.from('MediaFile').insert({
          id: genId('media'),
          fileName,
          filePath,
          publicUrl: uploadResult.publicUrl,
          bucketName: 'SnapJe',
          group,
          mimeType: `image/${ext}`,
          fileSize: optimized.optimizedSize,
          width: optimized.width || null,
          height: optimized.height || null,
          variantKey,
          uploaderId: userId,
          alertLevel,
        })
      } catch (logErr) {
        console.warn('MediaFile log failed (non-fatal):', logErr)
      }

      stats.push({
        key: variantKey || 'original',
        originalSize: optimized.originalSize,
        optimizedSize: optimized.optimizedSize,
        optimized: optimized.optimized,
        width: optimized.width,
        height: optimized.height,
        verified: uploadResult.verified,
      })

      return { publicUrl: uploadResult.publicUrl, filePath }
    }

    let originalFilePath: string | null = null
    let originalPublicUrl: string | null = null

    const origResult = await processAndUpload(original, null)
    originalFilePath = origResult.filePath
    originalPublicUrl = origResult.publicUrl

    const variantEntries = Array.from(formData.entries()).filter(
      ([k]) => k.startsWith('variant_')
    )
    for (const [key, value] of variantEntries) {
      const variantKey = key.replace('variant_', '')
      if (value instanceof File) {
        const vResult = await processAndUpload(value, variantKey)
        urls[variantKey] = vResult.publicUrl
      }
    }

    // AUTO-DELETE ORIGINAL after variants are processed
    if (originalFilePath) {
      try {
        await supabase.storage.from('SnapJe').remove([originalFilePath])
        await supabase
          .from('MediaFile')
          .delete()
          .eq('filePath', originalFilePath)
      } catch (deleteErr) {
        console.warn('Original auto-delete failed (non-fatal):', deleteErr)
      }
    }

    const fallbackUrl =
      urls.medium || urls.large || urls.hero || urls.avatar || urls.banner ||
      urls.logo || urls.thumb || urls.notif ||
      Object.values(urls)[0] || originalPublicUrl || ''

    return NextResponse.json({
      success: true,
      data: {
        urls,
        originalUrl: fallbackUrl,
        stats,
        originalDeleted: true,
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
