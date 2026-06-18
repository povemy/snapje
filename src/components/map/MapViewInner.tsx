'use client'

import { Component, useEffect, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './map.css'

export interface MapMarker {
  position: [number, number]
  popup?: string
  isUser?: boolean
}

export interface MapViewProps {
  center: [number, number]
  zoom?: number
  markers?: MapMarker[]
  className?: string
  height?: string | number
  interactive?: boolean
  onMapClick?: (lat: number, lng: number) => void
}

// Fix Leaflet's missing default marker icon issue by pointing at unpkg CDN.
const LEAFLET_CDN = 'https://unpkg.com/leaflet@1.9.4/dist/images'

let iconsInitialized = false
function initIcons() {
  if (iconsInitialized || typeof window === 'undefined') return
  try {
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: `${LEAFLET_CDN}/marker-icon-2x.png`,
      iconUrl: `${LEAFLET_CDN}/marker-icon.png`,
      shadowUrl: `${LEAFLET_CDN}/marker-shadow.png`,
    })
    iconsInitialized = true
  } catch (e) {
    console.error('Failed to init leaflet icons:', e)
  }
}

function getUserLocationIcon() {
  try {
    return L.divIcon({
      className: 'user-location-marker',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10],
    })
  } catch {
    return undefined
  }
}

/**
 * Re-centers the map when the `center` prop changes.
 */
function MapRecenter({
  center,
  zoom,
}: {
  center: [number, number]
  zoom: number
}) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom, { animate: true })
  }, [map, center, zoom])
  return null
}

/**
 * Attaches a click handler to the map when `onMapClick` is provided.
 */
function MapClickHandler({
  onClick,
}: {
  onClick?: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

/**
 * Draggable picker marker used when `onMapClick` is provided.
 */
function PickerMarker({
  position,
  onDragEnd,
}: {
  position: [number, number]
  onDragEnd: (lat: number, lng: number) => void
}) {
  return (
    <Marker
      position={position}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const ll = (e.target as L.Marker).getLatLng()
          onDragEnd(ll.lat, ll.lng)
        },
      }}
    />
  )
}

/**
 * Error boundary to gracefully handle map rendering failures.
 */
class MapErrorBoundary extends Component<
  { children: ReactNode; height: number | string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; height: number | string }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: unknown) {
    console.error('MapView render error:', error)
  }
  render() {
    if (this.state.hasError) {
      const h = typeof this.props.height === 'number' ? `${this.props.height}px` : this.props.height
      return (
        <div
          style={{
            height: h,
            width: '100%',
            background: '#f3f4f6',
            borderRadius: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: 13,
          }}
        >
          Map unavailable
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * The fully client-side implementation. Loaded lazily via `next/dynamic`
 * in `MapView.tsx` so that react-leaflet (which requires `window`) is
 * never imported on the server.
 */
export function MapViewInner({
  center,
  zoom = 15,
  markers = [],
  className,
  height = 280,
  interactive = true,
  onMapClick,
}: MapViewProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    initIcons()
    setMounted(true)
  }, [])

  const heightStyle: React.CSSProperties = {
    height: typeof height === 'number' ? `${height}px` : height,
  }

  // Don't render until mounted on client (icons must be initialized first)
  if (!mounted) {
    return (
      <div
        className={className}
        style={{
          ...heightStyle,
          width: '100%',
          background: '#f3f4f6',
          borderRadius: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: 13,
        }}
      >
        Loading map…
      </div>
    )
  }

  const userIcon = getUserLocationIcon()

  return (
    <MapErrorBoundary height={height}>
      <div
        className={className}
        style={{
          ...heightStyle,
          width: '100%',
          borderRadius: 'inherit',
          overflow: 'hidden',
        }}
      >
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={interactive}
          dragging={interactive}
          doubleClickZoom={interactive}
          zoomControl={interactive}
          style={{ height: '100%', width: '100%' }}
          attributionControl
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; OpenStreetMap &copy; CARTO"
            maxZoom={20}
          />

          <MapRecenter center={center} zoom={zoom} />

          {onMapClick && <MapClickHandler onClick={onMapClick} />}

          {markers.map((m, i) => (
            <Marker
              key={`${m.position[0]},${m.position[1]},${i}`}
              position={m.position}
              {...(m.isUser && userIcon ? { icon: userIcon } : {})}
            >
              {m.popup && <Popup>{m.popup}</Popup>}
            </Marker>
          ))}

          {onMapClick && (
            <PickerMarker position={center} onDragEnd={onMapClick} />
          )}
        </MapContainer>
      </div>
    </MapErrorBoundary>
  )
}

export default MapViewInner
