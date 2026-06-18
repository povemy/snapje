'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface StoredLocation {
  latitude: number
  longitude: number
}

interface LocationStore {
  location: StoredLocation | null
  hasPrompted: boolean
  hasDenied: boolean
  setLocation: (loc: StoredLocation) => void
  setPrompted: (prompted: boolean) => void
  setDenied: (denied: boolean) => void
  clear: () => void
}

/**
 * Persisted user location store.
 * - `location`: last known coordinates (or null if user never granted)
 * - `hasPrompted`: have we ever shown the geolocation prompt to the user?
 * - `hasDenied`: did the user deny the geolocation prompt?
 *
 * Persisted to localStorage under the key `flashbite-location`.
 */
export const useLocationStore = create<LocationStore>()(
  persist(
    (set) => ({
      location: null,
      hasPrompted: false,
      hasDenied: false,
      setLocation: (loc) => set({ location: loc, hasDenied: false }),
      setPrompted: (prompted) => set({ hasPrompted: prompted }),
      setDenied: (denied) => set({ hasDenied: denied, hasPrompted: true }),
      clear: () => set({ location: null, hasPrompted: false, hasDenied: false }),
    }),
    {
      name: 'flashbite-location',
    }
  )
)
