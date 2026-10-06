import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

/** Inter, variable 100-900: the design uses intermediate weights (360, 470, 520...). */
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

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
    "An autonomous agent that reads live supply-chain news, traces which downstream companies a disruption exposes through a source-cited knowledge graph, and paper-trades Bitget stock perpetuals against them on Bitget's demo exchange.",
};

export const viewport: Viewport = {
  themeColor: "#E6EDF6",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
