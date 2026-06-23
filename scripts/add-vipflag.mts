import { Pool } from 'pg'

// Use session pooler (port 5432) — task requirement.
const url = 'postgresql://postgres.xknkgtuctjmkpommcxfd:Aiman0122769500@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
console.log('Connecting to:', url.replace(/:[^:@]+@/, ':***@'))

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000 })

try {
  const client = await pool.connect()
  try {
    const res = await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vipFlag" BOOLEAN DEFAULT false;`)
    console.log('ALTER TABLE result:', res.command, '— rowCount:', res.rowCount)
    const check = await client.query(`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'vipFlag';`)
    console.log('Column now exists:', JSON.stringify(check.rows, null, 2))
  } finally {
    client.release()
  }
} catch (e) {
  console.error('ERROR:', e instanceof Error ? e.message : String(e))
  process.exit(1)
} finally {
  await pool.end()
}
