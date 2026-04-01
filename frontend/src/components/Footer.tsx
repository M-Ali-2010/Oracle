import { FC } from 'react';
import Link from 'next/link';

export const Footer: FC = () => {
  return (
    <footer className="mt-auto border-t border-white/8 bg-[#080B12]">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-gradient-to-br from-violet-500/30 to-indigo-500/10 ring-1 ring-white/10">
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-violet-400 to-indigo-400" />
            </span>
            <span className="text-sm font-medium text-slate-400">Oracle-Pro</span>
            <span className="text-slate-700">·</span>
            <span className="text-xs text-slate-600">Solana Wallet Dashboard</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://solana.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-600 transition hover:text-slate-400"
            >
              Solana
            </a>
            <a
              href="https://solscan.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-600 transition hover:text-slate-400"
            >
              Solscan
            </a>
            <a
              href="https://docs.solana.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-600 transition hover:text-slate-400"
            >
              Docs
            </a>
            <span className="text-xs text-slate-700">© 2026</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
