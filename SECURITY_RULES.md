# FlashBite Security Prevention Rules

> **MANDATORY** — These rules MUST be followed for all future code in this codebase.
> Derived from a full security audit. Violations have led to CRITICAL vulnerabilities.

---

## 1. No Default Secrets

NEVER provide default values for security-critical env vars (`JWT_SECRET`, `JWT_REFRESH_SECRET`, database passwords, API keys). Fail-fast at module load if missing in production. Only allow dev fallbacks when `NODE_ENV === 'development'` with a logged warning.

```typescript
// ✅ Correct
const secret = process.env.JWT_SECRET
if (!secret && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production')
}

// ❌ Wrong — publicly committed secret enables token forgery
const secret = process.env.JWT_SECRET || 'hardcoded-fallback-secret'
```

---

## 2. Atomic State Transitions

ALL state transitions (Order status, Reservation status, Deal status) MUST use atomic conditional updates. Never read-then-check-then-update — that creates a TOCTOU race condition.

```typescript
// ✅ Correct — atomic conditional update
const res = await supabase
  .from('Reservation')
  .update({ status: 'confirmed' })
  .eq('id', reservationId)
  .eq('status', 'pending')  // only if still pending
  .select()

// ❌ Wrong — race condition between read and update
const { data } = await supabase.from('Reservation').select('status').eq('id', id).single()
if (data.status === 'pending') {
  await supabase.from('Reservation').update({ status: 'confirmed' }).eq('id', id)
}
```

---

## 3. Lock Release on All Paths

ALL in-memory locks MUST be released on every code path (success + error). Prefer database-level atomic guards (`.eq()` conditions) over in-memory locks — they work across instances and don't leak.

```typescript
// ✅ Correct — release on both success and error paths
try {
  reservationManager.acquire(dealId)
  // ... do work ...
  reservationManager.release(dealId)  // release on success
} catch (e) {
  reservationManager.release(dealId)  // release on error
  throw e
}

// ✅ Better — atomic DB guard, no in-memory lock needed
await supabase.from('Deal')
  .update({ availableQuantity: deal.availableQuantity - qty })
  .eq('id', dealId)
  .gte('availableQuantity', qty)  // atomic: only if enough stock
```

---

## 4. Positive Number Validation

ALL price/quantity inputs MUST be validated as positive finite numbers before storage. Never accept `NaN`, `Infinity`, zero, or negative values.

```typescript
// ✅ Correct
const price = Number(body.price)
if (!Number.isFinite(price) || price <= 0) {
  return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 })
}

// ❌ Wrong — accepts negative prices, NaN, Infinity
const price = parseFloat(body.price)
if (price >= originalPrice) { ... }
```

---

## 5. DB-Verified Authorization

ALL authenticated routes MUST re-verify `isBanned` + `roles` from the DB (with a short 15s cache). Never trust JWT claims alone for authorization decisions — JWTs are valid for 15 minutes after a ban/demotion.

```typescript
// ✅ Correct — use requireAdmin() which checks DB
import { requireAdmin } from '@/lib/auth-helpers'
const authUser = await requireAdmin()
if (!authUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

// ❌ Wrong — trusts JWT roles, banned users retain access for 15 min
const authUser = await getAuthUser()
if (!authUser || !hasRole(authUser.roles.join(','), 'admin')) { ... }
```

---

## 6. No Refresh Tokens in localStorage

NEVER store refresh tokens in localStorage. Use `httpOnly`, `Secure`, `SameSite` cookies. Access tokens (short-lived, 15min) may be in localStorage if required for iframe preview, but refresh tokens (7-day validity) must NEVER be client-readable.

```typescript
// ✅ Correct — only accessToken in store, refreshToken in httpOnly cookie
partialize: (state) => ({
  user: state.user,
  isAuthenticated: state.isAuthenticated,
  accessToken: state.accessToken,  // short-lived, OK
  // NO refreshToken here
})

// ❌ Wrong — XSS = 7-day account takeover
partialize: (state) => ({
  accessToken: state.accessToken,
  refreshToken: state.refreshToken,  // NEVER do this
})
```

---

## 7. URL Allowlist for Media

ALL user-supplied URLs (`logoUrl`, `imageUrl`, `avatarUrl`, `coverImageUrl`, `bannerUrl`) MUST be validated against an allowlist of allowed hosts before storage. Prevents SSRF, tracking pixels, and phishing.

```typescript
// ✅ Correct
import { isAllowedMediaUrl } from '@/lib/media/storage'
if (!isAllowedMediaUrl(logoUrl)) {
  return NextResponse.json({ error: 'URL must point to app media bucket' }, { status: 400 })
}

// ❌ Wrong — accepts any URL including https://evil.com/tracker.png
updateData.logoUrl = logoUrl
```

---

## 8. AbortController in Effects

ALL data-fetching `useEffect` hooks MUST use `AbortController` or a `cancelled` flag to prevent stale responses from overwriting fresh state. Without this, rapid navigation causes the wrong data to display.

```typescript
// ✅ Correct
useEffect(() => {
  let cancelled = false
  const controller = new AbortController()
  apiFetch('/api/deals').then((res) => {
    if (!cancelled && res.success) setDeals(res.data)
  })
  return () => { cancelled = true; controller.abort() }
}, [])

// ❌ Wrong — stale response wins, user sees wrong deal
useEffect(() => {
  apiFetch('/api/deals').then((res) => {
    if (res.success) setDeals(res.data)
  })
}, [])
```

---

## 9. Cleanup in Effects

ALL `useEffect` hooks with subscriptions, event listeners, or timers MUST have cleanup functions that remove listeners, clear timers, and null refs. Missing cleanup = memory leak.

```typescript
// ✅ Correct
useEffect(() => {
  const handler = () => { ... }
  window.addEventListener('resize', handler)
  const interval = setInterval(() => { ... }, 1000)
  return () => {
    window.removeEventListener('resize', handler)
    clearInterval(interval)
  }
}, [])

// ❌ Wrong — listener + interval leak forever
useEffect(() => {
  window.addEventListener('resize', () => { ... })
  setInterval(() => { ... }, 1000)
}, [])
```

---

## 10. Session Invalidation on Password Change

ALL password-change flows MUST invalidate existing sessions by deleting all refresh tokens for the user. Without this, an attacker with a stolen refresh token retains access for 7 days after the victim changes their password.

```typescript
// ✅ Correct
await supabase.from('User').update({ passwordHash: newHash }).eq('id', userId)
await supabase.from('RefreshToken').delete().eq('userId', userId)  // kill all sessions
// Issue new tokens for the current session
const newAccess = await generateAccessToken(payload)
const newRefresh = await generateRefreshToken(userId)
await setAuthCookies(newAccess, newRefresh)

// ❌ Wrong — attacker's stolen refresh token still works for 7 days
await supabase.from('User').update({ passwordHash: newHash }).eq('id', userId)
```

---

## 11. Dev Endpoint Gating

ALL dev/utility endpoints (`/api/seed`, debug routes, admin tools) MUST be gated behind auth + `NODE_ENV` checks. Never ship unauthenticated write endpoints to production.

```typescript
// ✅ Correct
if (process.env.NODE_ENV === 'production') {
  return NextResponse.json({ error: 'Disabled in production' }, { status: 403 })
}
const authUser = await requireAdmin()
if (!authUser) return NextResponse.json({ error: 'Admin required' }, { status: 403 })

// ❌ Wrong — anyone can create admin accounts
export async function POST() {
  await supabase.from('User').insert({ email: 'admin@test.com', ... })
}
```

---

## 12. Pagination Clamping

ALL list endpoints MUST clamp pagination params (`page >= 1`, `1 <= pageSize <= 100`). Prevents `?pageSize=999999` DoS and `?page=-1` errors.

```typescript
// ✅ Correct
import { clampPagination } from '@/lib/pagination'
const { page, pageSize, skip } = clampPagination(
  searchParams.get('page'),
  searchParams.get('pageSize')
)

// ❌ Wrong — ?pageSize=999999 returns unlimited rows
const page = parseInt(searchParams.get('page') || '1')
const pageSize = parseInt(searchParams.get('pageSize') || '20')
```

---

## 13. Hash Credentials at Rest

Hash ALL refresh tokens at rest (SHA-256). Never store credentials in plaintext — a DB compromise (SQLi, backup leak) would expose all 7-day tokens.

```typescript
// ✅ Correct
import { createHash } from 'crypto'
const tokenHash = createHash('sha256').update(rawToken).digest('hex')
await supabase.from('RefreshToken').insert({ tokenHash, ... })

// ❌ Wrong — DB dump = instant account takeover
await supabase.from('RefreshToken').insert({ token: rawToken, ... })
```

---

## 14. Full State Clear on Logout

ALL client-side logout flows MUST clear every Zustand store (auth, notifications, app, location) and all user-scoped `localStorage` entries. Without this, the next user on a shared computer sees the previous user's data.

```typescript
// ✅ Correct
const handleLogout = async () => {
  await apiFetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
  useAuthStore.getState().logout()
  useNotificationStore.getState().clearAll()
  useAppStore.getState().setSearchQuery('')
  useAppStore.getState().setSelectedCategory(null)
  useLocationStore.getState().clear()
  localStorage.removeItem('flashbite_settings')
  localStorage.removeItem('flashbite-user-location')
}

// ❌ Wrong — next user sees previous user's notifications + location
const handleLogout = async () => {
  await apiFetch('/api/auth/logout', { method: 'POST' })
  logout()  // only clears auth store
}
```

---

## 15. Whitelist API Output Fields

NEVER return sensitive fields (`passwordHash`, `qrCode`, internal IDs, full stack traces) in API responses. Whitelist output fields explicitly — don't spread the entire DB row.

```typescript
// ✅ Correct — explicit field whitelist
const { passwordHash, qrCode, ...safeUser } = user
return NextResponse.json({ data: safeUser })

// ❌ Wrong — leaks passwordHash, qrCode, internal fields
return NextResponse.json({ data: user })
```

---

## Enforcement

These rules should be enforced via:
1. **Code review checklist** — every PR must be checked against these 15 rules
2. **Lint rules** where possible (e.g., `no-restricted-syntax` for `dangerouslySetInnerHTML`)
3. **Pre-commit hooks** that run `bun run lint`
4. **Onboarding** — every new developer must read this file before writing code
