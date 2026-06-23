'use client'

/**
 * QRScanner — Continuous live camera QR code scanner
 * ================================================
 *
 * Uses html5-qrcode's Html5Qrcode class (NOT Html5QrcodeScanner) for
 * a lightweight continuous camera feed that auto-detects QR codes
 * on hover — no manual photo snapping required.
 *
 * The scanner tries multiple camera configurations in order:
 *   1. Back camera (facingMode: 'environment') — preferred for scanning
 *   2. Front camera (facingMode: 'user')
 *   3. Any available camera (true)
 *
 * Next.js requirements:
 * 1. 'use client' at the very top
 * 2. Html5Qrcode dynamically imported (SSR-isolated)
 * 3. useEffect initializes scanner after mount
 * 4. Unique element ID "qr-reader" with matching <div>
 * 5. Config: { fps: 10, qrbox: { width: 250, height: 250 } }
 * 6. Cleanup: scanner.stop().then(clear).catch() on unmount
 * 7. Success callback with duplicate-fire guard
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, XCircle, RefreshCw, AlertCircle } from 'lucide-react'

interface QRScannerProps {
  /** Called when a QR code is successfully decoded. */
  onScan: (decodedText: string) => void
  /** Whether the parent is currently processing a scan result. */
  processing?: boolean
}

// Unique element ID — must match the <div id="qr-reader"> in the JSX.
const READER_ID = 'qr-reader'

// Camera configurations to try, in order of preference.
const CAMERA_CONFIGS = [
  { facingMode: 'environment' }, // back camera (preferred)
  { facingMode: 'user' },        // front camera
  true,                           // any camera (last resort)
]

export default function QRScanner({ onScan, processing }: QRScannerProps) {
  const scannerRef = useRef<unknown>(null)
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alreadyFiredRef = useRef(false)

  /**
   * Start the live camera scanner with continuous auto-detection.
   * Tries multiple camera configs until one works.
   */
  const startScanner = useCallback(async () => {
    if (scannerRef.current || starting) return // idempotency guard
    setStarting(true)
    setError(null)
    alreadyFiredRef.current = false

    try {
      const { Html5Qrcode } = await import('html5-qrcode')

      // Guard again after async import
      if (scannerRef.current) {
        setStarting(false)
        return
      }

      const html5QrCode = new Html5Qrcode(READER_ID)
      scannerRef.current = html5QrCode

      // QR code detected callback — fires continuously, so we guard duplicates
      const onSuccess = (decodedText: string) => {
        if (alreadyFiredRef.current || processing) return
        alreadyFiredRef.current = true
        onScan(decodedText)
      }

      // Per-frame "no QR found" — ignore (normal scanning noise)
      const onError = () => {}

      // Try each camera config until one works
      let started = false
      let lastError: unknown = null

      for (const config of CAMERA_CONFIGS) {
        try {
          await html5QrCode.start(
            config,
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            onSuccess,
            onError
          )
          started = true
          break // success — stop trying configs
        } catch (err) {
          lastError = err
          // This config failed — try the next one
        }
      }

      if (!started) {
        // All camera configs failed
        throw lastError || new Error('No camera available')
      }

      setActive(true)
    } catch (err) {
      console.error('QRScanner camera error:', err)
      const errMsg = err instanceof Error
        ? (err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access in your browser settings and try again.'
            : err.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : 'Could not start camera. Make sure you are on HTTPS and have granted camera permission.')
        : 'Could not start camera.'
      setError(errMsg)
      // Clean up the scanner instance
      const scanner = scannerRef.current as { clear: () => void } | null
      if (scanner) {
        try { scanner.clear() } catch { /* ignore */ }
      }
      scannerRef.current = null
      setActive(false)
    } finally {
      setStarting(false)
    }
  }, [onScan, processing, starting])

  /**
   * Stop the scanner and release the camera.
   */
  const stopScanner = useCallback(async () => {
    const html5QrCode = scannerRef.current as {
      stop: () => Promise<void>
      clear: () => void
    } | null

    if (!html5QrCode) {
      setActive(false)
      return
    }

    try {
      // stop() turns off the camera; clear() removes the DOM elements
      await html5QrCode.stop()
      html5QrCode.clear()
    } catch (err) {
      // If stop() fails, still try to clear
      try { html5QrCode.clear() } catch { /* ignore */ }
    } finally {
      scannerRef.current = null
      setActive(false)
    }
  }, [])

  /**
   * CRITICAL cleanup on unmount.
   * Prevents memory leaks and camera staying on during Fast Refresh.
   */
  useEffect(() => {
    return () => {
      const html5QrCode = scannerRef.current as {
        stop: () => Promise<void>
        clear: () => void
      } | null
      if (html5QrCode) {
        // .catch() prevents unhandled rejection during Fast Refresh
        html5QrCode.stop()
          .then(() => html5QrCode.clear())
          .catch(() => {
            try { html5QrCode.clear() } catch { /* ignore */ }
          })
        scannerRef.current = null
      }
    }
  }, [])

  return (
    <div className="w-full">
      {/* The scanner target div — ALWAYS rendered, never hidden.
          Html5Qrcode injects the <video> element into this div.
          If hidden behind a conditional, the scanner throws "Element not found". */}
      <div id={READER_ID} className="w-full rounded-xl overflow-hidden" style={{ minHeight: active ? '200px' : '0' }} />

      {/* Controls */}
      {!active ? (
        <button
          onClick={startScanner}
          disabled={starting || processing}
          className="w-full h-10 rounded-xl font-bold text-sm bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
        >
          {starting ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Starting camera…</>
          ) : (
            <><Camera className="w-4 h-4" /> Start Live Scanner</>
          )}
        </button>
      ) : (
        <button
          onClick={stopScanner}
          disabled={processing}
          className="w-full h-9 rounded-xl font-bold text-xs text-[#EF4444] border border-[#EF4444]/30 hover:bg-[#EF4444]/10 flex items-center justify-center gap-2 transition-colors mt-2"
        >
          <XCircle className="w-3.5 h-3.5" /> Stop Scanner
        </button>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  )
}
