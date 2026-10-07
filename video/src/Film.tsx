import React from "react";
import { AbsoluteFill, Audio, Freeze, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { T, scene, wordAt, lineStart } from "./timing";
import { C } from "./theme";
import { Chrome } from "./ui/Chrome";
import { Captions } from "./ui/Captions";
import { Grain } from "./ui/Grain";
import { clamp } from "./ui/motion";
import { Open } from "./scenes/Open";
import { Problem } from "./scenes/Problem";
import { Evidence } from "./scenes/Evidence";
import { Gap } from "./scenes/Gap";
import { Turn } from "./scenes/Turn";
import { Sense } from "./scenes/Sense";
import { Reason } from "./scenes/Reason";
import { Graph } from "./scenes/Graph";
import { Decide } from "./scenes/Decide";
import { Act } from "./scenes/Act";
import { Unique } from "./scenes/Unique";
import { Close } from "./scenes/Close";

const SCENES: Record<string, React.FC> = {
  open: Open, problem: Problem, evidence: Evidence, gap: Gap, turn: Turn, sense: Sense,
  reason: Reason, graph: Graph, decide: Decide, act: Act, unique: Unique, close: Close,
};
const OVERLAP = 10; // frames each scene starts early, to cross-dissolve with the last

/** Each scene eases in (a short rise and un-blur) over the tail of the previous one. */
const SceneIn: React.FC<{ S: React.FC; first: boolean }> = ({ S, first }) => {
  const f = useCurrentFrame();
  if (first) return <S />;
  const p = interpolate(f, [0, OVERLAP], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  // While it dissolves in over the previous scene, the new one holds its first frame.
  const body = f < OVERLAP ? <Freeze frame={0}><S /></Freeze> : <Sequence from={OVERLAP} layout="none"><S /></Sequence>;
  return <AbsoluteFill style={{ opacity: p, transform: `scale(${1.03 - 0.03 * p})`, filter: p < 1 ? `blur(${(1 - p) * 10}px)` : undefined }}>{body}</AbsoluteFill>;
};

// --- Music: ducked under every spoken line.
const LINES = T.scenes.flatMap((s) => s.lines.map((l) => [l.startFrame, l.words[l.words.length - 1].end] as const));
const DUCK: number[] = (() => {
  const v = new Array<number>(T.totalFrames + 1).fill(0);
  for (let f = 0; f <= T.totalFrames; f++) {
    let d = 0;
    for (const [a, b] of LINES) d = Math.max(d, interpolate(f, [a - 10, a, b, b + 14], [0, 1, 1, 0], clamp));
    v[f] = d;
  }
  return v;
})();
const musicVolume = (f: number) => {
  const end = T.totalFrames;
  const fadeIn = interpolate(f, [0, 24], [0, 1], clamp);
  const fadeOut = interpolate(f, [end - 60, end], [1, 0], clamp);
  return (0.55 - 0.36 * DUCK[Math.min(end, Math.max(0, f))]) * fadeIn * fadeOut;
};

interface Fx { file: string; at: number; vol: number; dur?: number }
function effects(): Fx[] {
  const sc = (id: string) => scene(id).from;
  const w = (id: string, word: string, n = 0) => wordAt(id, word, n);
  const fx: Fx[] = [
    { file: "tick", at: 6, vol: 0.35 }, { file: "tick", at: 36, vol: 0.35 },
    { file: "rumble", at: w("open", "earthquake") - 6, vol: 0.7, dur: 110 },
    { file: "glitch", at: w("open", "Breaking") - 8, vol: 0.45 },
    { file: "news_sting", at: w("open", "Breaking") - 4, vol: 0.35 },
    { file: "whoosh", at: w("open", "TSMC") - 6, vol: 0.25 },
    { file: "stamp", at: w("open", "headline.") - 2, vol: 0.6 },
    { file: "pop", at: w("problem", "one") - 2, vol: 0.5 },
    { file: "pulse", at: w("problem", "damage") - 2, vol: 0.45 },
    ...["NVIDIA,", "AMD,", "Apple,", "Qualcomm", "Broadcom."].map((x) => ({ file: "pop", at: w("problem", x) - 1, vol: 0.4 })),
    { file: "swoosh_up", at: sc("evidence") - 6, vol: 0.35 },
    { file: "blip", at: w("evidence", "five") + 2, vol: 0.4 },
    { file: "blip", at: w("evidence", "forty") - 2, vol: 0.4 },
    { file: "whoosh", at: sc("gap") - 6, vol: 0.3 },
    { file: "tick", at: w("gap", "three"), vol: 0.4 }, { file: "tick", at: w("gap", "three") + 30, vol: 0.4 }, { file: "tick", at: w("gap", "three") + 60, vol: 0.4 },
    { file: "riser", at: sc("turn") - 100, vol: 0.4 },
    { file: "impact", at: w("turn", "Cascadr.") - 4, vol: 0.55 },
    { file: "whoosh", at: sc("sense") - 6, vol: 0.3 },
    { file: "typing", at: sc("sense") + 30, vol: 0.18 },
    ...["ten", "clock,", "nineteen"].map((x) => ({ file: "pop", at: w("sense", x) - 1, vol: 0.35 })),
    { file: "whoosh", at: sc("reason") - 6, vol: 0.3 },
    ...["Which", "badly,", "change"].map((x) => ({ file: "click", at: w("reason", x) - 2, vol: 0.4 })),
    { file: "blip", at: w("reason", "Most"), vol: 0.35 },
    { file: "whoosh", at: sc("graph") - 6, vol: 0.3 },
    { file: "pop", at: w("graph", "Every") - 4, vol: 0.45 },
    { file: "whoosh", at: sc("decide") - 6, vol: 0.3 },
    { file: "click", at: w("decide", "pass,"), vol: 0.45 },
    { file: "typing", at: w("decide", "reason") - 4, vol: 0.22 },
    { file: "whoosh", at: sc("act") - 6, vol: 0.3 },
    { file: "click", at: w("act", "risk"), vol: 0.4 },
    { file: "pulse", at: w("act", "Agent") - 4, vol: 0.4 },
    { file: "stamp", at: w("act", "Bitget's") + 16, vol: 0.55 },
    { file: "chime", at: w("act", "Bitget's") + 18, vol: 0.35 },
    { file: "swoosh_up", at: sc("unique") - 6, vol: 0.35 },
    ...["second", "sourced,", "public,"].map((x) => ({ file: "impact", at: w("unique", x) - 4, vol: 0.22 })),
    { file: "whoosh", at: sc("close") - 6, vol: 0.3 },
    { file: "chime", at: w("close", "Cascadr.") - 2, vol: 0.45 },
  ];
  return fx.filter((x) => x.at >= 0 && x.at < T.totalFrames);
}

export const Film: React.FC = () => {
  // Captions sit out where the picture already carries the words (big kinetic type, cards).
  const hideCaptions = (f: number) => {
    const s = T.scenes.find((x) => f >= x.from && f < x.from + x.durationInFrames);
    return !s || ["turn", "gap", "unique", "close"].includes(s.id) || f < lineStart("open", 0) - 4;
  };
  return (
    <AbsoluteFill style={{ background: C.frame }}>
      {T.scenes.map((s, i) => {
        const S = SCENES[s.id];
        const from = i === 0 ? s.from : s.from - OVERLAP;
        const dur = s.durationInFrames + (i === 0 ? 0 : OVERLAP);
        return S ? (
          <Sequence key={s.id} from={from} durationInFrames={dur} name={s.id}>
            <SceneIn S={S} first={i === 0} />
          </Sequence>
        ) : null;
      })}
      <Grain opacity={0.05} />
      <Chrome hideAfter={scene("close").from + 40} />
      <Captions hidden={hideCaptions} />
      <Audio src={staticFile("audio/music.mp3")} volume={musicVolume} />
      {T.scenes.flatMap((s) => s.lines).map((l, i) => (
        <Sequence key={`vo${i}`} from={l.startFrame} durationInFrames={l.durationFrames} name={`vo ${l.text.slice(0, 18)}`}>
          <Audio src={staticFile(l.file)} volume={1} />
        </Sequence>
      ))}
      {effects().map((x, i) => (
        <Sequence key={`fx${i}`} from={x.at} durationInFrames={x.dur ?? 150} name={`fx ${x.file}`}>
          <Audio src={staticFile(`audio/sfx/${x.file}.mp3`)} volume={(f) => x.vol * (x.dur ? interpolate(f, [0, 8, x.dur - 20, x.dur], [0, 1, 1, 0], clamp) : 1)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
