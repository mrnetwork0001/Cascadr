/**
 * In production Caddy routes /api/* to the FastAPI service before a request
 * ever reaches Next, so the rewrite below only matters in development: it
 * lets `npm run dev` talk to a real backend (the deployed one by default) on
 * the same origin, with no CORS and no fallback data.
 */
const BACKEND_URL = process.env.BACKEND_URL ?? "https://cascadr.38.49.216.120.sslip.io/api";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits a self-contained server bundle so deployment needs no node_modules.
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/:path*` }];
  },
};

export default nextConfig;
