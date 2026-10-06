"use client";

import { useEffect } from "react";

const EXPO = "cubic-bezier(.16,1,.3,1)";
const SOFT = "cubic-bezier(.22,.7,.25,1)";
const GLASS = "cubic-bezier(.2,.75,.28,1)";

/**
 * The hero's entrance: runs once on load, then deletes itself. The hero root
 * carries .cx-pre (added before first paint by the inline script in Hero);
 * this plays the WAAPI timeline from those pre-states, then removes the class
 * and cancels every animation so the finished page is plain CSS again.
 * Without the class (no JS at paint, reduced motion, client-side navigation)
 * it does nothing and the hero is already finished.
 */
export function HeroMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".cx-hero");
    if (!root || !root.classList.contains("cx-pre")) return;
    if (typeof root.animate !== "function") {
      root.classList.remove("cx-pre");
      return;
    }

    const s = window.matchMedia("(max-width: 640px)").matches ? 0.86 : 1;
    const running: Animation[] = [];
    const one = (sel: string) => root.querySelector<HTMLElement>(sel);
    const nth = (sel: string, i: number) => root.querySelectorAll<HTMLElement>(sel)[i] ?? null;

    const animate = (el: Element | null, frames: Keyframe[], dur: number, delay: number, easing: string) => {
      if (!el) return;
      running.push(el.animate(frames, { duration: dur * s, delay: delay * s, easing, fill: "both" }));
    };
    // A - masked rise: headline lines, the two figures.
    const rise = (el: Element | null, delay: number, dur: number) =>
      animate(
        el,
        [
          { clipPath: "inset(100% 0 -14% 0)", translate: "0 .16em" },
          { clipPath: "inset(-18% 0 -14% 0)", translate: "0 0" },
        ],
        dur,
        delay,
        EXPO,
      );
    // B - quiet lift: eyebrow, tagline, labels.
    const lift = (el: Element | null, delay: number, dist = ".7em", dur = 560) =>
      animate(
        el,
        [
          { opacity: 0, translate: `0 ${dist}` },
          { opacity: 1, translate: "0 0" },
        ],
        dur,
        delay,
        SOFT,
      );
    // C - glass settle: pills, panel, play, burger.
    const settle = (el: Element | null, delay: number, dur = 760, from = 0.985, dist = "1.1em") =>
      animate(
        el,
        [
          { opacity: 0, scale: String(from), translate: `0 ${dist}` },
          { opacity: 1, scale: "1", translate: "0 0" },
        ],
        dur,
        delay,
        GLASS,
      );

    lift(one(".cx-brand"), 60, ".55em", 600);
    settle(one(".cx-nav"), 150, 700, 0.99, ".5em");
    settle(one(".cx-cta"), 200, 700, 0.985, ".5em");
    settle(one(".cx-burger"), 150, 700, 0.9, ".4em");
    lift(one(".cx-eyebrow"), 300, ".8em", 520);
    rise(nth(".cx-h1 .cx-sx", 0), 380, 980);
    rise(nth(".cx-h1 .cx-sx", 1), 470, 980);
    settle(one(".cx-play"), 720, 640, 0.88, ".3em");
    lift(one(".cx-tag"), 770, ".7em", 560);
    settle(one(".cx-panel"), 800, 880, 0.982, "1.4em");
    // D - accent: badge, dot, meter, slash.
    animate(one(".cx-badge"), [{ scale: "0.86" }, { scale: "1" }], 700, 1020, EXPO);
    animate(one(".cx-dot"), [{ scale: "0" }, { scale: "1" }], 520, 1080, EXPO);
    animate(one(".cx-track i"), [{ scale: "0 1" }, { scale: "1 1" }], 820, 1120, EXPO);
    rise(nth(".cx-num", 0), 920, 860);
    rise(nth(".cx-num", 1), 990, 860);
    lift(nth(".cx-lbl", 0), 1030, ".6em", 520);
    lift(nth(".cx-lbl", 1), 1075, ".6em", 520);
    animate(one(".cx-slash"), [{ scale: "1 0" }, { scale: "1 1" }], 700, 1010, EXPO);
    settle(one(".cx-meet"), 1140, 820, 0.985, "1.2em");

    let live = true;
    Promise.all(running.map((a) => a.finished))
      .then(() => {
        if (!live) return;
        root.classList.remove("cx-pre");
        running.forEach((a) => a.cancel());
        running.length = 0;
      })
      // A cancelled animation rejects its promise: the cleanup below did it.
      .catch(() => {});

    return () => {
      live = false;
      running.forEach((a) => a.cancel());
      running.length = 0;
    };
  }, []);

  return null;
}
