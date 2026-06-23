'use client'

/**
 * Global error boundary for the SnapJe app router.
 *
 * BUGFIX (fix-logout-theme-nearme): previously, an unexpected throw during
 * render (e.g. accessing `user.name` on a null user mid-logout, a stale
 * socket callback, or an unhandled API rejection) would bubble all the way
 * to Next.js and show the raw "Application error: a client-side exception
 * has occurred" white screen — forcing a manual page reload.
 *
 * This boundary catches those errors, shows a friendly inline fallback, and
 * offers a one-tap "Reset" button that calls `reset()` to re-render the
 * route tree without a full page reload. If the user prefers, they can also
 * go straight home.
 */

import { useEffect } from 'react'
import { RotateCcw, Home, AlertTriangle } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to console so devs can debug, but never throw out of the boundary.
    try {
      console.error('[SnapJe ErrorBoundary]', error)
    } catch {
      // ignore
    }
  }, [error])

  const goHome = () => {
    try {
      // Clear client-side auth/session state that may have caused the crash,
      // then reset the boundary so the route re-renders cleanly.
      window.localStorage.removeItem('snapje-user-location')
    } catch {
      // ignore
    }
    try {
      // Use a soft navigation if possible — fall back to a hard reload only
      // if absolutely necessary. (We intentionally do NOT clobber the auth
      // store here — the user might still be logged in.)
      window.location.href = '/'
    } catch {
      reset()
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #FFEBEE 0%, #ffffff 100%)',
        padding: '24px',
        fontFamily: '"Nunito Sans", system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          width: '100%',
          background: '#ffffff',
          borderRadius: '24px',
          padding: '32px 24px',
          textAlign: 'center',
          boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.12)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #EF5350 0%, #E53935 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <AlertTriangle color="#fff" size={32} />
        </div>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 800,
            color: '#1a1c1e',
            margin: '0 0 8px',
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: '#414841',
            margin: '0 0 24px',
            lineHeight: 1.5,
          }}
        >
          The app hit an unexpected error. You can try again, or go back to the
          home screen.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => reset()}
            style={{
              flex: 1,
              height: '44px',
              borderRadius: '12px',
              border: '1px solid #FFCDD2',
              background: '#FFEBEE',
              color: '#C62828',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <RotateCcw size={16} /> Try Again
          </button>
          <button
            onClick={goHome}
            style={{
              flex: 1,
              height: '44px',
              borderRadius: '12px',
              border: '0',
              background: 'linear-gradient(180deg, #EF5350 0%, #E53935 100%)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Home size={16} /> Go Home
          </button>
        </div>
        {error?.digest ? (
          <p
            style={{
              marginTop: '16px',
              fontSize: '11px',
              color: '#717971',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            Ref: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  )
}
