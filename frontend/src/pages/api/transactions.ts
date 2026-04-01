/**
 * GET /api/transactions?projectId=oracle-data&wallet=xxx&limit=50
 *
 * Returns ICO buy/sell transactions stored in the in-memory store.
 *
 * Query params (all optional):
 *   projectId  – filter by project
 *   wallet     – filter by buyer/seller address
 *   type       – "buy" | "sell"
 *   limit      – max records (default 50, max 200)
 *
 * Returns:
 *   { transactions: TxRecord[], total: number }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { store } from '../../lib/icoStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const {
    projectId,
    wallet,
    type,
    limit: limitStr = '50',
  } = req.query as { projectId?: string; wallet?: string; type?: string; limit?: string };

  const limit = Math.min(200, parseInt(limitStr, 10) || 50);

  let txs = [...store.transactions].reverse(); // newest first

  if (projectId) txs = txs.filter(t => t.projectId === projectId);
  if (wallet)    txs = txs.filter(t => t.wallet === wallet);
  if (type === 'buy' || type === 'sell') txs = txs.filter(t => t.type === type);

  const total = txs.length;
  txs = txs.slice(0, limit);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ transactions: txs, total });
}