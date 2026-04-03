import Link from 'next/link';
import dynamic from 'next/dynamic';
import React, { useState, useEffect } from 'react';
import { useAutoConnect } from '../contexts/AutoConnectProvider';
import { useWallet } from '@solana/wallet-adapter-react';

const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export const AppBar: React.FC = () => {
  const { autoConnect, setAutoConnect } = useAutoConnect();
  const { publicKey } = useWallet();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? 'devnet';
  const isDevnet = network.includes('devnet');
  const walletShort = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full h-14 bg-[#0d1021]/95 backdrop-blur-xl shadow-[0_20px_60px_-40px_rgba(0,0,0,0.8)] border-b border-white/[0.12]">
      <div className="mx-auto flex h-full max-w-2xl items-center justify-between px-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.5), rgba(99,102,241,0.3))', border: '1px solid rgba(139,92,246,0.3)' }}>
            <span className="text-xs font-black text-violet-200">OP</span>
          </div>
          <span className="text-sm font-black text-white">Oracle-Pro</span>
        </Link>

        {/* Center badges */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: isDevnet ? 'rgba(251,191,36,0.1)' : 'rgba(16,185,129,0.1)', color: isDevnet ? '#fbbf24' : '#34d399', border: `1px solid ${isDevnet ? 'rgba(251,191,36,0.2)' : 'rgba(16,185,129,0.2)'}` }}>
            {isDevnet ? '⚡ Devnet' : '🌐 Mainnet'}
          </span>
          {walletShort && (
            <span className="font-mono text-[10px] text-slate-600">{walletShort}</span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {mounted ? (
            <WalletMultiButtonDynamic
              style={{ height: 34, fontSize: 12, paddingLeft: 16, paddingRight: 16,
                background: 'linear-gradient(135deg, rgba(124,58,237,0.9), rgba(79,70,229,0.8))',
                borderRadius: 14, border: 'none' }}
            />
          ) : (
            <div className="h-8 w-28 rounded-xl bg-white/5" />
          )}
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:text-slate-300 transition"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="1.8"/>
            </svg>
          </button>

          {settingsOpen && (
            <div className="absolute right-3 top-16 z-50 rounded-2xl p-4 w-52"
              style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-3">Settings</div>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-400">Auto-connect wallet</span>
                <div
                  onClick={() => setAutoConnect(!autoConnect)}
                  className="relative h-5 w-9 cursor-pointer rounded-full transition-colors"
                  style={{ background: autoConnect ? 'rgba(139,92,246,0.7)' : 'rgba(255,255,255,0.1)' }}>
                  <div className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: autoConnect ? 'translateX(16px)' : 'translateX(2px)' }} />
                </div>
              </label>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
