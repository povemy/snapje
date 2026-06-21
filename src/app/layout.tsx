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
  title: "FlashBite - Hyper-Local Food Flash Deals",
  description: "Discover amazing food flash deals near you. Save up to 60% on meals from your favorite local vendors.",
  keywords: ["FlashBite", "food deals", "flash deals", "local food", "discount meals"],
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
    title: "FlashBite",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#00B14F",
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
        <meta name="apple-mobile-web-app-title" content="FlashBite" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* ================================================================
            HMR Reload Suppressor — MUST run in <head> BEFORE Next.js's HMR
            client script so we can override location.reload before it's used.
            ================================================================

            WHY: Next.js dev mode uses HMR via a WebSocket at
            /_next/webpack-hmr. When accessed through ngrok or a preview
            proxy, this WebSocket can't connect. After repeated failures,
            the HMR client calls location.reload() to recover — causing the
            app to "keep refreshing itself".

            FIX: Override window.location.reload to be a no-op for 30s after
            page load. User-initiated refreshes (Ctrl+R, pull-to-refresh) are
            NOT affected because they use the browser's native reload mechanism,
            not window.location.reload() from JS.
            ================================================================ */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            if (typeof window === 'undefined') return;

            var pageLoadTime = Date.now();
            var BLOCK_DURATION = 30000; // 30 seconds — covers the HMR retry window

            // Override location.reload on the PROTOTYPE (not the instance)
            // so it catches ALL calls — including from HMR client code that
            // captured a reference to location.reload before our script ran.
            try {
              var locProto = window.Location.prototype;
              var origReload = locProto.reload;
              locProto.reload = function() {
                if (Date.now() - pageLoadTime < BLOCK_DURATION) {
                  console.warn('[FlashBite] Blocked auto-reload (HMR recovery). App stays stable.');
                  return;
                }
                return origReload.call(this);
              };
            } catch(e) {
              console.warn('[FlashBite] Could not override Location.prototype.reload:', e);
            }

            // Also override on the instance for browsers that don't use the prototype
            try {
              var origInstReload = window.location.reload;
              window.location.reload = function() {
                if (Date.now() - pageLoadTime < BLOCK_DURATION) {
                  console.warn('[FlashBite] Blocked auto-reload (instance). App stays stable.');
                  return;
                }
                return origInstReload.call(window.location);
              };
            } catch(e) { /* ignore */ }

            // Block location.href self-assignment (another HMR reload trick)
            try {
              var origHref = Object.getOwnPropertyDescriptor(window.Location.prototype, 'href');
              if (origHref && origHref.set) {
                Object.defineProperty(window.Location.prototype, 'href', {
                  get: origHref.get,
                  set: function(val) {
                    if (val === window.location.href && Date.now() - pageLoadTime < BLOCK_DURATION) {
                      console.warn('[FlashBite] Blocked href self-assign reload (HMR recovery).');
                      return;
                    }
                    origHref.set.call(this, val);
                  },
                  configurable: true,
                });
              }
            } catch(e) { /* some browsers restrict this */ }

            // Intercept setTimeout with string args containing 'reload'
            var origSetTimeout = window.setTimeout;
            window.setTimeout = function(fn, delay) {
              if (typeof fn === 'string' && fn.indexOf('reload') !== -1 && Date.now() - pageLoadTime < BLOCK_DURATION) {
                console.warn('[FlashBite] Blocked setTimeout reload.');
                return 0;
              }
              return origSetTimeout.call(window, fn, delay);
            };

            // Service Worker Registration (PWA) — only on non-localhost
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                var isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (!isLocalhost) {
                  navigator.serviceWorker.register('/sw.js').then(function(reg) {
                    console.log('[FlashBite] Service Worker registered:', reg.scope);
                  }).catch(function(err) {
                    console.warn('[FlashBite] SW registration failed:', err);
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
          position="top-center"
          duration={3000}
          toastOptions={{
            style: {
              fontFamily: '"Nunito Sans", sans-serif',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(108, 180, 238, 0.2)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
              animation: 'toastFadeIn 0.3s ease-out, toastFadeOut 2s ease-in 1s forwards',
            },
            success: {
              style: {
                background: 'rgba(108, 180, 238, 0.5)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: '#fff',
                border: '1px solid rgba(108, 180, 238, 0.3)',
                boxShadow: '0 8px 32px rgba(108, 180, 238, 0.2)',
                animation: 'toastFadeIn 0.3s ease-out, toastFadeOut 2s ease-in 1s forwards',
              },
            },
          }}
        />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes toastFadeIn {
            from { opacity: 0; transform: translateY(-16px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes toastFadeOut {
            from { opacity: 1; }
            to { opacity: 0; transform: translateY(-8px); }
          }
        `}} />
      </body>
    </html>
  );
}
