# FlashBite — Environment Credentials Reference

> **Source of truth for all environment variables.** Last updated: 2026-06-17
> Recovered from git history (commit `f30b6d4` — original commit by user on 2026-06-15).

---

## ⚠️ Important — Do NOT Overwrite `.env`

The `.env` file has been wiped multiple times by subagents reverting it to SQLite-only.
**The Prisma schema (`prisma/schema.prisma`) is configured for `postgresql`** — writing
`DATABASE_URL=file:...custom.db` will break the app.

If you need to modify `.env`:
1. **READ** the existing `.env` first
2. Only modify the specific key(s) you need to change
3. **Never** replace the whole file with a single `DATABASE_URL=file:...` line

## 🚨 CRITICAL — System env var override

The sandbox environment exports `DATABASE_URL=file:/home/z/my-project/db/custom.db`
as a **system-level environment variable** at shell startup. **System env vars take
precedence over `.env` files in both Bun and Next.js**, so any value written to
`.env` is silently ignored unless the system var is unset first.

**When running scripts/tests/Prisma commands**, always prepend:
```bash
unset DATABASE_URL && unset DIRECT_URL && bun your-script.ts
```

**When running the dev server** (`bun run dev`), the system env var may also leak in.
The fix is either:
1. Run dev server from a shell where you've `unset DATABASE_URL DIRECT_URL`, OR
2. Change the env var name in `prisma/schema.prisma` to something that doesn't collide
   (e.g. `url = env("PRISMA_DATABASE_URL")`) — this is the more robust long-term fix.

**Verified 2026-06-17**: With system vars unset, `.env` is read correctly and both
Prisma + Supabase SDK connect successfully to the remote PostgreSQL.

---

## Supabase Project

| Field | Value |
|---|---|
| **Project URL** | `https://xknkgtuctjmkpommcxfd.supabase.co` |
| **Project Reference** | `xknkgtuctjmkpommcxfd` |
| **Region** | `ap-southeast-1` (AWS Singapore) |
| **Dashboard** | https://supabase.com/dashboard/project/xknkgtuctjmkpommcxfd |

---

## API Keys

### Supabase Anon Key (public / RLS-restricted)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrbmtndHVjdGpta3BvbW1jeGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODA5MjYsImV4cCI6MjA5NzA1NjkyNn0.fjDwH7YlWym9GG-7jWJQ38J1VRj9QmOnuw4nOnvKhrM
```

### Supabase Service Role Key (admin / bypasses RLS)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrbmtndHVjdGpta3BvbW1jeGZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTQ4MDkyNiwiZXhwIjoyMDk3MDU2OTI2fQ.3EKByhQ7FGf4uTrzTIpoRbTKIhRRO3BmmjMxufOh_58
```

**Token payload (decoded):**
- `iss`: supabase
- `ref`: xknkgtuctjmkpommcxfd
- `iat`: 1781480926 (2026-06-14)
- `exp`: 2097056926 (2036-06-09 — 10-year validity)

---

## Database Connection (PostgreSQL via Supabase)

### Option A — Direct connection (BLOCKED from sandbox)
```
postgresql://postgres:Aiman0122769500@db.xknkgtuctjmkpommcxfd.supabase.co:5432/postgres
```
> ⚠️ Port 5432 on `db.xknkgtuctjmkpommcxfd.supabase.co` is **firewalled** from this
> sandbox (`Network is unreachable`). Only works from Supabase internal network or
> a host with VPN access.

### Option B — Transaction pooler (ACTIVE, used in current `.env`) ✅
```
postgresql://postgres.xknkgtuctjmkpommcxfd:Aiman0122769500@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```
> ✅ **Verified working 2026-06-17**: 11 users, 4 vendors, 12 deals, 8 orders, 17 notifications.
>
> **Region is `aws-1-ap-southeast-1`** (NOT `aws-0-` as in Supabase's default snippet).
> All 9 standard regions were probed; only `aws-1-ap-southeast-1` accepts this project.

### Option C — Session mode pooler (for Prisma migrations)
```
postgresql://postgres.xknkgtuctjmkpommcxfd:Aiman0122769500@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```
> Use this if `prisma migrate` complains about PgBouncer's transaction mode. Not yet tested.

### Database Credentials
| Field | Value |
|---|---|
| **Username** | `postgres` |
| **Password** | `Aiman0122769500` |
| **Database** | `postgres` |
| **Port** | `5432` (direct) / `6543` (pooler) |

---

## JWT Secrets (for FlashBite's own auth tokens)

These are used by `src/lib/auth.ts` to sign access/refresh tokens. They are NOT
Supabase keys — they're FlashBite's own HMAC-SHA256 secrets.

```
JWT_SECRET=flashbite-access-secret-9f3a7c2e1b8d4f6a0e5c3b9d7f2a8c4e
JWT_REFRESH_SECRET=flashbite-refresh-secret-2b7e9c5f3d8a1b4e6c0f9a2d5e7b3c8f
```

> These were generated at restore time (not in original commit). Safe to rotate.

---

## File Locations

| File | Purpose |
|---|---|
| `.env` | Active environment file loaded by Next.js + Prisma |
| `env.md` | This reference document (do NOT load as env) |
| `src/lib/supabase.ts` | Reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `src/lib/db.ts` | Prisma client (reads `DATABASE_URL` via `prisma/schema.prisma`) |
| `src/lib/auth.ts` | Reads `JWT_SECRET`, `JWT_REFRESH_SECRET` (with fallback defaults) |
| `prisma/schema.prisma` | Datasource block: `provider = "postgresql"`, `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")` |

---

## Verification Results (2026-06-17)

### Supabase REST API — ✅ Working
- HTTP 200 on `/rest/v1/` with anon key (returns OpenAPI swagger)
- HTTP 200 with service role key on all 10 tables
- Sample queries returned real data (users, deals, vendors)

### Supabase SDK (z-ai-web-dev-sdk pattern, used by app) — ✅ Working
- `supabase.from('User').select(...)` → 11 users
- `supabase.from('Deal').select(...)` → 12 deals (Cendol, Char Kuey Teow, Nasi Lemak, etc.)
- `supabase.from('Vendor').select('*', { count: 'exact', head: true })` → 4 vendors

### Prisma Client (via transaction pooler) — ✅ Working
| Model | Count |
|---|---|
| User | 11 |
| Vendor | 4 |
| Deal | 12 |
| Order | 8 |
| Notification | 17 |

> ⚠️ `Media` and `UploadSettings` tables exist in the database but are NOT yet
> modeled in `prisma/schema.prisma`. Adding them is part of the pending Storage
> Adapter Pattern work from the previous session.

### JWT API Keys — ✅ Valid
- Issued: 2026-06-14 23:48 UTC
- Expires: 2036-06-14 11:48 UTC (10-year validity)
- ~10 years remaining

### Network Reachability from Sandbox
| Host:Port | Status |
|---|---|
| `db.xknkgtuctjmkpommcxfd.supabase.co:5432` (direct) | ❌ Blocked (firewall) |
| `aws-1-ap-southeast-1.pooler.supabase.com:6543` (pooler txn) | ✅ Reachable |
| `aws-1-ap-southeast-1.pooler.supabase.com:5432` (pooler session) | ✅ Reachable |
| `xknkgtuctjmkpommcxfd.supabase.co:443` (REST API) | ✅ Reachable |

---

## Verification Endpoints

Test the Supabase connection from the sandbox with curl:

```bash
# Health check (REST API root — should return 401 without auth)
curl -s -o /dev/null -w "%{http_code}" https://xknkgtuctjmkpommcxfd.supabase.co/rest/v1/

# List all tables (returns OpenAPI swagger doc)
curl -s https://xknkgtuctjmkpommcxfd.supabase.co/rest/v1/ \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"

# Query a specific table
curl -s "https://xknkgtuctjmkpommcxfd.supabase.co/rest/v1/Deal?select=id,title,dealPrice&limit=3" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

Test Prisma from the sandbox:
```bash
# CRITICAL: must unset the system env var override first!
unset DATABASE_URL && unset DIRECT_URL && bun scripts/db-ping.ts
```

---

## Recovery History

| Date | Event |
|---|---|
| 2026-06-14 09:45 | Initial commit — SQLite only (`DATABASE_URL=file:...custom.db`) |
| 2026-06-15 03:50 | User provided full Supabase credentials → commit `f30b6d4` |
| 2026-06-15 14:00 | Subagent wiped `.env` back to SQLite → commit `63e8c8b` |
| 2026-06-17 13:22 | **Restored from git history** — all credentials recovered + JWT secrets added |
| 2026-06-17 13:22 | Created `env.md` for future reference |
| 2026-06-17 13:30 | **Discovered system env var override** — sandbox exports `DATABASE_URL=file:...custom.db` as system env, silently overriding `.env`. Documented fix (unset before running). |
| 2026-06-17 13:35 | **Probed all 9 Supabase pooler regions** — found correct region is `aws-1-ap-southeast-1` (not `aws-0-` as Supabase docs default). Updated `.env` Option B to use correct region. |
| 2026-06-17 13:37 | **Full verification passed** — Prisma + Supabase SDK both connect successfully to remote PostgreSQL. 11 users, 4 vendors, 12 deals, 8 orders, 17 notifications. |
