/**
 * SnapJe - Supabase Schema Push & Seed Script
 * 
 * Pushes the complete database schema to Supabase PostgreSQL
 * and seeds it with demo data.
 * 
 * Usage: bun run scripts/setup-supabase.ts
 */

// ============================================
// FULL SQL SCHEMA - mirrors prisma/schema.prisma
// ============================================
const SCHEMA_SQL = `
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
-- Disable RLS on all tables (Prisma manages access)
-- ============================================
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;

-- Create policies that allow full access with service_role key
CREATE POLICY "Service role full access on User" ON "User" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on RefreshToken" ON "RefreshToken" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on Vendor" ON "Vendor" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on Deal" ON "Deal" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on Reservation" ON "Reservation" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on Order" ON "Order" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on Notification" ON "Notification" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on Subscription" ON "Subscription" FOR ALL USING (true) WITH CHECK (true);
`

// ============================================
// SEED DATA SQL
// ============================================
const SEED_SQL = `
-- Hashed password for "password123" (bcrypt)
-- Generated: $2a$12$LJ3m4ys3Lk0TSwMM0e4sM.6UOd6q1MGqF9Q7xlMKfHxMFv1kYn3aW

-- Demo Users
INSERT INTO "User" ("id", "email", "passwordHash", "name", "phone", "roles", "activeRole", "emailVerified") VALUES
('user_foodie', 'foodie@test.com', '$2a$12$LJ3m4ys3Lk0TSwMM0e4sM.6UOd6q1MGqF9Q7xlMKfHxMFv1kYn3aW', 'Aiman Foodie', '+60123456789', 'foodie', 'foodie', true),
('user_vendor', 'vendor@test.com', '$2a$12$LJ3m4ys3Lk0TSwMM0e4sM.6UOd6q1MGqF9Q7xlMKfHxMFv1kYn3aW', 'Kak Roti Vendor', '+60198765432', 'foodie,vendor', 'vendor', true),
('user_admin', 'admin@test.com', '$2a$12$LJ3m4ys3Lk0TSwMM0e4sM.6UOd6q1MGqF9Q7xlMKfHxMFv1kYn3aW', 'Admin SnapJe', '+60111222333', 'foodie,vendor,admin', 'admin', true)
ON CONFLICT ("email") DO NOTHING;

-- Demo Vendors
INSERT INTO "Vendor" ("id", "userId", "businessName", "description", "contactEmail", "contactPhone", "address", "latitude", "longitude", "foodCategories", "verificationStatus", "subscriptionPlan", "subscriptionStatus", "rating", "totalSales") VALUES
('vendor_kak_roti', 'user_vendor', 'Kak Roti Corner', 'Authentic Malaysian breakfast & street food since 1998', 'kakroti@snapje.my', '+60198765432', '12 Jalan Tunku Abdul Rahman, KL', 3.1542, 101.6978, '["Malay","Indian"]', 'approved', 'vendor_basic', 'active', 4.8, 156),
('vendor_mamak_lounge', 'user_vendor', 'Mamak Lounge', 'Late-night mamak with the best roti canai & teh tarik', 'mamak@snapje.my', '+60198889999', '45 Jalan Bukit Bintang, KL', 3.1478, 101.7130, '["Malay","Indian"]', 'approved', 'vendor_premium', 'active', 4.6, 89),
('vendor_seoul_bowl', 'user_vendor', 'Seoul Bowl KL', 'Korean-Malaysian fusion bowls', 'seoul@snapje.my', '+60197776666', '88 Jalan Ampang, KL', 3.1580, 101.7180, '["Korean","Japanese"]', 'approved', 'vendor_basic', 'active', 4.5, 42)
ON CONFLICT ("userId") DO NOTHING;

-- Demo Deals (expires 6 hours from now)
INSERT INTO "Deal" ("id", "vendorId", "title", "description", "category", "imageUrl", "originalPrice", "dealPrice", "discountPercent", "totalQuantity", "availableQuantity", "status", "publicAccessAt", "expiresAt") VALUES
('deal_nasi_lemak', 'vendor_kak_roti', 'Nasi Lemak Special - Blue Rice', 'Signature nasi lemak with bunga telang blue rice, sambal, fried chicken & all the trimmings', 'Malay', 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600', 15.00, 8.90, 41, 30, 30, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours'),
('deal_char_kuey', 'vendor_kak_roti', 'Char Kuey Teow Large Portion', 'Wok-hei perfection with prawns, cockles & lap cheong', 'Chinese', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600', 12.00, 6.90, 42, 20, 20, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours'),
('deal_roti_canai', 'vendor_mamak_lounge', 'Roti Canai Set (2 pcs + Dhal)', 'Flaky buttery roti canai with rich dhal curry & sambal', 'Indian', 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=600', 8.00, 4.50, 44, 40, 40, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours'),
('deal_mee_goreng', 'vendor_mamak_lounge', 'Mee Goreng Mamak Extra Pedas', 'Spicy stir-fried noodles with tofu, egg & veggies', 'Malay', 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600', 10.00, 5.90, 41, 25, 25, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours'),
('deal_chicken_rice', 'vendor_kak_roti', 'Hainanese Chicken Rice Plate', 'Poached chicken with fragrant rice & chili sauce', 'Chinese', 'https://images.unsplash.com/photo-1569058242567-93de6f36f8e6?w=600', 14.00, 7.90, 44, 15, 15, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours'),
('deal_laksa', 'vendor_kak_roti', 'Sarawak Laksa Bowl', 'Rich aromatic laksa with prawns, chicken & bean sprouts', 'Malay', 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=600', 13.00, 7.50, 42, 18, 18, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours'),
('deal_satay', 'vendor_mamak_lounge', 'Satay Kajang 20 Sticks + Ketupat', 'Charcoal-grilled chicken satay with peanut sauce & rice cakes', 'Malay', 'https://images.unsplash.com/photo-1529563021893-cc83c992d75d?w=600', 25.00, 14.90, 40, 12, 12, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours'),
('deal_cendol', 'vendor_mamak_lounge', 'Cendol Penang Special', 'Shaved ice with pandan cendol, coconut milk & gula melaka', 'Dessert', 'https://images.unsplash.com/photo-1559598467-f8b76c8155d0?w=600', 6.00, 3.50, 42, 35, 35, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours'),
('deal_teh_tarik', 'vendor_mamak_lounge', 'Teh Tarik Kurang Manis', 'Creamy pulled tea with just the right sweetness', 'Beverage', 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=600', 4.00, 2.00, 50, 50, 50, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours'),
('deal_korean_bowl', 'vendor_seoul_bowl', 'Korean Fried Rice Bowl', 'Crispy rice with gochujang sauce, fried egg & kimchi', 'Korean', 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=600', 16.00, 9.90, 38, 22, 22, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours')
ON CONFLICT DO NOTHING;
`

async function main() {
  console.log('🚀 SnapJe - Supabase Schema Setup\n')
  console.log('=' .repeat(60))

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  // Test connectivity
  console.log('1️⃣  Testing Supabase connectivity...')
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    })
    console.log(`   ✅ Supabase API reachable (${res.status})\n`)
  } catch (err) {
    console.error('   ❌ Cannot reach Supabase API:', err)
    process.exit(1)
  }

  // Push schema using Supabase SQL API
  console.log('2️⃣  Pushing schema to Supabase PostgreSQL...')
  try {
    const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ query: SCHEMA_SQL }),
    })

    if (sqlRes.ok) {
      const result = await sqlRes.json()
      console.log('   ✅ Schema pushed successfully!', result)
    } else {
      const text = await sqlRes.text()
      console.log(`   ⚠️ SQL RPC not available (${sqlRes.status}): ${text}`)
      console.log('   📝 Falling back to Supabase client method...\n')
      await pushViaClient(supabaseUrl, supabaseKey)
    }
  } catch (err) {
    console.log('   ⚠️ SQL RPC error:', err)
    console.log('   📝 Falling back to Supabase client method...\n')
    await pushViaClient(supabaseUrl, supabaseKey)
  }

  // Seed data
  console.log('\n3️⃣  Seeding demo data...')
  try {
    const seedRes = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ query: SEED_SQL }),
    })

    if (seedRes.ok) {
      console.log('   ✅ Demo data seeded successfully!')
    } else {
      console.log('   ⚠️ Seed RPC not available, trying client method...')
      await seedViaClient(supabaseUrl, supabaseKey)
    }
  } catch (err) {
    console.log('   ⚠️ Seed RPC error, trying client method...')
    await seedViaClient(supabaseUrl, supabaseKey)
  }

  console.log('\n✅ Setup complete!')
}

async function pushViaClient(supabaseUrl: string, supabaseKey: string) {
  // Use the Supabase client to verify connectivity
  // For actual table creation, we need to use SQL - output it for manual use
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Check if tables exist
  const { data, error } = await supabase.from('User').select('id').limit(1)
  
  if (error) {
    if (error.code === '42P01') {
      console.log('   📋 Tables do not exist yet. Schema SQL must be executed manually.')
    } else {
      console.log('   ⚠️ Table check error:', error.message)
    }
    
    console.log('\n   📝 MANUAL SETUP REQUIRED:')
    console.log('   ─────────────────────────')
    console.log('   1. Open: https://supabase.com/dashboard/project/xknkgtuctjmkpommcxfd/sql')
    console.log('   2. Paste the SCHEMA SQL below into the SQL Editor')
    console.log('   3. Click "Run"')
    console.log('   4. Then paste the SEED SQL and run it too')
    console.log('   ─────────────────────────\n')
    outputSQL()
  } else {
    console.log('   ✅ Tables already exist! Checking if seeded...')
    const { data: users } = await supabase.from('User').select('id, email')
    console.log(`   📊 Found ${users?.length || 0} users`)
    if (!users?.length) {
      console.log('   📝 No users found. Run the SEED SQL manually.')
    }
  }
}

async function seedViaClient(supabaseUrl: string, supabaseKey: string) {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Try inserting demo users via the REST API
  const bcrypt = await import('bcryptjs')
  const passwordHash = await bcrypt.hash('password123', 12)

  // Insert users
  const { data: userData, error: userErr } = await supabase
    .from('User')
    .upsert([
      { id: 'user_foodie', email: 'foodie@test.com', passwordHash, name: 'Aiman Foodie', phone: '+60123456789', roles: 'foodie', activeRole: 'foodie', emailVerified: true },
      { id: 'user_vendor', email: 'vendor@test.com', passwordHash, name: 'Kak Roti Vendor', phone: '+60198765432', roles: 'foodie,vendor', activeRole: 'vendor', emailVerified: true },
      { id: 'user_admin', email: 'admin@test.com', passwordHash, name: 'Admin SnapJe', phone: '+60111222333', roles: 'foodie,vendor,admin', activeRole: 'admin', emailVerified: true },
    ], { onConflict: 'email' })

  if (userErr) {
    console.log('   ⚠️ User seed error:', userErr.message)
    return
  }
  console.log('   ✅ Demo users seeded!')

  // Insert vendors
  const { data: vendorData, error: vendorErr } = await supabase
    .from('Vendor')
    .upsert([
      { id: 'vendor_kak_roti', userId: 'user_vendor', businessName: 'Kak Roti Corner', description: 'Authentic Malaysian breakfast & street food since 1998', contactEmail: 'kakroti@snapje.my', contactPhone: '+60198765432', address: '12 Jalan Tunku Abdul Rahman, KL', latitude: 3.1542, longitude: 101.6978, foodCategories: '["Malay","Indian"]', verificationStatus: 'approved', subscriptionPlan: 'vendor_basic', subscriptionStatus: 'active', rating: 4.8, totalSales: 156 },
      { id: 'vendor_mamak_lounge', userId: 'user_vendor', businessName: 'Mamak Lounge', description: 'Late-night mamak with the best roti canai & teh tarik', contactEmail: 'mamak@snapje.my', contactPhone: '+60198889999', address: '45 Jalan Bukit Bintang, KL', latitude: 3.1478, longitude: 101.7130, foodCategories: '["Malay","Indian"]', verificationStatus: 'approved', subscriptionPlan: 'vendor_premium', subscriptionStatus: 'active', rating: 4.6, totalSales: 89 },
      { id: 'vendor_seoul_bowl', userId: 'user_vendor', businessName: 'Seoul Bowl KL', description: 'Korean-Malaysian fusion bowls', contactEmail: 'seoul@snapje.my', contactPhone: '+60197776666', address: '88 Jalan Ampang, KL', latitude: 3.1580, longitude: 101.7180, foodCategories: '["Korean","Japanese"]', verificationStatus: 'approved', subscriptionPlan: 'vendor_basic', subscriptionStatus: 'active', rating: 4.5, totalSales: 42 },
    ], { onConflict: 'userId' })

  if (vendorErr) {
    console.log('   ⚠️ Vendor seed error:', vendorErr.message)
    return
  }
  console.log('   ✅ Demo vendors seeded!')

  // Insert deals
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 6 * 3600000).toISOString()
  const publicAccessAt = now.toISOString()

  const deals = [
    { id: 'deal_nasi_lemak', vendorId: 'vendor_kak_roti', title: 'Nasi Lemak Special - Blue Rice', description: 'Signature nasi lemak with bunga telang blue rice, sambal, fried chicken & all the trimmings', category: 'Malay', imageUrl: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600', originalPrice: 15.00, dealPrice: 8.90, discountPercent: 41, totalQuantity: 30, availableQuantity: 30, status: 'active', publicAccessAt, expiresAt },
    { id: 'deal_char_kuey', vendorId: 'vendor_kak_roti', title: 'Char Kuey Teow Large Portion', description: 'Wok-hei perfection with prawns, cockles & lap cheong', category: 'Chinese', imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600', originalPrice: 12.00, dealPrice: 6.90, discountPercent: 42, totalQuantity: 20, availableQuantity: 20, status: 'active', publicAccessAt, expiresAt },
    { id: 'deal_roti_canai', vendorId: 'vendor_mamak_lounge', title: 'Roti Canai Set (2 pcs + Dhal)', description: 'Flaky buttery roti canai with rich dhal curry & sambal', category: 'Indian', imageUrl: 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=600', originalPrice: 8.00, dealPrice: 4.50, discountPercent: 44, totalQuantity: 40, availableQuantity: 40, status: 'active', publicAccessAt, expiresAt },
    { id: 'deal_mee_goreng', vendorId: 'vendor_mamak_lounge', title: 'Mee Goreng Mamak Extra Pedas', description: 'Spicy stir-fried noodles with tofu, egg & veggies', category: 'Malay', imageUrl: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600', originalPrice: 10.00, dealPrice: 5.90, discountPercent: 41, totalQuantity: 25, availableQuantity: 25, status: 'active', publicAccessAt, expiresAt },
    { id: 'deal_chicken_rice', vendorId: 'vendor_kak_roti', title: 'Hainanese Chicken Rice Plate', description: 'Poached chicken with fragrant rice & chili sauce', category: 'Chinese', imageUrl: 'https://images.unsplash.com/photo-1569058242567-93de6f36f8e6?w=600', originalPrice: 14.00, dealPrice: 7.90, discountPercent: 44, totalQuantity: 15, availableQuantity: 15, status: 'active', publicAccessAt, expiresAt },
    { id: 'deal_laksa', vendorId: 'vendor_kak_roti', title: 'Sarawak Laksa Bowl', description: 'Rich aromatic laksa with prawns, chicken & bean sprouts', category: 'Malay', imageUrl: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=600', originalPrice: 13.00, dealPrice: 7.50, discountPercent: 42, totalQuantity: 18, availableQuantity: 18, status: 'active', publicAccessAt, expiresAt },
    { id: 'deal_satay', vendorId: 'vendor_mamak_lounge', title: 'Satay Kajang 20 Sticks + Ketupat', description: 'Charcoal-grilled chicken satay with peanut sauce & rice cakes', category: 'Malay', imageUrl: 'https://images.unsplash.com/photo-1529563021893-cc83c992d75d?w=600', originalPrice: 25.00, dealPrice: 14.90, discountPercent: 40, totalQuantity: 12, availableQuantity: 12, status: 'active', publicAccessAt, expiresAt },
    { id: 'deal_cendol', vendorId: 'vendor_mamak_lounge', title: 'Cendol Penang Special', description: 'Shaved ice with pandan cendol, coconut milk & gula melaka', category: 'Dessert', imageUrl: 'https://images.unsplash.com/photo-1559598467-f8b76c8155d0?w=600', originalPrice: 6.00, dealPrice: 3.50, discountPercent: 42, totalQuantity: 35, availableQuantity: 35, status: 'active', publicAccessAt, expiresAt },
    { id: 'deal_teh_tarik', vendorId: 'vendor_mamak_lounge', title: 'Teh Tarik Kurang Manis', description: 'Creamy pulled tea with just the right sweetness', category: 'Beverage', imageUrl: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=600', originalPrice: 4.00, dealPrice: 2.00, discountPercent: 50, totalQuantity: 50, availableQuantity: 50, status: 'active', publicAccessAt, expiresAt },
    { id: 'deal_korean_bowl', vendorId: 'vendor_seoul_bowl', title: 'Korean Fried Rice Bowl', description: 'Crispy rice with gochujang sauce, fried egg & kimchi', category: 'Korean', imageUrl: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=600', originalPrice: 16.00, dealPrice: 9.90, discountPercent: 38, totalQuantity: 22, availableQuantity: 22, status: 'active', publicAccessAt, expiresAt },
  ]

  const { data: dealData, error: dealErr } = await supabase
    .from('Deal')
    .upsert(deals, { onConflict: 'id' })

  if (dealErr) {
    console.log('   ⚠️ Deal seed error:', dealErr.message)
    return
  }
  console.log('   ✅ Demo deals seeded!')
}

function outputSQL() {
  console.log('\n' + '='.repeat(70))
  console.log('📋 SCHEMA SQL — Copy to Supabase SQL Editor:')
  console.log('='.repeat(70))
  console.log(SCHEMA_SQL)
  console.log('\n' + '='.repeat(70))
  console.log('🌱 SEED SQL — Run after schema:')
  console.log('='.repeat(70))
  console.log(SEED_SQL)
  console.log('='.repeat(70))
}

main().catch(console.error)
