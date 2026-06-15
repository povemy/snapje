# Task 7-b: Supabase Refactor Agent - Deal API Routes

## Task
Refactor FlashBite API routes from Prisma to Supabase client SDK for all deal-related routes.

## Files Modified

### 1. `/src/app/api/deals/route.ts`
- **GET handler**: Replaced `db.deal.findMany` + `db.deal.count` with Supabase `select()` + count queries
  - Used `.eq()`, `.or()`, `.range()`, `.order()` for filtering/pagination
- **POST handler**: Replaced `db.vendor.findFirst` + `db.deal.create` with Supabase equivalents
  - Dates converted to `.toISOString()` for Supabase compatibility

### 2. `/src/app/api/deals/[id]/route.ts`
- **GET handler**: Replaced `db.deal.findUnique` with `supabase.from('Deal').select('*, vendor:Vendor(...)').eq('id', id).single()`
- **PATCH handler**: Replaced findUnique + update with Supabase equivalents
  - Added "0 rows" error detection for 404 responses

### 3. `/src/app/api/deals/[id]/claim/route.ts`
- Replaced `db.deal.findUnique` with Supabase select
- Replaced `db.reservation.findFirst` with `.gt('expiresAt', new Date().toISOString())`
- Replaced `db.reservation.count` with Supabase count query using `.in()`
- Replaced atomic increment/decrement with fetch-then-update pattern
- Kept `reservationManager` concurrency protection as-is

### 4. `/src/app/api/deals/[id]/confirm/route.ts`
- Replaced nested `findUnique` with separate reservation + deal+vendor queries
- Replaced `db.$transaction` with 4 sequential operations:
  1. Create order
  2. Update deal quantities (sold++, reserved--)
  3. Update reservation status
  4. Create notification

## Key Patterns Used
- `unwrap(response, 'context')` throws on error, returns data
- `.single()` for unique queries (throws PGRST116 if no rows → caught for 404)
- `.select('*', { count: 'exact', head: true })` for count-only queries
- `.range(from, to)` for pagination (0-indexed, inclusive)
- `.gt('expiresAt', new Date().toISOString())` for date comparisons
- `.in('status', ['pending', 'confirmed'])` for IN queries
- `.or('title.ilike.%search%,description.ilike.%search%')` for OR search
- Fetch-then-update pattern for atomic increment/decrement operations

## Validation
- ESLint: zero errors
- Dev server: compiles and serves successfully
