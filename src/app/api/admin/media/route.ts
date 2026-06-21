import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/admin/media
 * Returns media monitoring data for the admin Media Settings dashboard:
 *   - overview stats (total files, total size, by group, by alert level)
 *   - top 5 biggest media files
 *   - recent alerts (critical/warning files)
 *   - upload activity (last 14 days)
 *
 * Alert level thresholds (set at upload time, also recomputed here):
 *   - none     (< 200KB)      — green/ok
 *   - info     (200KB–700KB)  — baby blue
 *   - warning  (700KB–1.5MB)  — orange
 *   - critical (> 1.5MB)      — red
 */
export async function GET() {
  try {
    const authUser = await requireAdmin()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Run all queries in parallel
    const [
      totalRes,
      totalSizeRes,
      byGroupRes,
      byAlertRes,
      top5Res,
      recentAlertsRes,
      recentUploadsRes,
    ] = await Promise.all([
      // Total file count
      supabase.from('MediaFile').select('*', { count: 'exact', head: true }),
      // Total size (fetch all sizes and sum in-memory — Supabase head count can't sum)
      supabase.from('MediaFile').select('fileSize'),
      // Count by group (fetch all groups, aggregate in-memory)
      supabase.from('MediaFile').select('group'),
      // Count by alert level (fetch all, aggregate in-memory)
      supabase.from('MediaFile').select('alertLevel'),
      // Top 5 biggest files (with uploader name)
      supabase
        .from('MediaFile')
        .select('id, fileName, publicUrl, group, mimeType, fileSize, variantKey, uploaderId, uploader:User(name, email), createdAt, alertLevel')
        .order('fileSize', { ascending: false })
        .limit(5),
      // Recent critical/warning alerts (latest 10)
      supabase
        .from('MediaFile')
        .select('id, fileName, publicUrl, group, mimeType, fileSize, variantKey, uploaderId, uploader:User(name, email), createdAt, alertLevel')
        .in('alertLevel', ['critical', 'warning'])
        .order('createdAt', { ascending: false })
        .limit(10),
      // Recent uploads for activity chart (last 14 days)
      supabase
        .from('MediaFile')
        .select('createdAt, fileSize, alertLevel')
        .order('createdAt', { ascending: false })
        .limit(500),
    ])

    // Aggregate total size
    const sizes = totalSizeRes.data || []
    const totalSizeBytes = sizes.reduce((sum: number, f: { fileSize: number }) => sum + (f.fileSize || 0), 0)

    // Aggregate by group
    const groupCounts: Record<string, number> = {}
    for (const row of (byGroupRes.data || []) as { group: string }[]) {
      groupCounts[row.group] = (groupCounts[row.group] || 0) + 1
    }

    // Aggregate by alert level
    const alertCounts: Record<string, number> = {
      none: 0, info: 0, warning: 0, critical: 0,
    }
    for (const row of (byAlertRes.data || []) as { alertLevel: string }[]) {
      alertCounts[row.alertLevel] = (alertCounts[row.alertLevel] || 0) + 1
    }

    // Build daily upload activity for last 14 days
    const now = new Date()
    const dailyActivity: { date: string; count: number; size: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now)
      day.setDate(day.getDate() - i)
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
      const dateLabel = dayStart.toISOString().slice(0, 10)

      const dayUploads = (recentUploadsRes.data || []).filter(
        (f: { createdAt: string }) => {
          const t = new Date(f.createdAt).getTime()
          return t >= dayStart.getTime() && t < dayEnd.getTime()
        }
      )
      const count = dayUploads.length
      const size = dayUploads.reduce(
        (sum: number, f: { fileSize: number }) => sum + (f.fileSize || 0),
        0
      )
      dailyActivity.push({ date: dateLabel, count, size })
    }

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalFiles: totalRes.count ?? 0,
          totalSizeBytes,
          totalSizeMB: Math.round((totalSizeBytes / (1024 * 1024)) * 100) / 100,
          byGroup: groupCounts,
          byAlertLevel: alertCounts,
        },
        top5Biggest: (top5Res.data || []).map((f: Record<string, unknown>) => ({
          ...f,
          sizeKB: Math.round((((f.fileSize as number) || 0) / 1024) * 100) / 100,
          sizeMB: Math.round((((f.fileSize as number) || 0) / (1024 * 1024)) * 100) / 100,
        })),
        recentAlerts: (recentAlertsRes.data || []).map((f: Record<string, unknown>) => ({
          ...f,
          sizeKB: Math.round((((f.fileSize as number) || 0) / 1024) * 100) / 100,
          sizeMB: Math.round((((f.fileSize as number) || 0) / (1024 * 1024)) * 100) / 100,
        })),
        dailyActivity,
      },
    })
  } catch (error) {
    console.error('Admin media error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
