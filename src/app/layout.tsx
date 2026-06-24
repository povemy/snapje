import type { Metadata, Viewport } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SnapJe - Hyper-Local Food Flash Deals",
  description: "Discover amazing food flash deals near you. Save up to 60% on meals from your favorite local vendors.",
  keywords: ["SnapJe", "food deals", "flash deals", "local food", "discount meals"],
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SnapJe",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#E53935",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA: allow standalone install on mobile (helps camera permissions) */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SnapJe" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* ================================================================
            HMR Auto-Refresh Killer — Multi-layer defense
            ================================================================
            PROBLEM: Next.js dev mode injects an HMR client that connects
            via WebSocket to /_next/webpack-hmr. When accessed through ngrok
            or a preview proxy, the WebSocket can't connect. After repeated
            failures, the HMR client triggers a FULL PAGE RELOAD — causing
            the app to "keep refreshing itself".

            The refresh happens via multiple paths:
              1. location.reload()
              2. location.href = location.href
              3. location.replace(location.href)
              4. history.go(0)
              5. The HMR client's internal reload logic

            Previous attempts to override location.reload() didn't work
            because Turbopack's HMR client uses multiple reload paths.

            NEW APPROACH — Kill it at the source:
              A. Override WebSocket to silently fail for HMR URLs. The HMR
                 client gets a fake "connected" socket that does nothing.
                 It never detects a failure → never triggers a reload.
              B. Block ALL programmatic reload mechanisms permanently
                 (not just 30s) — user refreshes (Ctrl+R, pull-to-refresh)
                 still work because they use the browser's native reload,
                 not the JS API.
            ================================================================ */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            if (typeof window === 'undefined') return;

            // ── localStorage key migration: flashbite-* → snapje-* ──────
            // One-time migration: copy old flashbite-* localStorage keys
            // to the new snapje-* names so existing users don't lose their
            // session, settings, or cached location after the rebrand.
            try {
              var migrations = [
                ['flashbite-auth', 'snapje-auth'],
                ['flashbite_settings', 'snapje_settings'],
                ['flashbite-location', 'snapje-location'],
                ['flashbite-user-location', 'snapje-user-location'],
                ['flashbite_cache', 'snapje_cache'],
              ];
              for (var i = 0; i < migrations.length; i++) {
                var oldKey = migrations[i][0];
                var newKey = migrations[i][1];
                if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
                  localStorage.setItem(newKey, localStorage.getItem(oldKey));
                  localStorage.removeItem(oldKey);
                }
              }
            } catch(e) { /* ignore migration errors */ }

            // ── LAYER 1: Neuter the HMR WebSocket ──────────────────────
            // Override WebSocket so HMR connections get a silent no-op
            // socket instead of a real connection. The HMR client thinks
            // it's "connected" and never triggers a reload.
            var OrigWebSocket = window.WebSocket;
            window.WebSocket = function(url, protocols) {
              // Check if this is an HMR connection
              var isHMR = false;
              try {
                isHMR = typeof url === 'string' && (
                  url.indexOf('webpack-hmr') !== -1 ||
                  url.indexOf('_next/webpack') !== -1 ||
                  url.indexOf('/_next/') !== -1 && url.indexOf('hmr') !== -1
                );
              } catch(e) {}

              if (isHMR) {
                // Return a FAKE WebSocket that silently does nothing.
                // The HMR client gets a "connected" socket that never
                // sends or receives data → no reload trigger.
                var fake = {
                  readyState: 1, // OPEN
                  CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
                  binaryType: 'blob',
                  bufferedAmount: 0,
                  extensions: '',
                  protocol: '',
                  url: url,
                  onopen: null, onclose: null, onerror: null, onmessage: null,
                  addEventListener: function() {},
                  removeEventListener: function() {},
                  dispatchEvent: function() { return false; },
                  send: function() {},
                  close: function() {
                    this.readyState = 3; // CLOSED
                  },
                };
                // Fire onopen asynchronously (like a real WebSocket)
                setTimeout(function() {
                  if (fake.onopen) fake.onopen({ type: 'open', target: fake });
                }, 0);
                return fake;
              }

              // Real WebSocket for everything else (socket.io, etc.)
              return protocols !== undefined
                ? new OrigWebSocket(url, protocols)
                : new OrigWebSocket(url);
            };
            // Copy static properties
            window.WebSocket.CONNECTING = 0;
            window.WebSocket.OPEN = 1;
            window.WebSocket.CLOSING = 2;
            window.WebSocket.CLOSED = 3;
            window.WebSocket.prototype = OrigWebSocket.prototype;

            // ── LAYER 2: Block ALL programmatic reloads ────────────────
            // Permanently block JS-initiated reloads. User-initiated
            // refreshes (Ctrl+R, pull-to-refresh, address bar) still work
            // because they bypass the JS API entirely.
            try {
              var locProto = window.Location.prototype;
              var origReload = locProto.reload;
              locProto.reload = function() {
                console.warn('[SnapJe] Blocked location.reload() — app stays stable.');
              };
            } catch(e) {}

            // Block location.replace(self) — another reload path
            try {
              var origReplace = locProto.replace;
              locProto.replace = function(url) {
                if (url === window.location.href || url === window.location.pathname) {
                  console.warn('[SnapJe] Blocked location.replace(self) — app stays stable.');
                  return;
                }
                return origReplace.call(this, url);
              };
            } catch(e) {}

            // Block location.href self-assignment
            try {
              var origHref = Object.getOwnPropertyDescriptor(locProto, 'href');
              if (origHref && origHref.set) {
                Object.defineProperty(locProto, 'href', {
                  get: origHref.get,
                  set: function(val) {
                    var current = window.location.href;
                    if (val === current || val === window.location.pathname) {
                      console.warn('[SnapJe] Blocked href self-assign — app stays stable.');
                      return;
                    }
                    origHref.set.call(this, val);
                  },
                  configurable: true,
                });
              }
            } catch(e) {}

            // Block history.go(0) — another reload trick
            try {
              var origGo = window.history.go;
              window.history.go = function(delta) {
                if (delta === 0 || delta === undefined) {
                  console.warn('[SnapJe] Blocked history.go(0) — app stays stable.');
                  return;
                }
                return origGo.call(window.history, delta);
              };
            } catch(e) {}

            // ── LAYER 3: Service Worker (PWA) ──────────────────────────
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                var isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (!isLocalhost) {
                  navigator.serviceWorker.register('/sw.js').then(function(reg) {
                    console.log('[SnapJe] Service Worker registered:', reg.scope);
                  }).catch(function(err) {
                    console.warn('[SnapJe] SW registration failed:', err);
                  });
                }
              });
            }
          })();
        `}} />
      </head>
      <body
        className={`${nunitoSans.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster
          position="bottom-center"
          duration={3000}
          // Issue 11: offset the toaster above the floating-bottom nav bar
          // (~72px + safe area) so toasts don't overlap the bottom menu.
          offset="80px"
          containerAriaLabel="Notifications"
          className="snapje-toaster"
          toastOptions={{
            // Issue 1: width matches the "Order Confirmed" success card
            // (left-3 right-3 = 12px margins each side, max-w-lg = 512px max).
            // Using calc(100vw - 24px) ensures identical width + centering.
            style: {
              fontFamily: '"Nunito Sans", sans-serif',
              width: 'calc(100vw - 24px)',
              maxWidth: '512px',
              minWidth: '280px',
              borderRadius: '16px',
              background: '#ffffff',
              color: '#1a1c1e',
              border: '1px solid rgba(229, 57, 53, 0.15)',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0,0,0,0.08)',
              padding: '18px 18px',
              fontSize: '14px',
              fontWeight: 700,
              animation: 'snapjeToastIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards',
              margin: '0 auto',
            },
            info: {
              style: { background: '#ffffff', color: '#1a1c1e' },
            },
            success: {
              style: { background: '#ffffff', color: '#1a1c1e' },
            },
            error: {
              style: { background: '#ffffff', color: '#1a1c1e' },
            },
          }}
        />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes snapjeToastIn {
            from {
              opacity: 0;
              transform: translateY(120%) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes snapjeToastOut {
            from {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
            to {
              opacity: 0;
              transform: translateY(120%) scale(0.95);
            }
          }
          /* Sonner applies [data-state="closed"] when a toast is leaving —
             animate it sliding downwards (back the way it came). */
          [data-sonner-toast][data-state="closed"] {
            animation: snapjeToastOut 0.3s cubic-bezier(0.55, 0, 0.65, 0.35) forwards !important;
          }
          [data-sonner-toast] {
            margin-bottom: 10px !important;
          }
          /* Issue 11: black title + description on white bg */
          [data-sonner-toast] [data-title] {
            font-size: 15px !important;
            font-weight: 800 !important;
            line-height: 1.25 !important;
            color: #1a1c1e !important;
          }
          [data-sonner-toast] [data-description] {
            font-size: 13.5px !important;
            font-weight: 600 !important;
            line-height: 1.3 !important;
            color: #1a1c1e !important;
            opacity: 0.95 !important;
          }
          [data-sonner-toast] [data-icon] svg {
            width: 20px !important;
            height: 20px !important;
            color: #E53935 !important;
          }
          /* Hide the close button — the toast auto-dismisses after 3s */
          [data-sonner-toast] [data-close-button] {
            display: none !important;
          }
        `}} />
      </body>
    </html>
  );
}
