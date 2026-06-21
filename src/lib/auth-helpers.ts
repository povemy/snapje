import { supabase } from './supabase'
import { getAuthUser, parseRoles } from './auth'
import type { TokenPayload } from './auth'

// HIGH 2 / HIGH 3: defense-in-depth guard for protected routes.
//
// The CRITICAL agent already re-verifies `isBanned` + roles from the DB inside
// `getAuthUser()` (in ./auth.ts). This module adds a SECOND short-TTL cache
// layer specifically for role-gated routes (admin / vendor) so that:
//   1. The JWT-roles-trust anti-pattern can never be reintroduced by accident —
//      callers go through `requireAdmin()` / `requireVendor()` instead of
//      `hasRole(authUser.roles.join(','), ...)`.
//   2. We have an explicit, route-level fail-closed check that returns null
//      when the user is banned or lacks the required role, even if a future
//      refactor loosens `getAuthUser()`.
//
// Note: this cache is intentionally separate from the one inside `auth.ts` —
// it lives at the route-guard layer and de-dupes the per-route DB hit when
// multiple guards run in the same request.

interface CachedUserCheck {
  isBanned: boolean
  roles: string
  activeRole: string
  expiresAt: number
}

const userCheckCache = new Map<string, CachedUserCheck>()
const CACHE_TTL = 15_000

async function getUserCheck(userId: string): Promise<CachedUserCheck | null> {
  const cached = userCheckCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached
  }
  const { data } = await supabase
    .from('User')
    .select('isBanned, roles, activeRole')
    .eq('id', userId)
    .maybeSingle()
  if (!data) return null
  const entry: CachedUserCheck = {
    isBanned: !!data.isBanned,
    roles: data.roles ?? '',
    activeRole: data.activeRole ?? 'foodie',
    expiresAt: Date.now() + CACHE_TTL,
  }
  userCheckCache.set(userId, entry)
  return entry
}

/**
 * Returns the authenticated user ONLY if they are not banned AND have the
 * `admin` role. Otherwise returns null. Use this in every admin route.
 */
export async function requireAdmin(): Promise<TokenPayload | null> {
  const authUser = await getAuthUser()
  if (!authUser) return null

  const userCheck = await getUserCheck(authUser.userId)
  if (!userCheck) return null
  if (userCheck.isBanned) return null
  if (!parseRoles(userCheck.roles).includes('admin')) return null
  return authUser
}

/**
 * Returns the authenticated user ONLY if they are not banned AND have the
 * `vendor` role. Otherwise returns null. Use this in vendor-only routes.
 */
export async function requireVendor(): Promise<TokenPayload | null> {
  const authUser = await getAuthUser()
  if (!authUser) return null

  const userCheck = await getUserCheck(authUser.userId)
  if (!userCheck) return null
  if (userCheck.isBanned) return null
  if (!parseRoles(userCheck.roles).includes('vendor')) return null
  return authUser
}
