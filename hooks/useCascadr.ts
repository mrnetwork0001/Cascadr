"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type {
  Decision,
  FeedItem,
  Graph,
  Health,
  PositionsResponse,
  Quote,
} from "@/lib/types";

/** How often each live source is re-read. Quotes move fastest. */
const POLL = { quotes: 5_000, feed: 15_000, positions: 10_000, health: 15_000, graph: 300_000 };

interface Slot<T> {
  data: T | null;
  error: string | null;
  updatedAt: number | null;
}

function usePoll<T>(fetcher: () => Promise<T>, every: number): Slot<T> {
  const [slot, setSlot] = useState<Slot<T>>({ data: null, error: null, updatedAt: null });
  const fn = useRef(fetcher);
  fn.current = fetcher;

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const data = await fn.current();
        if (live) setSlot({ data, error: null, updatedAt: Date.now() });
      } catch (e) {
        // Keep the last good data on screen, but say that it is stale.
        if (live) setSlot((s) => ({ ...s, error: (e as Error).message }));
      }
      if (live) timer = setTimeout(tick, every);
    };
    tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [every]);

  return slot;
}

/**
 * Everything the terminal shows, read live from the API. Nothing here is
 * generated in the browser: the graph, the quotes, every decision and every
 * position come from the backend, and a failed read is reported, not papered
 * over.
 */
export function useCascadr() {
  const health = usePoll<Health>(api.health, POLL.health);
  const graph = usePoll<Graph>(api.graph, POLL.graph);
  const quotes = usePoll<Quote[]>(api.quotes, POLL.quotes);
  const feed = usePoll<FeedItem[]>(() => api.feed(120), POLL.feed);
  const positions = usePoll<PositionsResponse>(api.positions, POLL.positions);

  const decisions: Decision[] = useMemo(
    () =>
      (feed.data ?? []).filter((i): i is Extract<FeedItem, { kind: "decision" }> => i.kind === "decision"),
    [feed.data]
  );

  // The decision whose contagion is drawn on the graph. Follows the newest
  // decision that implies any exposure until the user picks one; selecting
  // null (or the pinned decision leaving the feed window) resumes following.
  const [pinnedId, setPinnedId] = useState<number | null>(null);
  useEffect(() => {
    if (pinnedId != null && feed.data && !decisions.some((d) => d.id === pinnedId)) setPinnedId(null);
  }, [pinnedId, feed.data, decisions]);
  const selected = useMemo(() => {
    const pinned = pinnedId != null ? decisions.find((d) => d.id === pinnedId) : undefined;
    return pinned ?? decisions.find((d) => d.exposures.length > 0) ?? null;
  }, [decisions, pinnedId]);

  const select = useCallback((id: number | null) => setPinnedId(id), []);

  const [node, setNode] = useState<string | null>(null);

  return {
    health,
    graph,
    quotes,
    feed,
    positions,
    decisions,
    // Nothing has come back yet: distinct from "came back empty".
    feedLoading: feed.data == null && feed.error == null,
    selected,
    following: pinnedId == null,
    select,
    node,
    setNode,
  };
}
