'use client'

import { create } from 'zustand'
import type { AppNotification } from '@/types'

interface NotificationStore {
  notifications: AppNotification[]
  unreadCount: number
  addNotification: (notification: AppNotification) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  setNotifications: (notifications: AppNotification[]) => void
  setUnreadCount: (count: number) => void
  clearAll: () => void
}

export const useNotificationStore = create<NotificationStore>()((set) => ({
  notifications: [],
  unreadCount: 0,
  
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    })),
  
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  
  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    }),

  setUnreadCount: (count) =>
    set({ unreadCount: Math.max(0, Math.floor(count)) }),
  
  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}))
