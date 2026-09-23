/**
 * Instrument mapping.
 *
 * Shorting a US equity on Bitget means the STOCK PERPETUAL FUTURES product:
 * symbol `${ticker}USDT`, productType "USDT-FUTURES".
 *
 * It does NOT mean the tokenized xStocks (AAPLx, NVDAx, TSLAx). Those are
 * spot-only — you can buy and hold them, but you cannot short them, so they
 * are unusable for a contagion strategy. Every symbol here was reconciled
 * against GET /api/v2/mix/market/contracts.
 */

/** Underlying equity ticker -> Bitget stock-perp symbol. */
export function perpSymbol(ticker: string): string {
  return `${ticker.toUpperCase()}USDT`;
}
