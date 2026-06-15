import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server-side Supabase client with service role (full admin access)
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

// Public Supabase client with anon key (restricted by RLS)
export const supabasePublic = createClient(
  supabaseUrl,
  process.env.SUPABASE_ANON_KEY!
)
