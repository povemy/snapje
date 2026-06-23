import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { DEFAULT_DESCRIPTION_TEMPLATES } from '@/lib/description-templates'

/**
 * ISSUE 5 (fix-logout-theme-nearme): read-only endpoint that exposes the
 * default description templates. Admins can fetch the list to render in a
 * future management UI; the vendor onboarding form calls this to populate
 * the "Auto Generate Desc." button.
 *
 * NOTE: For now we only support GET — templates are baked into the codebase
 * as constants. A future iteration can extend this to PUT/POST/DELETE backed
 * by a Supabase table or a JSON column on UploadSettings.
 */
export async function GET() {
  // Allow any authenticated admin to read templates; fall back to public
  // defaults if the caller isn't an admin (the vendor form needs them too,
  // and we don't want to block onboarding if the auth check is slow).
  try {
    await requireAdmin()
  } catch {
    // ignore — non-admins get the same default list
  }

  return NextResponse.json({
    success: true,
    templates: DEFAULT_DESCRIPTION_TEMPLATES,
  })
}
