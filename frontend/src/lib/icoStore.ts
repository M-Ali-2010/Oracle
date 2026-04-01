/**
 * src/lib/icoStore.ts
 *
 * In-process singleton store for ICO state.
 * Next.js API routes run in the same Node process (dev + prod),
 * so this module acts as a lightweight in-memory database.
 *
 * For production you'd swap this with Postgres / Redis / Firestore,
 * but the API surface stays identical.
 */

export interface IcoProjectState {
  id: string;
  mintAddress: string | null;   // null until /api/create-token is called
  raisedSol: number;
  soldTokens: number;
  totalTokens: number;
  basePrice: number;            // price in SOL at genesis
  decimals: number;
}

export interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;   // SOL traded in this tick
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

// ─── Singleton guard (hot-reload safe) ───────────────────────────────────────
const g = global as any;

if (!g.__icoStore) {
  g.__icoStore = {
    projects: new Map<string, IcoProjectState>(),
    priceHistory: new Map<string, PricePoint[]>(),
    transactions: [] as TxRecord[],
  };

  // Seed initial project states that mirror PROJECTS in the frontend
  const seed: Omit<IcoProjectState, 'mintAddress'>[] = [
    { id: 'oracle-data',  raisedSol: 3247, soldTokens: 64200,  totalTokens: 100000, basePrice: 0.15, decimals: 6 },
    { id: 'green-chain',  raisedSol: 2150, soldTokens: 41800,  totalTokens: 200000, basePrice: 0.08, decimals: 6 },
    { id: 'ai-compute',   raisedSol: 9800, soldTokens: 72000,  totalTokens: 80000,  basePrice: 0.25, decimals: 6 },
    { id: 'reit-sol',     raisedSol: 4500, soldTokens: 2800,   totalTokens: 10000,  basePrice: 1.2,  decimals: 6 },
    { id: 'depin-mesh',   raisedSol: 3000, soldTokens: 500000, totalTokens: 500000, basePrice: 0.05, decimals: 6 },
  ];

  const now = Date.now();
  for (const s of seed) {
    g.__icoStore.projects.set(s.id, { ...s, mintAddress: null });

    // Generate 30 synthetic price-history points per project
    const pts: PricePoint[] = [];
    let price = s.basePrice;
    for (let i = 29; i >= 0; i--) {
      price = price * (0.97 + Math.random() * 0.06);
      pts.push({
        timestamp: now - i * 3_600_000,
        price: parseFloat(price.toFixed(6)),
        volume: parseFloat((Math.random() * 50).toFixed(4)),
      });
    }
    g.__icoStore.priceHistory.set(s.id, pts);
  }
}

export const store: {
  projects: Map<string, IcoProjectState>;
  priceHistory: Map<string, PricePoint[]>;
  transactions: TxRecord[];
} = g.__icoStore;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Dynamic bonding-curve price: price = basePrice * (1 + soldTokens/totalTokens) */
export function currentPrice(projectId: string): number {
  const p = store.projects.get(projectId);
  if (!p) return 0;
  return parseFloat(
    (p.basePrice * (1 + p.soldTokens / p.totalTokens)).toFixed(6)
  );
}

/** Record a new price tick after a buy/sell */
export function pushPricePoint(projectId: string, price: number, volume: number) {
  const hist = store.priceHistory.get(projectId) ?? [];
  hist.push({ timestamp: Date.now(), price, volume });
  // Keep last 500 points
  if (hist.length > 500) hist.splice(0, hist.length - 500);
  store.priceHistory.set(projectId, hist);
}

/** Generate a short UUID-ish id */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}