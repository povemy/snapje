'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser, AppRole } from '@/types'

interface AuthStore {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  // Bearer tokens stored in localStorage (via persist) so that auth works even
  // when third-party cookies are blocked by the browser (common in preview iframes).
  accessToken: string | null
  refreshToken: string | null
  login: (user: AuthUser, tokens?: { accessToken: string; refreshToken: string }) => void
  logout: () => void
  setLoading: (loading: boolean) => void
  updateActiveRole: (role: AppRole) => void
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      accessToken: null,
      refreshToken: null,
      login: (user, tokens) =>
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          ...(tokens ? tokens : {}),
        }),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          accessToken: null,
          refreshToken: null,
        }),
      setLoading: (isLoading) => set({ isLoading }),
      updateActiveRole: (role) =>
        set((state) => ({
          user: state.user ? { ...state.user, activeRole: role } : null,
        })),
      setTokens: (tokens) => set(tokens),
    }),
    {
      name: 'flashbite-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      // When rehydrating from localStorage, if user exists, skip loading state
      onRehydrateStorage: () => (state) => {
        if (state?.isAuthenticated && state?.user) {
          state.isLoading = false
        }
      },
    }
  )
)
