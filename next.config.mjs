/**
 * The site (on Vercel) forwards /api/* to the FastAPI service on the VPS,
 * which runs the agent around the clock. On the VPS itself Caddy routes /api/*
 * before a request reaches Next. In development the same rewrite lets
 * `npm run dev` talk to the real backend on the same origin, with no CORS and
 * no fallback data.
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
