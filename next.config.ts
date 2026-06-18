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
