"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The hero header's burger and menu. In landscape the menu is display:contents
 * and its children (the nav pill and the CTA) sit in the header as usual; in
 * portrait they collapse behind the burger.
 *
 * Closes on a link click, a click anywhere outside, Escape (focus returns to
 * the burger), and when the frame turns landscape.
 */
export function HeroMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || button.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(min-aspect-ratio: 1/1)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="cx-burger"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="cx-menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <i />
        <i />
      </button>
      <div
        ref={menu}
        id="cx-menu"
        className="cx-menu"
        data-open={open ? "" : undefined}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) close();
        }}
      >
        {children}
      </div>
    </>
  );
}
