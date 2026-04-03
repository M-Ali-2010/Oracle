/** Detect whether the RPC endpoint targets Solana mainnet-beta. */
export function isMainnetRpc(endpoint: string): boolean {
  const u = endpoint.toLowerCase();
  if (u.includes('devnet') || u.includes('testnet')) return false;
  if (u.includes('localhost') || u.includes('127.0.0.1')) return false;
  if (u.includes('mainnet') || u.includes('api.mainnet-beta.solana.com')) return true;
  return true;
}

export function solscanClusterQuery(endpoint: string): string {
  return isMainnetRpc(endpoint) ? '' : '?cluster=devnet';
}
