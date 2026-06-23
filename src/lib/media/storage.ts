/**
 * SnapJe Media Storage Layer
 * =============================
 *
 * Adapted from a production storage architecture. Uses Supabase Storage
 * (SnapJe bucket) as the backend, with the same safety guarantees:
 *
 *   1. Atomic Verification — after every upload, the file's existence is
 *      verified via a HEAD request to the public URL BEFORE the DB record
 *      is committed. If verification fails, the record is not logged.
 *
 *   2. Portable Serving URLs — the /api/media/serve/{mediaId} route obscures
 *      the underlying storage path (SnapJe bucket + Supabase URL) so the
 *      frontend never depends on the storage backend. Migrating to AWS S3
 *      or Cloudflare R2 later only requires changing this layer — no
 *      frontend image tags break.
 *
 *   3. Siloed Paths — files are stored at {group}/{userId}/{ts}_{rand}/{file}
 *      to prevent data leakage between users and simplify per-user exports.
 */

import { supabase } from '@/lib/supabase'

const BUCKET_NAME = 'SnapJe'

export interface UploadParams {
  buffer: Buffer
  filePath: string // e.g. "profile/user_x/1781_abc/avatar.webp"
  contentType: string
  cacheControl?: string
}

export interface UploadResult {
  publicUrl: string
  path: string
  verified: boolean
}

/**
 * Upload a buffer to the SnapJe bucket.
 */
export async function uploadToBucket(params: UploadParams): Promise<UploadResult> {
  const { buffer, filePath, contentType, cacheControl = '3600' } = params

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, buffer, {
      contentType,
      cacheControl,
      upsert: false,
    })

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`)
  }

  const { data: pub } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath)

  const publicUrl = pub.publicUrl

  // Atomic verification: HEAD the public URL to confirm the file is physically
  // present before the caller commits the DB record.
  const verified = await verifyUpload(publicUrl)

  return {
    publicUrl,
    path: data?.path || filePath,
    verified,
  }
}

/**
 * Atomic read-back verification. Confirms the uploaded file is physically
 * present and accessible at its public URL.
 */
export async function verifyUpload(publicUrl: string): Promise<boolean> {
  try {
    const res = await fetch(publicUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    return res.ok && (res.status === 200 || res.status === 204)
  } catch {
    return false
  }
}

/**
 * Build a portable serving URL that obscures the underlying storage backend.
 * The /api/media/serve/{mediaId} route redirects to the actual public URL.
 *
 * Frontend code should prefer this over the raw Supabase URL so that
 * migrating to S3/R2 later doesn't break any <img src> tags.
 */
export function buildServeUrl(mediaId: string, fileName: string): string {
  return `/api/media/serve/${mediaId}/${encodeURIComponent(fileName)}`
}

/**
 * Compute the alert level for a file based on its size.
 *   - < 200KB:   none     (green/ok)
 *   - 200KB-700KB: info   (baby blue)
 *   - 700KB-1.5MB: warning (orange)
 *   - > 1.5MB:  critical  (red)
 */
export function computeAlertLevel(sizeBytes: number): string {
  if (sizeBytes > 1.5 * 1024 * 1024) return 'critical'
  if (sizeBytes > 700 * 1024) return 'warning'
  if (sizeBytes > 200 * 1024) return 'info'
  return 'none'
}

/**
 * Build the storage path for a file, siloed by group + user.
 * Format: {group}/{userId}/{timestamp}_{rand}/{fileName}
 */
export function buildFilePath(
  group: string,
  userId: string,
  fileName: string
): string {
  const timestamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 10)
  return `${group}/${userId}/${timestamp}_${rand}/${fileName}`
}

/**
 * HIGH 6: URL allowlist for user-supplied media URLs.
 *
 * Accepts only:
 *   - absolute http/https URLs whose hostname matches the configured Supabase
 *     project hostname (SUPABASE_URL), OR
 *   - relative URLs of the form /api/media/serve/... (our portable serving
 *     route which itself only ever redirects to the Supabase bucket).
 *
 * This blocks SSRF / arbitrary-external-host image injection where a malicious
 * user could set logoUrl/avatarUrl to an attacker-controlled URL (used for
 * tracking, IP harvesting, or driving bot traffic to a target).
 *
 * Returns true for empty/null values so callers can use it as a guard without
 * blocking "clear image" flows.
 */
export function isAllowedMediaUrl(url: string | null | undefined): boolean {
  if (!url) return true
  try {
    // Relative /api/media/serve/... — always allowed (our own route)
    if (url.startsWith('/api/media/serve/')) return true
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) return false
    let allowedHost: string
    try {
      allowedHost = new URL(supabaseUrl).hostname
    } catch {
      return false
    }
    return parsed.hostname === allowedHost
  } catch {
    return false
  }
}
