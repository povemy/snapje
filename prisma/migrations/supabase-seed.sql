-- ============================================
-- SNAPJE - Supabase Seed Data
-- ============================================
-- Run this AFTER supabase-schema.sql in the SQL Editor
-- https://supabase.com/dashboard/project/xknkgtuctjmkpommcxfd/sql
-- ============================================

-- Demo Users (password: "password123")
-- bcrypt hash generated with 12 rounds
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
