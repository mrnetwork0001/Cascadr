/**
 * Company icons for the knowledge graph.
 *
 * Round stock-app style icons (the Apple apple, the NVIDIA eye, the Tesla T),
 * resolved through TradingView's symbol search so each one is the icon that
 * company's listing actually uses, not a guessed URL. Stored as square SVGs
 * under public/logos/ and clipped to a circle when drawn, so they stay sharp
 * at every zoom level.
 */

const IDS = [
  "ASML", "SHIN_ETSU", "TSMC", "SK_HYNIX", "SAMSUNG", "SONY", "CATL",
  "FOXCONN", "PEGATRON", "NVDA", "AAPL", "AMD", "QCOM", "AVGO", "TSLA", "DELL",
] as const;

const HAS_LOGO = new Set<string>(IDS);

export function logoSrc(id: string): string {
  return `/logos/${id}.svg`;
}

const cache = new Map<string, HTMLImageElement>();

/**
 * Returns the icon once it has decoded, or null while it is still loading.
 * Canvas painters call this every frame; the first call starts the fetch and
 * later calls pick up the finished image.
 */
export function getLogo(id: string): HTMLImageElement | null {
  if (typeof window === "undefined" || !HAS_LOGO.has(id)) return null;
  let img = cache.get(id);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = logoSrc(id);
    cache.set(id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
