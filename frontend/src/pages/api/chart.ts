/**
 * GET /api/chart?projectId=oracle-data&period=24h
 *
 * Returns price history for the chart widget.
 *
 * Query params:
 *   projectId  – required
 *   period     – "1h" | "24h" | "7d" | "all"  (default: "24h")
 *
 * Returns:
 *   {
 *     projectId,
 *     currentPrice,
 *     change24h,      // percentage
 *     points: [{ timestamp, price, volume }]
 *   }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { store, currentPrice } from '../../lib/icoStore';

const PERIOD_MS: Record<string, number> = {
  '1h':  1 * 60 * 60 * 1_000,
  '24h': 24 * 60 * 60 * 1_000,
  '7d':  7 * 24 * 60 * 60 * 1_000,
  'all': Infinity,
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { projectId, period = '24h' } = req.query as { projectId?: string; period?: string };
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });

  const project = store.projects.get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const history = store.priceHistory.get(projectId) ?? [];
  const cutoff = Date.now() - (PERIOD_MS[period] ?? PERIOD_MS['24h']);
  const points = history.filter(p => p.timestamp >= cutoff);

  const price = currentPrice(projectId);

  // 24-h change
  const dayAgo = Date.now() - PERIOD_MS['24h'];
  const dayAgoPoint = history.filter(p => p.timestamp <= dayAgo).at(-1);
  const change24h = dayAgoPoint
    ? ((price - dayAgoPoint.price) / dayAgoPoint.price) * 100
    : 0;

  // Cache for 10 seconds
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate');
  return res.status(200).json({
    projectId,
    currentPrice: price,
    change24h: parseFloat(change24h.toFixed(2)),
    mintAddress: project.mintAddress,
    raisedSol: project.raisedSol,
    soldTokens: project.soldTokens,
    totalTokens: project.totalTokens,
    points,
  });
}