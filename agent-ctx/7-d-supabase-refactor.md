# Task 7-d: Refactor Admin & Seed API Routes from Prisma to Supabase

## Summary
Refactored 5 API route files from Prisma ORM to Supabase client SDK to work around IPv6-only DNS limitations in the sandbox environment.

## Files Modified

### 1. `/src/app/api/admin/analytics/route.ts`
- Replaced all `db.*` calls with `supabase.from()` queries
- Count queries: `db.user.count()` → `supabase.from('User').select('*', { count: 'exact', head: true })`
- Aggregate SUM: `db.order.aggregate({ _sum })` → fetch + in-memory `.reduce()` 
- GroupBy: `db.deal.groupBy({ by: ['status'] })` → fetch + in-memory `.reduce()`
- Recent records: `db.user.findMany({ take, select })` → `.select(...).order().limit()`
- Vendor join: `.select('..., user:User(name, email)')`
- Top vendors with gt filter: `.gt('totalSales', 0)`
- All 10 queries still run in parallel via Promise.all

### 2. `/src/app/api/admin/users/route.ts`
- Replaced findMany with `.select('..., vendor:Vendor(id, businessName, verificationStatus)').order().range()`
- Search: `.or(`name.ilike.%${search}%,email.ilike.%${search}%`)`
- isBanned filter: `.eq('isBanned', isBannedBool)`
- Separate count query with same filters

### 3. `/src/app/api/admin/vendors/route.ts`
- Replaced `_count` filtered relation with two-step approach:
  1. Fetch vendors with user join
  2. Batch fetch active deals by vendorIds
  3. Group counts in-memory and merge as `_count.deals`
- Search: `.or(`businessName.ilike.%...,address.ilike.%...,contactEmail.ilike.%...%`)`
- Status filter: `.eq('verificationStatus', status)`

### 4. `/src/app/api/admin/vendors/[id]/action/route.ts`
- Replaced `db.$transaction` with sequential operations (update vendor → create notification)
- Vendor update with join: `.update(data).eq('id', id).select('*, user:User(id, name, email)').single()`
- Date fields use `.toISOString()`

### 5. `/src/app/api/seed/route.ts`
- All create operations: `db.*.create({ data })` → `supabase.from('Table').insert(data).select().single()`
- All update operations: `db.deal.update({ where, data })` → `supabase.from('Deal').update(data).eq('id', id)`
- All Date objects converted to `.toISOString()` for Supabase
- Same creation order preserved (users → vendors → deals → orders → notifications → subscriptions)

## Key Patterns
- `unwrap(response, context)` for operations that must succeed
- `.single()` for expected-single-row queries
- `{ count: 'exact', head: true }` for count-only queries
- `.range(skip, skip + pageSize - 1)` for pagination
- `.reduce()` for in-memory aggregation (SUM, groupBy)
- Separate batch query + in-memory merge for `_count` with filtered relations
- Sequential operations replacing `$transaction`

## Verification
- ESLint: zero errors
- Dev server: compiles and serves successfully
