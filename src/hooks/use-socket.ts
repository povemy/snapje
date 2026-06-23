'use client'

import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
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

    // Listen for notifications
    socket.on('notification:new', (notification: AppNotification) => {
      safeAddNotification(notification)
    })

    // Listen for order status updates
    socket.on('order:status_update', (data: { orderId: string; status: OrderStatus }) => {
      try {
        console.log('[Socket] Order status update:', data)
      } catch {
        // ignore
      }
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
