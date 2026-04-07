/** Deterministic number formatting for SSR/hydration (avoids Intl locale differences Node vs browser). */

function toFiniteNumber(n: unknown): number {
  if (typeof n === 'number') return Number.isFinite(n) ? n : 0;
  if (typeof n === 'string') {
    const x = parseFloat(n);
    return Number.isFinite(x) ? x : 0;
  }
  return 0;
}

/** Integer-style display with comma thousands separators (en-US style, SSR-safe). */
export function formatIntEnUS(value: unknown): string {
  const n = Math.round(toFiniteNumber(value));
  const s = Math.abs(n).toString();
  const withSep = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${withSep}` : withSep;
}

/** Optional decimals, comma-separated integer part. */
export function formatNumEnUS(value: unknown, maxFrac = 6): string {
  const n = toFiniteNumber(value);
  if (!Number.isFinite(n)) return '0';
  const fixed = n.toFixed(maxFrac).replace(/\.?0+$/, '');
  const [intPart, frac] = fixed.split('.');
  const intWith = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac !== undefined && frac !== '' ? `${intWith}.${frac}` : intWith;
}
