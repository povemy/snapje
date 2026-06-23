/**
 * SnapJe Media Optimization Pipeline
 * =====================================
 *
 * Adapted from a production media-compression architecture. Uses sharp (libvips
 * C++ bindings) for high-performance server-side image processing.
 *
 * Pipeline (per file):
 *   1. Dynamic Bypass — if `enableOptimization` is false in admin UploadSettings,
 *      skip compression but STILL extract dimensional metadata.
 *   2. Auto-Orientation — `autoOrient()` reads the EXIF orientation tag and
 *      physically rotates the pixels so mobile photos never render sideways.
 *   3. Format Conversion — legacy formats (JPEG/PNG/GIF) are converted to WebP;
 *      native WebP is re-encoded to enforce the platform's target compression.
 *   4. Compression Target — quality defaults to 80% (DB-tunable via UploadSettings
 *      compressionQuality or the group-specific qualityProfile/qualityDeal/qualityVendor).
 *   5. Metadata Stripping — sharp strips all EXIF/ICC/XMP metadata by default
 *      (we do NOT call keepMetadata), reducing file size and protecting user
 *      privacy (e.g., removing GPS coordinates, camera serials).
 *
 * Variant generation: when `variants` is provided, each variant is resized
 * (cover/crop) to its target dimensions and independently optimized.
 */

import sharp from 'sharp'

export interface OptimizeOptions {
  /** 0-100 WebP quality. Overrides settings if provided. */
  quality?: number
  /** When false, skip compression but still extract dimensions (dynamic bypass). */
  enableOptimization?: boolean
}

export interface OptimizedImage {
  buffer: Buffer
  width: number
  height: number
  format: string
  /** Original byte size (input) */
  originalSize: number
  /** Optimized byte size (output) */
  optimizedSize: number
  /** Whether compression was applied (false = bypassed) */
  optimized: boolean
}

export interface VariantSpec {
  key: string // e.g. 'avatar', 'thumb', 'medium'
  width: number
  height: number
}

/**
 * Optimize a single image buffer through the sharp pipeline.
 * Returns the optimized WebP buffer + metadata.
 */
export async function optimizeImage(
  input: Buffer | ArrayBuffer | Uint8Array,
  options: OptimizeOptions = {}
): Promise<OptimizedImage> {
  const buf = input instanceof Buffer ? input : Buffer.from(input)
  const originalSize = buf.length

  // First pass: read metadata (always — needed even in bypass mode)
  const meta = await sharp(buf).metadata()
  const width = meta.width || 0
  const height = meta.height || 0

  // Dynamic Bypass: skip compression, return original buffer + dims
  if (options.enableOptimization === false) {
    return {
      buffer: buf,
      width,
      height,
      format: meta.format || 'unknown',
      originalSize,
      optimizedSize: originalSize,
      optimized: false,
    }
  }

  const quality = Math.max(1, Math.min(100, options.quality ?? 80))

  // Pipeline: auto-orient via EXIF → strip all metadata (default behavior,
  // no keepMetadata) → convert to WebP at target quality
  //
  // sharp 0.35 API notes:
  //   - `autoOrient()` reads the EXIF orientation tag and physically rotates
  //     the pixels, so mobile photos never render sideways.
  //   - Metadata (EXIF/ICC/XMP) is stripped by default — we do NOT call
  //     keepMetadata(), so GPS coordinates, camera serials, etc. are removed.
  const optimized = await sharp(buf)
    .autoOrient() // physically rotate per EXIF orientation tag
    // (no keepMetadata → EXIF/ICC/XMP stripped by default = privacy)
    .webp({
      quality,
      effort: 4, // balance speed/compression (0=fastest, 6=best)
    })
    .toBuffer()

  const outMeta = await sharp(optimized).metadata()

  return {
    buffer: optimized,
    width: outMeta.width || width,
    height: outMeta.height || height,
    format: outMeta.format || 'webp',
    originalSize,
    optimizedSize: optimized.length,
    optimized: true,
  }
}

/**
 * Generate + optimize multiple size variants from a single source image.
 * Each variant is center-cropped (cover) to its target dimensions.
 */
export async function optimizeVariants(
  input: Buffer | ArrayBuffer | Uint8Array,
  variants: VariantSpec[],
  options: OptimizeOptions = {}
): Promise<Record<string, OptimizedImage>> {
  const buf = input instanceof Buffer ? input : Buffer.from(input)
  const results: Record<string, OptimizedImage> = {}

  // Process variants in parallel for speed
  await Promise.all(
    variants.map(async (v) => {
      try {
        const meta = await sharp(buf).metadata()
        const originalSize = buf.length
        const srcWidth = meta.width || 0
        const srcHeight = meta.height || 0

        // Dynamic Bypass: skip resize/compress, but we can't really "bypass" a variant
        // — instead produce an unresized optimized copy so the variant key still exists.
        if (options.enableOptimization === false) {
          results[v.key] = {
            buffer: buf,
            width: srcWidth,
            height: srcHeight,
            format: meta.format || 'unknown',
            originalSize,
            optimizedSize: originalSize,
            optimized: false,
          }
          return
        }

        const quality = Math.max(1, Math.min(100, options.quality ?? 80))

        // Resize with cover strategy (center-crop to fill target aspect)
        // autoOrient handles EXIF rotation; metadata stripped by default (privacy)
        const resized = await sharp(buf)
          .autoOrient()
          .resize(v.width, v.height, {
            fit: 'cover',
            position: 'centre',
            withoutEnlargement: true,
          })
          .webp({ quality, effort: 4 })
          .toBuffer()

        const outMeta = await sharp(resized).metadata()

        results[v.key] = {
          buffer: resized,
          width: outMeta.width || v.width,
          height: outMeta.height || v.height,
          format: outMeta.format || 'webp',
          originalSize,
          optimizedSize: resized.length,
          optimized: true,
        }
      } catch (e) {
        // Non-fatal: skip failed variant
        console.warn(`[optimizeVariants] variant ${v.key} failed:`, e instanceof Error ? e.message : e)
      }
    })
  )

  return results
}

/**
 * Extract dimensions only (no processing). Used for logging when bypass is on.
 */
export async function extractDimensions(
  input: Buffer | ArrayBuffer | Uint8Array
): Promise<{ width: number; height: number; format: string }> {
  const buf = input instanceof Buffer ? input : Buffer.from(input)
  const meta = await sharp(buf).metadata()
  return {
    width: meta.width || 0,
    height: meta.height || 0,
    format: meta.format || 'unknown',
  }
}
