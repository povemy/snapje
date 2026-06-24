import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a database timestamp string as UTC.
 *
 * WHY THIS EXISTS:
 * All timestamp columns in our Supabase Postgres schema are declared as
 * `TIMESTAMP(3) WITHOUT TIME ZONE` (see prisma/migrations/supabase-schema.sql).
 * When the server stores a UTC value (e.g. `new Date().toISOString()` which
 * ends with 'Z'), Postgres STRIPS the timezone suffix and stores only the
 * naive datetime. When PostgREST returns that row, it serializes the value
 * as an ISO 8601 string WITHOUT the trailing 'Z' (e.g.
 * `"2026-06-24T05:58:18.523"`).
 *
 * Per the ECMAScript spec, `new Date("2026-06-24T05:58:18.523")` (a date-time
 * string without timezone info) is interpreted as LOCAL time, NOT UTC. This
 * causes a multi-hour skew for any client not running in UTC — e.g. a user in
 * Asia/Kuala_Lumpur (UTC+8) would see a freshly-claimed order's
 * `pickupDeadline` interpreted 8 hours earlier than intended, which makes the
 * order appear "overdue" and incorrectly land in the Burnt tab.
 *
 * This helper detects strings that lack timezone info and appends 'Z' before
 * passing them to `new Date()`, so the value is always parsed as UTC (which
 * is what the server intended when it stored it).
 *
 * Already-Z-terminated strings, strings with explicit +HH:MM / -HH:MM offsets,
 * and Date instances are passed through unchanged.
 */
export function parseDbDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date(NaN) // invalid — caller can isNaN-check
  if (value instanceof Date) return value
  // Regex: matches an ISO 8601 datetime that does NOT end with 'Z' and has no
  // explicit +HH:MM / -HH:MM offset. e.g. "2026-06-24T05:58:18.523" matches.
  // Strings like "...Z", "...+00:00", "...-08:00" are left alone.
  if (typeof value === 'string' && value.length > 0) {
    const trimmed = value.trim()
    const hasTzInfo = /([Zz]$)|([+-]\d{2}:?\d{2}$)/.test(trimmed)
    if (!hasTzInfo) {
      return new Date(trimmed + 'Z')
    }
  }
  return new Date(value)
}

/**
 * Format a Date as a "YYYY-MM-DDTHH:mm" string in the user's LOCAL timezone,
 * suitable for pre-filling an `<input type="datetime-local">` field.
 *
 * This is the correct counterpart to `new Date(formValue)` (which parses the
 * form value as local time). If we instead used `date.toISOString().slice(0,16)`
 * the form would show UTC time, which the user would perceive as local time —
 * causing an 8-hour skew on every roundtrip through the edit form for users in
 * non-UTC timezones.
 */
export function toDatetimeLocalString(date: Date): string {
  if (isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
