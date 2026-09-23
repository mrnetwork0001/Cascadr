"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NODES, NODE_BY_ID } from "@/lib/mock/graph";
import { SCENARIO, type ScenarioEvent } from "@/lib/mock/scenario";
import {
  impliedDrawdownPct,
  scoreToContagion,
  traverseContagion,
} from "@/lib/traversal";
import { stamp } from "@/lib/format";
import { perpSymbol } from "@/lib/instruments";
import {
  getContagion,
  getHealth,
  getMarks,
  getPositions,
  getOracleVerdict,
  toExposurePaths,
  type BackendHealth,
} from "@/lib/api";
import {
  CONTAGION_RANK,
  type Contagion,
  type ExposurePath,
  type LogEntry,
  type LogLevel,
  type NewsItem,
  type Position,
} from "@/lib/types";

export type Phase = "IDLE" | "RUNNING" | "COMPLETE";

/** Exposure at or above this gets an order; below it we only raise an alert. */
const TRADE_THRESHOLD = 0.32;
const MAX_LOG_LINES = 400;

/** Visual pacing of one cascade hop, so the graph animates rather than snaps. */
const HOP_STAGGER_MS = 620;

export interface EngineState {
  phase: Phase;
  news: NewsItem[];
  logs: LogEntry[];
  positions: Position[];
  contagion: Record<string, Contagion>;
  exposure: Record<string, number>;
  paths: ExposurePath[];
  prices: Record<string, number>;
  /** Node ids on the currently-highlighted traversal route. */
  activePath: string[];
}

const initialContagion = (): Record<string, Contagion> =>
  Object.fromEntries(NODES.map((n) => [n.id, "NOMINAL" as Contagion]));

const initialPrices = (): Record<string, number> =>
  Object.fromEntries(
    NODES.filter((n) => n.price !== undefined).map((n) => [n.id, n.price!])
  );

export function useCascadrEngine() {
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [contagion, setContagion] = useState(initialContagion);
  const [exposure, setExposure] = useState<Record<string, number>>({});
  const [paths, setPaths] = useState<ExposurePath[]>([]);
  const [activePath, setActivePath] = useState<string[]>([]);
  const [prices, setPrices] = useState(initialPrices);
  const [selected, setSelected] = useState<string | null>(null);
  /** null until the health probe resolves; null thereafter means "no backend". */
  const [backend, setBackend] = useState<BackendHealth | null>(null);

  // Every scheduled timer, so reset() and unmount can cancel cleanly.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Read inside scheduled callbacks; a ref keeps applyEvent's identity stable.
  const backendRef = useRef<BackendHealth | null>(null);
  const seq = useRef(0);

  backendRef.current = backend;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const log = useCallback(
    (level: LogLevel, text: string, payload?: Record<string, unknown>) => {
      seq.current += 1;
      const entry: LogEntry = {
        id: `log-${seq.current}`,
        ts: stamp(),
        level,
        text,
        payload,
      };
      setLogs((prev) => [...prev, entry].slice(-MAX_LOG_LINES));
    },
    []
  );

  // --- Backend handshake ----------------------------------------------------
  // If the Python service is up we take its live Bitget marks as the starting
  // tape, so the demo opens on real prices rather than seeded constants.
  useEffect(() => {
    let live = true;
    (async () => {
      const health = await getHealth();
      if (!live) return;
      setBackend(health);
      if (!health) return;
      const marks = await getMarks();
      if (live && Object.keys(marks).length > 0) {
        setPrices((prev) => ({ ...prev, ...marks }));
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // --- Persisted book -------------------------------------------------------
  // When the backend is up it owns the positions: it is the thing that fires
  // exits and survives a restart, so the terminal mirrors it rather than
  // keeping a second, divergent copy.
  const [realized, setRealized] = useState(0);
  useEffect(() => {
    if (!backend) return;
    let live = true;
    const pull = async () => {
      const book = await getPositions();
      if (!live || !book) return;
      setPositions(book.positions.filter((p) => p.status !== "CLOSED"));
      setRealized(book.realized);
    };
    pull();
    const id = setInterval(pull, 5000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [backend]);

  // --- Price tape -----------------------------------------------------------
  // Random walk, biased downward in proportion to each name's exposure so the
  // blotter's P&L is a consequence of the thesis rather than decoration.
  useEffect(() => {
    const id = setInterval(() => {
      setPrices((prev) => {
        const next: Record<string, number> = {};
        for (const [nodeId, px] of Object.entries(prev)) {
          const drift = (exposure[nodeId] ?? 0) * -0.0016;
          const noise = (Math.random() - 0.5) * 0.0022;
          next[nodeId] = Math.max(1, px * (1 + drift + noise));
        }
        return next;
      });
    }, 900);
    return () => clearInterval(id);
  }, [exposure]);

  // --- Contagion cascade ----------------------------------------------------
  const applyEvent = useCallback(
    (evt: ScenarioEvent) => {
      const at = stamp();
      setNews((prev) => [{ ...evt, ts: at }, ...prev].slice(0, 40));

      log(
        "ORACLE",
        `${evt.source} headline ingested — entity resolution p=${evt.confidence.toFixed(2)}`
      );
      log(
        "ORACLE",
        `Resolved ${evt.entities.length} entity(s) to graph nodes: ${evt.entities.join(", ")}`
      );

      after(480, async () => {
        let origin = evt.origins[0];
        let shock = evt.shock;

        // Hand the raw headline to the oracle. When an LLM is configured it
        // resolves the entity and judges severity itself; the scripted shock
        // is only a fallback. This is the decision point of the whole system,
        // so the trace records which engine actually made the call.
        if (backendRef.current) {
          const verdict = await getOracleVerdict(evt.headline, evt.source);
          if (verdict) {
            const tag = verdict.engine === "llm" ? verdict.model ?? "llm" : "heuristic";
            log(
              "ORACLE",
              `[${tag}] shock=${verdict.shock.toFixed(2)} severity=${verdict.severity} ` +
                `confidence=${verdict.confidence.toFixed(2)} -> ${verdict.entities.join(", ") || "no entity"}`
            );
            if (verdict.reasoning) log("ORACLE", `reasoning: ${verdict.reasoning}`);
            if (verdict.uncertainty) {
              log("ORACLE", `uncertainty: ${verdict.uncertainty}`);
            }
            if (verdict.entities.length > 0 && verdict.shock > 0) {
              origin = verdict.entities[0];
              shock = verdict.shock;
            } else {
              log("ORACLE", `falling back to scripted shock — ${verdict.detail}`);
            }
          }
        }
        const originName = NODE_BY_ID.get(origin)?.name ?? origin;
        log(
          "GRAPH",
          `MATCH (o:Company {id:'${origin}'})-[:SUPPLIES|FABRICATES|ASSEMBLES*1..3]->(d) — traversing downstream cone`
        );

        // Prefer the server: it scores against the same algorithm but over
        // the live graph, and returns real Bitget marks alongside.
        const remote = backendRef.current
          ? await getContagion(origin, shock, evt.headline)
          : null;
        const found = remote
          ? toExposurePaths(remote.exposures)
          : traverseContagion(origin, shock);
        setPaths(found);

        if (remote) {
          const marks = Object.fromEntries(
            remote.exposures
              .filter((e) => e.mark != null)
              .map((e) => [e.target, e.mark as number])
          );
          if (Object.keys(marks).length > 0) {
            setPrices((prev) => ({ ...prev, ...marks }));
          }
        }

        log(
          "GRAPH",
          `${originName} shock ${shock.toFixed(2)} propagated to ${found.length} ` +
            `downstream node(s) [${remote ? "backend" : "local engine"}]`
        );

        // Origin itself is the epicentre, not a traversal result.
        setExposure((prev) => ({
          ...prev,
          [origin]: Math.max(prev[origin] ?? 0, shock),
        }));
        setContagion((prev) => escalate(prev, origin, scoreToContagion(shock)));
        setActivePath([origin]);

        // Walk outward one hop at a time so the operator can follow the spread.
        found.forEach((path) => {
          const hopIndex = path.hops.length - 1;
          after(hopIndex * HOP_STAGGER_MS, () => {
            setExposure((prev) => ({
              ...prev,
              [path.target]: Math.max(prev[path.target] ?? 0, path.score),
            }));
            setContagion((prev) =>
              escalate(prev, path.target, scoreToContagion(path.score))
            );
            setActivePath(path.hops);

            const node = NODE_BY_ID.get(path.target);
            log(
              "RISK",
              `${node?.name ?? path.target} exposure ${(path.score * 100).toFixed(0)}% ` +
                `(${path.hops.join(" -> ")}) · implied ${impliedDrawdownPct(path.score).toFixed(1)}%`
            );

            if (path.score >= TRADE_THRESHOLD && node?.ticker) {
              after(340, () => submitOrder(path, evt));
            }
          });
        });

        // The epicentre is tradable too when it has a listed token.
        const originNode = NODE_BY_ID.get(origin);
        if (originNode?.ticker && shock >= TRADE_THRESHOLD) {
          after(220, () =>
            submitOrder(
              {
                target: origin,
                hops: [origin],
                score: shock,
                rationale: "Epicentre — direct operational disruption",
              },
              evt
            )
          );
        }
      });
    },
    // submitOrder is stable via useCallback below; declared after for readability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [after, log]
  );

  // --- Execution ------------------------------------------------------------
  /**
   * Symbols with live risk. Tracked in a ref rather than derived from
   * `positions` inside the updater: React StrictMode double-invokes state
   * updaters in development, and logging or scheduling from inside one would
   * print every Bitget order twice.
   */
  const openSymbols = useRef(new Set<string>());

  const submitOrder = useCallback(
    (path: ExposurePath, evt: ScenarioEvent) => {
      const node = NODE_BY_ID.get(path.target);
      if (!node?.ticker) return;

      // The real Bitget stock-perp contract, e.g. NVDAUSDT.
      const symbol = perpSymbol(node.ticker);
      if (openSymbols.current.has(symbol)) {
        log(
          "RISK",
          `${symbol} already at target weight — incremental order suppressed by risk gate`
        );
        return;
      }
      openSymbols.current.add(symbol);

      const notional = Math.round((18_000 + path.score * 42_000) / 500) * 500;
      const leverage = path.score >= 0.55 ? 3 : 2;
      const entry = node.price ?? 100;

      const body = {
        symbol,
        productType: "USDT-FUTURES",
        marginMode: "isolated",
        marginCoin: "USDT",
        side: "sell",
        tradeSide: "open",
        orderType: "market",
        size: (notional / entry).toFixed(3),
        clientOid: `cascadr-${evt.id}-${node.id}`.toLowerCase(),
      };

      log(
        "EXEC",
        `Bitget Agent Hub -> POST /api/v2/mix/order — SHORT ${symbol} ` +
          `${notional.toLocaleString("en-US")} USDT @ ${leverage}x`,
        body
      );

      after(420, () =>
        log(
          "FILL",
          `FILLED ${symbol} short ${notional.toLocaleString("en-US")} USDT ` +
            `@ ${entry.toFixed(2)} · orderId 12${Math.floor(path.score * 8_999_999) + 1_000_000}`
        )
      );

      seq.current += 1;
      const position: Position = {
        id: `pos-${seq.current}`,
        symbol,
        side: "SHORT",
        notional,
        leverage,
        entry,
        mark: entry,
        openedAt: stamp(),
        thesis: path.rationale,
      };
      setPositions((prev) => [...prev, position]);
    },
    [after, log]
  );

  // Mark positions to the live tape. Skipped when the backend owns the book.
  useEffect(() => {
    if (backendRef.current) return;
    setPositions((prev) =>
      prev.map((p) => {
        const nodeId = NODES.find(
          (n) => n.ticker && perpSymbol(n.ticker) === p.symbol
        )?.id;
        const mark = nodeId ? prices[nodeId] : undefined;
        return mark ? { ...p, mark } : p;
      })
    );
  }, [prices]);

  // --- Controls -------------------------------------------------------------
  const run = useCallback(() => {
    if (phase === "RUNNING") return;
    clearTimers();
    setPhase("RUNNING");
    log("INFO", "Scenario armed — NLP oracle subscribed to wire feed");

    let elapsed = 0;
    SCENARIO.forEach((evt, i) => {
      elapsed += evt.delayMs;
      after(elapsed, () => {
        applyEvent(evt);
        if (i === SCENARIO.length - 1) {
          after(4200, () => {
            setPhase("COMPLETE");
            log("INFO", "Scenario complete — agent holding positions, monitoring for reversal");
          });
        }
      });
    });
  }, [after, applyEvent, clearTimers, log, phase]);

  const reset = useCallback(() => {
    clearTimers();
    setPhase("IDLE");
    setNews([]);
    setLogs([]);
    setPositions([]);
    openSymbols.current.clear();
    setContagion(initialContagion());
    setExposure({});
    setPaths([]);
    setActivePath([]);
    setPrices(initialPrices());
    setSelected(null);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const pnl = useMemo(
    () =>
      positions.reduce((sum, p) => {
        const move = (p.entry - p.mark) / p.entry; // short: down is profit
        return sum + move * p.notional * p.leverage;
      }, 0),
    [positions]
  );

  return {
    phase,
    news,
    logs,
    positions,
    contagion,
    exposure,
    paths,
    activePath,
    prices,
    selected,
    setSelected,
    pnl,
    run,
    reset,
    backend,
    realized,
  };
}

/** Severity only ever ratchets up within a scenario; it never silently downgrades. */
function escalate(
  prev: Record<string, Contagion>,
  id: string,
  next: Contagion
): Record<string, Contagion> {
  const cur = prev[id] ?? "NOMINAL";
  if (CONTAGION_RANK[next] <= CONTAGION_RANK[cur]) return prev;
  return { ...prev, [id]: next };
}
