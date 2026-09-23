import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Bundled with the repo rather than fetched from a font CDN: the demo has to
 * render identically on conference wifi (or none at all).
 */
const mono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CASCADR // Supply Chain Knowledge Graph Arbitrage Agent",
  description:
    "Cascadr maps the global electronics supply chain as a knowledge graph and trades downstream contagion on Bitget tokenized equities — shorting exposed names before the second-order effect is priced in.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
