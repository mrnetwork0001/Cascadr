"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

interface NavLink {
  label: string;
  href: string;
}

/**
 * Hamburger menu for the landing header below the md breakpoint. On wider
 * screens the same links render inline and this component is hidden.
 *
 * Closes on link tap, Escape, and a tap anywhere outside - a menu that has
 * to be closed by hitting the tiny toggle again is a menu people get stuck in.
 */
export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        // 40px square: comfortably above the minimum touch target.
        className="-mr-2 flex h-10 w-10 items-center justify-center text-term-text transition-colors hover:text-amber"
      >
        <span aria-hidden className="relative block h-3.5 w-5">
          <span
            className={`absolute left-0 h-0.5 w-5 bg-current transition-all duration-200 ${
              open ? "top-1.5 rotate-45" : "top-0"
            }`}
          />
          <span
            className={`absolute left-0 top-1.5 h-0.5 w-5 bg-current transition-opacity duration-200 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`absolute left-0 h-0.5 w-5 bg-current transition-all duration-200 ${
              open ? "top-1.5 -rotate-45" : "top-3"
            }`}
          />
        </span>
      </button>

      {/* Anchored to the full-width sticky nav, directly beneath it. */}
      <div
        id={menuId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-term-line bg-term-void/95 backdrop-blur"
      >
        <ul className="flex flex-col px-5 py-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="block border-b border-term-line/60 py-3.5 text-xs uppercase tracking-widest text-term-text last:border-0 hover:text-amber"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
