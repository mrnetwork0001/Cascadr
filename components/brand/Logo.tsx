import Image from "next/image";

/** Intrinsic ratio of the trimmed wordmark (1796 x 344). */
const RATIO = 1796 / 344;

/**
 * The Cascadr wordmark. One component so the header, footer and terminal can
 * never drift apart. Height drives size; width follows the artwork's ratio.
 */
export function Logo({
  height = 24,
  priority = false,
  className = "",
}: {
  height?: number;
  /** Above-the-fold placements should load eagerly. */
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src="/brand/cascadr-wordmark-128.png"
      alt="Cascadr"
      width={Math.round(height * RATIO)}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
