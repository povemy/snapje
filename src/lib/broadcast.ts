import { supabase, genId } from '@/lib/supabase'

/**
 * Shared broadcast fan-out helper.
 *
 * Task 4 + Task 5: Both the immediate broadcast route (/api/vendors/[id]/broadcast)
 * and the scheduled-broadcast scheduler (in realtime-service) use this helper
 * to fan out a broadcast to a vendor's subscribers.
 *
 * Recipients = foodie users subscribed to this vendor (via VendorSubscription),
 * excluding:
 *   - vendors (any user with the 'vendor' role)
 *   - admins (any user with the 'admin' role)
 *   - banned users
 *
 * The optional `excludeUserId` param excludes the broadcaster themselves.
 *
 * Side effects:
 *   1. Inserts one Notification row per recipient (chunked at 500).
 *   2. Fires an HTTP POST to the realtime-service's /broadcast endpoint so
 *      connected socket.io clients receive the notification in real time.
 *      Failures here are non-fatal — the DB notification still exists and
 *      will be picked up by the foodie's 5-second polling.
 *
 * Returns the number of recipients that received the DB notification.
 */
export interface BroadcastInput {
  vendorId: string
  vendorBusinessName: string
  message: string
  dealId?: string | null
  senderUserId: string
}

export async function fanOutBroadcast(input: BroadcastInput): Promise<number> {
  const { vendorId, vendorBusinessName, message, dealId, senderUserId } = input

  // 1. Fetch the vendor's subscribers
  const { data: subscriberRows, error: subError } = await supabase
    .from('VendorSubscription')
    .select('userId')
    .eq('vendorId', vendorId)

  if (subError) {
    console.error('[fanOutBroadcast] subscriber list error:', subError.message)
    return 0
  }

  const subscriberUserIds = ((subscriberRows ?? []) as { userId: string }[])
    .map((r) => r.userId)
    .filter((uid) => uid !== senderUserId) // exclude broadcaster

  if (subscriberUserIds.length === 0) return 0

  // 2. Fetch the User rows to filter out banned + non-foodie accounts
  const { data: subscriberUsers, error: subUsersError } = await supabase
    .from('User')
    .select('id, roles, isBanned')
    .in('id', subscriberUserIds)

  if (subUsersError) {
    console.error('[fanOutBroadcast] subscriber user fetch error:', subUsersError.message)
    return 0
  }

  const users = ((subscriberUsers ?? []) as { id: string; roles: string; isBanned: boolean }[])
    .filter((u) => {
      if (u.isBanned) return false
      try {
        const roles = typeof u.roles === 'string' ? u.roles.split(',') : []
        if (roles.includes('vendor') || roles.includes('admin')) return false
        return roles.includes('foodie')
      } catch {
        return false
      }
    })
    .map((u) => ({ id: u.id }))

  if (users.length === 0) return 0

  // 3. Build notification rows
  const title = vendorBusinessName
  const dataPayload = JSON.stringify({
    vendorId,
    dealId: dealId || null,
    senderUserId,
  })

  const rows = users.map((u) => ({
    id: genId('notif'),
    userId: u.id,
    type: 'broadcast',
    title,
    message,
    data: dataPayload,
    read: false,
  }))

  // 4. Insert in chunks of 500 (Supabase REST API limit)
  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const ins = await supabase.from('Notification').insert(slice)
    if (ins.error) {
      console.error('[fanOutBroadcast] insert chunk error:', ins.error.message)
    } else {
      inserted += slice.length
    }
  }

  // 5. Emit real-time notifications via the socket.io service (non-fatal).
  try {
    await fetch(`http://127.0.0.1:3003/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userIds: users.map((u) => u.id),
        notification: {
          type: 'broadcast',
          title,
          message,
          data: dataPayload,
          dealId: dealId || undefined,
        },
      }),
      signal: AbortSignal.timeout(3000),
    })
  } catch (socketErr) {
    console.warn('[fanOutBroadcast] socket emit failed (non-fatal):', socketErr instanceof Error ? socketErr.message : socketErr)
  }

  return inserted
}
