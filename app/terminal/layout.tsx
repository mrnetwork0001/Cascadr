import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CASCADR Terminal // Live Contagion Monitor",
  description:
    "Supply-chain knowledge graph, contagion traversal and Bitget execution log, on one screen.",
};

export default function TerminalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
