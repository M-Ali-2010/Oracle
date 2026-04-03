'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, Transaction } from '@solana/web3.js';
import { notify } from '../utils/notifications';
import { ModalBackdrop } from './ModalBackdrop';
import {
  buildMintAndSupplyTransaction,
  buildMetadataTransaction,
  buildRevokeMintAuthorityTransaction,
  finalizeMetadataTransaction,
} from '../lib/solana/createSPLToken';
import { isMainnetRpc, solscanClusterQuery } from '../lib/solana/cluster';

const glassInput =
  'bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/20 focus:border-white/20 focus:outline-none';

function humanSupplyToRaw(supplyStr: string, decimals: number): bigint {
  const cleaned = supplyStr.replace(/,/g, '').trim();
  if (!/^\d+$/.test(cleaned)) throw new Error('Supply must be a positive whole number');
  const base = BigInt(cleaned);
  if (base <= BigInt(0)) throw new Error('Invalid supply');
  return base * BigInt(10) ** BigInt(decimals);
}

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

const STEPS = ['Basics', 'Details', 'Brand', 'Review', 'Launch'];

const CreateTokenLaunchpad: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [stepIdx, setStepIdx] = useState(0);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [supply, setSupply] = useState('1000000');
  const [decimals, setDecimals] = useState(9);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [metaWarning, setMetaWarning] = useState<string | null>(null);

  const endpoint = connection.rpcEndpoint;
  const clusterQs = useMemo(() => solscanClusterQuery(endpoint), [endpoint]);

  const appendLog = useCallback((line: string) => {
    setLogLines((prev) => [`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${line}`, ...prev].slice(0, 12));
  }, []);

  const canNext = useMemo(() => {
    if (stepIdx === 0) return name.trim().length >= 2 && symbol.trim().length >= 2;
    if (stepIdx === 1) {
      try {
        humanSupplyToRaw(supply, decimals);
        return true;
      } catch {
        return false;
      }
    }
    if (stepIdx === 2) return true;
    if (stepIdx === 3) return true;
    return true;
  }, [stepIdx, name, symbol, supply, decimals]);

  const onPickImage = (f: File | null) => {
    setImageFile(f);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (f) setImagePreview(URL.createObjectURL(f));
    else setImagePreview(null);
  };

  const deploy = async () => {
    if (!publicKey) {
      notify({ type: 'error', message: 'Connect your wallet' });
      return;
    }
    setBusy(true);
    setLogLines([]);
    setMetaWarning(null);
    const mintKeypair = Keypair.generate();

    try {
      let metadataUri = '';
      if (imageFile) {
        const b64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => {
            const s = String(r.result ?? '');
            const i = s.indexOf('base64,');
            resolve(i >= 0 ? s.slice(i + 7) : '');
          };
          r.onerror = () => reject(new Error('read failed'));
          r.readAsDataURL(imageFile);
        });
        appendLog('Uploading metadata to IPFS…');
        const res = await fetch('/api/token-metadata-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            symbol: symbol.trim().toUpperCase().slice(0, 10),
            description: description.trim(),
            imageBase64: b64,
            imageMime: imageFile.type || 'image/png',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMetaWarning(data.error ?? 'Metadata upload unavailable; continuing without rich metadata.');
          metadataUri = '';
        } else {
          metadataUri = data.uri as string;
          appendLog('Metadata URI ready.');
        }
      } else {
        const res = await fetch('/api/token-metadata-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            symbol: symbol.trim().toUpperCase().slice(0, 10),
            description: description.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMetaWarning(data.error ?? 'Set NFT_STORAGE_TOKEN for token name/logo on explorers.');
          metadataUri = '';
        } else {
          metadataUri = data.uri as string;
        }
      }

      const supplyRaw = humanSupplyToRaw(supply, decimals);
      const baseParams = {
        connection,
        payer: publicKey,
        mintKeypair,
        decimals,
        supplyRaw,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
      };

      appendLog('Creating mint and minting supply…');
      const tx1 = await buildMintAndSupplyTransaction(baseParams);
      const sig1 = await sendTransaction(tx1, connection, { signers: [mintKeypair] });
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig1, ...bh }, 'confirmed');
      appendLog(`Mint tx: ${sig1}`);
      setLastSig(sig1);

      const hasMeta = Boolean(
        metadataUri && (/^https?:\/\//i.test(metadataUri) || /^ipfs:\/\//i.test(metadataUri))
      );
      if (hasMeta) {
        appendLog('Creating Metaplex metadata + revoking mint…');
        const tx2 = buildMetadataTransaction({
          ...baseParams,
          metadataUri,
          revokeMintAuthority: true,
        });
        await finalizeMetadataTransaction(connection, tx2, publicKey);
        const sig2 = await sendTransaction(tx2, connection);
        const bh2 = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature: sig2, ...bh2 }, 'confirmed');
        appendLog(`Metadata tx: ${sig2}`);
      } else {
        appendLog('Revoking mint authority (fixed supply)…');
        const tx2 = await buildRevokeMintAuthorityTransaction(connection, mintKeypair.publicKey, publicKey);
        const sig2 = await sendTransaction(tx2, connection);
        const bh2 = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature: sig2, ...bh2 }, 'confirmed');
        appendLog(`Revoke tx: ${sig2}`);
      }

      setMintAddress(mintKeypair.publicKey.toBase58());
      notify({ type: 'success', message: 'Token created', txid: sig1 });
      setStepIdx(4);
    } catch (e: unknown) {
      appendLog(e instanceof Error ? e.message : 'Error');
      notify({ type: 'error', message: e instanceof Error ? e.message : 'Deployment failed' });
    } finally {
      setBusy(false);
    }
  };

  const explorerToken = mintAddress ? `https://solscan.io/token/${mintAddress}${clusterQs}` : null;
  const explorerTx = lastSig ? `https://solscan.io/tx/${lastSig}${clusterQs}` : null;

  return (
    <ModalBackdrop onClose={onClose} accentColor="#f97316">
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-white">Launch token</div>
            <div className="text-[10px] text-white/30 mt-0.5">SPL mint · Metaplex metadata · {isMainnetRpc(endpoint) ? 'Mainnet' : 'Devnet'}</div>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        <div className="flex gap-1">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1 text-center">
              <div
                className="h-1 rounded-full mb-1 transition-all"
                style={{
                  background: i <= stepIdx ? 'linear-gradient(90deg, #f97316, #ea580c)' : 'rgba(255,255,255,0.06)',
                }}
              />
              <div className={`text-[9px] font-semibold ${i === stepIdx ? 'text-orange-400' : 'text-white/20'}`}>{label}</div>
            </div>
          ))}
        </div>

        {stepIdx === 0 && (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">Name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 32))}
                placeholder="e.g. Acme Coin"
                className={`w-full rounded-xl px-4 py-3 text-sm ${glassInput}`}
              />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">Symbol</div>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                placeholder="e.g. ACME"
                className={`w-full rounded-xl px-4 py-3 text-sm ${glassInput}`}
              />
            </div>
          </div>
        )}

        {stepIdx === 1 && (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">Decimals</div>
              <select
                value={decimals}
                onChange={(e) => setDecimals(Number(e.target.value))}
                className={`w-full rounded-xl px-4 py-3 text-sm ${glassInput}`}
              >
                {[0, 6, 9].map((d) => (
                  <option key={d} value={d} className="bg-[#0d1117]">
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">Total supply (whole tokens)</div>
              <input
                value={supply}
                onChange={(e) => setSupply(e.target.value.replace(/\D/g, ''))}
                placeholder="1000000"
                className={`w-full rounded-xl px-4 py-3 text-sm tabular-nums ${glassInput}`}
              />
              <p className="text-[10px] text-white/20 mt-1">
                Raw amount:{' '}
                {(() => {
                  try {
                    return humanSupplyToRaw(supply || '0', decimals).toLocaleString('en-US');
                  } catch {
                    return '—';
                  }
                })()}
              </p>
            </div>
          </div>
        )}

        {stepIdx === 2 && (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">Description</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="Tell the world about your project…"
                rows={4}
                className={`w-full rounded-xl px-4 py-3 text-sm resize-none ${glassInput}`}
              />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">Logo</div>
              <label
                className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-8 cursor-pointer hover:border-orange-500/30 transition"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0] ?? null)} />
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="" className="h-20 w-20 rounded-2xl object-cover" />
                ) : (
                  <span className="text-xs text-white/30">PNG / JPG / WebP · optional</span>
                )}
              </label>
              <p className="text-[10px] text-white/20 mt-2">
                Rich metadata requires <code className="text-[10px]">NFT_STORAGE_TOKEN</code> on the server (see /api/token-metadata-upload).
              </p>
            </div>
          </div>
        )}

        {stepIdx === 3 && (
          <div
            className="rounded-2xl p-4 space-y-2 text-sm"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {[
              ['Name', name],
              ['Symbol', symbol],
              ['Decimals', String(decimals)],
              ['Supply', Number(supply).toLocaleString('en-US')],
              ['Description', description || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <span className="text-white/30">{k}</span>
                <span className="text-white font-medium text-right break-all">{v}</span>
              </div>
            ))}
          </div>
        )}

        {stepIdx === 4 && mintAddress && (
          <div className="space-y-3">
            <div className="text-center py-2">
              <div className="text-2xl mb-2">🎉</div>
              <div className="text-lg font-bold text-white">Deployed</div>
              <div className="text-xs text-white/30 mt-1">Mint (SPL)</div>
            </div>
            <div
              className="rounded-xl p-4 font-mono text-xs break-all text-emerald-400/90"
              style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}
            >
              {mintAddress}
            </div>
            {metaWarning && (
              <div className="text-[10px] text-amber-300/90 px-2" style={{ background: 'rgba(251,191,36,0.06)' }}>
                {metaWarning}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {explorerToken && (
                <a
                  href={explorerToken}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl py-2.5 text-center text-xs font-semibold text-emerald-400"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.18)' }}
                >
                  View token on Solscan ↗
                </a>
              )}
              {explorerTx && (
                <a
                  href={explorerTx}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl py-2.5 text-center text-xs font-semibold text-white/50 hover:text-white/80"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  First transaction ↗
                </a>
              )}
            </div>
            {logLines.length > 0 && (
              <div className="rounded-xl p-3 max-h-28 overflow-y-auto text-[10px] font-mono text-white/35 space-y-0.5" style={{ background: 'rgba(0,0,0,0.35)' }}>
                {logLines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {stepIdx < 4 && (
          <div className="flex gap-2 pt-1">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((s) => s - 1)}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white/50"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                Back
              </button>
            )}
            {stepIdx < 3 ? (
              <button
                type="button"
                disabled={!canNext}
                onClick={() => setStepIdx((s) => s + 1)}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.8), rgba(234,88,12,0.7))', border: '1px solid rgba(249,115,22,0.45)' }}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !publicKey}
                onClick={() => void deploy()}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.9), rgba(234,88,12,0.85))', border: '1px solid rgba(249,115,22,0.5)' }}
              >
                {busy ? 'Signing…' : 'Deploy on-chain'}
              </button>
            )}
          </div>
        )}

        {stepIdx === 4 && (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl py-3 text-sm font-bold text-white"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Close
          </button>
        )}

        {!publicKey && stepIdx < 4 && (
          <p className="text-[10px] text-center text-amber-400/80">Connect a wallet to deploy</p>
        )}
      </div>
    </ModalBackdrop>
  );
};

export default CreateTokenLaunchpad;
