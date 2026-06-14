# Task 5 - Backend API Routes

## Agent: Backend API Developer

## Summary
Created all 22 API routes for the FlashBite food flash deal application, covering authentication, deals, vendors, orders, admin, notifications, and seed data.

## Files Created

### Auth Routes (6)
- `src/app/api/auth/register/route.ts` - POST: Register new user with bcrypt password hashing, JWT tokens
- `src/app/api/auth/login/route.ts` - POST: Login with email/password, rate limited
- `src/app/api/auth/logout/route.ts` - POST: Clear cookies, delete refresh tokens
- `src/app/api/auth/me/route.ts` - GET: Get current authenticated user
- `src/app/api/auth/refresh/route.ts` - POST: Rotate refresh token, issue new access token
- `src/app/api/auth/update-role/route.ts` - POST: Switch active role (validates user has role)

### Deals Routes (4)
- `src/app/api/deals/route.ts` - GET: List deals with distance calc, filters, sorting; POST: Create deal (vendor only)
- `src/app/api/deals/[id]/route.ts` - GET: Deal detail; PATCH: Update deal (owner/admin)
- `src/app/api/deals/[id]/claim/route.ts` - POST: Claim deal with reservation lock (5min TTL)
- `src/app/api/deals/[id]/confirm/route.ts` - POST: Confirm reservation into order with QR code

### Vendors Routes (2)
- `src/app/api/vendors/route.ts` - GET: List vendors; POST: Register as vendor
- `src/app/api/vendors/[id]/route.ts` - GET: Vendor detail; PATCH: Update vendor (owner/admin)

### Orders Routes (3)
- `src/app/api/orders/route.ts` - GET: List orders for current user
- `src/app/api/orders/[id]/route.ts` - GET: Order detail with QR
- `src/app/api/orders/[id]/verify/route.ts` - POST: Verify pickup via QR scan (state machine)

### Admin Routes (4)
- `src/app/api/admin/vendors/route.ts` - GET: List all vendors (admin only)
- `src/app/api/admin/vendors/[id]/action/route.ts` - POST: Approve/reject/suspend/restore vendor
- `src/app/api/admin/users/route.ts` - GET: List all users (admin only)
- `src/app/api/admin/analytics/route.ts` - GET: Platform analytics with caching

### Notifications Routes (2)
- `src/app/api/notifications/route.ts` - GET: List notifications with unread count
- `src/app/api/notifications/[id]/read/route.ts` - POST: Mark notification as read

### Seed Route (1)
- `src/app/api/seed/route.ts` - POST: Seed demo data (Malaysian food, KL locations, RM pricing)

## Key Implementation Details
- JWT auth: 15min access + 7d refresh with rotation, httpOnly cookies
- Concurrency: In-memory reservation locks with 5min TTL
- Distance: Haversine formula, sorted by distance tier then discount %
- Transactions: Prisma interactive transactions for atomic operations
- Rate limiting: Registration (5/min), login (10/min), claiming (10/min)
- Caching: Deals (30s), analytics (60s)
- Demo data: 7 vendors, 12 deals, 3 orders, 7 notifications
- Login credentials: foodie@test.com, vendor@test.com, admin@test.com (all: password123)
