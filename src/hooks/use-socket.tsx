'use client'

import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'
import type { AppNotification, DealStatus, OrderStatus } from '@/types'

const REALTIME_PORT = 3003

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const { user, isAuthenticated } = useAuthStore()
  const { addNotification } = useNotificationStore()

  useEffect(() => {
    if (!isAuthenticated || !user) {
      if (socketRef.current) {
        // BUGFIX (fix-logout-theme-nearme): wrap disconnect in try/catch so
        // a socket that's already half-closed (e.g. the server hung up
        // during the logout request) doesn't throw and crash the React
        // tree as "Application error: a client-side exception has occurred".
        try {
          socketRef.current.removeAllListeners?.()
          socketRef.current.disconnect()
        } catch (err) {
          console.warn('[useSocket] disconnect error (ignored):', err)
        }
        socketRef.current = null
      }
      return
    }

    let socket: Socket
    try {
      // Connect to Socket.io via gateway
      socket = io('/?XTransformPort=' + REALTIME_PORT, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      })
    } catch (err) {
      // io() can throw if the URL is malformed or the transport is
      // unsupported — never crash the React tree over a realtime socket.
      console.error('[useSocket] failed to connect:', err)
      return
    }

    const safeAddNotification = (n: AppNotification) => {
      try {
        addNotification(n)
      } catch (err) {
        console.warn('[useSocket] addNotification error (ignored):', err)
      }
    }

    socket.on('connect', () => {
      // Subscribe to user's personal channel
      try {
        socket.emit('user:subscribe', user.id)
      } catch (err) {
        console.warn('[useSocket] emit user:subscribe failed:', err)
      }
    })

    // Listen for notifications — show social-proof toast for broadcasts
    socket.on('notification:new', (notification: AppNotification) => {
      safeAddNotification(notification)
      // Social-proof toast for broadcast messages.
      // Format: "📣 <Vendor Name>:" as title, with the broadcast message in
      // BOLD as the description (per user spec — Facebook-style social proof).
      try {
        if (notification.type === 'broadcast') {
          const msg = notification.message || ''
          toast.info(`📣 ${notification.title}:`, {
            description: (
              <span className="font-bold text-[#1a1c1e]">
                {msg.slice(0, 140) + (msg.length > 140 ? '…' : '')}
              </span>
            ),
            duration: 6000,
          })
        } else if (notification.type === 'order_status_update') {
          toast.info(`📦 ${notification.title}`, { duration: 4000 })
        } else if (notification.type === 'claim_confirmed') {
          toast.success(`✅ ${notification.title}`, { duration: 4000 })
        } else if (notification.type === 'pickup_reminder') {
          toast.info(`⏰ ${notification.title}`, {
            description: notification.message,
            duration: 5000,
          })
        } else if (notification.type === 'order_burnt') {
          toast.error(`🔥 ${notification.title}`, { duration: 5000 })
        } else if (notification.type === 'deal_new' || notification.type === 'deal_expiring') {
          toast.success(`🔥 ${notification.title}`, { duration: 4000 })
        } else {
          toast.info(notification.title, { duration: 3000 })
        }
      } catch { /* ignore toast errors */ }
    })

    // Listen for order status updates
    socket.on('order:status_update', (data: { orderId: string; status: OrderStatus }) => {
      try {
        toast.info(`📦 Order updated: ${data.status.replace(/_/g, ' ')}`, { duration: 4000 })
      } catch { /* ignore */ }
    })

    socketRef.current = socket

    return () => {
      try {
        socket.removeAllListeners?.()
        socket.disconnect()
      } catch (err) {
        console.warn('[useSocket] cleanup disconnect error (ignored):', err)
      }
      socketRef.current = null
    }
  // Use user?.id instead of user to avoid reconnection on role switch
  }, [isAuthenticated, user?.id, addNotification])

  // Methods to emit events - use callbacks to access ref lazily
  const emitStockUpdate = useCallback((dealId: string, available: number, reserved: number) => {
    socketRef.current?.emit('deal:stock_update', { dealId, available, reserved })
  }, [])

  const emitDealStatusChange = useCallback((dealId: string, status: DealStatus) => {
    socketRef.current?.emit('deal:status_change', { dealId, status })
  }, [])

  const emitNotification = useCallback((userId: string, notification: AppNotification) => {
    socketRef.current?.emit('notification:send', { userId, notification })
  }, [])

  const emitOrderUpdate = useCallback((userId: string, orderId: string, status: OrderStatus) => {
    socketRef.current?.emit('order:status_update', { userId, orderId, status })
  }, [])

  return {
    emitStockUpdate,
    emitDealStatusChange,
    emitNotification,
    emitOrderUpdate,
  }
}
