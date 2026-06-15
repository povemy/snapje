import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { supabase, unwrap } from './supabase'

const ACCESS_TOKEN_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'flashbite-secret-key-change-in-production-2024'
)
const REFRESH_TOKEN_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET || 'flashbite-refresh-secret-change-in-production-2024'
)

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

export async function generateRefreshToken(userId: string): Promise<string> {
  const id = `rt_${crypto.randomUUID()}`
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  unwrap(
    await supabase.from('RefreshToken').insert({ id, token, userId, expiresAt: expiresAt.toISOString() }),
    'Generate refresh token'
  )

  return token
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
  const result = unwrapOrNull(
    await supabase
      .from('RefreshToken')
      .select('*, user:User(*)')
      .eq('token', token)
      .single()
  )

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

  // Delete old token
  await supabase.from('RefreshToken').delete().eq('id', stored.id)

  // Generate new token
  const newToken = await generateRefreshToken(stored.userId)

  return {
    refreshToken: newToken,
    user: stored.user
  }
}

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies()

  cookieStore.set('access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60, // 15 minutes
  })

  cookieStore.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  })
}

export async function clearAuthCookies() {
  const cookieStore = await cookies()
  cookieStore.delete('access_token')
  cookieStore.delete('refresh_token')
}

export async function getAuthUser(): Promise<TokenPayload | null> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')?.value

  if (!accessToken) return null
  return verifyAccessToken(accessToken)
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
