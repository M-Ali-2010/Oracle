import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';

export interface JupiterToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

/** Minimal fallback if token list endpoints fail (mainnet). */
export const FALLBACK_JUPITER_TOKENS: JupiterToken[] = [
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  {
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'USDT',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
  },
  {
    address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade staked SOL',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png',
  },
];

export interface JupiterQuote extends Record<string, unknown> {
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  priceImpactPct?: string;
  routePlan?: Array<{ swapInfo?: { label?: string } }>;
  error?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 18_000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Load tradable tokens (mainnet Jupiter list). */
export async function fetchJupiterTokenList(): Promise<JupiterToken[]> {
  const urls = [
    'https://tokens.jup.ag/tokens?tags=strict',
    'https://token.jup.ag/strict',
  ];
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data = await res.json();
      const raw = Array.isArray(data) ? data : (data as { tokens?: unknown }).tokens;
      if (!Array.isArray(raw) || raw.length === 0) continue;
      const mapped: JupiterToken[] = raw
        .map((t: Record<string, unknown>) => ({
          address: String(t.address ?? ''),
          symbol: String(t.symbol ?? ''),
          name: String(t.name ?? ''),
          decimals: Number(t.decimals ?? 0),
          logoURI: typeof t.logoURI === 'string' ? t.logoURI : undefined,
        }))
        .filter((t) => t.address.length >= 32 && t.symbol && t.name);
      if (mapped.length > 0) return mapped.filter((t) => t.address !== SOL_MINT);
    } catch {
      /* try next */
    }
  }
  return FALLBACK_JUPITER_TOKENS;
}

export function solToLamports(sol: number): bigint {
  if (!Number.isFinite(sol) || sol <= 0) return BigInt(0);
  return BigInt(Math.round(sol * LAMPORTS_PER_SOL));
}

export async function getJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amountLamports: bigint;
  slippageBps: number;
}): Promise<JupiterQuote | null> {
  const { inputMint, outputMint, amountLamports, slippageBps } = params;
  if (amountLamports <= BigInt(0)) return null;

  const url = new URL('https://quote-api.jup.ag/v6/quote');
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amountLamports.toString());
  url.searchParams.set('slippageBps', String(Math.min(5000, Math.max(1, slippageBps))));
  url.searchParams.set('swapMode', 'ExactIn');
  url.searchParams.set('onlyDirectRoutes', 'false');
  url.searchParams.set('asLegacyTransaction', 'false');

  try {
    const res = await fetchWithTimeout(url.toString());
    const data = (await res.json()) as JupiterQuote;
    if (!res.ok || data.error) return null;
    if (typeof data.outAmount !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

export async function getJupiterSwapTransaction(params: {
  quoteResponse: JupiterQuote;
  userPublicKey: string;
}): Promise<{ swapTransaction?: string; error?: string }> {
  const res = await fetchWithTimeout('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  return res.json() as Promise<{ swapTransaction?: string; error?: string }>;
}

/** Jupiter returns human-readable percent string, e.g. "0.05" = 0.05%. */
export function formatPriceImpactPct(pct: string | undefined): string {
  if (pct == null || pct === '') return '—';
  const n = Number(pct);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}
