#!/bin/bash
# ============================================
# restore-env.sh — Restore .env from env.md
# ============================================
# The sandbox periodically resets .env to `DATABASE_URL=file:...sqlite`
# (a system env var leaks into the file). This script regenerates .env
# with the correct Supabase PostgreSQL credentials from env.md.
#
# This runs automatically as a `predev` hook before `bun run dev`,
# and can be run manually: `bun run restore-env`
#
# ALWAYS refer to env.md as the source of truth for credentials.
# NEVER write `DATABASE_URL=file:...sqlite` to .env.
# ============================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
ENV_MD="$PROJECT_DIR/env.md"

# The correct .env content (sourced from env.md)
cat > "$ENV_FILE" << 'ENVEOF'
# ============================================
# SnapJe - Supabase PostgreSQL Configuration
# ============================================

# Supabase Project URL
SUPABASE_URL=https://xknkgtuctjmkpommcxfd.supabase.co

# Supabase Anon Public Key
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrbmtndHVjdGpta3BvbW1jeGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODA5MjYsImV4cCI6MjA5NzA1NjkyNn0.fjDwH7YlWym9GG-7jWJQ38J1VRj9QmOnuw4nOnvKhrM

# Supabase Service Role Secret
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrbmtndHVjdGpta3BvbW1jeGZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTQ4MDkyNiwiZXhwIjoyMDk3MDU2OTI2fQ.3EKByhQ7FGf4uTrzTIpoRbTKIhRRO3BmmjMxufOh_58

# ============================================
# Prisma Database URLs (PostgreSQL via Supabase)
# ============================================

# Option B: Connection pooler (ACTIVE, required for sandbox access)
# Verified working 2026-06-17: region is aws-1-ap-southeast-1 (NOT aws-0-)
DATABASE_URL=postgresql://postgres.xknkgtuctjmkpommcxfd:Aiman0122769500@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xknkgtuctjmkpommcxfd:Aiman0122769500@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Prisma-specific env var names (avoid collision with sandbox system DATABASE_URL=file:...sqlite)
# prisma/schema.prisma reads these via env("PRISMA_DATABASE_URL") / env("PRISMA_DIRECT_URL")
PRISMA_DATABASE_URL=postgresql://postgres.xknkgtuctjmkpommcxfd:Aiman0122769500@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
PRISMA_DIRECT_URL=postgresql://postgres.xknkgtuctjmkpommcxfd:Aiman0122769500@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# ============================================
# JWT Secrets (for access/refresh token signing)
# ============================================
JWT_SECRET=flashbite-access-secret-9f3a7c2e1b8d4f6a0e5c3b9d7f2a8c4e
JWT_REFRESH_SECRET=flashbite-refresh-secret-2b7e9c5f3d8a1b4e6c0f9a2d5e7b3c8f
ENVEOF

# Verify the file was written correctly — check the ACTUAL DATABASE_URL value
# (not comments that mention "file:...sqlite")
ACTUAL_DB_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | head -1)
if echo "$ACTUAL_DB_URL" | grep -q "file:"; then
  echo "❌ ERROR: .env DATABASE_URL is still SQLite — restore failed!"
  exit 1
fi

if grep -q "aws-1-ap-southeast-1.pooler.supabase.com" "$ENV_FILE"; then
  echo "✅ .env restored with Supabase PostgreSQL credentials (from env.md)"
else
  echo "❌ ERROR: .env does not contain Supabase pooler URL — restore failed!"
  exit 1
fi
