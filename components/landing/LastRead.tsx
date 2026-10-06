"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";

/** How often the open page re-asks the API when the agent last read. */
const POLL_MS = 60_000;
/** How often the relative time is re-rendered. */
const TICK_MS = 30_000;

/**
 * "6d ago" for a fixed moment, kept current while the page stays open. The
 * first render uses the server's text so hydration matches.
 */
export function Ago({ iso, initial }: { iso: string; initial: string }) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    const tick = () => setText(ago(iso));
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [iso]);
  return <>{text}</>;
}

/**
 * "3m ago" for the agent's last read. The agent reads again every few
 * minutes, so the page re-reads the timestamp from /health (the same value
 * /overview reports, without its exchange calls) once a minute while the tab
 * is visible, and ticks from the freshest one. A failed poll keeps the last
 * good value.
 */
export function LastRead({ iso, initial }: { iso: string; initial: string }) {
  const [latest, setLatest] = useState(iso);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = (await api.health()).autonomous.last_cycle;
        if (!live || !next || Number.isNaN(Date.parse(next))) return;
        setLatest((cur) => (Date.parse(next) > Date.parse(cur) ? next : cur));
      } catch {
        // Keep showing the last value that was read successfully.
      }
    };
    const id = window.setInterval(poll, POLL_MS);
    // Back on a tab that sat hidden: catch up at once rather than in a minute.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <Ago iso={latest} initial={initial} />;
}
