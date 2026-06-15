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
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#00B14F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
