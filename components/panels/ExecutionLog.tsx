"use client";

import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/terminal/Panel";
import { LEVEL_CLASS } from "@/lib/theme";
import type { LogEntry } from "@/lib/types";

/**
 * The agent's reasoning trace: every oracle hit, graph traversal, risk score
 * and Bitget order body, in the order they happened. EXEC lines carry the raw
 * request payload so a judge can see the actual API call.
 */
export function ExecutionLog({ logs }: { logs: LogEntry[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the tail, but stop fighting the user the moment they scroll up.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  };

  return (
    <Panel
      title="Agent Execution Log"
      meta={`${logs.length} events`}
      flush
      className="h-full"
    >
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-full overflow-y-auto px-2 py-1.5"
      >
        {logs.length === 0 ? (
          <p className="py-6 text-center text-2xs uppercase tracking-widest text-term-dim">
            awaiting wire feed
          </p>
        ) : (
          <ul className="space-y-[3px]">
            {logs.map((l) => (
              <LogRow key={l.id} entry={l} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false);
  const hasPayload = Boolean(entry.payload);

  return (
    <li className="leading-[15px]">
      <div className="flex gap-1.5">
        <span className="num shrink-0 text-2xs text-term-dim">{entry.ts}</span>
        <span
          className={`w-12 shrink-0 text-2xs font-semibold ${LEVEL_CLASS[entry.level]}`}
        >
          {entry.level}
        </span>
        <span
          className={`flex-1 text-2xs ${
            entry.level === "FILL" ? "text-signal-green" : "text-term-text"
          }`}
        >
          {entry.text}
          {hasPayload && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="ml-1.5 border border-term-edge px-1 text-2xs text-term-dim hover:border-amber hover:text-amber"
            >
              {open ? "hide" : "body"}
            </button>
          )}
        </span>
      </div>
      {hasPayload && open && (
        <pre className="my-1 ml-[76px] overflow-x-auto border-l-2 border-signal-red/60 bg-term-void px-2 py-1 text-2xs text-signal-cyan">
          {JSON.stringify(entry.payload, null, 2)}
        </pre>
      )}
    </li>
  );
}
