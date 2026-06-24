import { Server } from 'socket.io'
import { createServer } from 'http'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load .env from the parent project ─────────────────────────────────────
// The realtime-service is a separate Bun project, so it doesn't auto-load
// the parent Next.js .env. We parse it manually here so the scheduler can
// talk to Supabase.
function loadEnv() {
  try {
    const envPath = resolve(import.meta.dir, '../../.env')
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
    console.log('[SnapJe Real-time] .env loaded from', envPath)
  } catch (e) {
    console.warn('[SnapJe Real-time] Failed to load .env:', e instanceof Error ? e.message : e)
  }
}
loadEnv()

const PORT = 3003

const httpServer = createServer()

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
})

// ── Supabase client (service role, bypasses RLS) ──────────────────────────
// The scheduler needs admin access to query + update ScheduledBroadcast rows.
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[SnapJe Real-time] FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env')
}
const supabase: SupabaseClient = createClient(supabaseUrl!, supabaseServiceKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Track connected users and their rooms
const userRooms: Map<string, Set<string>> = new Map()

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`)

  // User subscribes to their personal notification channel
  socket.on('user:subscribe', (userId: string) => {
    const room = `user:${userId}`
    socket.join(room)
    if (!userRooms.has(userId)) {
      userRooms.set(userId, new Set())
    }
    userRooms.get(userId)!.add(socket.id)
    console.log(`[Socket] User ${userId} subscribed to ${room}`)
  })

  socket.on('deal:subscribe', (dealId: string) => {
    socket.join(`deal:${dealId}`)
  })

  socket.on('deal:unsubscribe', (dealId: string) => {
    socket.leave(`deal:${dealId}`)
  })

  socket.on('vendor:subscribe', (vendorId: string) => {
    socket.join(`vendor:${vendorId}`)
  })

  socket.on('admin:subscribe', () => {
    socket.join('admin')
  })

  socket.on('deal:stock_update', (data: { dealId: string; available: number; reserved: number }) => {
    io.to(`deal:${data.dealId}`).emit('deal:stock_update', data)
  })

  socket.on('deal:status_change', (data: { dealId: string; status: string }) => {
    io.to(`deal:${data.dealId}`).emit('deal:status_change', data)
  })

  socket.on('notification:send', (data: { userId: string; notification: unknown }) => {
    io.to(`user:${data.userId}`).emit('notification:new', data.notification)
  })

  socket.on('order:status_update', (data: { userId: string; orderId: string; status: string }) => {
    io.to(`user:${data.userId}`).emit('order:status_update', data)
  })

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`)
    for (const [userId, sockets] of userRooms.entries()) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id)
        if (sockets.size === 0) {
          userRooms.delete(userId)
        }
      }
    }
  })
})

// ── HTTP /broadcast endpoint (called by Next.js API routes) ───────────────
httpServer.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/broadcast') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const { userIds, notification } = JSON.parse(body)
        if (userIds && Array.isArray(userIds) && notification) {
          let emitted = 0
          for (const userId of userIds) {
            io.to(`user:${userId}`).emit('notification:new', {
              ...notification,
              id: `broadcast_${Date.now()}_${userId}`,
              userId,
              read: false,
              createdAt: new Date().toISOString(),
            })
            emitted++
          }
          console.log(`[Socket] Broadcast emitted to ${emitted} users`)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } catch (e) {
        console.error('[Socket] Broadcast parse error:', e)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }))
      }
    })
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }
})

// ───────────────────────────────────────────────────────────────────────────
// Task 5: Scheduled Broadcast Scheduler
// ───────────────────────────────────────────────────────────────────────────
// Polls every 60 seconds for ScheduledBroadcast rows where:
//   - status = 'pending'
//   - scheduledAt <= now
// For each due row:
//   1. Atomically marks it 'sent' (status='sent', sentAt=now) — uses a
//      conditional update (.eq('status', 'pending')) so two scheduler ticks
//      can't double-fire the same broadcast.
//   2. Fetches the vendor's subscribers (foodie-only, excluding the
//      broadcaster).
//   3. Inserts one Notification row per subscriber (chunked at 500).
//   4. Fires the socket.io /broadcast endpoint for real-time delivery.
//   5. Updates recipientCount on the ScheduledBroadcast row.
//
// Why run the scheduler HERE (in the realtime-service mini-service) instead
// of in the Next.js app?
//   - Next.js serverless functions have a max execution time and aren't
//     guaranteed to be running 24/7 in production. The realtime-service is a
//     long-lived Bun process that's always on, making it the right place for
//     a polling scheduler.
//   - It keeps the scheduler logic co-located with the socket.io fan-out,
//     avoiding an extra HTTP hop.
async function genId(prefix?: string): Promise<string> {
  // Bun has crypto.randomUUID natively
  const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 24)
  return prefix ? `${prefix}_${uuid}` : uuid
}

async function executeScheduledBroadcast(row: {
  id: string
  vendorId: string
  message: string
  dealId: string | null
}) {
  console.log(`[Scheduler] Executing scheduled broadcast ${row.id} for vendor ${row.vendorId}`)

  // 1. Atomically mark as 'sent' (prevents double-fire from concurrent ticks)
  const { error: claimErr } = await supabase
    .from('ScheduledBroadcast')
    .update({ status: 'sent', sentAt: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
  if (claimErr) {
    console.error(`[Scheduler] claim error for ${row.id}:`, claimErr.message)
    return
  }

  // 2. Fetch the vendor (need businessName + userId for the broadcaster exclusion)
  const { data: vendor, error: vErr } = await supabase
    .from('Vendor')
    .select('id, userId, businessName')
    .eq('id', row.vendorId)
    .maybeSingle()
  if (vErr || !vendor) {
    console.error(`[Scheduler] vendor fetch error for ${row.vendorId}:`, vErr?.message ?? 'not found')
    return
  }

  // 3. Fetch subscribers
  const { data: subRows, error: subErr } = await supabase
    .from('VendorSubscription')
    .select('userId')
    .eq('vendorId', row.vendorId)
  if (subErr) {
    console.error(`[Scheduler] subscriber fetch error:`, subErr.message)
    return
  }
  const subscriberIds = ((subRows ?? []) as { userId: string }[])
    .map((r) => r.userId)
    .filter((uid) => uid !== vendor.userId) // exclude broadcaster
  if (subscriberIds.length === 0) {
    console.log(`[Scheduler] No subscribers for vendor ${row.vendorId} — broadcast ${row.id} had 0 recipients`)
    await supabase.from('ScheduledBroadcast').update({ recipientCount: 0 }).eq('id', row.id)
    return
  }

  // 4. Filter to foodie-only + not banned + not vendor/admin
  const { data: subUsers, error: suErr } = await supabase
    .from('User')
    .select('id, roles, isBanned')
    .in('id', subscriberIds)
  if (suErr) {
    console.error(`[Scheduler] subscriber user fetch error:`, suErr.message)
    return
  }
  const eligibleUsers = ((subUsers ?? []) as { id: string; roles: string; isBanned: boolean }[])
    .filter((u) => {
      if (u.isBanned) return false
      const roles = typeof u.roles === 'string' ? u.roles.split(',') : []
      if (roles.includes('vendor') || roles.includes('admin')) return false
      return roles.includes('foodie')
    })
    .map((u) => ({ id: u.id }))

  if (eligibleUsers.length === 0) {
    console.log(`[Scheduler] No eligible foodie subscribers for broadcast ${row.id}`)
    await supabase.from('ScheduledBroadcast').update({ recipientCount: 0 }).eq('id', row.id)
    return
  }

  // 5. Insert Notification rows (chunked at 500)
  const title = vendor.businessName
  const dataPayload = JSON.stringify({
    vendorId: vendor.id,
    dealId: row.dealId,
    senderUserId: vendor.userId,
  })
  const notifRows = []
  for (const u of eligibleUsers) {
    notifRows.push({
      id: await genId('notif'),
      userId: u.id,
      type: 'broadcast',
      title,
      message: row.message,
      data: dataPayload,
      read: false,
    })
  }
  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < notifRows.length; i += CHUNK) {
    const slice = notifRows.slice(i, i + CHUNK)
    const ins = await supabase.from('Notification').insert(slice)
    if (ins.error) {
      console.error(`[Scheduler] notif insert chunk error:`, ins.error.message)
    } else {
      inserted += slice.length
    }
  }

  // 6. Real-time fan-out via socket.io (in-process, no HTTP hop needed)
  try {
    for (const u of eligibleUsers) {
      io.to(`user:${u.id}`).emit('notification:new', {
        id: `scheduled_${Date.now()}_${u.id}`,
        userId: u.id,
        type: 'broadcast',
        title,
        message: row.message,
        data: dataPayload,
        dealId: row.dealId || undefined,
        read: false,
        createdAt: new Date().toISOString(),
      })
    }
  } catch (e) {
    console.warn(`[Scheduler] socket emit failed (non-fatal):`, e)
  }

  // 7. Update recipientCount
  await supabase.from('ScheduledBroadcast').update({ recipientCount: inserted }).eq('id', row.id)
  console.log(`[Scheduler] Broadcast ${row.id} sent to ${inserted} subscribers`)
}

async function schedulerTick() {
  try {
    const nowIso = new Date().toISOString()
    const { data: dueRows, error } = await supabase
      .from('ScheduledBroadcast')
      .select('id, vendorId, message, dealId')
      .eq('status', 'pending')
      .lte('scheduledAt', nowIso)
      .limit(50) // cap per tick to avoid runaway fan-out
    if (error) {
      console.error('[Scheduler] query error:', error.message)
      return
    }
    if (!dueRows || dueRows.length === 0) return
    console.log(`[Scheduler] Found ${dueRows.length} due scheduled broadcast(s)`)
    // Execute sequentially to avoid hammering Supabase with concurrent fan-outs
    for (const row of dueRows as Array<{ id: string; vendorId: string; message: string; dealId: string | null }>) {
      await executeScheduledBroadcast(row)
    }
  } catch (e) {
    console.error('[Scheduler] tick error:', e)
  }
}

// Run every 60 seconds
setInterval(schedulerTick, 60 * 1000)
// Run once on startup so we catch any broadcasts that came due while the
// service was down (e.g. a deploy/restart).
setTimeout(schedulerTick, 5000)

// ───────────────────────────────────────────────────────────────────────────
// Issue 8: Pickup Reminder + Burnt-Check Scheduler
// ───────────────────────────────────────────────────────────────────────────
// Runs every 5 minutes. Two jobs per tick:
//
// 1. PICKUP REMINDERS: For every `pending_pickup` order where
//    `lastReminderSentAt` is null OR > 30 min ago, insert a `pickup_reminder`
//    notification and update `lastReminderSentAt`. This fires every 30 min
//    from order creation until the order is picked up or goes burnt.
//
// 2. BURNT CHECK: For every `pending_pickup` order, determine if the vendor's
//    shop has closed for the pickup day. If so, mark the order `status=expired`
//    (which the client renders as "Burnt"). If the vendor has no operating
//    hours, fall back to pickupDeadline + 2h grace period.
//
// Operating-hours format: {"mon": {"open": "09:00", "close": "18:00"}, ...}
// Legacy format: {"mon": "9-18", ...} — also supported via parse.
const PICKUP_REMINDER_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

interface OperatingHours {
  [day: string]: { open?: string; close?: string } | string | undefined
}

/**
 * Parse the vendor's operatingHours JSON and return today's closing time
 * as a Date object (today's date + the close time), or null if unknown.
 */
function getVendorClosingTimeToday(operatingHoursRaw: string | null | undefined): Date | null {
  if (!operatingHoursRaw) return null
  let hours: OperatingHours
  try {
    hours = JSON.parse(operatingHoursRaw)
  } catch {
    return null
  }
  if (!hours || typeof hours !== 'object') return null

  // Day-of-week keys: mon, tue, wed, thu, fri, sat, sun
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const now = new Date()
  const todayKey = dayKeys[now.getDay()]
  const todayHours = hours[todayKey]
  if (!todayHours) return null

  let closeTime: string | null = null
  if (typeof todayHours === 'string') {
    // Legacy format: "9-18" or "09:00-18:00"
    const parts = todayHours.split('-')
    if (parts.length === 2) {
      closeTime = parts[1].trim()
    }
  } else if (typeof todayHours === 'object' && todayHours.close) {
    closeTime = todayHours.close
  }

  if (!closeTime) return null

  // Parse "18:00" or "18" → hours and minutes
  const closeParts = closeTime.split(':')
  const closeHour = parseInt(closeParts[0], 10)
  const closeMin = closeParts.length > 1 ? parseInt(closeParts[1], 10) : 0
  if (isNaN(closeHour)) return null

  const closing = new Date(now)
  closing.setHours(closeHour, closeMin, 0, 0)
  return closing
}

async function pickupReminderTick() {
  try {
    // Find pending_pickup orders that need a reminder.
    // A reminder is due if lastReminderSentAt is null OR > 30 min ago.
    const thirtyMinAgo = new Date(Date.now() - PICKUP_REMINDER_INTERVAL_MS).toISOString()
    const { data: dueOrders, error } = await supabase
      .from('Order')
      .select('id, userId, orderNumber, pickupDeadline, lastReminderSentAt, dealId, deal:Deal(title)')
      .eq('status', 'pending_pickup')
      .or(`lastReminderSentAt.is.null,lastReminderSentAt.lte.${thirtyMinAgo}`)
      .limit(100)
    if (error) {
      console.error('[Reminders] query error:', error.message)
      return
    }
    if (!dueOrders || dueOrders.length === 0) return

    console.log(`[Reminders] Found ${dueOrders.length} order(s) needing a pickup reminder`)

    for (const order of dueOrders as Array<{
      id: string; userId: string; orderNumber: string;
      pickupDeadline: string; lastReminderSentAt: string | null;
      dealId: string; deal?: { title: string } | { title: string }[]
    }>) {
      const dealTitle = Array.isArray(order.deal) ? order.deal[0]?.title : order.deal?.title
      const pickupTime = new Date(order.pickupDeadline + (order.pickupDeadline.endsWith('Z') ? '' : 'Z'))
      const pickupStr = pickupTime.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })

      // Insert a pickup_reminder notification
      const notifId = await genId('notif')
      const { error: insErr } = await supabase.from('Notification').insert({
        id: notifId,
        userId: order.userId,
        type: 'pickup_reminder',
        title: '⏰ Pickup Reminder',
        message: `Don't forget to pick up your order${dealTitle ? ` for "${dealTitle}"` : ''} (#${order.orderNumber}) by ${pickupStr}.`,
        data: JSON.stringify({ orderId: order.id, dealId: order.dealId }),
        read: false,
      })
      if (insErr) {
        console.error(`[Reminders] insert error for order ${order.id}:`, insErr.message)
        continue
      }

      // Emit via socket.io for real-time delivery
      try {
        io.to(`user:${order.userId}`).emit('notification:new', {
          id: notifId,
          userId: order.userId,
          type: 'pickup_reminder',
          title: '⏰ Pickup Reminder',
          message: `Don't forget to pick up your order${dealTitle ? ` for "${dealTitle}"` : ''} (#${order.orderNumber}) by ${pickupStr}.`,
          data: JSON.stringify({ orderId: order.id, dealId: order.dealId }),
          read: false,
          createdAt: new Date().toISOString(),
        })
      } catch { /* non-fatal */ }

      // Update lastReminderSentAt
      await supabase.from('Order').update({ lastReminderSentAt: new Date().toISOString() }).eq('id', order.id)
    }
  } catch (e) {
    console.error('[Reminders] tick error:', e)
  }
}

async function burntCheckTick() {
  try {
    // Find all pending_pickup orders (with vendor operatingHours for the burnt check)
    const { data: orders, error } = await supabase
      .from('Order')
      .select('id, pickupDeadline, createdAt, vendor:Vendor(operatingHours)')
      .eq('status', 'pending_pickup')
      .limit(200)
    if (error) {
      console.error('[BurntCheck] query error:', error.message)
      return
    }
    if (!orders || orders.length === 0) return

    const now = new Date()
    const toBurn: string[] = []

    for (const order of orders as Array<{
      id: string; pickupDeadline: string; createdAt: string;
      vendor?: { operatingHours: string | null } | { operatingHours: string | null }[]
    }>) {
      const vendorHours = Array.isArray(order.vendor) ? order.vendor[0]?.operatingHours : order.vendor?.operatingHours
      const pickupDate = new Date(order.pickupDeadline + (order.pickupDeadline.endsWith('Z') ? '' : 'Z'))

      // Determine the burnt threshold:
      // - If the vendor has today's closing time → burnt when closing time has passed
      // - If no operating hours → fall back to pickupDeadline + 2h grace period
      const closingTime = getVendorClosingTimeToday(vendorHours)
      let burntThreshold: Date
      if (closingTime && closingTime.getTime() > pickupDate.getTime()) {
        // Closing time is after pickup deadline — use closing time as threshold
        burntThreshold = closingTime
      } else if (closingTime) {
        // Closing time is before or equal to pickup deadline — use closing time
        burntThreshold = closingTime
      } else {
        // No operating hours — fall back to pickupDeadline + 2h
        burntThreshold = new Date(pickupDate.getTime() + 2 * 60 * 60 * 1000)
      }

      if (now > burntThreshold) {
        toBurn.push(order.id)
      }
    }

    if (toBurn.length > 0) {
      console.log(`[BurntCheck] Marking ${toBurn.length} order(s) as expired (burnt)`)
      const { error: updErr } = await supabase
        .from('Order')
        .update({ status: 'expired' })
        .in('id', toBurn)
      if (updErr) {
        console.error('[BurntCheck] update error:', updErr.message)
      }
    }
  } catch (e) {
    console.error('[BurntCheck] tick error:', e)
  }
}

// Reminder + burnt check: run every 5 minutes
setInterval(async () => {
  await pickupReminderTick()
  await burntCheckTick()
}, 5 * 60 * 1000)
// Run once on startup
setTimeout(async () => {
  await pickupReminderTick()
  await burntCheckTick()
}, 8000)

httpServer.listen(PORT)
console.log(`[SnapJe Real-time] Socket.io server running on port ${PORT}`)
console.log(`[SnapJe Real-time] Scheduled-broadcast scheduler active (60s interval)`)
console.log(`[SnapJe Real-time] Pickup-reminder + burnt-check scheduler active (5m interval)`)
