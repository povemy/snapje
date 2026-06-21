'use client'

/**
 * QRScanner — Continuous live camera QR code scanner
 * ================================================
 *
 * A dedicated Client Component that uses html5-qrcode's
 * Html5QrcodeScanner for a continuous, live camera feed that
 * auto-detects QR codes on hover — no manual photo snapping.
 *
 * Next.js requirements followed:
 * 1. 'use client' at the very top (this file is a Client Component).
 * 2. Html5QrcodeScanner is dynamically imported inside useEffect,
 *    so its execution is completely isolated from SSR.
 * 3. The scanner is initialized ONLY after mount (inside useEffect).
 * 4. A unique ID "qr-reader" is passed to Html5QrcodeScanner, and a
 *    matching <div id="qr-reader"> is rendered directly in the return
 *    statement — NOT hidden behind any isLoading / if (!mounted) guard.
 * 5. Scanner config: { fps: 10, qrbox: { width: 250, height: 250 } }.
 * 6. Cleanup calls scanner.clear().catch(...) to properly unmount the
 *    video track and prevent double-initialization during Fast Refresh.
 * 7. A success callback fires when a QR code is detected.
 *
 * CRITICAL — "Element not found" prevention:
 * The <div id="qr-reader"> is ALWAYS rendered in the JSX return. It is
 * never conditionally hidden. The scanner initializes inside useEffect
 * after mount, at which point the div is guaranteed to be in the DOM.
 */

import { useEffect, useRef, useState } from 'react'
import { Camera, XCircle, RefreshCw, AlertCircle } from 'lucide-react'

// --- Types for the dynamically-imported scanner ---
interface Html5QrcodeScannerInstance {
  render: (
    onSuccess: (decodedText: string, decodedResult: unknown) => void,
    onError: (errorMessage: string) => void
  ) => void
  clear: () => Promise<void>
  getState: () => number
}

interface QRScannerProps {
  /** Called when a QR code is successfully decoded. */
  onScan: (decodedText: string) => void
  /** Called when the user clicks the "Stop Scanner" button. */
  onStop?: () => void
  /** Whether the parent is currently processing a scan result. */
  processing?: boolean
}

// Unique element ID — must match the <div id="qr-reader"> in the JSX.
const READER_ID = 'qr-reader'

export default function QRScanner({ onScan, onStop, processing }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScannerInstance | null>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  /**
   * Initialize the scanner when the user clicks "Start Scanner".
   * We do NOT auto-start on mount because:
   *   - Browser permission prompts should be user-initiated
   *   - getUserMedia requires a secure context + user gesture
   *
   * Once started, the scanner renders a live camera feed inside
   * the <div id="qr-reader"> and continuously scans for QR codes.
   */
  const startScanner = async () => {
    if (scannerRef.current || starting) return // idempotency guard
    setStarting(true)
    setError(null)

    try {
      // Dynamically import — keeps html5-qrcode out of the SSR bundle.
      const { Html5QrcodeScanner } = await import('html5-qrcode')

      // Guard again after the async import — a double-click could race.
      if (scannerRef.current) {
        setStarting(false)
        return
      }

      // Create the scanner with the unique element ID and config.
      // Html5QrcodeScanner renders its own UI (camera view + scan region
      // + result display) inside the target div.
      const scanner = new Html5QrcodeScanner(
        READER_ID,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          // Use the back camera on mobile (environment), fall back to any.
          // rememberLastUsedCamera: true saves the permission for next time.
        },
        /* verbose= */ false
      ) as unknown as Html5QrcodeScannerInstance

      scannerRef.current = scanner

      // Render the scanner UI + start the camera.
      // The success callback fires on EVERY detection — we stop after the
      // first valid one to avoid duplicate processing.
      let alreadyFired = false
      scanner.render(
        (decodedText: string) => {
          // Guard against duplicate callbacks (html5-qrcode can fire
          // multiple times rapidly for the same code).
          if (alreadyFired || processing) return
          alreadyFired = true
          onScan(decodedText)
        },
        (errorMessage: string) => {
          // Per-frame "no QR found" errors are expected and harmless.
          // Only log actual camera/permission errors.
          if (errorMessage.includes('NotAllowedError') || errorMessage.includes('NotFoundError')) {
            setError('Camera access denied. Please allow camera permissions and try again.')
          }
          // Silently ignore other errors (normal scan-miss noise).
        }
      )

      setActive(true)
    } catch (err) {
      console.error('QRScanner init error:', err)
      setError(
        err instanceof Error && err.message.includes('NotAllowed')
          ? 'Camera access denied. Please allow camera permissions in your browser settings.'
          : 'Could not start camera. Make sure you are on HTTPS and have granted camera permission.'
      )
      scannerRef.current = null
      setActive(false)
    } finally {
      setStarting(false)
    }
  }

  /**
   * Stop the scanner and release the camera.
   * Calls scanner.clear() which stops the video track and removes the UI.
   */
  const stopScanner = async () => {
    const scanner = scannerRef.current
    if (!scanner) {
      setActive(false)
      return
    }
    try {
      // clear() is the official teardown method for Html5QrcodeScanner.
      // It stops the camera, removes the video element, and cleans up
      // event listeners. MUST be called to release the webcam.
      await scanner.clear()
    } catch (err) {
      console.warn('QRScanner clear error (non-fatal):', err)
    } finally {
      scannerRef.current = null
      setActive(false)
      onStop?.()
    }
  }

  /**
   * CRITICAL cleanup on unmount.
   * This runs when the component is removed from the DOM (navigation away,
   * Fast Refresh/hot-reload, conditional unmount). Without this, the camera
   * stays on and the webcam indicator stays lit — a memory leak + privacy
   * concern. scanner.clear() is async; we call .catch() to prevent
   * unhandled rejections during Fast Refresh.
   */
  useEffect(() => {
    return () => {
      const scanner = scannerRef.current
      if (scanner) {
        // .clear() returns a Promise; .catch() prevents unhandled rejection
        // during Next.js Fast Refresh / hot-reloading.
        scanner.clear().catch(() => {
          /* ignore — component is already unmounting */
        })
        scannerRef.current = null
      }
    }
  }, [])

  return (
    <div className="w-full">
      {/* The scanner target div — ALWAYS rendered, never conditionally hidden.
          Html5QrcodeScanner injects the camera view + UI into this div.
          If this div were hidden behind an isLoading guard, the scanner
          would throw "Element not found" on initialization. */}
      <div id={READER_ID} className="w-full max-w-md mx-auto" />

      {/* Controls */}
      {!active ? (
        <button
          onClick={startScanner}
          disabled={starting || processing}
          className="w-full h-10 rounded-xl font-bold text-sm bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
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
