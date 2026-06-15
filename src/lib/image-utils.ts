/**
 * FlashBite Image Utilities
 * =========================
 * Client-side image resizing using Canvas API.
 * Generates multiple size variants for different usage contexts.
 * All resizing happens in the browser for maximum speed —
 * no server-side image processing needed.
 */

// ── Size Presets ──────────────────────────────────────────────
export interface ImageSizePreset {
  key: string
  width: number
  height: number
  quality: number // 0-1
  format: 'webp' | 'jpeg' | 'png'
}

export const IMAGE_PRESETS = {
  // Profile photos
  profile_avatar: { key: 'avatar', width: 200, height: 200, quality: 0.85, format: 'webp' as const },
  profile_avatar_small: { key: 'avatar_sm', width: 80, height: 80, quality: 0.8, format: 'webp' as const },

  // Vendor images
  vendor_logo: { key: 'logo', width: 200, height: 200, quality: 0.85, format: 'webp' as const },
  vendor_logo_small: { key: 'logo_sm', width: 64, height: 64, quality: 0.8, format: 'webp' as const },
  vendor_banner: { key: 'banner', width: 1200, height: 400, quality: 0.8, format: 'webp' as const },

  // Deal images
  deal_thumb: { key: 'thumb', width: 200, height: 150, quality: 0.8, format: 'webp' as const },
  deal_medium: { key: 'medium', width: 400, height: 300, quality: 0.8, format: 'webp' as const },
  deal_large: { key: 'large', width: 800, height: 600, quality: 0.8, format: 'webp' as const },
  deal_hero: { key: 'hero', width: 1200, height: 800, quality: 0.75, format: 'webp' as const },

  // General
  notification_icon: { key: 'notif', width: 96, height: 96, quality: 0.8, format: 'webp' as const },
} as const

export type ImagePresetKey = keyof typeof IMAGE_PRESETS

// ── Preset Groups (generate multiple sizes from one upload) ───
export const PRESET_GROUPS: Record<string, ImagePresetKey[]> = {
  profile: ['profile_avatar', 'profile_avatar_small'],
  vendor_logo: ['vendor_logo', 'vendor_logo_small'],
  vendor_banner: ['vendor_banner'],
  deal: ['deal_thumb', 'deal_medium', 'deal_large', 'deal_hero'],
  notification: ['notification_icon'],
}

export type PresetGroup = keyof typeof PRESET_GROUPS

// ── Resize Configuration ──────────────────────────────────────
export interface ResizeOptions {
  /** Object-fit strategy: 'cover' crops to fill, 'contain' fits inside */
  fit: 'cover' | 'contain'
  /** Background color for 'contain' padding (default: transparent) */
  backgroundColor: string
  /** Max file size in bytes before auto-quality reduction (default: 500KB) */
  maxFileSize: number
}

const DEFAULT_RESIZE_OPTIONS: ResizeOptions = {
  fit: 'cover',
  backgroundColor: '#ffffff',
  maxFileSize: 500 * 1024, // 500KB
}

// ── Core Resize Function ──────────────────────────────────────
/**
 * Resize an image file to a specific size using Canvas API.
 * Returns a Blob of the resized image.
 */
export async function resizeImage(
  file: File | Blob,
  preset: ImageSizePreset,
  options: Partial<ResizeOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_RESIZE_OPTIONS, ...options }
  const bitmap = await createImageBitmap(file)

  const canvas = document.createElement('canvas')
  canvas.width = preset.width
  canvas.height = preset.height

  const ctx = canvas.getContext('2d')!

  // Background fill for contain mode
  if (opts.fit === 'contain') {
    ctx.fillStyle = opts.backgroundColor
    ctx.fillRect(0, 0, preset.width, preset.height)
  }

  // Calculate source/destination rectangles for proper fit
  const srcRatio = bitmap.width / bitmap.height
  const dstRatio = preset.width / preset.height

  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height
  let dx = 0, dy = 0, dw = preset.width, dh = preset.height

  if (opts.fit === 'cover') {
    if (srcRatio > dstRatio) {
      // Source is wider — crop sides
      sw = bitmap.height * dstRatio
      sx = (bitmap.width - sw) / 2
    } else {
      // Source is taller — crop top/bottom
      sh = bitmap.width / dstRatio
      sy = (bitmap.height - sh) / 2
    }
  } else {
    // Contain — fit inside, pad with background
    if (srcRatio > dstRatio) {
      dh = preset.width / srcRatio
      dy = (preset.height - dh) / 2
    } else {
      dw = preset.height * srcRatio
      dx = (preset.width - dw) / 2
    }
  }

  ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh)

  // Auto quality reduction if file is too large
  let quality = preset.quality
  let blob = await canvasToBlob(canvas, preset.format, quality)

  while (blob.size > opts.maxFileSize && quality > 0.3) {
    quality -= 0.1
    blob = await canvasToBlob(canvas, preset.format, quality)
  }

  bitmap.close()
  return blob
}

// ── Generate All Variants for a Preset Group ──────────────────
export interface ImageVariant {
  key: string
  blob: Blob
  width: number
  height: number
  format: string
}

export async function generateVariants(
  file: File | Blob,
  group: PresetGroup,
  options: Partial<ResizeOptions> = {}
): Promise<ImageVariant[]> {
  const presets = PRESET_GROUPS[group]
  const variants = await Promise.all(
    presets.map(async (presetKey) => {
      const preset = IMAGE_PRESETS[presetKey]
      const blob = await resizeImage(file, preset, options)
      return {
        key: preset.key,
        blob,
        width: preset.width,
        height: preset.height,
        format: preset.format,
      }
    })
  )
  return variants
}

// ── Upload Helper ─────────────────────────────────────────────
export interface UploadResult {
  urls: Record<string, string> // key → url mapping
  originalUrl: string
}

/**
 * Upload image variants to the server.
 * Sends all variants in a single request for speed.
 */
export async function uploadImageVariants(
  file: File | Blob,
  group: PresetGroup,
  options: Partial<ResizeOptions> & { onProgress?: (pct: number) => void } = {}
): Promise<UploadResult> {
  const { onProgress, ...resizeOpts } = options
  onProgress?.(10)

  // Generate variants client-side
  const variants = await generateVariants(file, group, resizeOpts)
  onProgress?.(40)

  // Build FormData
  const formData = new FormData()
  formData.append('group', group)
  formData.append('original', file)

  variants.forEach((v) => {
    const ext = v.format === 'webp' ? 'webp' : v.format === 'jpeg' ? 'jpg' : 'png'
    formData.append(
      `variant_${v.key}`,
      v.blob,
      `${v.key}.${ext}`
    )
  })

  onProgress?.(60)

  // Upload
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  })

  onProgress?.(90)

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(err.error || 'Upload failed')
  }

  const data = await res.json()
  onProgress?.(100)

  return {
    urls: data.urls || {},
    originalUrl: data.originalUrl || '',
  }
}

/**
 * Quick upload a single image (auto-selects group).
 * Convenience wrapper around uploadImageVariants.
 */
export async function quickUpload(
  file: File | Blob,
  group: PresetGroup,
  onProgress?: (pct: number) => void
): Promise<string> {
  const result = await uploadImageVariants(file, group, { onProgress })
  // Return the most appropriate URL based on the group
  const primaryKey: Record<PresetGroup, string> = {
    profile: 'avatar',
    vendor_logo: 'logo',
    vendor_banner: 'banner',
    deal: 'medium',
    notification: 'notif',
  }
  return result.urls[primaryKey[group]] || result.originalUrl
}

// ── Utility ───────────────────────────────────────────────────
function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mimeType = format === 'webp' ? 'image/webp' : format === 'jpeg' ? 'image/jpeg' : 'image/png'
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob failed'))
      },
      mimeType,
      quality
    )
  })
}

/**
 * Validate an image file before upload.
 */
export function validateImageFile(
  file: File,
  maxFileSizeMB: number = 10
): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(heic|heif)$/i)) {
    return { valid: false, error: 'Invalid file type. Use JPG, PNG, WebP, or HEIC.' }
  }
  if (file.size > maxFileSizeMB * 1024 * 1024) {
    return { valid: false, error: `File too large. Max ${maxFileSizeMB}MB.` }
  }
  return { valid: true }
}

/**
 * Get image dimensions from a File/Blob.
 */
export async function getImageDimensions(file: File | Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const dims = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return dims
}
