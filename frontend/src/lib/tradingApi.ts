/**
 * src/lib/tradingApi.ts
 *
 * Typed API client for the NestJS backend.
 * Uses relative paths — Next.js rewrites proxy them to http://localhost:4000
 * (see next.config.js rewrites for /api/binance/* and /api/trading/*)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Ticker {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePct: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface Indicators {
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  ema: { ema9: number; ema21: number; ema50: number };
  price: number;
}

export interface Signal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  indicators: Indicators;
  symbol: string;
  timeframe: string;
  timestamp: number;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
}

export interface OrderResult {
  orderId: number;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price: number;
  status: string;
  executedQty: number;
  cummulativeQuoteQty: number;
  transactTime: number;
}

export interface TradeSummary {
  signal: Signal;
  order?: OrderResult;
  skipped?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface ExecuteTradeParams {
  symbol?: string;
  timeframe?: string;
  maxPosPct?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).message ?? msg; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).message ?? msg; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ─── API surface ──────────────────────────────────────────────────────────────

/** GET /api/binance/ticker/:symbol  →  proxied to NestJS */
export const getTicker = (symbol: string) =>
  get<Ticker>(`/api/binance/ticker/${symbol.toUpperCase()}`);

/** GET /api/binance/candles/:symbol?interval=15m&limit=100 */
export const getCandles = (symbol: string, interval = '15m', limit = 100) =>
  get<Candle[]>(`/api/binance/candles/${symbol.toUpperCase()}?interval=${interval}&limit=${limit}`);

/** GET /api/binance/balance */
export const getBalance = () => get<Balance[]>('/api/binance/balance');

/** GET /api/trading/signal?symbol=BTCUSDT&timeframe=15m */
export const getSignal = (symbol = 'BTCUSDT', timeframe = '15m') =>
  get<Signal>(`/api/trading/signal?symbol=${symbol}&timeframe=${timeframe}`);

/** POST /api/trading/execute */
export const executeTrade = (params: ExecuteTradeParams = {}) =>
  post<TradeSummary>('/api/trading/execute', {
    symbol:        params.symbol        ?? 'BTCUSDT',
    timeframe:     params.timeframe     ?? '15m',
    maxPosPct:     params.maxPosPct     ?? 2,
    stopLossPct:   params.stopLossPct   ?? 1.5,
    takeProfitPct: params.takeProfitPct ?? 3,
  });
