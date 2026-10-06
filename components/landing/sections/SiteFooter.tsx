import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { CONTAINER } from "@/components/landing/Section";
import { Hairline, Label } from "@/components/landing/sections/ui";

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/** Brand, one honest line about the project, and the link columns. */
export function SiteFooter({ columns, onDemo }: { columns: FooterColumn[]; onDemo: boolean }) {
  return (
    <footer className="pb-14 pt-4 md:pb-20">
      <div className={CONTAINER}>
        <Hairline />
        {/* Phones: brand, then the link columns two by two (an odd last one
            takes the full row so its longer labels stay on one line).
            Tablets: brand above three columns. Desktop: all four in a row. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 pt-14 sm:grid-cols-3 md:gap-x-10 md:pt-16 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" aria-label="Cascadr home" className="inline-flex rounded-full">
              <Logo height={34} />
            </Link>
            <p className="mt-5 max-w-sm text-[14.5px] leading-[1.6] text-muted-2">
              An autonomous agent that reads supply-chain news and paper-trades downstream
              contagion on Bitget stock perpetuals{onDemo ? ", on Bitget's demo exchange" : ""}. Built by NetLayer Labs for the Bitget AI
              Hackathon.
            </p>
          </div>
          {columns.map((col, i) => (
            <nav
              key={col.title}
              aria-label={col.title}
              className={i === columns.length - 1 && columns.length % 2 === 1 ? "col-span-2 sm:col-span-1" : undefined}
            >
              <Label className="mb-5">{col.title}</Label>
              <ul className="space-y-3.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-[15px] tracking-[-0.01em] text-term-text transition-colors hover:text-accent-deep"
                    >
                      {l.label}
                      {l.external && (
                        <span aria-hidden="true" className="ml-1 text-muted">
                          ↗
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}
