#!/bin/bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "[$(date '+%H:%M:%S')] Starting Next.js dev server (skipping db:push, DB already seeded)..."
bun run dev &
DEV_PID=$!
echo "[$(date '+%H:%M:%S')] dev server launched, PID=$DEV_PID"

# Wait for readiness
for i in $(seq 1 40); do
  if curl -s --connect-timeout 2 --max-time 5 http://localhost:3000 >/dev/null 2>&1; then
    echo "[$(date '+%H:%M:%S')] dev server ready (attempt $i)"
    break
  fi
  sleep 1
done

echo "[$(date '+%H:%M:%S')] Starting mini-services..."
for service_dir in "$PROJECT_DIR"/mini-services/*; do
  [ -d "$service_dir" ] || continue
  [ -f "$service_dir/package.json" ] || continue
  grep -q '"dev"' "$service_dir/package.json" || continue
  service_name=$(basename "$service_dir")
  (
    cd "$service_dir"
    bun install >/dev/null 2>&1
    exec bun run dev
  ) >"$PROJECT_DIR/.zscripts/mini-service-${service_name}.log" 2>&1 &
  echo "[$(date '+%H:%M:%S')] $service_name started (PID $!)"
  disown $! 2>/dev/null || true
done

# Detach the dev server so this script can exit without killing it
disown "$DEV_PID" 2>/dev/null || true
echo "[$(date '+%H:%M:%S')] dev server disowned. Script exiting. Server should persist."
echo "$DEV_PID" > "$PROJECT_DIR/.zscripts/dev.pid"
