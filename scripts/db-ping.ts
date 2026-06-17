import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ log: ['error', 'warn'] })

console.log('DATABASE_URL prefix:', process.env.DATABASE_URL?.substring(0, 30) ?? '(undefined)')
console.log('DIRECT_URL  prefix:', process.env.DIRECT_URL?.substring(0, 30) ?? '(undefined)')
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ?? '(undefined)')
console.log()

try {
  const userCount = await prisma.user.count()
  const dealCount = await prisma.deal.count()
  const vendorCount = await prisma.vendor.count()
  const orderCount = await prisma.order.count()
  const notifCount = await prisma.notification.count()

  console.log('✓ Prisma PostgreSQL connection via pooler: OK')
  console.log('  --- Row counts (Prisma models only) ---')
  console.log(`  Users:         ${userCount}`)
  console.log(`  Vendors:       ${vendorCount}`)
  console.log(`  Deals:         ${dealCount}`)
  console.log(`  Orders:        ${orderCount}`)
  console.log(`  Notifications: ${notifCount}`)

  console.log('  --- Sample vendor ---')
  const v = await prisma.vendor.findFirst({ select: { id: true, businessName: true, createdAt: true } })
  console.log(`  id:            ${v?.id}`)
  console.log(`  businessName:  ${v?.businessName}`)

  console.log('  --- Sample deal ---')
  const d = await prisma.deal.findFirst({ select: { id: true, title: true, dealPrice: true, status: true, availableQuantity: true } })
  console.log(`  id:                ${d?.id}`)
  console.log(`  title:             ${d?.title}`)
  console.log(`  dealPrice:         RM${d?.dealPrice}`)
  console.log(`  status:            ${d?.status}`)
  console.log(`  availableQuantity: ${d?.availableQuantity}`)

  console.log()
  console.log('✓ ALL VERIFICATION PASSED')
} catch (e) {
  console.error('✗ Prisma connection FAILED:', e.message)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
