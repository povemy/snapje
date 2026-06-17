'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

/**
 * SSR-safe wrapper around the Leaflet-based map.
 *
 * This file must NOT import `react-leaflet` or `leaflet` at the top level —
 * those modules require `window` and would crash during SSR. Instead we
 * lazy-load `MapViewInner` via `next/dynamic` with `ssr: false`, so the
 * leaflet code only ever runs in the browser.
 *
 * Consumers should `import MapView from '@/components/map/MapView'`.
 * If you need the raw inner component (e.g. for typing), import the types
 * from here: `import type { MapViewProps, MapMarker } from '@/components/map/MapView'`.
 */

// Re-export the types so consumers don't need to know about MapViewInner.
export type { MapViewProps, MapMarker } from './MapViewInner'

const MapView = dynamic<
  ComponentProps<typeof import('./MapViewInner').MapViewInner>
>(() => import('./MapViewInner').then((m) => m.MapViewInner), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 280,
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
  ),
})

export default MapView
