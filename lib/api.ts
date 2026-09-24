/**
 * Client for the Cascadr API.
 *
 * Browser calls go to the same-origin path /api: in production Caddy routes it
 * to the FastAPI service, and in development next.config.mjs proxies it to the
 * backend. There is deliberately no fallback data - when a call fails the UI
 * shows that it failed, rather than substituting something that looks real.
 */

import type {
  Decision,
  FeedItem,
  Graph,
  Health,
  Overview,
  PaperReport,
  PositionsResponse,
  Quote,
} from "@/lib/types";

export class ApiError extends Error {}

async function get<T>(path: string, timeoutMs = 10_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ApiError(`network: ${(e as Error).message}`);
  }
  if (!res.ok) throw new ApiError(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => get<Health>("/health"),
  graph: () => get<Graph>("/graph"),
  quotes: () => get<{ quotes: Quote[] }>("/market/quotes").then((r) => r.quotes),
  feed: (limit = 80) => get<{ items: FeedItem[] }>(`/agent/feed?limit=${limit}`).then((r) => r.items),
  decisions: (limit = 60) =>
    get<{ decisions: Decision[]; counts: Record<string, number> }>(`/agent/decisions?limit=${limit}`),
  latest: () =>
    get<{ latest: Decision | null; latest_with_exposure: Decision | null }>("/agent/latest"),
  positions: () => get<PositionsResponse>("/positions"),
  overview: () => get<Overview>("/overview"),
  paper: () => get<PaperReport>("/paper/report"),
};

/** Where the deployed API lives; the dev proxy in next.config.mjs defaults here too. */
const DEPLOYED_API = "https://cascadr.38.49.216.120.sslip.io/api";

/**
 * Server-side fetch for the landing page (runs in the Next server, not the
 * browser). BACKEND_INTERNAL_URL points at the API directly (loopback on the
 * VPS); otherwise it follows BACKEND_URL, the same backend the /api proxy
 * uses, so the landing page and the terminal always read the same system.
 */
export async function serverGet<T>(path: string): Promise<T | null> {
  const base = process.env.BACKEND_INTERNAL_URL ?? process.env.BACKEND_URL ?? DEPLOYED_API;
  try {
    const res = await fetch(`${base}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
