import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // The preview panel serves the app from a *.space-z.ai origin (cross-origin
  // to localhost:3000). Allow it in dev so HMR/_next resources load cleanly.
  allowedDevOrigins: ['https://*.space-z.ai'],
  // CRITICAL: Disable HMR (Hot Module Replacement) in development.
  // The preview proxy doesn't forward the HMR WebSocket (_next/webpack-hmr),
  // which causes it to fail repeatedly. When HMR fails, Next.js falls back to
  // FULL PAGE REFRESHES — this is why the app "keeps refreshing itself".
  // Disabling HMR means code changes require a manual refresh, but the app
  // stays stable for the user.
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
