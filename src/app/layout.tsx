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
          toastOptions={{
            style: {
              fontFamily: '"Nunito Sans", sans-serif',
              borderRadius: '12px',
            },
          }}
        />
      </body>
    </html>
  );
}
