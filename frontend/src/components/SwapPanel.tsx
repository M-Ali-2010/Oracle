'use client';

import {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import useUserSOLBalanceStore from '../stores/useUserSOLBalanceStore';
import { notify } from '../utils/notifications';
import { ModalBackdrop } from './ModalBackdrop';
import {
  SOL_MINT,
  fetchJupiterTokenList,
  getJupiterQuote,
  getJupiterSwapTransaction,
  formatPriceImpactPct,
  JupiterToken,
  JupiterQuote,
} from '../lib/jupiter';
import { isMainnetRpc, solscanClusterQuery } from '../lib/solana/cluster';

const glassInput =
  'bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/20 focus:border-white/20 focus:outline-none';

const Spinner: FC<{ size?: number }> = ({ size = 14 }) => (
  <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
  </svg>
);

const CloseBtn: FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="grid h-8 w-8 place-items-center rounded-xl transition"
    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
  >
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-white/40">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  </button>
);

type Phase = 'idle' | 'quoting' | 'signing' | 'confirming' | 'done' | 'error';

const SwapPanel: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { getUserSOLBalance } = useUserSOLBalanceStore();

  const endpoint = connection.rpcEndpoint;
  const mainnet = useMemo(() => isMainnetRpc(endpoint), [endpoint]);

  const [tokens, setTokens] = useState<JupiterToken[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [outMint, setOutMint] = useState<JupiterToken | null>(null);
  const [inAmount, setInAmount] = useState('');
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [slippageBps, setSlippageBps] = useState(50);
  const [showSlippage, setShowSlippage] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'swap'>('select');
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    fetchJupiterTokenList()
      .then((list) => {
        if (!cancelled) {
          setTokens(list);
          setListLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setListError('Could not load token list');
          setListLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return tokens.slice(0, 100);
    const q = search.toLowerCase();
    return tokens.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)).slice(0, 80);
  }, [tokens, search]);

  const solBalance = useUserSOLBalanceStore((s) => s.balance);

  const [outBal, setOutBal] = useState<number | null>(null);
  useEffect(() => {
    if (!publicKey || !outMint || !mainnet) {
      setOutBal(null);
      return;
    }
    let c = false;
    (async () => {
      try {
        const ata = await getAssociatedTokenAddress(new PublicKey(outMint.address), publicKey);
        const b = await connection.getTokenAccountBalance(ata);
        if (!c) setOutBal(Number(b.value.amount) / 10 ** b.value.decimals);
      } catch {
        if (!c) setOutBal(0);
      }
    })();
    return () => {
      c = true;
    };
  }, [connection, publicKey, outMint, mainnet, lastSig]);

  useEffect(() => {
    if (!mainnet || !outMint || !inAmount) {
      setQuote(null);
      return;
    }
    const n = Number.parseFloat(inAmount);
    if (!Number.isFinite(n) || n <= 0) {
      setQuote(null);
      return;
    }
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      setQuoting(true);
      setPhase('quoting');
      try {
        const lamports = BigInt(Math.round(n * LAMPORTS_PER_SOL));
        const q = await getJupiterQuote({
          inputMint: SOL_MINT,
          outputMint: outMint.address,
          amountLamports: lamports,
          slippageBps,
        });
        setQuote(q);
        setPhase('idle');
      } catch {
        setQuote(null);
        setPhase('idle');
      } finally {
        setQuoting(false);
      }
    }, 450);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
  }, [mainnet, outMint, inAmount, slippageBps]);

  const outAmountFmt = useMemo(() => {
    if (!quote || !outMint || typeof quote.outAmount !== 'string') return null;
    const v = Number(quote.outAmount) / 10 ** outMint.decimals;
    return v.toLocaleString('en-US', { maximumFractionDigits: 8 });
  }, [quote, outMint]);

  const onSwap = useCallback(async () => {
    if (!mainnet || !publicKey || !quote || !outMint) return;
    setPhase('signing');
    try {
      const { swapTransaction, error } = await getJupiterSwapTransaction({
        quoteResponse: quote,
        userPublicKey: publicKey.toBase58(),
      });
      if (error || !swapTransaction) throw new Error(error || 'No swap transaction');
      const tx = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(swapTransaction, 'base64')));
      setPhase('confirming');
      const sig = await sendTransaction(tx, connection, {
        skipPreflight: false,
        maxRetries: 5,
      });
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
      setLastSig(sig);
      setPhase('done');
      notify({
        type: 'success',
        message: `Swapped ${inAmount} SOL → ${outAmountFmt ?? ''} ${outMint.symbol}`,
        txid: sig,
      });
      getUserSOLBalance(publicKey, connection);
    } catch (e: unknown) {
      setPhase('idle');
      notify({ type: 'error', message: e instanceof Error ? e.message : 'Swap failed' });
    }
  }, [
    mainnet,
    publicKey,
    quote,
    outMint,
    connection,
    sendTransaction,
    getUserSOLBalance,
    inAmount,
    outAmountFmt,
  ]);

  const explorerTx = lastSig
    ? `https://solscan.io/tx/${lastSig}${solscanClusterQuery(endpoint)}`
    : null;

  if (!mainnet) {
    return (
      <ModalBackdrop onClose={onClose} accentColor="#f59e0b">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-white">Swap</div>
              <div className="text-[10px] text-white/30 mt-0.5">Jupiter aggregator</div>
            </div>
            <CloseBtn onClose={onClose} />
          </div>
          <div
            className="rounded-2xl p-4 text-sm text-amber-200/90"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}
          >
            Jupiter routes run on <strong className="text-white">Solana Mainnet</strong>. Switch your wallet network to
            Mainnet, or set <code className="text-xs">NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta</code> and{' '}
            <code className="text-xs">NEXT_PUBLIC_SOLANA_RPC_URL</code> to a mainnet RPC.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl py-3 text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}
          >
            Close
          </button>
        </div>
      </ModalBackdrop>
    );
  }

  return (
    <ModalBackdrop onClose={onClose} accentColor="#f59e0b">
      <div className="flex items-center justify-between p-6 pb-4">
        <div>
          <div className="text-lg font-bold text-white">{step === 'select' ? 'Select token' : 'Swap'}</div>
          <div className="text-[10px] text-white/30 mt-0.5">Jupiter · prices update live</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSlippage((s) => !s)}
            className="rounded-lg px-2 py-1 text-[10px] font-bold text-white/40 hover:text-white/70"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Slippage {(slippageBps / 100).toLocaleString('en-US', { minimumFractionDigits: 1 })}%
          </button>
          {step === 'swap' && (
            <button
              type="button"
              onClick={() => {
                setStep('select');
                setQuote(null);
              }}
              className="grid h-8 w-8 place-items-center rounded-xl text-white/30 hover:text-white transition"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <CloseBtn onClick={onClose} />
        </div>
      </div>

      {showSlippage && step === 'swap' && (
        <div className="px-6 pb-3 flex flex-wrap gap-2">
          {[25, 50, 100, 200].map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setSlippageBps(b)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold transition"
              style={{
                background: slippageBps === b ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${slippageBps === b ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.06)'}`,
                color: slippageBps === b ? '#fbbf24' : 'rgba(255,255,255,0.4)',
              }}
            >
              {(b / 100).toLocaleString('en-US')}%
            </button>
          ))}
        </div>
      )}

      {step === 'select' ? (
        <div className="flex flex-col px-6 pb-6 gap-3" style={{ maxHeight: '60vh' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or symbol…"
            className={`w-full rounded-xl px-4 py-3 text-sm ${glassInput}`}
          />
          {listLoading && (
            <div className="py-8 flex flex-col items-center gap-2 text-xs text-white/30">
              <Spinner />
              Loading tokens…
            </div>
          )}
          {listError && !listLoading && (
            <div className="rounded-xl px-3 py-2 text-xs text-red-300" style={{ background: 'rgba(239,68,68,0.08)' }}>
              {listError}
            </div>
          )}
          <div className="overflow-y-auto space-y-px" style={{ maxHeight: '45vh' }}>
            {!listLoading &&
              filtered.map((t) => (
                <button
                  key={t.address}
                  type="button"
                  onClick={() => {
                    setOutMint(t);
                    setStep('swap');
                  }}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
                >
                  {t.logoURI ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.logoURI}
                      alt=""
                      width={32}
                      height={32}
                      className="rounded-full flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div
                      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-xs font-bold text-amber-400"
                      style={{ background: 'rgba(251,191,36,0.1)' }}
                    >
                      {t.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{t.symbol}</div>
                    <div className="truncate text-xs text-white/30">{t.name}</div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      ) : (
        outMint && (
          <div className="px-6 pb-6 space-y-3">
            <div className="flex justify-between text-[10px] text-white/30 px-1">
              <span>Balance</span>
              <span className="tabular-nums text-white/50">
                {publicKey ? `${solBalance.toLocaleString('en-US', { maximumFractionDigits: 6 })} SOL` : '—'}
              </span>
            </div>
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div
                className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full font-bold text-violet-400 text-xs"
                style={{ background: 'rgba(139,92,246,0.15)' }}
              >
                ◎
              </div>
              <div className="flex-1 text-sm font-semibold text-white">SOL</div>
              <input
                value={inAmount}
                onChange={(e) => setInAmount(e.target.value)}
                placeholder="0.00"
                type="text"
                inputMode="decimal"
                className="w-28 bg-transparent text-right text-sm font-bold text-white placeholder-white/20 outline-none tabular-nums"
              />
            </div>
            <div className="flex justify-center">
              <div
                className="grid h-8 w-8 place-items-center rounded-xl"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-amber-400">
                  <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {outMint.logoURI ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={outMint.logoURI} alt="" width={36} height={36} className="rounded-full flex-shrink-0" />
              ) : (
                <div
                  className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-xs font-bold text-amber-400"
                  style={{ background: 'rgba(251,191,36,0.1)' }}
                >
                  {outMint.symbol.slice(0, 2)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">{outMint.symbol}</div>
                <div className="text-[10px] text-white/25 truncate">{outMint.name}</div>
              </div>
              <div className="w-32 text-right text-sm font-bold tabular-nums" style={{ color: outAmountFmt ? '#fbbf24' : 'rgba(255,255,255,0.2)' }}>
                {quoting ? (
                  <span className="flex justify-end">
                    <Spinner />
                  </span>
                ) : (
                  outAmountFmt ?? '—'
                )}
              </div>
            </div>
            {outBal !== null && (
              <div className="text-[10px] text-right text-white/25 px-1">
                Wallet: {outBal.toLocaleString('en-US', { maximumFractionDigits: 6 })} {outMint.symbol}
              </div>
            )}

            {quote && !quoting && (
              <div
                className="rounded-xl px-4 py-3 text-xs space-y-1.5"
                style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)' }}
              >
                <div className="flex justify-between text-white/30">
                  <span>Route</span>
                  <span className="text-amber-400/70 truncate ml-2 max-w-[60%] text-right">
                    {(quote.routePlan as JupiterQuote['routePlan'])
                      ?.map((r) => r.swapInfo?.label ?? '')
                      .filter(Boolean)
                      .join(' → ') || 'Best'}
                  </span>
                </div>
                <div className="flex justify-between text-white/30">
                  <span>Price impact</span>
                  <span
                    className={
                      Number(quote.priceImpactPct ?? 0) > 1 ? 'text-red-400' : 'text-emerald-400'
                    }
                  >
                    {formatPriceImpactPct(quote.priceImpactPct as string | undefined)}
                  </span>
                </div>
              </div>
            )}

            {(phase === 'signing' || phase === 'confirming') && (
              <div
                className="rounded-xl px-4 py-3 text-xs text-center"
                style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}
              >
                {phase === 'signing' ? 'Approve in your wallet…' : 'Confirming on-chain…'}
              </div>
            )}

            {phase === 'done' && explorerTx && (
              <a
                href={explorerTx}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl py-2.5 text-center text-xs font-semibold text-emerald-400"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                View transaction on Solscan ↗
              </a>
            )}

            <button
              type="button"
              onClick={() => {
                if (phase === 'done') {
                  onClose();
                  return;
                }
                void onSwap();
              }}
              disabled={
                phase === 'signing' ||
                phase === 'confirming' ||
                (phase !== 'done' && (!publicKey || quoting || !quote || !inAmount))
              }
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all disabled:opacity-30"
              style={{
                background: 'linear-gradient(135deg, #d97706, #b45309)',
                boxShadow: quote && inAmount ? '0 8px 24px rgba(217,119,6,0.35)' : 'none',
              }}
            >
              {!publicKey
                ? 'Connect wallet'
                : phase === 'signing' || phase === 'confirming'
                ? 'Working…'
                : phase === 'done'
                ? 'Done — close'
                : quoting
                ? 'Fetching quote…'
                : !inAmount
                ? 'Enter amount'
                : !quote
                ? 'No route — try another token or amount'
                : `Swap to ${outMint.symbol}`}
            </button>
          </div>
        )
      )}
    </ModalBackdrop>
  );
};

export default SwapPanel;
