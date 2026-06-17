'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, Search, LocateFixed, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import MapView from '@/components/map/MapView'
import { useGeolocation } from '@/hooks/use-geolocation'

export interface LocationPickerValue {
  latitude: number
  longitude: number
}

export interface LocationPickerProps {
  value: LocationPickerValue
  onChange: (lat: number, lng: number) => void
  address?: string
  onAddressChange?: (addr: string) => void
}

interface NominatimReverseResponse {
  display_name?: string
  error?: string
}

interface NominatimSearchResult {
  lat: string
  lon: string
  display_name?: string
}

const REVERSE_DEBOUNCE_MS = 700

/**
 * Vendor registration / deal-location picker.
 *
 * - Address search input (forward geocodes via Nominatim on Enter / Search)
 * - "Use my location" button (browser geolocation, cached in flashbite-* localStorage)
 * - Interactive Leaflet map with a draggable center marker; reverse-geocodes
 *   the address on marker drag / map click (debounced 700ms).
 *
 * Props are fully controlled by the parent:
 *   value/onChange     — the coordinates
 *   address/onAddressChange — the human-readable address (optional)
 */
export function LocationPicker({
  value,
  onChange,
  address,
  onAddressChange,
}: LocationPickerProps) {
  const [searchInput, setSearchInput] = useState(address ?? '')
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  // Track the most recent reverse-geocode request so we can ignore stale
  // responses (e.g. user drags twice in quick succession).
  const reverseReqId = useRef(0)
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const geo = useGeolocation()
  // True between the user clicking "Use my location" and the position being
  // resolved — used to distinguish a user-initiated fix from the cached one.
  const geoRequestedRef = useRef(false)

  // Keep the search box in sync with the parent-provided address (e.g. when
  // a reverse-geocode completes). Don't clobber while the user is typing:
  // if the search box has focus, leave it alone.
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = inputRef.current
    const isFocused = el && document.activeElement === el
    if (!isFocused && address != null) {
      setSearchInput(address)
    }
  }, [address])

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      const reqId = ++reverseReqId.current
      setIsGeocoding(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
          { headers: { Accept: 'application/json' } }
        )
        if (!res.ok) return
        const data = (await res.json()) as NominatimReverseResponse
        // Ignore stale responses.
        if (reqId !== reverseReqId.current) return
        if (data.display_name) {
          onAddressChange?.(data.display_name)
          setSearchInput(data.display_name)
        }
      } catch {
        // Network errors are non-fatal — coordinates are still valid.
      } finally {
        if (reqId === reverseReqId.current) {
          setIsGeocoding(false)
        }
      }
    },
    [onAddressChange]
  )

  // Debounced reverse geocode after a coordinate change originating from the
  // map (marker drag or map click).
  const scheduleReverseGeocode = useCallback(
    (lat: number, lng: number) => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current)
      reverseTimer.current = setTimeout(() => {
        reverseGeocode(lat, lng)
      }, REVERSE_DEBOUNCE_MS)
    },
    [reverseGeocode]
  )

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      onChange(lat, lng)
      scheduleReverseGeocode(lat, lng)
    },
    [onChange, scheduleReverseGeocode]
  )

  // Forward geocode when the user types an address and presses Enter / Search.
  const forwardGeocode = useCallback(
    async (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return
      setIsGeocoding(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            trimmed
          )}&limit=1`,
          { headers: { Accept: 'application/json' } }
        )
        if (!res.ok) return
        const data = (await res.json()) as NominatimSearchResult[]
        if (data.length === 0) {
          setGeoError('No matching place found. Try a different address.')
          return
        }
        const first = data[0]
        const lat = parseFloat(first.lat)
        const lng = parseFloat(first.lon)
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          onChange(lat, lng)
          if (first.display_name) {
            onAddressChange?.(first.display_name)
            setSearchInput(first.display_name)
          }
        }
      } catch {
        setGeoError('Failed to search address. Please try again.')
      } finally {
        setIsGeocoding(false)
      }
    },
    [onChange, onAddressChange]
  )

  // When geolocation resolves from a *user-initiated* request, update coords
  // and reverse-geocode the address.
  useEffect(() => {
    if (!geoRequestedRef.current) return
    if (geo.location) {
      geoRequestedRef.current = false
      onChange(geo.location.latitude, geo.location.longitude)
      scheduleReverseGeocode(geo.location.latitude, geo.location.longitude)
    }
    if (geo.error) {
      setGeoError(geo.error)
    } else if (geo.permission === 'granted') {
      setGeoError(null)
    }
  }, [geo.location, geo.error, geo.permission, onChange, scheduleReverseGeocode])

  const handleUseMyLocation = () => {
    setGeoError(null)
    geoRequestedRef.current = true
    geo.request()
  }

  const handleSearchSubmit = () => {
    setGeoError(null)
    forwardGeocode(searchInput)
  }

  // Cleanup any pending debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current)
    }
  }, [])

  const center: [number, number] = [value.latitude, value.longitude]

  return (
    <div className="space-y-3">
      {/* Search row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            inputMode="search"
            placeholder="Search an address (e.g. Jalan Bukit Bintang, KL)"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              setGeoError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSearchSubmit()
              }
            }}
            className="pl-8"
            aria-label="Search address"
          />
          {isGeocoding && (
            <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="default"
          onClick={handleSearchSubmit}
          disabled={isGeocoding || !searchInput.trim()}
          aria-label="Search address"
        >
          <Search className="size-4" />
          <span className="hidden sm:inline">Search</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="default"
          onClick={handleUseMyLocation}
          disabled={geo.loading}
          aria-label="Use my location"
        >
          {geo.loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LocateFixed className="size-4" />
          )}
          <span className="hidden sm:inline">My location</span>
        </Button>
      </div>

      {/* Map */}
      <MapView
        center={center}
        zoom={15}
        height={320}
        interactive
        onMapClick={handleMapClick}
        className="rounded-xl border border-border"
      />

      {/* Resolved address display */}
      <div className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <MapPin className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          {isGeocoding ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              Resolving address…
            </span>
          ) : address ? (
            <span className="break-words text-foreground">{address}</span>
          ) : (
            <span className="italic">Drag the marker or search to set an address.</span>
          )}
          {geoError && (
            <span className="mt-1 block text-destructive">{geoError}</span>
          )}
        </div>
      </div>

      {/* Coords helper — useful for debugging and screen readers */}
      <p className="sr-only" aria-live="polite">
        Selected coordinates: {value.latitude.toFixed(5)},{' '}
        {value.longitude.toFixed(5)}
      </p>
    </div>
  )
}

export default LocationPicker
