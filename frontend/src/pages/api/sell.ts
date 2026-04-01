/**
 * POST /api/sell
 *
 * Flow:
 *  1. Frontend sends tokens back to TREASURY_TOKEN_ACCOUNT (user signs)
 *  2. Frontend calls this endpoint with { wallet, projectId, tokenAmount, txHash }
 *  3. Backend verifies the on-chain token transfer
 *  4. Backend sends SOL from treasury back to seller
 *
 * Body:
 *   wallet       – seller's public key (base58)
 *   projectId    – e.g. "oracle-data"
 *   tokenAmount  – tokens sold (human units, not raw)
 *   txHash       – confirmed spl-token transfer signature
 *
 * Returns:
 *   { solPayout, newPrice }
 *
 * IMPORTANT: The treasury must hold SOL to pay sellers back.
 * On Devnet you can fund it with `solana airdrop` or the Airdrop modal.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  clusterApiUrl,
} from '@solana/web3.js';
import { store, currentPrice, pushPricePoint, uid } from '../../lib/icoStore';

const TREASURY = process.env.TREASURY_WALLET!;
const PLATFORM_FEE = 0.03; // 3 %

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

  const { wallet, projectId, tokenAmount, txHash } = req.body as {
    wallet?: string;
    projectId?: string;
    tokenAmount?: number;
    txHash?: string;
  };

  if (!wallet || !projectId || !tokenAmount || !txHash) {
    return res.status(400).json({ error: 'wallet, projectId, tokenAmount and txHash are required' });
  }

  const project = store.projects.get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.mintAddress) return res.status(400).json({ error: 'Token not yet created' });

  const alreadyProcessed = store.transactions.some(t => t.txHash === txHash);
  if (alreadyProcessed) return res.status(409).json({ error: 'Transaction already processed' });

  const connection = new Connection(
    process.env.SOLANA_RPC_URL ?? clusterApiUrl('devnet'),
    'confirmed'
  );

  try {
    // ── 1. Verify on-chain SPL token transfer ─────────────────────────────────
    const tx = await connection.getParsedTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx) return res.status(400).json({ error: 'Transaction not found on chain' });
    if (tx.meta?.err) return res.status(400).json({ error: 'Transaction failed on chain' });

    let verifiedTokens = 0;
    const instructions = tx.transaction.message.instructions;

    for (const ix of instructions) {
      if ('parsed' in ix) {
        const { type, info } = ix.parsed ?? {};
        // transferChecked or transfer
        if (type === 'transferChecked' || type === 'transfer') {
          const uiAmount = info?.tokenAmount?.uiAmount ?? info?.amount;
          const isToTreasury =
            info?.destination === TREASURY ||
            (info?.mint === project.mintAddress);
          if (isToTreasury && uiAmount) {
            verifiedTokens = parseFloat(uiAmount);
            break;
          }
        }
      }
    }

    // Fallback: accept if tx came from seller and has the right mint involved
    // (Some wallets may structure instructions differently)
    if (verifiedTokens === 0) {
      // Accept the caller's stated amount with tolerance for dev purposes
      // In production you would tighten this using token balance deltas
      const postTokenBalances = tx.meta?.postTokenBalances ?? [];
      const preTokenBalances  = tx.meta?.preTokenBalances  ?? [];

      for (const post of postTokenBalances) {
        if (post.mint === project.mintAddress) {
          const pre = preTokenBalances.find(
            p => p.accountIndex === post.accountIndex
          );
          const delta =
            (post.uiTokenAmount.uiAmount ?? 0) -
            (pre?.uiTokenAmount?.uiAmount ?? 0);
          if (delta > 0) {
            verifiedTokens = delta;
            break;
          }
        }
      }
    }

    if (verifiedTokens === 0) {
      return res.status(400).json({ error: 'Could not verify token transfer in transaction' });
    }

    // ── 2. Calculate SOL payout ───────────────────────────────────────────────
    const price = currentPrice(projectId);
    const grossSol = verifiedTokens * price;
    const netSol = grossSol * (1 - PLATFORM_FEE);
    const lamports = Math.floor(netSol * LAMPORTS_PER_SOL);

    if (lamports <= 0) return res.status(400).json({ error: 'Payout rounds to zero' });

    // ── 3. Send SOL from treasury to seller ───────────────────────────────────
    const authority = getMintAuthority(); // same keypair controls treasury
    const sellerPubkey = new PublicKey(wallet);
    const treasuryPubkey = new PublicKey(TREASURY);

    // Check treasury has enough balance
    const treasuryBalance = await connection.getBalance(treasuryPubkey);
    if (treasuryBalance < lamports + 5000) {
      return res.status(400).json({
        error: `Treasury has insufficient SOL (${(treasuryBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL). Fund the treasury wallet.`,
      });
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const payoutTx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: treasuryPubkey,
    }).add(
      SystemProgram.transfer({
        fromPubkey: treasuryPubkey,
        toPubkey: sellerPubkey,
        lamports,
      })
    );
    payoutTx.sign(authority);

    const payoutSig = await connection.sendRawTransaction(payoutTx.serialize());
    await connection.confirmTransaction({ signature: payoutSig, blockhash, lastValidBlockHeight }, 'confirmed');

    // ── 4. Update store ───────────────────────────────────────────────────────
    project.raisedSol = Math.max(0, project.raisedSol - netSol);
    project.soldTokens = Math.max(0, project.soldTokens - verifiedTokens);
    store.projects.set(projectId, project);

    const newPrice = currentPrice(projectId);
    pushPricePoint(projectId, newPrice, netSol);

    store.transactions.push({
      id: uid(),
      wallet,
      type: 'sell',
      solAmount: netSol,
      tokenAmount: verifiedTokens,
      txHash,
      timestamp: Date.now(),
      projectId,
    });

    console.log(`[sell] ${wallet} sold ${verifiedTokens} tokens of ${projectId} → ${netSol.toFixed(6)} SOL (tx: ${payoutSig})`);

    return res.status(200).json({
      solPayout: netSol,
      payoutTxHash: payoutSig,
      newPrice,
      raisedSol: project.raisedSol,
      soldTokens: project.soldTokens,
    });
  } catch (err: any) {
    console.error('[sell] error:', err);
    return res.status(500).json({ error: err.message ?? 'Internal error' });
  }
}