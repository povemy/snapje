import { NextResponse } from 'next/server'
import { supabase, unwrap, genId } from '@/lib/supabase'
import { getAuthUser, hasRole } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST() {
  try {
    // CRITICAL FIX (dev endpoint gating): never allow seeding in production,
    // and require an authenticated admin in all other environments so an
    // unauthenticated user cannot wipe/repopulate the database.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, error: 'Seed endpoint is disabled in production' },
        { status: 403 }
      )
    }

    const authUser = await getAuthUser()
    if (!authUser || !hasRole(authUser.roles.join(','), 'admin')) {
      return NextResponse.json(
        { success: false, error: 'Admin authentication required to seed the database' },
        { status: 403 }
      )
    }

    // Check if data already seeded
    const existingRes = await supabase
      .from('User')
      .select('id')
      .eq('email', 'foodie@test.com')
      .single()

    if (existingRes.data) {
      return NextResponse.json({
        success: false,
        error: 'Database already seeded. Reset the database first.',
      }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash('password123', 10)

    // ============================================
    // CREATE DEMO USERS
    // ============================================
    const [foodieUserRes, vendorUserRes, adminUserRes] = await Promise.all([
      supabase.from('User').insert({
        id: genId('user'),
        email: 'foodie@test.com',
        passwordHash,
        name: 'Ali Foodie',
        phone: '+60123456789',
        roles: 'foodie',
        activeRole: 'foodie',
        emailVerified: true,
      }).select().single(),
      supabase.from('User').insert({
        id: genId('user'),
        email: 'vendor@test.com',
        passwordHash,
        name: 'Mei Ling Vendor',
        phone: '+60198765432',
        roles: 'foodie,vendor',
        activeRole: 'vendor',
        emailVerified: true,
      }).select().single(),
      supabase.from('User').insert({
        id: genId('user'),
        email: 'admin@test.com',
        passwordHash,
        name: 'Admin SnapJe',
        phone: '+60135551234',
        roles: 'foodie,vendor,admin',
        activeRole: 'admin',
        emailVerified: true,
      }).select().single(),
    ])

    const foodieUser = unwrap(foodieUserRes, 'Create foodie user')
    const vendorUser = unwrap(vendorUserRes, 'Create vendor user')
    const adminUser = unwrap(adminUserRes, 'Create admin user')

    // Also create some extra foodie users
    const [sitiRes, rajRes] = await Promise.all([
      supabase.from('User').insert({
        id: genId('user'),
        email: 'siti@test.com',
        passwordHash,
        name: 'Siti Nurhaliza',
        phone: '+60145550001',
        roles: 'foodie',
        activeRole: 'foodie',
        emailVerified: true,
      }).select().single(),
      supabase.from('User').insert({
        id: genId('user'),
        email: 'raj@test.com',
        passwordHash,
        name: 'Raj Kumar',
        phone: '+60165550002',
        roles: 'foodie',
        activeRole: 'foodie',
        emailVerified: true,
      }).select().single(),
    ])

    const extraFoodies = [unwrap(sitiRes, 'Create siti user'), unwrap(rajRes, 'Create raj user')]

    // ============================================
    // CREATE DEMO VENDORS (around KL area)
    // ============================================
    const vendorData = [
      {
        userId: vendorUser.id,
        businessName: 'Nasi Lemak Bunga Telang',
        description: 'Authentic Nasi Lemak with a twist - infused with butterfly pea flower for that beautiful blue rice. Family recipe passed down for 3 generations.',
        contactEmail: 'nasilemak@bungatelang.my',
        contactPhone: '+60388881001',
        address: '12, Jalan Ampang, 50450 Kuala Lumpur',
        latitude: 3.1580,
        longitude: 101.7120,
        operatingHours: JSON.stringify({ mon: '7-22', tue: '7-22', wed: '7-22', thu: '7-22', fri: '7-22', sat: '8-23', sun: '8-23' }),
        foodCategories: JSON.stringify(['Malay']),
        verificationStatus: 'approved',
        verifiedAt: new Date().toISOString(),
        rating: 4.7,
        totalSales: 342,
        subscriptionPlan: 'vendor_premium',
        subscriptionStatus: 'active',
        subscriptionStart: new Date().toISOString(),
        subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        userId: vendorUser.id,
        businessName: 'Char Kuey Teow Paradise',
        description: 'Wok-hei master Char Kuey Teow cooked fresh to order. The best in KL, voted by locals. Come taste the difference!',
        contactEmail: 'ckteow@paradise.my',
        contactPhone: '+60388881002',
        address: '45, Jalan Bukit Bintang, 55100 Kuala Lumpur',
        latitude: 3.1480,
        longitude: 101.7160,
        operatingHours: JSON.stringify({ mon: '10-22', tue: '10-22', wed: '10-22', thu: '10-22', fri: '10-23', sat: '10-23', sun: '11-21' }),
        foodCategories: JSON.stringify(['Chinese']),
        verificationStatus: 'approved',
        verifiedAt: new Date().toISOString(),
        rating: 4.5,
        totalSales: 256,
        subscriptionPlan: 'vendor_basic',
        subscriptionStatus: 'active',
        subscriptionStart: new Date().toISOString(),
        subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        userId: vendorUser.id,
        businessName: 'Roti Canai House',
        description: 'Flaky, crispy Roti Canai with the best dhal curry in town. Open early for breakfast, open late for supper.',
        contactEmail: 'roticanai@house.my',
        contactPhone: '+60388881003',
        address: '8, Jalan Masjid India, 50100 Kuala Lumpur',
        latitude: 3.1450,
        longitude: 101.6930,
        operatingHours: JSON.stringify({ mon: '6-24', tue: '6-24', wed: '6-24', thu: '6-24', fri: '6-24', sat: '6-24', sun: '6-24' }),
        foodCategories: JSON.stringify(['Indian']),
        verificationStatus: 'approved',
        verifiedAt: new Date().toISOString(),
        rating: 4.6,
        totalSales: 489,
        subscriptionPlan: 'vendor_premium',
        subscriptionStatus: 'active',
        subscriptionStart: new Date().toISOString(),
        subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        userId: vendorUser.id,
        businessName: 'Mee Goreng Mamak',
        description: 'Spicy, tangy Mee Goreng Mamak that packs a punch. Made with our secret sauce blend that keeps customers coming back!',
        contactEmail: 'meegoreng@mamak.my',
        contactPhone: '+60388881004',
        address: '22, Jalan Tunku Abdul Rahman, 50100 Kuala Lumpur',
        latitude: 3.1560,
        longitude: 101.6980,
        operatingHours: JSON.stringify({ mon: '8-23', tue: '8-23', wed: '8-23', thu: '8-23', fri: '8-24', sat: '8-24', sun: '9-22' }),
        foodCategories: JSON.stringify(['Indian', 'Malay']),
        verificationStatus: 'approved',
        verifiedAt: new Date().toISOString(),
        rating: 4.3,
        totalSales: 178,
        subscriptionPlan: 'vendor_basic',
        subscriptionStatus: 'active',
        subscriptionStart: new Date().toISOString(),
        subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        userId: vendorUser.id,
        businessName: 'Chicken Rice Shop KL',
        description: 'Tender, juicy Hainanese chicken rice served with fragrant rice and our signature chili sauce. A Malaysian classic done right.',
        contactEmail: 'chickenrice@shopkl.my',
        contactPhone: '+60388881005',
        address: '56, Jalan Sultan Ismail, 50250 Kuala Lumpur',
        latitude: 3.1520,
        longitude: 101.7090,
        operatingHours: JSON.stringify({ mon: '9-21', tue: '9-21', wed: '9-21', thu: '9-21', fri: '9-21', sat: '9-22', sun: '9-22' }),
        foodCategories: JSON.stringify(['Chinese']),
        verificationStatus: 'approved',
        verifiedAt: new Date().toISOString(),
        rating: 4.4,
        totalSales: 312,
        subscriptionPlan: 'vendor_premium',
        subscriptionStatus: 'active',
        subscriptionStart: new Date().toISOString(),
        subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        userId: vendorUser.id,
        businessName: 'Laksa Sarawak Kitchen',
        description: 'Rich, creamy Sarawak Laksa with a unique spice paste. Experience the taste of East Malaysia right here in KL!',
        contactEmail: 'laksa@sarawak.my',
        contactPhone: '+60388881006',
        address: '33, Jalan Alor, 55100 Kuala Lumpur',
        latitude: 3.1460,
        longitude: 101.7060,
        operatingHours: JSON.stringify({ mon: '10-22', tue: '10-22', wed: '10-22', thu: '10-22', fri: '10-23', sat: '9-23', sun: '9-22' }),
        foodCategories: JSON.stringify(['Malay', 'Other']),
        verificationStatus: 'pending',
        rating: 0,
        totalSales: 0,
        subscriptionPlan: 'none',
        subscriptionStatus: 'inactive',
      },
      {
        userId: vendorUser.id,
        businessName: 'Satay Kajang Original',
        description: 'The legendary Satay Kajang, now in KL! Perfectly grilled skewers with our signature peanut sauce. Order by the dozen!',
        contactEmail: 'satay@kajang.my',
        contactPhone: '+60388881007',
        address: '78, Jalan Pudu, 55100 Kuala Lumpur',
        latitude: 3.1380,
        longitude: 101.7030,
        operatingHours: JSON.stringify({ mon: '11-23', tue: '11-23', wed: '11-23', thu: '11-23', fri: '11-24', sat: '11-24', sun: '12-22' }),
        foodCategories: JSON.stringify(['Malay']),
        verificationStatus: 'approved',
        verifiedAt: new Date().toISOString(),
        rating: 4.8,
        totalSales: 567,
        subscriptionPlan: 'vendor_premium',
        subscriptionStatus: 'active',
        subscriptionStart: new Date().toISOString(),
        subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]

    // We need separate vendors - vendorUser can only have one vendor profile
    // So let's create extra users for extra vendors
    const [vendor2Res, vendor3Res, vendor4Res, vendor5Res, vendor6Res, vendor7Res] = await Promise.all([
      supabase.from('User').insert({
        id: genId('user'),
        email: 'vendor2@test.com',
        passwordHash,
        name: 'Ahmad Roti',
        phone: '+60175550003',
        roles: 'foodie,vendor',
        activeRole: 'vendor',
        emailVerified: true,
      }).select().single(),
      supabase.from('User').insert({
        id: genId('user'),
        email: 'vendor3@test.com',
        passwordHash,
        name: 'Kumar Spice',
        phone: '+60185550004',
        roles: 'foodie,vendor',
        activeRole: 'vendor',
        emailVerified: true,
      }).select().single(),
      supabase.from('User').insert({
        id: genId('user'),
        email: 'vendor4@test.com',
        passwordHash,
        name: 'Lim Wok Master',
        phone: '+60195550005',
        roles: 'foodie,vendor',
        activeRole: 'vendor',
        emailVerified: true,
      }).select().single(),
      supabase.from('User').insert({
        id: genId('user'),
        email: 'vendor5@test.com',
        passwordHash,
        name: 'Samy Curry',
        phone: '+60105550006',
        roles: 'foodie,vendor',
        activeRole: 'vendor',
        emailVerified: true,
      }).select().single(),
      supabase.from('User').insert({
        id: genId('user'),
        email: 'vendor6@test.com',
        passwordHash,
        name: 'Siti Laksa',
        phone: '+60115550007',
        roles: 'foodie,vendor',
        activeRole: 'vendor',
        emailVerified: true,
      }).select().single(),
      supabase.from('User').insert({
        id: genId('user'),
        email: 'vendor7@test.com',
        passwordHash,
        name: 'Hassan Satay',
        phone: '+60125550008',
        roles: 'foodie,vendor',
        activeRole: 'vendor',
        emailVerified: true,
      }).select().single(),
    ])

    const extraVendorUsers = [
      unwrap(vendor2Res, 'Create vendor2 user'),
      unwrap(vendor3Res, 'Create vendor3 user'),
      unwrap(vendor4Res, 'Create vendor4 user'),
      unwrap(vendor5Res, 'Create vendor5 user'),
      unwrap(vendor6Res, 'Create vendor6 user'),
      unwrap(vendor7Res, 'Create vendor7 user'),
    ]

    // Update vendorData to use separate users and create vendors
    const vendorRecordPromises = vendorData.map((v, i) => {
      const userId = i === 0 ? vendorUser.id : extraVendorUsers[i - 1].id
      return supabase.from('Vendor').insert({ id: genId('vendor'), ...v, userId }).select().single()
    })

    const vendorRecordResults = await Promise.all(vendorRecordPromises)
    const vendorRecords = vendorRecordResults.map((r, i) =>
      unwrap(r, `Create vendor ${i + 1}`)
    )

    // ============================================
    // CREATE DEMO DEALS (8+ active deals)
    // ============================================
    const now = new Date()
    const dealsData = [
      {
        vendorId: vendorRecords[0].id,
        title: 'Nasi Lemak Special - Blue Rice',
        description: 'Our signature blue rice Nasi Lemak with crispy anchovies, roasted peanuts, cucumber, boiled egg, and your choice of sambal. Limited flash deal - grab it while it lasts!',
        category: 'Malay',
        originalPrice: 12.00,
        dealPrice: 6.50,
        totalQuantity: 30,
        maxClaimsPerUser: 2,
        expiresAt: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
        pickupInstructions: 'Show your QR code at the counter. Pickup at main entrance.',
        imageUrl: 'https://sfile.chatglm.cn/images-ppt/d1f8eab41b2d.jpg',
      },
      {
        vendorId: vendorRecords[1].id,
        title: 'Char Kuey Teow Large Portion',
        description: 'Wok-tossed CKT with prawns, cockles, bean sprouts, and Chinese chives. Extra large portion for the same price as regular!',
        category: 'Chinese',
        originalPrice: 10.00,
        dealPrice: 5.50,
        totalQuantity: 25,
        maxClaimsPerUser: 1,
        expiresAt: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(),
        pickupInstructions: 'Collect at stall #5. Present order confirmation.',
        imageUrl: 'https://sfile.chatglm.cn/images-ppt/658794e37269.jpg',
      },
      {
        vendorId: vendorRecords[2].id,
        title: 'Roti Canai Set (2 pcs + Dhal)',
        description: 'Two pieces of our flaky, crispy Roti Canai served with rich dhal curry and sambal. Perfect breakfast or supper deal!',
        category: 'Indian',
        originalPrice: 6.00,
        dealPrice: 3.00,
        totalQuantity: 50,
        maxClaimsPerUser: 3,
        expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
        pickupInstructions: 'Self-service pickup. Show QR at counter.',
        imageUrl: 'https://sfile.chatglm.cn/images-ppt/9f2ff963df78.jpg',
      },
      {
        vendorId: vendorRecords[3].id,
        title: 'Mee Goreng Mamak Extra Pedas',
        description: 'Our famous Mee Goreng with extra spicy sambal, tofu, potatoes, and a fried egg on top. Not for the faint-hearted!',
        category: 'Indian',
        originalPrice: 8.00,
        dealPrice: 4.50,
        totalQuantity: 20,
        maxClaimsPerUser: 2,
        expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        pickupInstructions: 'Pickup at the front counter. Ask for extra napkins!',
        imageUrl: 'https://sfile.chatglm.cn/images-ppt/a7f764bc299d.jpg',
      },
      {
        vendorId: vendorRecords[4].id,
        title: 'Hainanese Chicken Rice Plate',
        description: 'Steamed chicken with fragrant rice, soup, and our secret chili sauce. The classic done right - now at half price!',
        category: 'Chinese',
        originalPrice: 11.00,
        dealPrice: 5.90,
        totalQuantity: 35,
        maxClaimsPerUser: 2,
        expiresAt: new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString(),
        pickupInstructions: 'Pickup at the food court, Stall B3.',
        imageUrl: 'https://sfile.chatglm.cn/images-ppt/c25939cfb21d.jpg',
      },
      {
        vendorId: vendorRecords[5].id,
        title: 'Sarawak Laksa Bowl',
        description: 'Authentic Sarawak Laksa with prawns, chicken strips, bean sprouts, and a squeeze of lime. Creamy, spicy perfection!',
        category: 'Malay',
        originalPrice: 9.00,
        dealPrice: 4.80,
        totalQuantity: 15,
        maxClaimsPerUser: 1,
        expiresAt: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(),
        pickupInstructions: 'Counter pickup. Bring your own container for eco-friendly option.',
        imageUrl: 'https://sfile.chatglm.cn/images-ppt/45ef964ffdc9.jpg',
      },
      {
        vendorId: vendorRecords[6].id,
        title: 'Satay Kajang 20 Sticks + Ketupat',
        description: '20 sticks of our legendary beef and chicken satay served with ketupat, onion, and cucumber. Best deal in town!',
        category: 'Malay',
        originalPrice: 25.00,
        dealPrice: 12.00,
        totalQuantity: 40,
        maxClaimsPerUser: 2,
        expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
        pickupInstructions: 'Grill counter at the back. Follow the aroma!',
        imageUrl: 'https://sfile.chatglm.cn/images-ppt/95939562463c.jpg',
      },
      {
        vendorId: vendorRecords[0].id,
        title: 'Cendol Penang Special',
        description: 'Refreshing Cendol with rich coconut milk, gula Melaka, red beans, and creamy sweet corn. The perfect dessert for hot KL weather!',
        category: 'Dessert',
        originalPrice: 7.00,
        dealPrice: 3.50,
        totalQuantity: 25,
        maxClaimsPerUser: 2,
        expiresAt: new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString(),
        pickupInstructions: 'Dessert counter next to the main stall.',
        imageUrl: 'https://sfile.chatglm.cn/images-ppt/5ea784d83bd1.jpg',
      },
      {
        vendorId: vendorRecords[2].id,
        title: 'Teh Tarik Kurang Manis',
        description: 'Perfectly pulled tea with less sugar but full flavor. Our Teh Tarik is frothy, creamy, and the best companion for any meal.',
        category: 'Beverage',
        originalPrice: 4.00,
        dealPrice: 2.00,
        totalQuantity: 60,
        maxClaimsPerUser: 3,
        expiresAt: new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString(),
        pickupInstructions: 'Drinks counter at the front. Show your order.',
        imageUrl: 'https://sfile.chatglm.cn/images-ppt/7a01a7c14ac1.jpg',
      },
      {
        vendorId: vendorRecords[4].id,
        title: 'Korean Fried Rice Bowl',
        description: 'Kimchi fried rice topped with a sunny-side-up egg and sesame seeds. Fusion deal you cannot resist!',
        category: 'Korean',
        originalPrice: 14.00,
        dealPrice: 7.50,
        totalQuantity: 20,
        maxClaimsPerUser: 1,
        expiresAt: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
        pickupInstructions: 'Pickup at fusion counter, Level 2.',
        imageUrl: 'https://sfile.chatglm.cn/images-ppt/685ae8fc5812.jpg',
      },
    ]

    const dealRecordPromises = dealsData.map((deal) => {
      const discountPercent = Math.round(((deal.originalPrice - deal.dealPrice) / deal.originalPrice) * 100)
      return supabase.from('Deal').insert({
        id: genId('deal'),
        ...deal,
        discountPercent,
        reservedQuantity: 0,
        soldQuantity: 0,
        availableQuantity: deal.totalQuantity,
        status: 'active',
        pickupOnly: true,
        publicAccessAt: now.toISOString(),
      }).select().single()
    })

    const dealRecordResults = await Promise.all(dealRecordPromises)
    const dealRecords = dealRecordResults.map((r, i) =>
      unwrap(r, `Create deal ${i + 1}`)
    )

    // Also create some expired/sold_out deals for variety
    const [expiredDeal1Res, expiredDeal2Res] = await Promise.all([
      supabase.from('Deal').insert({
        id: genId('deal'),
        vendorId: vendorRecords[0].id,
        title: 'Nasi Lemak Ayam Goreng Berempah',
        description: 'Crispy fried chicken with spice paste, served with our signature Nasi Lemak. This deal has ended.',
        category: 'Malay',
        originalPrice: 15.00,
        dealPrice: 8.00,
        discountPercent: 47,
        totalQuantity: 20,
        reservedQuantity: 0,
        soldQuantity: 20,
        availableQuantity: 0,
        status: 'sold_out',
        pickupOnly: true,
        publicAccessAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      }).select().single(),
      supabase.from('Deal').insert({
        id: genId('deal'),
        vendorId: vendorRecords[1].id,
        title: 'Hokkien Mee Sup',
        description: 'Rich prawn broth Hokkien Mee. This deal has expired.',
        category: 'Chinese',
        originalPrice: 9.00,
        dealPrice: 4.50,
        discountPercent: 50,
        totalQuantity: 30,
        reservedQuantity: 0,
        soldQuantity: 12,
        availableQuantity: 18,
        status: 'expired',
        pickupOnly: true,
        publicAccessAt: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      }).select().single(),
    ])

    unwrap(expiredDeal1Res, 'Create expired deal 1')
    unwrap(expiredDeal2Res, 'Create expired deal 2')

    // ============================================
    // CREATE DEMO ORDERS
    // ============================================
    const orderData = [
      {
        userId: foodieUser.id,
        vendorId: vendorRecords[0].id,
        dealId: dealRecords[0].id,
        quantity: 1,
        originalPrice: dealRecords[0].originalPrice,
        dealPrice: dealRecords[0].dealPrice,
        totalPrice: dealRecords[0].dealPrice,
        status: 'pending_pickup',
        qrCode: crypto.randomUUID(),
        pickupDeadline: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        userId: foodieUser.id,
        vendorId: vendorRecords[2].id,
        dealId: dealRecords[2].id,
        quantity: 1,
        originalPrice: dealRecords[2].originalPrice,
        dealPrice: dealRecords[2].dealPrice,
        totalPrice: dealRecords[2].dealPrice,
        status: 'completed',
        qrCode: crypto.randomUUID(),
        qrVerifiedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
        pickupDeadline: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      },
      {
        userId: extraFoodies[0].id,
        vendorId: vendorRecords[6].id,
        dealId: dealRecords[6].id,
        quantity: 1,
        originalPrice: dealRecords[6].originalPrice,
        dealPrice: dealRecords[6].dealPrice,
        totalPrice: dealRecords[6].dealPrice,
        status: 'picked_up',
        qrCode: crypto.randomUUID(),
        qrVerifiedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        pickupDeadline: new Date(now.getTime() + 1.5 * 60 * 60 * 1000).toISOString(),
      },
    ]

    const orderRecordPromises = orderData.map((o) => {
      const timestamp = Date.now()
      const random = Math.random().toString(36).substring(2, 6).toUpperCase()
      return supabase.from('Order').insert({
        id: genId('order'),
        orderNumber: `FB-${timestamp}-${random}`,
        ...o,
      }).select().single()
    })

    const orderRecordResults = await Promise.all(orderRecordPromises)
    const orderRecords = orderRecordResults.map((r, i) =>
      unwrap(r, `Create order ${i + 1}`)
    )

    // Update deal sold/reserved quantities for orders
    await Promise.all([
      supabase.from('Deal').update({
        reservedQuantity: 1,
        availableQuantity: dealRecords[0].availableQuantity - 1,
      }).eq('id', dealRecords[0].id),
      supabase.from('Deal').update({
        soldQuantity: 1,
        availableQuantity: dealRecords[2].availableQuantity - 1,
      }).eq('id', dealRecords[2].id),
      supabase.from('Deal').update({
        soldQuantity: 1,
        availableQuantity: dealRecords[6].availableQuantity - 1,
      }).eq('id', dealRecords[6].id),
    ])

    // ============================================
    // CREATE DEMO NOTIFICATIONS
    // ============================================
    await Promise.all([
      supabase.from('Notification').insert({
        id: genId('notif'),
        userId: foodieUser.id,
        type: 'claim_confirmed',
        title: 'Order Confirmed! 🎉',
        message: 'Your order for "Nasi Lemak Special - Blue Rice" from Nasi Lemak Bunga Telang is confirmed. Pick up before the deadline!',
        data: JSON.stringify({ orderId: orderRecords[0].id, dealId: dealRecords[0].id }),
      }),
      supabase.from('Notification').insert({
        id: genId('notif'),
        userId: foodieUser.id,
        type: 'order_status_update',
        title: 'Order Completed! ✅',
        message: 'Your order "Roti Canai Set (2 pcs + Dhal)" from Roti Canai House has been completed. Enjoy your meal!',
        data: JSON.stringify({ orderId: orderRecords[1].id, status: 'completed' }),
      }),
      supabase.from('Notification').insert({
        id: genId('notif'),
        userId: foodieUser.id,
        type: 'new_deal_nearby',
        title: 'New Deal Nearby! 🍜',
        message: 'Char Kuey Teow Paradise just dropped a new flash deal! 45% off - grab it before it\'s gone!',
        data: JSON.stringify({ dealId: dealRecords[1].id, vendorId: vendorRecords[1].id }),
        read: true,
      }),
      supabase.from('Notification').insert({
        id: genId('notif'),
        userId: foodieUser.id,
        type: 'deal_expiring',
        title: 'Deal Expiring Soon! ⏰',
        message: 'Mee Goreng Mamak Extra Pedas deal expires in 30 minutes! Don\'t miss out!',
        data: JSON.stringify({ dealId: dealRecords[3].id }),
        read: true,
      }),
      supabase.from('Notification').insert({
        id: genId('notif'),
        userId: vendorUser.id,
        type: 'vendor_approved',
        title: 'Vendor Account Approved! 🎉',
        message: 'Your vendor account "Nasi Lemak Bunga Telang" has been approved. You can now create flash deals!',
        data: JSON.stringify({ vendorId: vendorRecords[0].id, action: 'approve' }),
        read: true,
      }),
      supabase.from('Notification').insert({
        id: genId('notif'),
        userId: extraFoodies[0].id,
        type: 'pickup_reminder',
        title: 'Order Picked Up! 📦',
        message: 'Your order "Satay Kajang 20 Sticks + Ketupat" has been picked up from Satay Kajang Original.',
        data: JSON.stringify({ orderId: orderRecords[2].id, status: 'picked_up' }),
      }),
      supabase.from('Notification').insert({
        id: genId('notif'),
        userId: adminUser.id,
        type: 'siren_push',
        title: 'New Vendor Registration',
        message: 'Laksa Sarawak Kitchen has registered as a vendor and is awaiting approval.',
        data: JSON.stringify({ vendorId: vendorRecords[5].id }),
      }),
    ])

    // ============================================
    // CREATE DEMO SUBSCRIPTIONS
    // ============================================
    await supabase.from('Subscription').insert({
      id: genId('sub'),
      userId: foodieUser.id,
      plan: 'first_dibs',
      status: 'active',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      autoRenew: true,
    })

    return NextResponse.json({
      success: true,
      data: {
        message: 'Database seeded successfully!',
        users: { foodie: foodieUser.id, vendor: vendorUser.id, admin: adminUser.id },
        vendors: vendorRecords.length,
        deals: dealRecords.length + 2, // +2 for expired/sold_out
        orders: orderRecords.length,
        credentials: {
          foodie: 'foodie@test.com / password123',
          vendor: 'vendor@test.com / password123',
          admin: 'admin@test.com / password123',
        },
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { success: false, error: 'Seed failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
}
