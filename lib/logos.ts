/**
 * Company logos for the knowledge graph.
 *
 * Official marks sourced from each company's Wikipedia infobox, trimmed and
 * normalised to 96px tall under public/logos/. Aspect ratios live here rather
 * than being read from the image so a badge has its final size before the
 * image finishes loading — no layout jump when logos stream in.
 */

export const LOGO_ASPECT: Record<string, number> = {
  ASML: 3.562,
  SHIN_ETSU: 4.49,
  LYNAS: 2.25,
  TSMC: 1.271,
  SK_HYNIX: 1.906,
  SAMSUNG: 6.5,
  SONY: 5.652,
  CATL: 4.99,
  FOXCONN: 5.474,
  PEGATRON: 6.753,
  MAERSK: 4.479,
  NVDA: 5.406,
  AAPL: 0.812,
  AMD: 4.188,
  QCOM: 5.417,
  AVGO: 7.324,
  TSLA: 0.771,
  DELL: 7.761,
};

export function logoSrc(id: string): string {
  return `/logos/${id}.png`;
}

const cache = new Map<string, HTMLImageElement>();

/**
 * Returns the logo once it has decoded, or null while it is still loading.
 * Canvas painters call this every frame; the first call starts the fetch and
 * later calls pick up the finished image.
 */
export function getLogo(id: string): HTMLImageElement | null {
  if (typeof window === "undefined" || !(id in LOGO_ASPECT)) return null;
  let img = cache.get(id);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = logoSrc(id);
    cache.set(id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
