-- ============================================
-- SNAPJE - Supabase PostgreSQL Schema
-- ============================================
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xknkgtuctjmkpommcxfd/sql
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USER & AUTHENTICATION
-- ============================================
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "avatarUrl" TEXT,
  "roles" TEXT NOT NULL DEFAULT 'foodie',
  "activeRole" TEXT NOT NULL DEFAULT 'foodie',
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "isBanned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

-- ============================================
-- REFRESH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_token_idx" ON "RefreshToken"("token");

-- ============================================
-- VENDOR
-- ============================================
CREATE TABLE IF NOT EXISTS "Vendor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "businessName" TEXT NOT NULL,
  "description" TEXT,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "operatingHours" TEXT NOT NULL DEFAULT '{}',
  "foodCategories" TEXT NOT NULL DEFAULT '[]',
  "logoUrl" TEXT,
  "coverImageUrl" TEXT,
  "verificationDocs" TEXT NOT NULL DEFAULT '[]',
  "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
  "rejectionReason" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "subscriptionPlan" TEXT NOT NULL DEFAULT 'none',
  "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive',
  "subscriptionStart" TIMESTAMP(3),
  "subscriptionEnd" TIMESTAMP(3),
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalSales" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vendor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Vendor_verificationStatus_idx" ON "Vendor"("verificationStatus");
CREATE INDEX IF NOT EXISTS "Vendor_latitude_longitude_idx" ON "Vendor"("latitude", "longitude");

-- ============================================
-- DEALS
-- ============================================
CREATE TABLE IF NOT EXISTS "Deal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "vendorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "imageUrl" TEXT,
  "originalPrice" DOUBLE PRECISION NOT NULL,
  "dealPrice" DOUBLE PRECISION NOT NULL,
  "discountPercent" INTEGER NOT NULL,
  "totalQuantity" INTEGER NOT NULL,
  "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  "soldQuantity" INTEGER NOT NULL DEFAULT 0,
  "availableQuantity" INTEGER NOT NULL,
  "maxClaimsPerUser" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'active',
  "pickupOnly" BOOLEAN NOT NULL DEFAULT true,
  "pickupInstructions" TEXT,
  "earlyAccessAt" TIMESTAMP(3),
  "publicAccessAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Deal_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Deal_vendorId_idx" ON "Deal"("vendorId");
CREATE INDEX IF NOT EXISTS "Deal_vendorId_status_idx" ON "Deal"("vendorId", "status");
CREATE INDEX IF NOT EXISTS "Deal_status_idx" ON "Deal"("status");
CREATE INDEX IF NOT EXISTS "Deal_expiresAt_idx" ON "Deal"("expiresAt");
CREATE INDEX IF NOT EXISTS "Deal_category_idx" ON "Deal"("category");
CREATE INDEX IF NOT EXISTS "Deal_publicAccessAt_idx" ON "Deal"("publicAccessAt");

-- ============================================
-- RESERVATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS "Reservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dealId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reservation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Reservation_dealId_status_idx" ON "Reservation"("dealId", "status");
CREATE INDEX IF NOT EXISTS "Reservation_dealId_userId_status_idx" ON "Reservation"("dealId", "userId", "status");
CREATE INDEX IF NOT EXISTS "Reservation_userId_idx" ON "Reservation"("userId");
CREATE INDEX IF NOT EXISTS "Reservation_expiresAt_idx" ON "Reservation"("expiresAt");

-- ============================================
-- ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS "Order" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderNumber" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "originalPrice" DOUBLE PRECISION NOT NULL,
  "dealPrice" DOUBLE PRECISION NOT NULL,
  "totalPrice" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_pickup',
  "qrCode" TEXT NOT NULL UNIQUE,
  "qrVerifiedAt" TIMESTAMP(3),
  "pickupDeadline" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Order_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Order_userId_idx" ON "Order"("userId");
CREATE INDEX IF NOT EXISTS "Order_vendorId_idx" ON "Order"("vendorId");
CREATE INDEX IF NOT EXISTS "Order_vendorId_status_idx" ON "Order"("vendorId", "status");
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "Order_qrCode_idx" ON "Order"("qrCode");

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "data" TEXT NOT NULL DEFAULT '{}',
  "read" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- ============================================
-- SUBSCRIPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endDate" TIMESTAMP(3) NOT NULL,
  "autoRenew" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;

-- Allow all operations (service_role bypasses RLS automatically)
CREATE POLICY "Allow all on User" ON "User" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on RefreshToken" ON "RefreshToken" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on Vendor" ON "Vendor" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on Deal" ON "Deal" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on Reservation" ON "Reservation" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on Order" ON "Order" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on Notification" ON "Notification" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on Subscription" ON "Subscription" FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- REALTIME (enable for deals & orders)
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE "Deal";
ALTER PUBLICATION supabase_realtime ADD TABLE "Order";
ALTER PUBLICATION supabase_realtime ADD TABLE "Notification";

-- Task 2: Add pickupDeadline to Reservation (foodie-selected pickup time at claim)
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "pickupDeadline" TIMESTAMP(3);

-- Task 4: VendorSubscription (foodie follows a vendor to receive broadcasts)
CREATE TABLE IF NOT EXISTS "VendorSubscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "vendorId" TEXT NOT NULL REFERENCES "Vendor"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId", "vendorId")
);
CREATE INDEX IF NOT EXISTS "VendorSubscription_userId_idx" ON "VendorSubscription"("userId");
CREATE INDEX IF NOT EXISTS "VendorSubscription_vendorId_idx" ON "VendorSubscription"("vendorId");

-- Task 5: ScheduledBroadcast (vendor schedules a broadcast for future execution)
CREATE TABLE IF NOT EXISTS "ScheduledBroadcast" (
  "id" TEXT PRIMARY KEY,
  "vendorId" TEXT NOT NULL REFERENCES "Vendor"("id") ON DELETE CASCADE,
  "message" TEXT NOT NULL,
  "dealId" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "recipientCount" INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "ScheduledBroadcast_vendorId_idx" ON "ScheduledBroadcast"("vendorId");
CREATE INDEX IF NOT EXISTS "ScheduledBroadcast_status_scheduledAt_idx" ON "ScheduledBroadcast"("status", "scheduledAt");
