'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocationStore } from '@/stores/location-store'

export type GeolocationPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

export interface GeolocationState {
  location: { latitude: number; longitude: number } | null
  loading: boolean
  error: string | null
  permission: GeolocationPermission
  request: () => void
}

const LOCALSTORAGE_KEY = 'snapje-user-location'

interface CachedLocation {
  latitude: number
  longitude: number
  timestamp: number
}

function readCached(): { latitude: number; longitude: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LOCALSTORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedLocation
    if (
      typeof parsed?.latitude === 'number' &&
      typeof parsed?.longitude === 'number'
    ) {
      return { latitude: parsed.latitude, longitude: parsed.longitude }
    }
    return null
  } catch {
    return null
  }
}

function writeCached(loc: { latitude: number; longitude: number }) {
  if (typeof window === 'undefined') return
  try {
    const payload: CachedLocation = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      timestamp: Date.now(),
    }
    window.localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(payload))
  } catch {
    // localStorage might be full or disabled — ignore.
  }
}

/**
 * Wraps the browser Geolocation API.
 *
 * - Does NOT auto-prompt on mount (the caller decides when to call `request()`).
 * - On mount, attempts to read the initial permission state via the
 *   Permissions API (if available) and seeds `location` from a cached
 *   localStorage entry (so the UI can render instantly on reload).
 * - On success, persists to `localStorage` under `snapje-user-location`
 *   and updates the Zustand `useLocationStore` on the first successful fix.
 */
export function useGeolocation(): GeolocationState {
  const setLocation = useLocationStore((s) => s.setLocation)
  const setDenied = useLocationStore((s) => s.setDenied)
  const setPrompted = useLocationStore((s) => s.setPrompted)

  const [location, setLocalLocation] = useState<
    { latitude: number; longitude: number } | null
  >(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useState<GeolocationPermission>('unknown')

  // On mount: read cached location + query permissions API for current state.
  useEffect(() => {
    const cached = readCached()
    if (cached) {
      setLocalLocation(cached)
    }

    // HIGH 9: a `cancelled` flag guards the async .then() below. If the
    // component unmounts before the Promise resolves, we MUST NOT touch
    // statusRef or attach an onchange handler — doing so would leak a
    // listener that fires setState on an unmounted component.
    let cancelled = false
    let statusRef: PermissionStatus | null = null
    if (
      typeof navigator !== 'undefined' &&
      'permissions' in navigator &&
      typeof navigator.permissions.query === 'function'
    ) {
      try {
        navigator.permissions
          .query({ name: 'geolocation' as PermissionName })
          .then((status) => {
            if (cancelled) {
              // Component already unmounted — detach the handler we never
              // attached and bail out. No state updates, no listener leak.
              status.onchange = null
              return
            }
            statusRef = status
            setPermission(status.state as GeolocationPermission)
            status.onchange = () => {
              setPermission(status.state as GeolocationPermission)
              if (status.state === 'denied') {
                setDenied(true)
              }
            }
          })
          .catch(() => {
            // Some browsers (Safari) don't support `geolocation` permission name.
            if (!cancelled) setPermission('unknown')
          })
      } catch {
        if (!cancelled) setPermission('unknown')
      }
    }

    return () => {
      cancelled = true
      // Detach the onchange handler to avoid stale state updates after unmount.
      if (statusRef) {
        statusRef.onchange = null
      }
    }
  }, [setDenied])

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      setPermission('denied')
      setDenied(true)
      return
    }

    setLoading(true)
    setError(null)
    setPrompted(true)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }
        setLocalLocation(loc)
        writeCached(loc)
        setLocation(loc)
        setPermission('granted')
        setLoading(false)
      },
      (err) => {
        let message = 'Unable to retrieve your location.'
        if (err.code === err.PERMISSION_DENIED) {
          message = 'Location permission denied. You can still search by address.'
          setPermission('denied')
          setDenied(true)
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          message = 'Position information is unavailable.'
        } else if (err.code === err.TIMEOUT) {
          message = 'Location request timed out.'
        }
        setError(message)
        setLoading(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }, [setLocation, setDenied, setPrompted])

  return { location, loading, error, permission, request }
}
