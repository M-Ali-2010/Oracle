/**
 * src/lib/icoStore.ts
 *
 * FIX: Price history now generates points every 5 minutes (not every 1h),
 * ensuring the 1h chart always has enough data points to render.
 */

export interface IcoProjectState {
  id: string;
  mintAddress: string | null;
  raisedSol: number;
  soldTokens: number;
  totalTokens: number;
  basePrice: number;
  decimals: number;
}

export interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
}

export interface TxRecord {
  id: string;
  wallet: string;
  type: 'buy' | 'sell';
  solAmount: number;
  tokenAmount: number;
  txHash: string;
  timestamp: number;
  projectId: string;
}

const g = global as any;

if (!g.__icoStore) {
  g.__icoStore = {
    projects: new Map(),
    priceHistory: new Map(),
    transactions: [],
  };

  const seed = [
    { id: 'oracle-data',  raisedSol: 3247, soldTokens: 64200,  totalTokens: 100000, basePrice: 0.15, decimals: 6 },
    { id: 'green-chain',  raisedSol: 2150, soldTokens: 41800,  totalTokens: 200000, basePrice: 0.08, decimals: 6 },
    { id: 'ai-compute',   raisedSol: 9800, soldTokens: 72000,  totalTokens: 80000,  basePrice: 0.25, decimals: 6 },
    { id: 'reit-sol',     raisedSol: 4500, soldTokens: 2800,   totalTokens: 10000,  basePrice: 1.2,  decimals: 6 },
    { id: 'depin-mesh',   raisedSol: 3000, soldTokens: 500000, totalTokens: 500000, basePrice: 0.05, decimals: 6 },
  ];

  const now = Date.now();
  const INTERVAL_MS = 5 * 60 * 1_000; // 5 minutes
  const POINTS = 7 * 24 * 12;         // 2016 points = 7 days

  for (const s of seed) {
    g.__icoStore.projects.set(s.id, { ...s, mintAddress: null });

    const pts = [];
    let price = s.basePrice * 0.85;
    for (let i = POINTS - 1; i >= 0; i--) {
      price = price * (0.999 + Math.random() * 0.004);
      if (Math.random() < 0.02) price *= 1 + (Math.random() - 0.4) * 0.05;
      price = Math.max(s.basePrice * 0.5, price);
      pts.push({
        timestamp: now - i * INTERVAL_MS,
        price: parseFloat(price.toFixed(6)),
        volume: parseFloat((Math.random() * 20 + 1).toFixed(4)),
      });
    }
    g.__icoStore.priceHistory.set(s.id, pts);
  }
}

export const store = g.__icoStore;

export function currentPrice(projectId) {
  const p = store.projects.get(projectId);
  if (!p) return 0;
  return parseFloat((p.basePrice * (1 + p.soldTokens / p.totalTokens)).toFixed(6));
}

export function pushPricePoint(projectId, price, volume) {
  const hist = store.priceHistory.get(projectId) ?? [];
  hist.push({ timestamp: Date.now(), price, volume });
  if (hist.length > 2500) hist.splice(0, hist.length - 2500);
  store.priceHistory.set(projectId, hist);
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
