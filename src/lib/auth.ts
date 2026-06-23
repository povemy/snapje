import { SignJWT, jwtVerify } from 'jose'
import { cookies, headers } from 'next/headers'
import { supabase, unwrap } from './supabase'

// Fail-fast: JWT secrets MUST be provided. In production we throw immediately;
// in development we fall back to a known-weak dev-only secret with a loud
// console warning so the app still boots in the sandbox.
function getJwtSecret(envVar: 'JWT_SECRET' | 'JWT_REFRESH_SECRET', label: string): Uint8Array {
  const value = process.env[envVar]
  if (value) return new TextEncoder().encode(value)
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`FATAL: ${envVar} (${label}) is not set. Refusing to boot in production.`)
  }
  // Dev-only fallback so the sandbox can boot without .env
  console.warn(
    `WARNING: ${envVar} is not set. Using insecure dev-only fallback secret. ` +
      `This MUST NOT be used in production.`
  )
  return new TextEncoder().encode(`snapje-dev-only-${label}-do-not-use-in-prod`)
}

const ACCESS_TOKEN_SECRET = getJwtSecret('JWT_SECRET', 'access')
const REFRESH_TOKEN_SECRET = getJwtSecret('JWT_REFRESH_SECRET', 'refresh')

const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY = '7d'

export interface TokenPayload {
  userId: string
  email: string
  roles: string[]
  activeRole: string
}

export async function generateAccessToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(ACCESS_TOKEN_SECRET)
}

export async function generateRefreshToken(userId: string, familyId?: string): Promise<string> {
  const id = `rt_${crypto.randomUUID()}`
  const token = crypto.randomUUID()
  // MEDIUM 3: store only the SHA-256 hash of the token in the DB. The raw
  // token is returned to the caller (and stored only in the httpOnly cookie)
  // so a DB read never exposes a usable credential.
  const tokenHash = hashToken(token)
  // MEDIUM 1: each refresh-token "family" shares a familyId. On first issue
  // (login/register) we mint a new familyId; subsequent rotations reuse it.
  // If a stolen token is reused after rotation, we revoke the entire family.
  const famId = familyId || `fam_${crypto.randomUUID()}`
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  unwrap(
    await supabase.from('RefreshToken').insert({
      id,
      token, // kept for backwards-compat with sessions issued before hashing
      tokenHash,
      familyId: famId,
      userId,
      expiresAt: expiresAt.toISOString(),
    }),
    'Generate refresh token'
  )

  return token
}

/**
 * MEDIUM 3: SHA-256 hash a refresh token for storage. We use the Web Crypto
 * API (available in Node 18+ and Next.js server runtime) — no native deps.
 */
function hashToken(token: string): string {
  // Synchronous sha256 via node:crypto (available in the Node runtime; this
  // file is server-only so we can rely on it).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('crypto') as typeof import('crypto')
  return createHash('sha256').update(token).digest('hex')
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_TOKEN_SECRET)
    return payload as unknown as TokenPayload
  } catch {
    return null
  }
}

export async function verifyRefreshToken(token: string) {
  // MEDIUM 3: look up by SHA-256 hash so the raw token never has to round-trip
  // through the DB layer. Fall back to the legacy `token` column for sessions
  // issued before the hashing migration.
  const tokenHash = hashToken(token)
  let result = unwrapOrNull(
    await supabase
      .from('RefreshToken')
      .select('*, user:User(*)')
      .eq('tokenHash', tokenHash)
      .maybeSingle()
  )
  if (!result) {
    // Legacy lookup (pre-migration rows where tokenHash was never populated)
    result = unwrapOrNull(
      await supabase
        .from('RefreshToken')
        .select('*, user:User(*)')
        .eq('token', token)
        .maybeSingle()
    )
  }

  if (!result || new Date(result.expiresAt) < new Date()) {
    if (result) {
      await supabase.from('RefreshToken').delete().eq('id', result.id)
    }
    return null
  }

  return result
}

export async function rotateRefreshToken(oldToken: string) {
  const stored = await verifyRefreshToken(oldToken)
  if (!stored) return null

  // MEDIUM 1 (reuse detection): if this token has already been rotated, the
  // raw token has been seen by TWO callers. That can only happen if the token
  // was stolen — the legitimate user rotated it once, then the attacker (or a
  // racing duplicate request) tried to reuse the original. Revoke the ENTIRE
  // family so every session in this family is invalidated immediately.
  if (stored.rotatedAt) {
    if (stored.familyId) {
      await supabase.from('RefreshToken').delete().eq('familyId', stored.familyId)
    } else {
      // Pre-migration token without a familyId — just delete this one.
      await supabase.from('RefreshToken').delete().eq('id', stored.id)
    }
    return null
  }

  // Mark the old token as rotated (timestamp) so any future attempt to rotate
  // it again will trigger the family-revocation branch above.
  await supabase
    .from('RefreshToken')
    .update({ rotatedAt: new Date().toISOString() })
    .eq('id', stored.id)

  // Generate the new token in the SAME family so future reuse can still be
  // detected and revoked together.
  const newToken = await generateRefreshToken(stored.userId, stored.familyId || undefined)

  // Delete the now-rotated old token row (it's already marked rotatedAt, but
  // we don't need to keep the dead row around).
  await supabase.from('RefreshToken').delete().eq('id', stored.id)

  return {
    refreshToken: newToken,
    user: stored.user
  }
}

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies()

  // Detect HTTPS (preview proxy sets x-forwarded-proto). When served over HTTPS
  // (often inside a cross-origin preview iframe), we MUST use SameSite=None + Secure
  // so the browser actually persists & sends the cookies on subsequent requests.
  // On plain localhost (direct dev access), SameSite=Lax + Secure=false is fine.
  const headerList = await headers()
  const isHttps = headerList.get('x-forwarded-proto') === 'https'

  const cookieOptions = {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? ('none' as const) : ('lax' as const),
    path: '/',
  }

  cookieStore.set('access_token', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60, // 15 minutes
  })

  cookieStore.set('refresh_token', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60, // 7 days
  })
}

export async function clearAuthCookies() {
  const cookieStore = await cookies()
  const headerList = await headers()
  const isHttps = headerList.get('x-forwarded-proto') === 'https'
  // delete() must match the SameSite/Secure attrs used when setting, otherwise
  // the browser won't drop the cookie.
  const deleteOptions = {
    secure: isHttps,
    sameSite: isHttps ? ('none' as const) : ('lax' as const),
    path: '/',
  }
  cookieStore.set('access_token', '', { ...deleteOptions, maxAge: 0 })
  cookieStore.set('refresh_token', '', { ...deleteOptions, maxAge: 0 })
}

export async function getAuthUser(): Promise<TokenPayload | null> {
  // 1) Check Authorization: Bearer <token> header (most robust — works in all
  //    preview/iframe/third-party-cookie environments where cookies may be blocked)
  const headerList = await headers()
  const authHeader = headerList.get('authorization') || headerList.get('Authorization')
  let payload: TokenPayload | null = null
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    payload = await verifyAccessToken(token)
  }

  // 2) Fall back to access_token cookie (for environments where cookies work)
  if (!payload) {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('access_token')?.value
    if (accessToken) {
      payload = await verifyAccessToken(accessToken)
    }
  }

  if (!payload) return null

  // HIGH 2: NEVER trust JWT claims alone for authorization — the user may have
  // been banned or had their roles changed since the token was issued. Re-fetch
  // isBanned + roles from the DB, with a short in-memory cache (15s TTL) so we
  // don't add a DB hit to every request. If the user is banned, treat them as
  // unauthenticated. If the DB is unreachable, fall back to the JWT claims
  // (fail-open) so a transient DB outage doesn't lock every user out.
  const fresh = await getFreshUserState(payload.userId, payload)
  if (!fresh || fresh.isBanned) return null

  // Return the DB-fresh roles/activeRole so privilege changes take effect
  // within the cache TTL instead of waiting for the JWT to expire.
  return {
    ...payload,
    roles: fresh.roles,
    activeRole: fresh.activeRole ?? payload.activeRole,
  }
}

// ---- in-memory cache of DB-fresh user state (HIGH 2) ----
interface FreshUserState {
  roles: string[]
  activeRole: string
  isBanned: boolean
}
const freshUserCache = new Map<string, { state: FreshUserState; expiresAt: number }>()
const FRESH_USER_TTL_MS = 15_000

async function getFreshUserState(
  userId: string,
  jwtFallback: TokenPayload
): Promise<FreshUserState | null> {
  const cached = freshUserCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.state
  }
  const { data, error } = await supabase
    .from('User')
    .select('roles, activeRole, isBanned')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    // Fail-open: a transient DB error shouldn't lock out every user. Use the
    // JWT claims as the source of truth until the DB recovers.
    console.error('getFreshUserState DB error (falling back to JWT claims):', error.message)
    return {
      roles: jwtFallback.roles,
      activeRole: jwtFallback.activeRole,
      isBanned: false,
    }
  }
  if (!data) return null
  const state: FreshUserState = {
    roles: parseRoles(data.roles || ''),
    activeRole: data.activeRole || 'foodie',
    isBanned: !!data.isBanned,
  }
  freshUserCache.set(userId, { state, expiresAt: Date.now() + FRESH_USER_TTL_MS })
  return state
}

/**
 * HIGH 3: requireAdmin — calls getAuthUser() (which already re-verifies
 * isBanned + roles from the DB) and returns the user only if they have the
 * admin role. Use this in every admin route instead of hasRole(JWT roles).
 */
export async function requireAdmin(): Promise<TokenPayload | null> {
  const authUser = await getAuthUser()
  if (!authUser) return null
  if (!authUser.roles.includes('admin')) return null
  return authUser
}

export function parseRoles(rolesStr: string): string[] {
  return rolesStr.split(',').map(r => r.trim()).filter(Boolean)
}

export function hasRole(userRoles: string, role: string): boolean {
  return parseRoles(userRoles).includes(role)
}

// Helper to unwrap or return null (used in auth.ts internally)
function unwrapOrNull<T>(response: { data: T | null; error: { message: string } | null }): T | null {
  if (response.error) {
    console.error('Database query error:', response.error.message)
    return null
  }
  return response.data
}
