# Task 7-a: Refactor Auth API Routes from Prisma to Supabase

## Summary
Refactored all 5 auth API route files from Prisma (`db` from `@/lib/db`) to Supabase client SDK (`supabase` from `@/lib/supabase`).

## Files Modified
1. `/home/z/my-project/src/app/api/auth/login/route.ts` - User lookup by email
2. `/home/z/my-project/src/app/api/auth/register/route.ts` - User existence check + creation
3. `/home/z/my-project/src/app/api/auth/me/route.ts` - User fetch with vendor join
4. `/home/z/my-project/src/app/api/auth/logout/route.ts` - RefreshToken deletion
5. `/home/z/my-project/src/app/api/auth/update-role/route.ts` - User update + token cleanup

## Key Patterns Applied
- `.maybeSingle()` replaces `findUnique` (returns null instead of error when no row)
- `.single()` for insert/update + select (expects exactly one result)
- `unwrap()` for must-succeed operations
- `vendor:Vendor(*)` for join replacing `include: { vendor: true }`
- `.neq('token', refreshToken)` replaces Prisma `token: { not: refreshToken }`
- All business logic, validation, error handling, and response formats preserved

## Verification
- ESLint: zero errors
- Dev server: running without issues
