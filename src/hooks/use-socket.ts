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
        socketRef.current.disconnect()
        socketRef.current = null
      }
      return
    }

    // Connect to Socket.io via gateway
    const socket = io('/?XTransformPort=' + REALTIME_PORT, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    })

    socket.on('connect', () => {
      // Subscribe to user's personal channel
      socket.emit('user:subscribe', user.id)
    })

    // Listen for notifications
    socket.on('notification:new', (notification: AppNotification) => {
      addNotification(notification)
    })

    // Listen for order status updates
    socket.on('order:status_update', (data: { orderId: string; status: OrderStatus }) => {
      console.log('[Socket] Order status update:', data)
    })

    socketRef.current = socket

    return () => {
      socket.disconnect()
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
