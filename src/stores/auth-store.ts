'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser, AppRole } from '@/types'

interface AuthStore {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  // CRITICAL FIX (tokens in localStorage): only the short-lived accessToken
  // (15 min) is persisted to localStorage so the Bearer-token flow keeps
  // working in preview iframes where third-party cookies are blocked.
  // The refresh token is NEVER stored here — it lives only in the httpOnly
  // cookie, set by the server on login/register/refresh/change-password.
  accessToken: string | null
  login: (user: AuthUser, tokens?: { accessToken?: string }) => void
  logout: () => void
  setLoading: (loading: boolean) => void
  updateActiveRole: (role: AppRole) => void
  setTokens: (tokens: { accessToken?: string }) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      accessToken: null,
      login: (user, tokens) =>
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          // Only the accessToken is persisted to the store/localStorage. The
          // refresh token lives ONLY in the httpOnly cookie (set by the server)
          // and is never exposed to JS.
          accessToken: tokens?.accessToken ?? null,
        }),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          accessToken: null,
        }),
      setLoading: (isLoading) => set({ isLoading }),
      updateActiveRole: (role) =>
        set((state) => ({
          user: state.user ? { ...state.user, activeRole: role } : null,
        })),
      setTokens: (tokens) =>
        set({
          // Only the accessToken is kept client-side; the refresh token lives
          // in the httpOnly cookie and is sent automatically with
          // credentials:'include'.
          accessToken: tokens?.accessToken ?? null,
        }),
    }),
    {
      name: 'flashbite-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        accessToken: state.accessToken,
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
