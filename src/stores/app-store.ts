'use client'

import { create } from 'zustand'
import type { AppView, AppRole } from '@/types'

interface AppStore {
  // View routing
  currentView: AppView
  viewParams: Record<string, string>
  previousView: AppView | null
  
  // Navigation
  navigate: (view: AppView, params?: Record<string, string>) => void
  goBack: () => void
  
  // Role
  activeRole: AppRole
  setActiveRole: (role: AppRole) => void
  
  // UI State
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  
  // Auth Modal
  showAuthModal: boolean
  setShowAuthModal: (show: boolean) => void
  
  // Notifications
  unreadCount: number
  setUnreadCount: (count: number) => void
  
  // Search
  searchQuery: string
  setSearchQuery: (query: string) => void
  
  // Filters
  selectedCategory: string | null
  setSelectedCategory: (cat: string | null) => void
  distanceMax: number
  setDistanceMax: (km: number) => void
}

export const useAppStore = create<AppStore>()((set, get) => ({
  currentView: 'home',
  viewParams: {},
  previousView: null,
  
  navigate: (view, params = {}) => {
    const { currentView } = get()
    set({ previousView: currentView, currentView: view, viewParams: params })
  },
  
  goBack: () => {
    const { previousView } = get()
    if (previousView) {
      set({ currentView: previousView, previousView: null, viewParams: {} })
    }
  },
  
  activeRole: 'foodie',
  setActiveRole: (role) => {
    // Navigate to the default view for the new role
    const defaultViews: Record<AppRole, AppView> = {
      foodie: 'home',
      vendor: 'dashboard',
      admin: 'dashboard',
    }
    set({ activeRole: role, currentView: defaultViews[role], viewParams: {}, previousView: null })
  },
  
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  
  showAuthModal: false,
  setShowAuthModal: (show) => set({ showAuthModal: show }),
  
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  selectedCategory: null,
  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  distanceMax: 5,
  setDistanceMax: (km) => set({ distanceMax: km }),
}))
