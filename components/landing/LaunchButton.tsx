import Link from "next/link";

/** Primary call to action. Solid amber so it is unmistakably the main path. */
export function LaunchButton({
  children = "Launch terminal",
  size = "md",
}: {
  children?: React.ReactNode;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-3 py-1.5" : "px-5 py-2.5";
  return (
    <Link
      href="/terminal"
      className={`inline-flex items-center bg-amber ${pad} text-2xs font-bold uppercase tracking-[0.18em] text-term-void transition-colors hover:bg-term-bright`}
    >
      {children}
    </Link>
  );
}
