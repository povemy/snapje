import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/media/serve/{mediaId}/{fileName}
 * ==========================================
 *
 * Portable media serving URL that obscures the underlying storage backend
 * (currently Supabase SnapJe bucket). The frontend references images via
 * this route instead of the raw Supabase public URL, so migrating to AWS S3
 * or Cloudflare R2 later only requires changing the storage layer — no
 * <img src> tags break.
 *
 * Behavior:
 *   1. Look up the MediaFile record by id (the first path segment).
 *   2. Redirect (307) to its publicUrl.
 *
 * Uses a catch-all [...path] segment so both /serve/{id} and /serve/{id}/{fileName}
 * are matched. The fileName is optional and only for URL readability.
 *
 * Auth: public (no auth required) — these are public images served from a
 * public bucket. Access control can be added here later if needed.
 *
 * MEDIUM 6 (IDOR audit note): this route is INTENTIONALLY public. The SnapJe
 * Supabase bucket is configured as a public bucket — every file in it is
 * world-readable by design (food deal photos, vendor logos, etc. are public
 * marketing content). The `mediaId` in the URL is an opaque random ID that
 * acts as a capability token: anyone with the link can view the image, but
 * the underlying Supabase path is hidden so a leaked URL doesn't expose the
 * bucket layout. If private media (e.g. receipts, banned-user evidence) is
 * added later, it MUST be stored in a separate private bucket and served via
 * a signed-URL route that enforces per-user authorization.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  // First segment is the mediaId; any remaining segments are the fileName (optional)
  const mediaId = path[0]

  if (!mediaId) {
    return NextResponse.json(
      { success: false, error: 'Media id required' },
      { status: 400 }
    )
  }

  try {
    const { data: media, error } = await supabase
      .from('MediaFile')
      .select('publicUrl, fileName')
      .eq('id', mediaId)
      .maybeSingle()

    if (error || !media) {
      return NextResponse.json(
        { success: false, error: error?.message || 'Media not found' },
        { status: 404 }
      )
    }

    // Redirect to the actual public URL (Supabase SnapJe bucket).
    // 307 preserves the GET method and is cacheable.
    return NextResponse.redirect(media.publicUrl, 307, {
      'Cache-Control': 'public, max-age=86400',
    })
  } catch (error) {
    console.error('Media serve error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
