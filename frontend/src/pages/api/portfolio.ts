/**
 * GET /api/portfolio?wallet=xxx
 *
 * Returns the user's actual SPL token balances for all ICO projects,
 * along with calculated USD values and P&L.
 *
 * Query params:
 *   wallet – required, base58 public key
 *
 * Returns:
 *   {
 *     wallet,
 *     positions: [{
 *       projectId, ticker, mintAddress,
 *       balance,           // human-readable token balance
 *       currentPrice,      // SOL per token (bonding curve)
 *       solValue,          // balance * currentPrice
 *       avgCostBasis,      // SOL per token (from tx history)
 *       pnlSol,
 *       pnlPct,
 *     }]
 *   }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { store, currentPrice } from '../../lib/icoStore';

// Map projectId → ticker (mirrors frontend PROJECTS data)
const TICKERS: Record<string, string> = {
  'oracle-data': 'ODN',
  'green-chain': 'GCP',
  'ai-compute':  'NMA',
  'reit-sol':    'SREIT',
  'depin-mesh':  'MESH',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { wallet } = req.query as { wallet?: string };
  if (!wallet) return res.status(400).json({ error: 'wallet is required' });

  let walletPubkey: PublicKey;
  try {
    walletPubkey = new PublicKey(wallet);
  } catch {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  const connection = new Connection(
    process.env.SOLANA_RPC_URL ?? clusterApiUrl('devnet'),
    'confirmed'
  );

  const positions: any[] = [];

  for (const [projectId, project] of store.projects) {
    if (!project.mintAddress) continue;

    const mintPubkey = new PublicKey(project.mintAddress);
    const ataAddress = getAssociatedTokenAddressSync(mintPubkey, walletPubkey);

    let balance = 0;
    try {
      const ataAccount = await getAccount(connection, ataAddress);
      balance = Number(ataAccount.amount) / Math.pow(10, project.decimals);
    } catch {
      // Account doesn't exist → balance 0
    }

    if (balance === 0) continue;

    const price = currentPrice(projectId);
    const solValue = balance * price;

    // Compute average cost basis from stored buy transactions
    const buyTxs = store.transactions.filter(
      t => t.projectId === projectId && t.wallet === wallet && t.type === 'buy'
    );
    const totalSpent = buyTxs.reduce((s, t) => s + t.solAmount, 0);
    const totalBought = buyTxs.reduce((s, t) => s + t.tokenAmount, 0);
    const avgCost = totalBought > 0 ? totalSpent / totalBought : project.basePrice;
    const pnlSol = (price - avgCost) * balance;
    const pnlPct = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;

    positions.push({
      projectId,
      ticker: TICKERS[projectId] ?? projectId,
      mintAddress: project.mintAddress,
      balance,
      currentPrice: price,
      solValue,
      avgCostBasis: parseFloat(avgCost.toFixed(6)),
      pnlSol: parseFloat(pnlSol.toFixed(6)),
      pnlPct: parseFloat(pnlPct.toFixed(2)),
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ wallet, positions });
}