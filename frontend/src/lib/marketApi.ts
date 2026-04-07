export interface MarketOption {
  id: string;
  label: string;
  liquidity: number;
  percentage: number;
}

export interface MarketEvent {
  id: string;
  title: string;
  description: string;
  endTime: string;
  status: 'OPEN' | 'RESOLVED' | 'CANCELLED';
  winningOption?: string | null;
  totalLiquidity: number;
  options: MarketOption[];
  bets?: Array<{ id: string }>;
}

export interface FeedItem {
  id: string;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardData {
  wallet: { id: string; balance: number } | null;
  activeBets: any[];
  history: any[];
  holdings: Array<{ id: string; amount: number; token: any }>;
}

export interface MarketToken {
  id: string;
  name: string;
  symbol: string;
  price: number;
  supply: number;
  logoUrl?: string;
}

const toJson = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `HTTP ${res.status}`);
  }
  return res.json();
};

export async function createUser(username: string, phantomAddress?: string) {
  const res = await fetch('/api/market/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, phantomAddress }),
  });
  return toJson<{ id: string }>(res);
}

export async function getEvents() {
  const res = await fetch('/api/market/events');
  return toJson<MarketEvent[]>(res);
}

export async function placeBet(eventId: string, payload: { userId: string; optionId: string; amount: number }) {
  const res = await fetch(`/api/market/events/${eventId}/bets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return toJson<any>(res);
}

export async function getDashboard(userId: string) {
  const res = await fetch(`/api/market/dashboard/${userId}`);
  return toJson<DashboardData>(res);
}

export async function deposit(userId: string, amount: number) {
  const res = await fetch('/api/market/wallet/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, amount }),
  });
  return toJson<DashboardData>(res);
}

export async function getFeed(limit = 50) {
  const res = await fetch(`/api/market/feed?limit=${limit}`);
  return toJson<FeedItem[]>(res);
}

export async function getWalletTransactions(userId: string, limit = 50) {
  const res = await fetch(`/api/market/wallet/transactions/${userId}?limit=${limit}`);
  return toJson<any[]>(res);
}

export async function getTokens() {
  const res = await fetch('/api/market/tokens');
  return toJson<MarketToken[]>(res);
}

export async function buyToken(tokenId: string, userId: string, amount: number) {
  const res = await fetch(`/api/market/tokens/${tokenId}/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, amount }),
  });
  return toJson<any>(res);
}

export async function sellToken(tokenId: string, userId: string, amount: number) {
  const res = await fetch(`/api/market/tokens/${tokenId}/sell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, amount }),
  });
  return toJson<any>(res);
}
