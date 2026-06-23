'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Navigation, X, MapPin, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGeolocation } from '@/hooks/use-geolocation'
import { useLocationStore } from '@/stores/location-store'

/**
 * GeolocationGate
 *
 * Prompts the user to enable geolocation on app load.
 * Shows a non-blocking banner at the bottom of the screen (above the bottom nav)
 * if the user hasn't yet granted location access.
 *
 * Only shows for foodie/client users (not vendor/admin dashboards which don't
 * strictly need it). Once granted or denied, it won't show again (persisted).
 */
export function GeolocationGate() {
  const { location, loading, error, permission, request } = useGeolocation()
  const { hasPrompted, hasDenied, setPrompted, setDenied } = useLocationStore()
  const [dismissed, setDismissed] = useState(false)

  // Don't show if:
  // - already have location
  // - already prompted and denied
  // - dismissed this session
  // - permission already granted
  const shouldShow =
    !location &&
    !dismissed &&
    !hasDenied &&
    permission !== 'granted' &&
    !loading

  // Auto-prompt once on mount (triggered by the gate, not silently)
  // We don't auto-call request() because that would show the browser permission
  // popup immediately on page load, which is bad UX. Instead we show our own
  // banner with a clear "Enable Location" button.

  const handleEnable = () => {
    request()
    setPrompted(true)
  }

  const handleDismiss = () => {
    setDismissed(true)
    setDenied(true)
    setPrompted(true)
  }

  // If request succeeded, hide the banner
  useEffect(() => {
    if (location) {
      setDismissed(true)
    }
  }, [location, setDismissed])

  // If request was made and resulted in error or denial, auto-dismiss after showing the state
  useEffect(() => {
    if (permission === 'denied') {
      setDenied(true)
      setDismissed(true)
    }
  }, [permission, setDenied])

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-md"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-[#EF5350]/30 overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#EF5350] to-[#E53935] flex items-center justify-center flex-shrink-0">
                <Navigation className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-[#1a1c1e] text-sm flex items-center gap-1.5">
                  Enable Location
                </h3>
                <p className="text-xs text-[#717971] mt-1 leading-relaxed">
                  SnapJe uses your location to suggest nearby food deals and show distance to vendors.
                </p>
                {error && (
                  <p className="text-xs text-[#EF4444] mt-1.5">{error}</p>
                )}
                <div className="flex gap-2 mt-3">
                  <Button
                    onClick={handleEnable}
                    disabled={loading}
                    size="sm"
                    className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#E53935] to-[#C62828] text-white font-semibold text-xs hover:opacity-90 active:scale-95 transition-all"
                  >
                    {loading ? (
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        Locating...
                      </span>
                    ) : location ? (
                      <span className="flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Enabled
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> Enable Location
                      </span>
                    )}
                  </Button>
                  <Button
                    onClick={handleDismiss}
                    size="sm"
                    variant="ghost"
                    className="h-9 px-3 rounded-lg text-[#717971] text-xs hover:bg-[#f0f4f2]"
                  >
                    Not now
                  </Button>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="p-1 -mt-1 -mr-1 text-[#717971] hover:text-[#1a1c1e] flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
