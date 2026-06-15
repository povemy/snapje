import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server-side Supabase client with service role (full admin access, bypasses RLS)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Public Supabase client with anon key (restricted by RLS)
export const supabasePublic: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

// Helper: parse Supabase response and throw on error
export function unwrap<T>(response: { data: T | null; error: { message: string } | null }, context = 'Database query'): T {
  if (response.error) {
    console.error(`${context} error:`, response.error.message)
    throw new Error(`${context}: ${response.error.message}`)
  }
  return response.data as T
}

// Helper: generate a unique ID for Supabase inserts (replaces Prisma's @default(cuid()))
export function genId(prefix?: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 24)
  return prefix ? `${prefix}_${uuid}` : uuid
}

// Helper: parse Supabase response, return null on error or no data
export function unwrapOrNull<T>(response: { data: T | null; error: { message: string } | null }): T | null {
  if (response.error) {
    console.error('Database query error:', response.error.message)
    return null
  }
  return response.data
}
