import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Strict in production; development keeps `unsafe-eval` (React Fast Refresh)
// and localhost/ws origins (HMR + dev asset server).
const contentSecurityPolicy = [
  `default-src 'self'${isDev ? " http://localhost:* ws://localhost:*" : ""}`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' http://localhost:*" : ""}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${
    isDev ? " http://localhost:*" : ""
  }`,
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' https://*.uploadthing.com https://*.ingest.uploadthing.com${
    isDev ? " ws://localhost:* http://localhost:*" : ""
  }`,
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 48, 96, 144, 192, 256, 384, 512],
    remotePatterns: [
      { protocol: "http", hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
