/**
 * POST /api/buy
 *
 * Flow:
 *  1. Frontend sends SOL → TREASURY_WALLET (signed by user's wallet)
 *  2. Frontend calls this endpoint with { wallet, projectId, solAmount, txHash }
 *  3. Backend verifies the on-chain tx (amount, destination, status)
 *  4. Backend mints tokens to buyer's ATA using the secret mint authority
 *
 * Body:
 *   wallet     – buyer's public key (base58)
 *   projectId  – e.g. "oracle-data"
 *   solAmount  – SOL paid (number)
 *   txHash     – confirmed transaction signature
 *
 * Returns:
 *   { tokenAmount, mintAddress, ata, newPrice }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import { store, currentPrice, pushPricePoint, uid } from '../../lib/icoStore';

const TREASURY = process.env.TREASURY_WALLET!;
const SLIPPAGE_TOLERANCE = 0.01; // 1 % tolerance on SOL amount

function getMintAuthority(): Keypair {
  const raw = process.env.MINT_AUTHORITY_PRIVATE_KEY;
  if (!raw) throw new Error('MINT_AUTHORITY_PRIVATE_KEY is not set in .env');
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    const bs58 = require('bs58');
    return Keypair.fromSecretKey(bs58.decode(raw));
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { wallet, projectId, solAmount, txHash } = req.body as {
    wallet?: string;
    projectId?: string;
    solAmount?: number;
    txHash?: string;
  };

  if (!wallet || !projectId || !solAmount || !txHash) {
    return res.status(400).json({ error: 'wallet, projectId, solAmount and txHash are required' });
  }

  const project = store.projects.get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.mintAddress) return res.status(400).json({ error: 'Token not yet created. Call /api/create-token first.' });

  // Guard: don't process same tx twice
  const alreadyProcessed = store.transactions.some(t => t.txHash === txHash);
  if (alreadyProcessed) return res.status(409).json({ error: 'Transaction already processed' });

  const connection = new Connection(
    process.env.SOLANA_RPC_URL ?? clusterApiUrl('devnet'),
    'confirmed'
  );

  // ── 1. Verify on-chain transaction ────────────────────────────────────────
  try {
    const tx = await connection.getParsedTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx) return res.status(400).json({ error: 'Transaction not found on chain. Wait for confirmation and retry.' });
    if (tx.meta?.err) return res.status(400).json({ error: 'Transaction failed on chain' });

    // Find the SOL transfer instruction to our treasury
    let verified = false;
    let onChainLamports = 0;

    const instructions = tx.transaction.message.instructions;
    for (const ix of instructions) {
      if ('parsed' in ix && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info;
        if (
          info.source === wallet &&
          info.destination === TREASURY
        ) {
          onChainLamports = info.lamports ?? 0;
          verified = true;
          break;
        }
      }
    }

    // Fallback: check balance deltas for treasury account
    if (!verified) {
      const accountKeys = tx.transaction.message.accountKeys;
      const treasuryIdx = accountKeys.findIndex(k => {
        const pk = 'pubkey' in k ? k.pubkey.toBase58() : (k as any).toBase58();
        return pk === TREASURY;
      });
      if (treasuryIdx >= 0 && tx.meta) {
        const delta = tx.meta.postBalances[treasuryIdx] - tx.meta.preBalances[treasuryIdx];
        if (delta > 0) {
          onChainLamports = delta;
          verified = true;
        }
      }
    }

    if (!verified) {
      return res.status(400).json({ error: 'SOL transfer to treasury not found in transaction' });
    }

    const onChainSol = onChainLamports / LAMPORTS_PER_SOL;
    const diff = Math.abs(onChainSol - solAmount) / solAmount;
    if (diff > SLIPPAGE_TOLERANCE) {
      return res.status(400).json({
        error: `Amount mismatch. Expected ≈${solAmount} SOL, found ${onChainSol} SOL on chain`,
      });
    }

    // ── 2. Calculate token amount using current bonding-curve price ──────────
    const price = currentPrice(projectId);      // SOL per token
    const tokenAmount = onChainSol / price;     // raw token count
    const tokenAmountRaw = Math.floor(tokenAmount * Math.pow(10, project.decimals));

    if (tokenAmountRaw <= 0) {
      return res.status(400).json({ error: 'Token amount rounds to zero' });
    }

    // ── 3. Mint tokens to buyer ───────────────────────────────────────────────
    const authority = getMintAuthority();
    const mintPubkey = new PublicKey(project.mintAddress);
    const buyerPubkey = new PublicKey(wallet);

    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,       // fee payer for ATA creation
      mintPubkey,
      buyerPubkey
    );

    await mintTo(
      connection,
      authority,
      mintPubkey,
      ata.address,
      authority,
      tokenAmountRaw
    );

    // ── 4. Update store ───────────────────────────────────────────────────────
    project.raisedSol += onChainSol;
    project.soldTokens += tokenAmount;
    store.projects.set(projectId, project);

    const newPrice = currentPrice(projectId);
    pushPricePoint(projectId, newPrice, onChainSol);

    store.transactions.push({
      id: uid(),
      wallet,
      type: 'buy',
      solAmount: onChainSol,
      tokenAmount,
      txHash,
      timestamp: Date.now(),
      projectId,
    });

    console.log(`[buy] ${wallet} bought ${tokenAmount.toFixed(4)} tokens of ${projectId} for ${onChainSol} SOL`);

    return res.status(200).json({
      tokenAmount,
      tokenAmountFormatted: tokenAmount.toFixed(project.decimals),
      mintAddress: project.mintAddress,
      ata: ata.address.toBase58(),
      newPrice,
      raisedSol: project.raisedSol,
      soldTokens: project.soldTokens,
    });
  } catch (err: any) {
    console.error('[buy] error:', err);
    return res.status(500).json({ error: err.message ?? 'Internal error' });
  }
}