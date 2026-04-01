/**
 * POST /api/create-token
 *
 * Creates a real SPL token on Solana Devnet for an ICO project.
 * The mint authority private key NEVER leaves this file / server.
 *
 * Body: { projectId: string }
 * Returns: { mintAddress: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  createMint,
  getMint,
} from '@solana/spl-token';
import { store } from '../../lib/icoStore';

// ─── Load mint-authority keypair from .env ────────────────────────────────────
function getMintAuthority(): Keypair {
  const raw = process.env.MINT_AUTHORITY_PRIVATE_KEY;
  if (!raw) throw new Error('MINT_AUTHORITY_PRIVATE_KEY is not set in .env');
  // Accept either JSON array "[1,2,3…]" or base58 string
  try {
    const parsed = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    // Try base58
    const bs58 = require('bs58');
    return Keypair.fromSecretKey(bs58.decode(raw));
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { projectId } = req.body as { projectId?: string };
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });

  const project = store.projects.get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // If already created, return existing mint
  if (project.mintAddress) {
    return res.status(200).json({ mintAddress: project.mintAddress });
  }

  try {
    const connection = new Connection(
      process.env.SOLANA_RPC_URL ?? clusterApiUrl('devnet'),
      'confirmed'
    );
    const authority = getMintAuthority();

    const mintKeypair = Keypair.generate();

    const mintAddress = await createMint(
      connection,
      authority,          // fee payer (must have SOL)
      authority.publicKey, // mint authority
      authority.publicKey, // freeze authority (can be null)
      project.decimals,
      mintKeypair
    );

    // Persist
    project.mintAddress = mintAddress.toBase58();
    store.projects.set(projectId, project);

    console.log(`[create-token] ${projectId} → mint ${mintAddress.toBase58()}`);
    return res.status(200).json({ mintAddress: mintAddress.toBase58() });
  } catch (err: any) {
    console.error('[create-token] error:', err);
    return res.status(500).json({ error: err.message ?? 'Internal error' });
  }
}