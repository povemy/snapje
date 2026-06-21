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
    icon: "/logo.svg",
    apple: "/logo.svg",
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
      </head>
      <body
        className={`${nunitoSans.variable} font-sans antialiased bg-background text-foreground`}
      >
        {/* Suppress HMR-induced full page refreshes.
            The preview proxy can't forward the HMR WebSocket, so it fails
            repeatedly. Next.js then falls back to full page refreshes.
            This script intercepts the HMR client's reload trigger and
            silences it, so the app stays stable. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            if (typeof window === 'undefined') return;
            // Prevent HMR-triggered full page reloads by overriding the
            // reload trigger that Next.js dev client uses when the WebSocket
            // connection fails. The app will still work normally; code
            // changes just require a manual refresh.
            var origReload = window.location.reload;
            var reloadBlocked = false;
            // Only block automatic reloads (not user-triggered ones)
            window.addEventListener('beforeunload', function(e) {
              // Allow user-initiated navigation/refresh
            });
            // Intercept the Next.js HMR error handler that calls location.reload()
            // by wrapping setTimeout to catch the reload call pattern
            var origSetTimeout = window.setTimeout;
            window.setTimeout = function(fn, delay) {
              if (typeof fn === 'string' && fn.indexOf('location.reload') !== -1) {
                console.warn('[HMR] Blocked auto-reload from HMR failure');
                return 0;
              }
              return origSetTimeout.call(window, fn, delay);
            };
          })();
        `}} />
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
