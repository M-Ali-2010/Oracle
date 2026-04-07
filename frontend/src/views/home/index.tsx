/**
 * src/views/home/index.tsx — Premium Web3 Dashboard
 * Upgraded: Modern glassmorphism, Polymarket-style layout, full TypeScript
 */

import { FC, useEffect, useMemo, useState, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
import useUserSOLBalanceStore from '../../stores/useUserSOLBalanceStore';
import useTransactionStore, { TxRecord } from '../../stores/useTransactionStore';
import { notify } from '../../utils/notifications';
import { solscanClusterQuery } from '../../lib/solana/cluster';
import { formatIntEnUS } from '../../utils/formatEnUS';
import {
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import {
  buyToken,
  createUser,
  deposit,
  getDashboard,
  getEvents,
  getFeed,
  getTokens,
  getWalletTransactions,
  MarketEvent,
  MarketToken,
  placeBet,
  sellToken,
} from '../../lib/marketApi';

const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);
const TradingPanel = dynamic(() => import('../../components/TradingPanel'), { ssr: false });
const SwapPanel = dynamic(() => import('../../components/SwapPanel'), { ssr: false });
const CreateTokenLaunchpad = dynamic(() => import('../../components/CreateTokenLaunchpad'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface IcoProject {
  id: string;
  name: string;
  ticker: string;
  logo: string;
  category: string;
  description: string;
  promises: string[];
  goalSol: number;
  raisedSol: number;
  vekselPrice: number;
  totalVeksels: number;
  soldVeksels: number;
  deadline: string;
  apy: number;
  tags: string[];
  accentColor: string;
  status: 'active' | 'completed' | 'upcoming';
  mintAddress?: string | null;
  change24h?: number;
}

interface MyVeksel {
  projectId: string;
  projectName: string;
  ticker: string;
  amount: number;
  pricePaid: number;
  currentPrice: number;
  type: 'spl' | 'nft';
  purchasedAt: number;
  accentColor: string;
  logo: string;
  mintAddress?: string | null;
}

interface ChartPoint {
  timestamp: number;
  price: number;
  volume: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TREASURY = process.env.NEXT_PUBLIC_TREASURY_WALLET ?? 'DVXt9pcAUPNEfFRuiXGxNMFuT7SAabABcxqb7Hn5Y7FE';

const BASE_PROJECTS: IcoProject[] = [
  {
    id: 'oracle-data', name: 'Oracle Data Network', ticker: 'ODN', logo: '🔮',
    category: 'DeFi Infrastructure',
    description: 'Decentralized oracle network for Solana. Real-world data on-chain in milliseconds.',
    promises: ['Mainnet launch Q3 2025', 'Integration with 50+ DeFi protocols', 'Staking 12% APY', 'DAO governance from month 6'],
    goalSol: 5000, raisedSol: 3247, vekselPrice: 0.15, totalVeksels: 100000, soldVeksels: 64200,
    deadline: '2025-08-01', apy: 12, tags: ['DeFi', 'Oracle', 'DAO'],
    accentColor: '#8b5cf6', status: 'active', change24h: 4.2,
  },
  {
    id: 'green-chain', name: 'GreenChain Protocol', ticker: 'GCP', logo: '🌱',
    category: 'RWA / Carbon',
    description: 'Tokenized carbon credits on Solana. Each token = 1 tonne CO₂. Verified by Verra.',
    promises: ['Partnership with Verra Registry', 'Listing on Raydium Q4 2025', 'Buyback 20% of profits quarterly', 'CertiK audit in progress'],
    goalSol: 8000, raisedSol: 2150, vekselPrice: 0.08, totalVeksels: 200000, soldVeksels: 41800,
    deadline: '2025-10-15', apy: 18, tags: ['RWA', 'Carbon', 'ESG'],
    accentColor: '#10b981', status: 'active', change24h: -1.8,
  },
  {
    id: 'ai-compute', name: 'NeuralMesh AI', ticker: 'NMA', logo: '🤖',
    category: 'AI / Compute',
    description: 'Distributed GPU network for AI inference. Sell compute power, earn NMA.',
    promises: ['First AI transaction Q2 2025', '500 GPU nodes by year end', 'Render Network integration', '2:1 token split at $10M cap'],
    goalSol: 12000, raisedSol: 9800, vekselPrice: 0.25, totalVeksels: 80000, soldVeksels: 72000,
    deadline: '2025-07-01', apy: 22, tags: ['AI', 'GPU', 'Compute'],
    accentColor: '#3b82f6', status: 'active', change24h: 11.3,
  },
  {
    id: 'reit-sol', name: 'SolEstate REIT', ticker: 'SREIT', logo: '🏢',
    category: 'Real Estate / RWA',
    description: 'Tokenized real estate in UAE and Singapore. NFT = fractional ownership.',
    promises: ['3 properties already in portfolio', '8% annual rental yield in USDC', 'Monthly payouts to holders', 'Dubai SPV legal structure'],
    goalSol: 20000, raisedSol: 4500, vekselPrice: 1.2, totalVeksels: 10000, soldVeksels: 2800,
    deadline: '2025-12-31', apy: 8, tags: ['RWA', 'Real Estate', 'REIT'],
    accentColor: '#f59e0b', status: 'active', change24h: 2.1,
  },
  {
    id: 'depin-mesh', name: 'MeshNet DePIN', ticker: 'MESH', logo: '📡',
    category: 'DePIN',
    description: 'Decentralized 5G network. Deploy a hotspot — earn MESH. Pilot in 12 cities.',
    promises: ['Pilot in Dubai, Singapore, NYC', 'Hardware devices Q3 2025', 'Roaming partnership with carriers', '15% of network revenue to holders'],
    goalSol: 3000, raisedSol: 3000, vekselPrice: 0.05, totalVeksels: 500000, soldVeksels: 500000,
    deadline: '2025-06-01', apy: 15, tags: ['DePIN', '5G', 'IoT'],
    accentColor: '#ec4899', status: 'completed', change24h: 0,
  },
];

const ICO_AIRDROPS = [
  { projectId: 'oracle-data', name: 'Oracle Data Network', ticker: 'ODN', logo: '🔮', bonus: 500, accentColor: '#8b5cf6', desc: 'Early holder bonus ×5 per token held' },
  { projectId: 'green-chain', name: 'GreenChain Protocol', ticker: 'GCP', logo: '🌱', bonus: 300, accentColor: '#10b981', desc: 'Green airdrop for active holders' },
  { projectId: 'ai-compute', name: 'NeuralMesh AI', ticker: 'NMA', logo: '🤖', bonus: 1000, accentColor: '#3b82f6', desc: 'AI Genesis Drop — first participants' },
  { projectId: 'reit-sol', name: 'SolEstate REIT', ticker: 'SREIT', logo: '🏢', bonus: 200, accentColor: '#f59e0b', desc: 'Rental bonus for SREIT holders' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function short(addr: string) {
  if (!addr || addr.length < 8) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}
function daysLeft(deadline: string) {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000));
}
function pct(a: number, b: number) {
  return Math.min(100, Math.round((a / b) * 100));
}
function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const glass = {
  card: 'bg-[#0d1117]/80 border border-white/[0.06] backdrop-blur-xl',
  cardHover: 'hover:border-white/[0.12] hover:bg-[#0d1117]/90',
  input: 'bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/20 focus:border-white/20 focus:outline-none',
};

// ─── Micro Components ─────────────────────────────────────────────────────────

const Badge: FC<{ children: React.ReactNode; color?: string }> = ({ children, color = 'rgba(255,255,255,0.06)' }) => (
  <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
    style={{ background: color, color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
    {children}
  </span>
);

const Pill: FC<{ children: React.ReactNode; active?: boolean; onClick?: () => void; accent?: string }> = ({ children, active, onClick, accent = '#8b5cf6' }) => (
  <button onClick={onClick}
    className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200"
    style={{
      background: active ? `${accent}22` : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? `${accent}55` : 'rgba(255,255,255,0.07)'}`,
      color: active ? accent : 'rgba(255,255,255,0.35)',
    }}>
    {children}
  </button>
);

const ProgressBar: FC<{ value: number; color: string; height?: number }> = ({ value, color, height = 3 }) => (
  <div className="w-full overflow-hidden rounded-full" style={{ height, background: 'rgba(255,255,255,0.05)' }}>
    <div className="h-full rounded-full transition-all duration-700"
      style={{ width: `${value}%`, background: color, boxShadow: `0 0 8px ${color}66` }} />
  </div>
);

const Spinner: FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
  <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
  </svg>
);

const CloseBtn: FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick}
    className="grid h-8 w-8 place-items-center rounded-xl transition-all duration-150"
    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-white/40">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  </button>
);

const StatCard: FC<{ label: string; value: string; sub?: string; icon: React.ReactNode; accent: string }> = ({ label, value, sub, icon, accent }) => (
  <div className={`${glass.card} rounded-2xl p-4 flex items-start gap-3 transition-all duration-200 ${glass.cardHover}`}>
    <div className="mt-0.5 grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl"
      style={{ background: `${accent}18`, border: `1px solid ${accent}28` }}>
      <span style={{ color: accent }}>{icon}</span>
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-widest text-white/25 mb-1">{label}</p>
      <p className="text-lg font-bold text-white tabular-nums truncate">{value}</p>
      {sub && <p className="text-[10px] text-white/25 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ─── Tab System ───────────────────────────────────────────────────────────────

type TabId = 'ico' | 'markets' | 'portfolio' | 'trading' | 'history';

const NavTab: FC<{ id: TabId; active: boolean; label: string; icon: React.ReactNode; badge?: number; onClick: () => void }> = ({ active, label, icon, badge, onClick }) => (
  <button onClick={onClick}
    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap relative"
    style={{
      background: active ? 'rgba(139,92,246,0.15)' : 'transparent',
      border: `1px solid ${active ? 'rgba(139,92,246,0.3)' : 'transparent'}`,
      color: active ? '#a78bfa' : 'rgba(255,255,255,0.35)',
    }}>
    <span className="opacity-80">{icon}</span>
    <span>{label}</span>
    {badge ? (
      <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ background: '#ef4444' }}>
        {badge}
      </span>
    ) : null}
  </button>
);

// ─── Price Chart ──────────────────────────────────────────────────────────────

const PriceChart: FC<{ projectId: string; accent: string }> = ({ projectId, accent }) => {
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [period, setPeriod] = useState<'1h' | '24h' | '7d'>('24h');
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ currentPrice: number; change24h: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/chart?projectId=${projectId}&period=${period}`)
      .then(r => r.json())
      .then(d => {
        setPoints(Array.isArray(d.points) ? d.points : []);
        setMeta({ currentPrice: d.currentPrice ?? 0, change24h: d.change24h ?? 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId, period]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    if (period === '7d') return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const priceUp = (meta?.change24h ?? 0) >= 0;
  const lineColor = priceUp ? '#10b981' : '#ef4444';

  return (
    <div className="rounded-xl p-3 mt-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white tabular-nums">
            {meta ? `${meta.currentPrice.toFixed(6)} SOL` : '—'}
          </span>
          {meta && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${priceUp ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>
              {priceUp ? '+' : ''}{meta.change24h.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {(['1h', '24h', '7d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className="rounded-lg px-2 py-0.5 text-[10px] font-bold transition-all"
              style={{
                background: period === p ? `${accent}22` : 'rgba(255,255,255,0.04)',
                color: period === p ? accent : 'rgba(255,255,255,0.3)',
                border: `1px solid ${period === p ? `${accent}44` : 'transparent'}`,
              }}>
              {p}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="h-20 flex items-center justify-center gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-1 w-1 rounded-full animate-pulse"
              style={{ background: accent, animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      ) : points.length < 2 ? (
        <div className="h-20 flex items-center justify-center text-xs text-white/20">No data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${projectId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lineColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="timestamp" tickFormatter={fmtTime} tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.2)' }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.2)' }} axisLine={false} tickLine={false} width={48} tickFormatter={v => v.toFixed(4)} />
            <Tooltip
              contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 11, color: '#fff' }}
              labelFormatter={fmtTime}
              formatter={(v: number) => [`${v.toFixed(6)} SOL`, 'Price']} />
            <Area type="monotone" dataKey="price" stroke={lineColor} strokeWidth={1.5} fill={`url(#grad-${projectId})`} dot={false} activeDot={{ r: 3, fill: lineColor }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

// ─── Project Card ─────────────────────────────────────────────────────────────

const ProjectCard: FC<{
  project: IcoProject;
  onBuy: (p: IcoProject) => void;
  onSell: (p: IcoProject) => void;
  myVeksels: MyVeksel[];
  showChart: string | null;
  onToggleChart: (id: string) => void;
}> = ({ project: p, onBuy, onSell, myVeksels, showChart, onToggleChart }) => {
  const mine = myVeksels.find(v => v.projectId === p.id);
  const progress = pct(p.raisedSol, p.goalSol);
  const isCompleted = p.status === 'completed';
  const chartOpen = showChart === p.id;
  const priceUp = (p.change24h ?? 0) >= 0;

  return (
    <div className={`${glass.card} rounded-2xl overflow-hidden transition-all duration-300 ${glass.cardHover}`}
      style={{ boxShadow: mine ? `0 0 0 1px ${p.accentColor}33, 0 8px 32px ${p.accentColor}11` : undefined }}>

      {/* Top accent line */}
      <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${p.accentColor}00, ${p.accentColor}66, ${p.accentColor}00)` }} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl text-2xl"
              style={{ background: `${p.accentColor}15`, border: `1px solid ${p.accentColor}25` }}>
              {p.logo}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm font-bold text-white">{p.name}</span>
                {mine && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: `${p.accentColor}20`, color: p.accentColor }}>Holding</span>}
                {isCompleted && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md text-emerald-400 bg-emerald-400/10">Completed</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/30 font-mono">{p.ticker}</span>
                <span className="text-[10px] text-white/20">·</span>
                <span className="text-[10px] text-white/30">{p.category}</span>
              </div>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <div className="text-base font-bold text-white tabular-nums">{p.vekselPrice.toFixed(4)}</div>
            <div className="text-[9px] text-white/25 mb-1">SOL/token</div>
            {(p.change24h !== undefined) && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${priceUp ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>
                {priceUp ? '+' : ''}{p.change24h.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Chart Toggle */}
        <button onClick={() => onToggleChart(p.id)}
          className="w-full flex items-center justify-between rounded-lg px-3 py-2 mb-3 text-xs font-medium transition-all"
          style={{
            background: chartOpen ? `${p.accentColor}10` : 'rgba(255,255,255,0.03)',
            border: `1px solid ${chartOpen ? `${p.accentColor}25` : 'rgba(255,255,255,0.05)'}`,
            color: chartOpen ? p.accentColor : 'rgba(255,255,255,0.3)',
          }}>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="22,7 13.5,15.5 8.5,10.5 2,17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Price Chart
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={`transition-transform ${chartOpen ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {chartOpen && <PriceChart projectId={p.id} accent={p.accentColor} />}

        {/* Description */}
        <p className="text-xs text-white/40 leading-relaxed mb-4">{p.description}</p>

        {/* Promises */}
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {p.promises.map((pr, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-white/50">
              <span className="flex-shrink-0 mt-0.5" style={{ color: p.accentColor }}>✓</span>
              <span className="leading-snug">{pr}</span>
            </div>
          ))}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {p.tags.map(t => <Badge key={t}>{t}</Badge>)}
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: '#10b98118', color: '#10b981', border: '1px solid #10b98130' }}>
            {p.apy}% APY
          </span>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-white/30">Raised</span>
            <span className="text-white/60 font-medium tabular-nums">
              {formatIntEnUS(p.raisedSol)} / {formatIntEnUS(p.goalSol)} SOL
              <span className="text-white/30 ml-1">({progress}%)</span>
            </span>
          </div>
          <ProgressBar value={progress} color={p.accentColor} />
          <div className="flex justify-between mt-1.5 text-[10px] text-white/25">
            <span>{isCompleted ? 'Completed' : `${daysLeft(p.deadline)}d left`}</span>
            <span>{fmtCompact(p.soldVeksels)} / {fmtCompact(p.totalVeksels)} tokens</span>
          </div>
        </div>

        {/* My Position */}
        {mine && (
          <div className="mb-4 rounded-xl p-3" style={{ background: `${p.accentColor}0d`, border: `1px solid ${p.accentColor}22` }}>
            <div className="flex justify-between text-xs">
              <span style={{ color: p.accentColor }}>Position: {mine.amount.toFixed(4)} {p.ticker}</span>
              <span className={mine.currentPrice >= mine.pricePaid ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                {mine.currentPrice >= mine.pricePaid ? '+' : ''}
                {(((mine.currentPrice - mine.pricePaid) / mine.pricePaid) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={() => onBuy(p)} disabled={isCompleted}
            className="flex-1 rounded-xl py-2.5 text-xs font-bold text-white transition-all duration-200 disabled:opacity-30"
            style={{
              background: isCompleted ? 'rgba(255,255,255,0.04)' : `${p.accentColor}cc`,
              boxShadow: isCompleted ? 'none' : `0 4px 14px ${p.accentColor}44`,
            }}
            onMouseEnter={e => !isCompleted && ((e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)')}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; }}>
            {isCompleted ? 'Closed' : 'Buy Tokens'}
          </button>
          {mine && (
            <button onClick={() => onSell(p)}
              className="flex-1 rounded-xl py-2.5 text-xs font-bold transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
              Sell
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Prediction Market Card ────────────────────────────────────────────────────

const PredictionCard: FC<{
  market: MarketEvent;
  userId: string | null;
  onBet: (eventId: string, optionId: string, amount: number) => Promise<void>;
}> = ({ market: m, userId, onBet }) => {
  const [betAmount, setBetAmount] = useState('2');
  const [busyOption, setBusyOption] = useState<string | null>(null);
  const noPercent = Math.max(0, 100 - Number(m.options?.[0]?.percentage ?? 0));
  const yesLike = Number(m.options?.[0]?.percentage ?? 0);
  const canBet = m.status === 'OPEN' && !!userId;

  const submitBet = async (optionId: string) => {
    if (!canBet) return;
    const amount = parseFloat(betAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setBusyOption(optionId);
    try {
      await onBet(m.id, optionId, amount);
    } finally {
      setBusyOption(null);
    }
  };

  return (
    <div className={`${glass.card} ${glass.cardHover} rounded-2xl p-5 transition-all duration-200`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <Badge>{m.status}</Badge>
          <p className="text-sm font-semibold text-white mt-2 leading-snug">{m.title}</p>
          <p className="text-xs text-white/35 mt-1">{m.description}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-[10px] text-white/25">Expires</p>
          <p className="text-xs text-white/50">{daysLeft(m.endTime)}d</p>
        </div>
      </div>

      {/* YES/NO bars */}
      <div className="flex gap-1.5 mb-3 rounded-xl overflow-hidden" style={{ height: 6 }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${yesLike}%`, background: '#10b981' }} />
        <div className="flex-1 h-full rounded-full transition-all" style={{ background: '#ef4444' }} />
      </div>

      <div className="flex justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-bold text-emerald-400">{yesLike.toFixed(1)}% {m.options?.[0]?.label ?? 'YES'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-red-400">{noPercent.toFixed(1)}% {m.options?.[1]?.label ?? 'NO'}</span>
          <div className="h-2 w-2 rounded-full bg-red-500" />
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] text-white/25">Liquidity: ${fmtCompact(Number(m.totalLiquidity || 0))}</span>
        <span className="text-[10px] text-white/25">{fmtCompact(m.bets?.length ?? 0)} bets</span>
      </div>
      <div className="mb-3">
        <input
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          type="number"
          min="0.1"
          step="0.1"
          className={`w-full rounded-xl px-3 py-2 text-xs ${glass.input}`}
          placeholder="Bet amount"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={!canBet || !m.options?.[0]}
          onClick={() => m.options?.[0] && submitBet(m.options[0].id)}
          className="rounded-xl py-2.5 text-xs font-bold text-emerald-400 transition-all disabled:opacity-40"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.1)')}>
          {busyOption === m.options?.[0]?.id ? 'Placing...' : `Bet ${m.options?.[0]?.label ?? 'YES'}`}
        </button>
        <button
          disabled={!canBet || !m.options?.[1]}
          onClick={() => m.options?.[1] && submitBet(m.options[1].id)}
          className="rounded-xl py-2.5 text-xs font-bold text-red-400 transition-all disabled:opacity-40"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}>
          {busyOption === m.options?.[1]?.id ? 'Placing...' : `Bet ${m.options?.[1]?.label ?? 'NO'}`}
        </button>
      </div>
    </div>
  );
};

// ─── Modal Backdrop ───────────────────────────────────────────────────────────

const ModalBackdrop: FC<{ onClose: () => void; children: React.ReactNode; accentColor?: string }> = ({ onClose, children, accentColor = '#8b5cf6' }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
    <div className="relative w-full max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #0d1117 0%, #0a0d14 100%)',
        border: `1px solid ${accentColor}22`,
        boxShadow: `0 0 60px ${accentColor}10, 0 40px 100px rgba(0,0,0,0.8)`,
        maxHeight: '92vh',
        overflowY: 'auto',
      }}
      onClick={e => e.stopPropagation()}>
      <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${accentColor}00, ${accentColor}66, ${accentColor}00)` }} />
      {children}
    </div>
  </div>
);

// ─── Buy Modal ────────────────────────────────────────────────────────────────

const BuyModal: FC<{
  project: IcoProject;
  balance: number;
  onClose: () => void;
  onSuccess: (v: MyVeksel) => void;
}> = ({ project: p, balance, onClose, onSuccess }) => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const clusterQsBuy = useMemo(() => solscanClusterQuery(connection.rpcEndpoint), [connection]);
  const [amount, setAmount] = useState('1');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'input' | 'sending' | 'minting' | 'done'>('input');

  const qty = parseFloat(amount || '0') || 0;
  const total = qty * p.vekselPrice;
  const canBuy = !!publicKey && qty > 0 && total <= balance;

  const onBuy = async () => {
    if (!publicKey || !canBuy) return;
    setBusy(true);
    try {
      if (!p.mintAddress) {
        setStep('minting');
        const createRes = await fetch('/api/create-token', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: p.id }),
        });
        if (!createRes.ok) { const { error } = await createRes.json(); throw new Error(error ?? 'Failed to create token'); }
      }
      setStep('sending');
      const lamports = Math.round(total * LAMPORTS_PER_SOL);
      const ix = [SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: new PublicKey(TREASURY), lamports })];
      const lb = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({ payerKey: publicKey, recentBlockhash: lb.blockhash, instructions: ix }).compileToLegacyMessage();
      const sig = await sendTransaction(new VersionedTransaction(msg), connection);
      await connection.confirmTransaction({ signature: sig, ...lb }, 'confirmed');
      notify({ type: 'success', message: `SOL sent`, txid: sig });
      setStep('minting');
      const buyRes = await fetch('/api/buy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58(), projectId: p.id, solAmount: total, txHash: sig }),
      });
      if (!buyRes.ok) { const { error } = await buyRes.json(); throw new Error(error ?? 'Purchase failed'); }
      const data = await buyRes.json();
      notify({ type: 'success', message: `Purchased ${data.tokenAmount.toFixed(4)} ${p.ticker}!`, txid: sig });
      setStep('done');
      onSuccess({
        projectId: p.id, projectName: p.name, ticker: p.ticker, logo: p.logo,
        amount: data.tokenAmount, pricePaid: p.vekselPrice,
        currentPrice: data.newPrice ?? p.vekselPrice, type: 'spl',
        purchasedAt: Date.now() / 1000, accentColor: p.accentColor, mintAddress: data.mintAddress,
      });
      onClose();
    } catch (e: unknown) {
      notify({ type: 'error', message: e instanceof Error ? e.message : 'Error' });
      setStep('input');
    }
    setBusy(false);
  };

  const stepLabel: Record<string, string | null> = { input: null, sending: 'Sending SOL…', minting: 'Minting tokens…', done: 'Done!' };

  return (
    <ModalBackdrop onClose={onClose} accentColor={p.accentColor}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl text-2xl" style={{ background: `${p.accentColor}15` }}>{p.logo}</div>
            <div>
              <div className="text-base font-bold text-white">{p.name}</div>
              <div className="text-[10px] text-white/30 font-mono">{p.ticker} · {p.vekselPrice.toFixed(6)} SOL/token</div>
            </div>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        {p.mintAddress && (
          <a href={`https://solscan.io/token/${p.mintAddress}${clusterQsBuy}`} target="_blank" rel="noopener noreferrer"
            className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[10px] text-emerald-400 font-mono transition"
            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <span>Mint: {p.mintAddress.slice(0, 20)}…</span>
            <span className="ml-auto opacity-60">↗ Solscan</span>
          </a>
        )}

        <div className="mb-4">
          <label className="mb-2 block text-[10px] font-semibold text-white/30 uppercase tracking-widest">Amount</label>
          <div className="flex items-center gap-2">
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="1" step="1"
              className={`flex-1 rounded-xl px-4 py-3 text-sm ${glass.input} rounded-xl`} />
            {[1, 5, 10, 25].map(n => (
              <button key={n} onClick={() => setAmount(String(n))}
                className="rounded-xl px-3 py-3 text-xs font-semibold text-white/40 transition hover:text-white"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5 rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex justify-between text-xs text-white/40">
            <span>Price × Qty</span>
            <span className="text-white/70 tabular-nums">{p.vekselPrice.toFixed(6)} × {qty}</span>
          </div>
          <div className="h-px bg-white/5" />
          <div className="flex justify-between text-sm font-bold">
            <span className="text-white/60">Total</span>
            <span className="text-white tabular-nums">{total.toFixed(6)} SOL</span>
          </div>
          {total > balance && <p className="text-xs text-red-400 pt-1">Insufficient balance (you have {balance.toFixed(4)} SOL)</p>}
        </div>

        {stepLabel[step] && (
          <div className="mb-3 text-center text-xs text-amber-400 animate-pulse">{stepLabel[step]}</div>
        )}

        <button onClick={onBuy} disabled={busy || !canBuy}
          className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all disabled:opacity-30"
          style={{ background: `${p.accentColor}cc`, boxShadow: canBuy ? `0 8px 24px ${p.accentColor}44` : 'none' }}>
          {busy
            ? <span className="flex items-center justify-center gap-2"><Spinner /> {stepLabel[step] ?? 'Processing…'}</span>
            : `Buy ${qty} tokens for ${total.toFixed(6)} SOL`}
        </button>
      </div>
    </ModalBackdrop>
  );
};

// ─── Sell Modal ───────────────────────────────────────────────────────────────

const SellModal: FC<{
  project: IcoProject;
  veksel: MyVeksel;
  onClose: () => void;
  onSuccess: (projectId: string, amount: number) => void;
}> = ({ project: p, veksel, onClose, onSuccess }) => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [amount, setAmount] = useState(String(veksel.amount));
  const [busy, setBusy] = useState(false);

  const qty = Math.min(parseFloat(amount || '0') || 0, veksel.amount);
  const receiveSOL = qty * veksel.currentPrice * 0.97;
  const pnl = qty * (veksel.currentPrice - veksel.pricePaid);

  const onSell = async () => {
    if (!publicKey || qty <= 0 || !veksel.mintAddress) {
      if (!veksel.mintAddress) notify({ type: 'error', message: 'Token not yet on-chain.' });
      return;
    }
    setBusy(true);
    try {
      const { createTransferCheckedInstruction, getAssociatedTokenAddressSync } = await import('@solana/spl-token');
      const { Transaction } = await import('@solana/web3.js');
      const mintPubkey = new PublicKey(veksel.mintAddress);
      const treasuryPubkey = new PublicKey(TREASURY);
      const decimals = 6;
      const senderAta = getAssociatedTokenAddressSync(mintPubkey, publicKey);
      const receiverAta = getAssociatedTokenAddressSync(mintPubkey, treasuryPubkey);
      const rawAmount = BigInt(Math.floor(qty * Math.pow(10, decimals)));
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const transferIx = createTransferCheckedInstruction(senderAta, mintPubkey, receiverAta, publicKey, rawAmount, decimals);
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey });
      tx.add(transferIx);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      notify({ type: 'success', message: `Tokens sent!`, txid: sig });
      const sellRes = await fetch('/api/sell', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58(), projectId: p.id, tokenAmount: qty, txHash: sig }),
      });
      if (!sellRes.ok) { const { error } = await sellRes.json(); throw new Error(error ?? 'Sale failed'); }
      const data = await sellRes.json();
      notify({ type: 'success', message: `Sold! Received ${data.solPayout.toFixed(6)} SOL`, txid: data.payoutTxHash });
      onSuccess(p.id, qty);
      onClose();
    } catch (e: unknown) { notify({ type: 'error', message: e instanceof Error ? e.message : 'Sale error' }); }
    setBusy(false);
  };

  return (
    <ModalBackdrop onClose={onClose} accentColor="#ef4444">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-base font-bold text-white">Sell {p.ticker}</div>
            <div className="text-[10px] text-white/30">{p.name}</div>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        <div className="mb-4 rounded-xl p-3.5" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Holding: <span className="text-white font-semibold">{veksel.amount.toFixed(4)} tokens</span></span>
            <span className={pnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
              {pnl >= 0 ? '+' : ''}{(((veksel.currentPrice - veksel.pricePaid) / veksel.pricePaid) * 100).toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-[10px] font-semibold text-white/30 uppercase tracking-widest">Sell Amount (max {veksel.amount.toFixed(4)})</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="1" max={veksel.amount}
            className={`w-full rounded-xl px-4 py-3 text-sm ${glass.input}`} />
        </div>

        <div className="mb-5 rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex justify-between text-xs text-white/40"><span>Price</span><span className="text-white/70 tabular-nums">{veksel.currentPrice.toFixed(6)} SOL/token</span></div>
          <div className="flex justify-between text-xs text-white/40"><span>Platform fee</span><span className="text-white/70">3%</span></div>
          <div className="h-px bg-white/5" />
          <div className="flex justify-between text-sm font-bold"><span className="text-white/60">You receive</span><span className="text-emerald-400 tabular-nums">{receiveSOL.toFixed(6)} SOL</span></div>
        </div>

        {!veksel.mintAddress && (
          <div className="mb-3 text-xs text-amber-400 rounded-xl px-3 py-2.5" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
            ⚠️ Mint address not available. Token must be on-chain to sell.
          </div>
        )}

        <button onClick={onSell} disabled={busy || qty <= 0 || !veksel.mintAddress}
          className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all disabled:opacity-30"
          style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', boxShadow: qty > 0 ? '0 8px 24px rgba(220,38,38,0.3)' : 'none' }}>
          {busy ? <span className="flex items-center justify-center gap-2"><Spinner />Selling…</span>
            : `Sell ${qty.toFixed(4)} → ${receiveSOL.toFixed(6)} SOL`}
        </button>
      </div>
    </ModalBackdrop>
  );
};

// ─── Airdrop Modal ────────────────────────────────────────────────────────────

const AirdropModal: FC<{ onClose: () => void; myVeksels: MyVeksel[]; onOpenCreateICO: () => void }> = ({ onClose, myVeksels, onOpenCreateICO }) => {
  const { publicKey } = useWallet();
  const [busy, setBusy] = useState(false);
  const [claimedIco, setClaimedIco] = useState<string[]>([]);
  const eligibleDrops = ICO_AIRDROPS.filter(d => myVeksels.some(v => v.projectId === d.projectId));
  const lockedDrops = ICO_AIRDROPS.filter(d => !myVeksels.some(v => v.projectId === d.projectId));

  const claimIcoAirdrop = async (projectId: string, bonus: number, ticker: string) => {
    if (!publicKey) return;
    setBusy(true);
    await new Promise(r => setTimeout(r, 1500));
    notify({ type: 'success', message: `🎉 Received ${bonus} ${ticker} from airdrop!` });
    setClaimedIco(prev => [...prev, projectId]);
    setBusy(false);
  };

  return (
    <ModalBackdrop onClose={onClose} accentColor="#3b82f6">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-lg font-bold text-white">Airdrops</div>
            <div className="text-[10px] text-white/30 mt-0.5">Free tokens from ICO projects</div>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        <div className="rounded-xl p-4 flex items-center gap-3 mb-5" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)' }}>
          <span className="text-2xl">🪙</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-violet-300">Launch your own ICO</p>
            <p className="text-[10px] text-white/25 mt-0.5">Create a token and run your own airdrop</p>
          </div>
          <button onClick={() => { onClose(); onOpenCreateICO(); }}
            className="rounded-xl px-4 py-2 text-xs font-bold text-white"
            style={{ background: 'rgba(139,92,246,0.5)', border: '1px solid rgba(139,92,246,0.4)' }}>
            Create →
          </button>
        </div>

        {eligibleDrops.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest mb-3">Available</div>
            <div className="space-y-2">
              {eligibleDrops.map(d => {
                const isClaimed = claimedIco.includes(d.projectId);
                const mine = myVeksels.find(v => v.projectId === d.projectId);
                const bonus = mine ? Math.floor(mine.amount * 5) : d.bonus;
                return (
                  <div key={d.projectId} className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{d.logo}</span>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-white">{d.name}</div>
                        <div className="text-[10px] text-white/30">{d.desc}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-400 tabular-nums">+{bonus}</div>
                        <div className="text-[9px] text-white/25">{d.ticker}</div>
                      </div>
                    </div>
                    <button onClick={() => claimIcoAirdrop(d.projectId, bonus, d.ticker)} disabled={busy || isClaimed}
                      className="w-full rounded-lg py-2 text-xs font-bold text-white transition-all disabled:opacity-40"
                      style={{ background: isClaimed ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.4)', color: isClaimed ? '#34d399' : 'white' }}>
                      {isClaimed ? '✓ Claimed' : busy ? 'Claiming…' : `Claim ${bonus} ${d.ticker}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-3">
            {eligibleDrops.length === 0 ? 'All Airdrops' : 'Locked'}
          </div>
          <div className="space-y-2">
            {lockedDrops.map(d => (
              <div key={d.projectId} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xl opacity-40">{d.logo}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white/40">{d.name}</div>
                    <div className="text-[10px] text-white/20">{d.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white/20">+{d.bonus}</div>
                    <div className="text-[9px] text-red-500/60">Buy first</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
};

// ─── Send Modal ───────────────────────────────────────────────────────────────

const SendModal: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { getUserSOLBalance } = useUserSOLBalanceStore();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const onSend = async () => {
    if (!publicKey) return notify({ type: 'error', message: 'Wallet not connected' });
    setBusy(true);
    try {
      const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);
      const ix = [SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: new PublicKey(to.trim()), lamports })];
      const lb = await connection.getLatestBlockhash();
      const sig = await sendTransaction(new VersionedTransaction(new TransactionMessage({ payerKey: publicKey, recentBlockhash: lb.blockhash, instructions: ix }).compileToLegacyMessage()), connection);
      await connection.confirmTransaction({ signature: sig, ...lb }, 'confirmed');
      notify({ type: 'success', message: 'Sent!', txid: sig });
      getUserSOLBalance(publicKey, connection);
      onClose();
    } catch (e: unknown) { notify({ type: 'error', message: e instanceof Error ? e.message : 'Error' }); }
    setBusy(false);
  };

  return (
    <ModalBackdrop onClose={onClose} accentColor="#8b5cf6">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div><div className="text-base font-bold text-white">Send SOL</div><div className="text-[10px] text-white/30 mt-0.5">Transfer to any Solana address</div></div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold text-white/30 uppercase tracking-widest">Recipient Address</label>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="Solana address…" className={`w-full rounded-xl px-4 py-3 font-mono text-sm ${glass.input}`} />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold text-white/30 uppercase tracking-widest">Amount (SOL)</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number" min="0" step="0.001" className={`w-full rounded-xl px-4 py-3 text-sm ${glass.input}`} />
          </div>
          <button onClick={onSend} disabled={busy || !to || !amount}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all disabled:opacity-30"
            style={{ background: 'rgba(139,92,246,0.5)', border: '1px solid rgba(139,92,246,0.4)', boxShadow: (!busy && to && amount) ? '0 8px 24px rgba(139,92,246,0.3)' : 'none' }}>
            {busy ? <span className="flex items-center justify-center gap-2"><Spinner />Sending…</span> : 'Send SOL'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
};

// ─── Receive Modal ────────────────────────────────────────────────────────────

const ReceiveModal: FC<{ address: string | null; onClose: () => void }> = ({ address, onClose }) => {
  const { connection } = useConnection();
  const clusterQs = useMemo(() => solscanClusterQuery(connection.rpcEndpoint), [connection]);
  const [copied, setCopied] = useState(false);
  const copy = async () => { if (!address) return; await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <ModalBackdrop onClose={onClose} accentColor="#10b981">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div><div className="text-base font-bold text-white">Receive SOL</div><div className="text-[10px] text-white/30 mt-0.5">Share your wallet address</div></div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Your Address</div>
          <div className="break-all font-mono text-sm text-white/60 leading-relaxed">{address ?? '—'}</div>
        </div>
        <button onClick={copy} className="w-full rounded-xl py-3.5 text-sm font-bold transition-all mb-2"
          style={{ background: copied ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`, color: copied ? '#34d399' : 'white' }}>
          {copied ? '✓ Copied!' : 'Copy Address'}
        </button>
        {address && <a href={`https://solscan.io/account/${address}${clusterQs}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 text-xs text-white/25 hover:text-white/50 transition py-2">↗ View on Solscan</a>}
      </div>
    </ModalBackdrop>
  );
};

// ─── Tx Row ───────────────────────────────────────────────────────────────────

const TxRow: FC<{ tx: TxRecord }> = ({ tx }) => {
  const { connection } = useConnection();
  const clusterQs = useMemo(() => solscanClusterQuery(connection.rpcEndpoint), [connection]);
  const isSend = tx.type === 'send';
  const isFailed = tx.status === 'failed';
  const color = isFailed ? '#ef4444' : isSend ? '#ef4444' : '#10b981';
  const bg = isFailed ? 'rgba(239,68,68,0.08)' : isSend ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)';

  return (
    <a href={`https://solscan.io/tx/${tx.signature}${clusterQs}`} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl px-3 py-3 transition-all hover:bg-white/[0.03]">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl" style={{ background: bg, border: `1px solid ${color}22` }}>
        {isFailed ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color }}><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        ) : isSend ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color }}><path d="M7 17 17 7M10 7h7v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color }}><path d="M17 7 7 17M14 17H7v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-white/70">{isFailed ? 'Failed' : isSend ? 'Sent' : 'Received'}</div>
        <div className="text-[10px] font-mono text-white/25">{short(tx.counterparty)}</div>
      </div>
      <div className="text-right">
        {tx.amount > 0 && <div className="text-xs font-bold tabular-nums" style={{ color: isFailed ? 'rgba(255,255,255,0.2)' : color }}>{isSend ? '−' : '+'}{tx.amount.toFixed(4)}</div>}
        <div className="text-[9px] text-white/20">SOL</div>
      </div>
    </a>
  );
};

const IcoTxRow: FC<{ tx: { wallet: string; type: string; solAmount: number; tokenAmount: number; txHash: string; timestamp: number; projectId: string } }> = ({ tx }) => {
  const { connection } = useConnection();
  const clusterQs = useMemo(() => solscanClusterQuery(connection.rpcEndpoint), [connection]);
  const isBuy = tx.type === 'buy';
  return (
    <a href={`https://solscan.io/tx/${tx.txHash}${clusterQs}`} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl px-3 py-3 transition-all hover:bg-white/[0.03]">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl text-base"
        style={{ background: isBuy ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${isBuy ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
        {isBuy ? '🎫' : '💱'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-white/70">{isBuy ? 'Bought' : 'Sold'} · <span className="font-mono">{tx.projectId}</span></div>
        <div className="text-[10px] text-white/25">{tx.tokenAmount.toFixed(4)} tokens · {new Date(tx.timestamp).toLocaleString('en-US')}</div>
      </div>
      <div className="text-right">
        <div className="text-xs font-bold tabular-nums" style={{ color: isBuy ? '#ef4444' : '#10b981' }}>{isBuy ? '−' : '+'}{tx.solAmount.toFixed(6)}</div>
        <div className="text-[9px] font-mono text-white/20">{short(tx.txHash)}</div>
      </div>
    </a>
  );
};

// ─── Action Button ────────────────────────────────────────────────────────────

const QuickAction: FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent: string;
}> = ({ label, icon, onClick, disabled, accent }) => (
  <button onClick={onClick} disabled={disabled}
    className="flex flex-col items-center gap-1.5 rounded-2xl p-3 transition-all duration-200 disabled:opacity-30 active:scale-95"
    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    onMouseEnter={e => !disabled && ((e.currentTarget.style.background = `${accent}10`) && (e.currentTarget.style.borderColor = `${accent}30`))}
    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}>
    <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${accent}10`, color: accent }}>
      {icon}
    </div>
    <span className="text-[9px] font-medium text-white/30 tracking-wide">{label}</span>
  </button>
);

// ─── Bottom Navigation ────────────────────────────────────────────────────────

interface NavItem {
  id: TabId | 'airdrop-nav';
  label: string;
  accent: string;
  badge?: number;
  icon: React.ReactNode;
}

// ─── Main HomeView ────────────────────────────────────────────────────────────

export const HomeView: FC = () => {
  const wallet = useWallet();
  const { connection } = useConnection();
  const clusterLabel = useMemo(() => {
    const ep = connection.rpcEndpoint;
    if (/mainnet/i.test(ep)) return 'Main';
    return 'Live';
  }, [connection]);
  const clusterQs = useMemo(() => solscanClusterQuery(connection.rpcEndpoint), [connection]);
  const balance = useUserSOLBalanceStore(s => s.balance);
  const solPrice = useUserSOLBalanceStore(s => s.solPrice);
  const priceChange24h = useUserSOLBalanceStore(s => s.priceChange24h);
  const { getUserSOLBalance, getSolPrice } = useUserSOLBalanceStore();
  const transactions = useTransactionStore(s => s.transactions);
  const txLoading = useTransactionStore(s => s.loading);
  const { fetchTransactions } = useTransactionStore();

  const [modal, setModal] = useState<'send' | 'receive' | 'swap' | 'airdrop' | 'buy' | 'sell' | 'createIco' | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('ico');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [selectedProject, setSelectedProject] = useState<IcoProject | null>(null);
  const [copied, setCopied] = useState(false);
  const [myVeksels, setMyVeksels] = useState<MyVeksel[]>([]);
  const [showChart, setShowChart] = useState<string | null>(null);
  const [projects, setProjects] = useState<IcoProject[]>(BASE_PROJECTS);
  const [icoTxs, setIcoTxs] = useState<Array<{ wallet: string; type: string; solAmount: number; tokenAmount: number; txHash: string; timestamp: number; projectId: string }>>([]);
  const [marketUserId, setMarketUserId] = useState<string | null>(null);
  const [marketEvents, setMarketEvents] = useState<MarketEvent[]>([]);
  const [marketFeed, setMarketFeed] = useState<any[]>([]);
  const [walletHistory, setWalletHistory] = useState<any[]>([]);
  const [marketTokens, setMarketTokens] = useState<MarketToken[]>([]);
  const [dashboardWalletBalance, setDashboardWalletBalance] = useState<number>(0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);

  const walletAddress = useMemo(() => wallet.publicKey?.toBase58() ?? null, [wallet.publicKey]);
  const walletShort = useMemo(() => walletAddress ? short(walletAddress) : null, [walletAddress]);
  const usdBalance = useMemo(() => balance * solPrice, [balance, solPrice]);
  const priceUp = priceChange24h >= 0;
  const totalVekselSol = useMemo(() => myVeksels.reduce((s, v) => s + v.amount * v.currentPrice, 0), [myVeksels]);
  const totalPnl = useMemo(() => myVeksels.reduce((s, v) => s + v.amount * (v.currentPrice - v.pricePaid), 0), [myVeksels]);
  const filteredProjects = useMemo(() => filter === 'all' ? projects : projects.filter(p => p.status === filter), [filter, projects]);
  const totalRaised = useMemo(() => projects.reduce((s, p) => s + p.raisedSol, 0), [projects]);

  const syncPrices = useCallback(async () => {
    const updated = await Promise.all(BASE_PROJECTS.map(async p => {
      try {
        const r = await fetch(`/api/chart?projectId=${p.id}&period=1h`);
        const d = await r.json();
        return { ...p, vekselPrice: d.currentPrice ?? p.vekselPrice, raisedSol: d.raisedSol ?? p.raisedSol, soldVeksels: Math.floor(d.soldTokens ?? p.soldVeksels), mintAddress: d.mintAddress ?? null };
      } catch { return p; }
    }));
    setProjects(updated);
    setMyVeksels(prev => prev.map(v => { const up = updated.find(p => p.id === v.projectId); return up ? { ...v, currentPrice: up.vekselPrice, mintAddress: up.mintAddress } : v; }));
  }, []);

  const loadIcoTxs = useCallback(async (w?: string) => {
    try {
      const r = await fetch(w ? `/api/transactions?wallet=${w}&limit=50` : '/api/transactions?limit=50');
      const d = await r.json();
      setIcoTxs(d.transactions ?? []);
    } catch {}
  }, []);

  useEffect(() => { getSolPrice(); const id = setInterval(getSolPrice, 60_000); return () => clearInterval(id); }, [getSolPrice]);
  useEffect(() => { syncPrices(); const id = setInterval(syncPrices, 30_000); return () => clearInterval(id); }, [syncPrices]);

  useEffect(() => {
    if (!walletAddress) return;
    const run = async () => {
      const username = `u_${walletAddress.slice(0, 10)}`;
      const user = await createUser(username, walletAddress).catch(() => null);
      if (user?.id) setMarketUserId(user.id);
    };
    run();
  }, [walletAddress]);

  const loadMarketData = useCallback(async () => {
    if (!marketUserId) return;
    setMarketLoading(true);
    setMarketError(null);
    try {
      const [events, feed, dashboard, walletTx, tokens] = await Promise.all([
        getEvents(),
        getFeed(50),
        getDashboard(marketUserId),
        getWalletTransactions(marketUserId, 50),
        getTokens(),
      ]);
      setMarketEvents(events);
      setMarketFeed(feed);
      setDashboardWalletBalance(Number(dashboard?.wallet?.balance ?? 0));
      setWalletHistory(walletTx);
      setMarketTokens(tokens);
    } catch (err: any) {
      setMarketError(err?.message ?? 'Failed to load market data');
    } finally {
      setMarketLoading(false);
    }
  }, [marketUserId]);

  useEffect(() => {
    if (!marketUserId) return;
    loadMarketData();
    const fastPoll = setInterval(() => {
      getFeed(50).then(setMarketFeed).catch(() => undefined);
      getEvents().then(setMarketEvents).catch(() => undefined);
    }, 7000);
    return () => clearInterval(fastPoll);
  }, [marketUserId, loadMarketData]);
  useEffect(() => {
    if (wallet.publicKey) {
      getUserSOLBalance(wallet.publicKey, connection);
      fetchTransactions(wallet.publicKey, connection);
      loadIcoTxs(wallet.publicKey.toBase58());
    }
  }, [wallet.publicKey, connection, getUserSOLBalance, fetchTransactions, loadIcoTxs]);

  const handleBet = useCallback(async (eventId: string, optionId: string, amount: number) => {
    if (!marketUserId) return;
    setMarketEvents((prev) =>
      prev.map((ev) =>
        ev.id === eventId
          ? { ...ev, totalLiquidity: Number(ev.totalLiquidity) + amount }
          : ev,
      ),
    );
    try {
      await placeBet(eventId, { userId: marketUserId, optionId, amount });
      await loadMarketData();
      notify({ type: 'success', message: 'Bet submitted' });
    } catch (err: any) {
      notify({ type: 'error', message: err?.message || 'Failed to submit bet' });
      await loadMarketData();
    }
  }, [marketUserId, loadMarketData]);

  const onCopy = async () => { if (!walletAddress) return; await navigator.clipboard.writeText(walletAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const onBuy = (p: IcoProject) => { setSelectedProject(p); setModal('buy'); };
  const onSell = (p: IcoProject) => { if (myVeksels.find(v => v.projectId === p.id)) { setSelectedProject(p); setModal('sell'); } };

  const onBuySuccess = (v: MyVeksel) => {
    setMyVeksels(prev => {
      const ex = prev.find(x => x.projectId === v.projectId);
      return ex ? prev.map(x => x.projectId === v.projectId ? { ...x, amount: x.amount + v.amount, mintAddress: v.mintAddress } : x) : [...prev, v];
    });
    syncPrices();
    loadIcoTxs(walletAddress ?? undefined);
  };

  const onSellSuccess = (pid: string, amt: number) => {
    setMyVeksels(prev => prev.map(v => v.projectId === pid ? { ...v, amount: Math.max(0, v.amount - amt) } : v).filter(v => v.amount > 0));
    syncPrices();
    loadIcoTxs(walletAddress ?? undefined);
  };

  const navItems: NavItem[] = [
    {
      id: 'ico', label: 'ICO', accent: '#8b5cf6',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>,
    },
    {
      id: 'markets', label: 'Markets', accent: '#10b981',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><polyline points="22,7 13.5,15.5 8.5,10.5 2,17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><polyline points="16,7 22,7 22,13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>,
    },
    {
      id: 'portfolio', label: 'Portfolio', accent: '#f59e0b', badge: myVeksels.length || undefined,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" /></svg>,
    },
    {
      id: 'airdrop-nav' as TabId, label: 'Airdrop', accent: '#3b82f6',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 12V22H4V12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M22 7H2v5h20V7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>,
    },
    {
      id: 'history', label: 'History', accent: '#ec4899',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>,
    },
  ];

  return (
    <div className="min-h-screen w-full" style={{ background: '#060810' }}>

      {/* Ambient gradient background */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-80 w-80 rounded-full opacity-30" style={{ background: 'radial-gradient(circle, #8b5cf620 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute top-1/3 right-1/4 h-64 w-64 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #3b82f620 0%, transparent 70%)', filter: 'blur(50px)' }} />
        <div className="absolute bottom-1/4 left-1/3 h-56 w-56 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #10b98115 0%, transparent 70%)', filter: 'blur(50px)' }} />
      </div>

      {/* Modals */}
      {modal === 'send' && <SendModal onClose={() => setModal(null)} />}
      {modal === 'receive' && <ReceiveModal address={walletAddress} onClose={() => setModal(null)} />}
      {modal === 'swap' && <SwapPanel onClose={() => setModal(null)} />}
      {modal === 'airdrop' && <AirdropModal onClose={() => setModal(null)} myVeksels={myVeksels} onOpenCreateICO={() => setModal('createIco')} />}
      {modal === 'createIco' && <CreateTokenLaunchpad onClose={() => setModal(null)} />}
      {modal === 'buy' && selectedProject && <BuyModal project={selectedProject} balance={balance} onClose={() => setModal(null)} onSuccess={onBuySuccess} />}
      {modal === 'sell' && selectedProject && myVeksels.find(v => v.projectId === selectedProject.id) && (
        <SellModal project={selectedProject} veksel={myVeksels.find(v => v.projectId === selectedProject.id)!} onClose={() => setModal(null)} onSuccess={onSellSuccess} />
      )}

      <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 md:px-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg grid place-items-center" style={{ background: 'rgba(139,92,246,0.3)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#a78bfa" /></svg>
              </div>
              <span className="text-sm font-bold text-white/80">SolLaunch</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
              style={{ background: wallet.connected ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${wallet.connected ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)'}`, color: wallet.connected ? '#34d399' : 'rgba(255,255,255,0.3)' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: wallet.connected ? '#34d399' : 'rgba(255,255,255,0.2)', boxShadow: wallet.connected ? '0 0 5px #34d399' : 'none' }} />
              {wallet.connected ? clusterLabel : 'Disconnected'}
            </div>
            {walletShort && (
              <button onClick={onCopy} className="rounded-full px-2.5 py-1 font-mono text-[10px] font-medium transition"
                style={{ background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${copied ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)'}`, color: copied ? '#34d399' : 'rgba(255,255,255,0.35)' }}>
                {copied ? '✓ Copied' : walletShort}
              </button>
            )}
          </div>
        </div>

        {/* ── Wallet Card ── */}
        <div className="relative overflow-hidden rounded-2xl p-5 mb-4"
          style={{ background: 'linear-gradient(145deg, rgba(139,92,246,0.12) 0%, rgba(255,255,255,0.03) 60%, rgba(59,130,246,0.06) 100%)', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(139,92,246,0.08) 0%, transparent 60%)' }} />

          {wallet.publicKey ? (
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-white/25 mb-2">Total Portfolio</p>
                <p className="text-3xl font-bold text-white mb-1 tabular-nums">${(usdBalance + totalVekselSol * solPrice).toFixed(2)}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-white/50 tabular-nums">{balance.toFixed(4)} SOL</span>
                  {totalVekselSol > 0 && <span className="text-xs text-white/30">+ {totalVekselSol.toFixed(4)} ICO</span>}
                  {solPrice > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: priceUp ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: priceUp ? '#34d399' : '#f87171' }}>
                      {priceUp ? '+' : ''}{priceChange24h.toFixed(2)}%
                    </span>
                  )}
                </div>
                {totalPnl !== 0 && (
                  <p className="mt-1 text-xs font-semibold" style={{ color: totalPnl >= 0 ? '#34d399' : '#f87171' }}>
                    ICO P&L: {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(6)} SOL
                  </p>
                )}
              </div>
              {solPrice > 0 && (
                <div className="text-right">
                  <p className="text-xs font-bold text-white/60 tabular-nums">SOL ${solPrice.toFixed(2)}</p>
                  <p className="text-[10px] text-white/25 mt-0.5">CoinGecko</p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-white/40 mb-3">Connect your wallet to get started</p>
              <WalletMultiButtonDynamic
                className="!rounded-xl !text-xs !font-bold !px-4 !py-2.5 !h-auto"
                style={{ background: 'rgba(139,92,246,0.5)', border: '1px solid rgba(139,92,246,0.4)' } as React.CSSProperties} />
            </div>
          )}
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatCard
            label="Total Raised"
            value={`${fmtCompact(totalRaised)} SOL`}
            sub={`$${fmtCompact(totalRaised * solPrice)}`}
            accent="#8b5cf6"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>} />
          <StatCard
            label="Active ICOs"
            value={`${projects.filter(p => p.status === 'active').length}`}
            sub={`${projects.filter(p => p.status === 'completed').length} completed`}
            accent="#10b981"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>} />
          <StatCard
            label="My Balance"
            value={`${balance.toFixed(3)} SOL`}
            sub={wallet.connected ? `~$${usdBalance.toFixed(2)}` : 'Connect wallet'}
            accent="#f59e0b"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="1" y="4" width="22" height="16" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M1 10h22" stroke="currentColor" strokeWidth="2" /></svg>} />
          <StatCard
            label="Transactions"
            value={`${icoTxs.length + transactions.length}`}
            sub={`${icoTxs.length} ICO · ${transactions.length} SOL`}
            accent="#3b82f6"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>} />
        </div>

        {/* ── Quick Actions ── */}
        <div className="grid grid-cols-6 gap-2 mb-5">
          <QuickAction label="Send" disabled={!wallet.connected} onClick={() => setModal('send')} accent="#8b5cf6"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 17 17 7M10 7h7v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>} />
          <QuickAction label="Receive" disabled={!wallet.connected} onClick={() => setModal('receive')} accent="#10b981"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17 7 7 17M14 17H7v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>} />
          <QuickAction label="Swap" disabled={!wallet.connected} onClick={() => setModal('swap')} accent="#f59e0b"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>} />
          <QuickAction label="Airdrop" onClick={() => setModal('airdrop')} accent="#3b82f6"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v14M5 10l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>} />
          <QuickAction label="History" onClick={() => setActiveTab('history')} accent="#ec4899"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>} />
          <QuickAction label="Create" onClick={() => setModal('createIco')} accent="#f97316"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>} />
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          <NavTab id="ico" active={activeTab === 'ico'} label="ICO" onClick={() => setActiveTab('ico')}
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>} />
          <NavTab id="markets" active={activeTab === 'markets'} label="Markets" onClick={() => setActiveTab('markets')}
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="22,7 13.5,15.5 8.5,10.5 2,17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>} />
          <NavTab id="trading" active={activeTab === 'trading'} label="Trading" onClick={() => setActiveTab('trading')}
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.8" /></svg>} />
          <NavTab id="portfolio" active={activeTab === 'portfolio'} label="Portfolio" badge={myVeksels.length || undefined} onClick={() => setActiveTab('portfolio')}
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="currentColor" strokeWidth="1.8" /></svg>} />
          <NavTab id="history" active={activeTab === 'history'} label="History" onClick={() => setActiveTab('history')}
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>} />
        </div>

        {/* ── ICO Tab ── */}
        {activeTab === 'ico' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
              <Pill active={filter === 'active'} onClick={() => setFilter('active')} accent="#10b981">Active</Pill>
              <Pill active={filter === 'completed'} onClick={() => setFilter('completed')} accent="#6b7280">Completed</Pill>
              <span className="ml-auto text-[10px] text-white/20">{filteredProjects.length} projects</span>
            </div>
            {filteredProjects.map(p => (
              <ProjectCard key={p.id} project={p} onBuy={onBuy} onSell={onSell} myVeksels={myVeksels} showChart={showChart} onToggleChart={id => setShowChart(prev => prev === id ? null : id)} />
            ))}
          </div>
        )}

        {/* ── Markets Tab (Prediction Markets) ── */}
        {activeTab === 'markets' && (
          <div className="space-y-3">
            <div className={`${glass.card} rounded-2xl p-4 mb-2`}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold text-white">Prediction Markets</div>
                <Badge color="rgba(16,185,129,0.12)"><span className="text-emerald-400">Live</span></Badge>
              </div>
              <p className="text-xs text-white/30">Bet on real-time events with custodial wallet settlement.</p>
            </div>
            {marketLoading && <div className="text-xs text-white/40">Loading market events...</div>}
            {marketError && <div className="text-xs text-red-400">{marketError}</div>}
            {!marketLoading && marketEvents.map(m => (
              <PredictionCard key={m.id} market={m} userId={marketUserId} onBet={handleBet} />
            ))}
          </div>
        )}

        {/* ── Trading Tab ── */}
        {activeTab === 'trading' && (
          <div className="space-y-3">
            <TradingPanel />
          </div>
        )}

        {/* ── Portfolio Tab ── */}
        {activeTab === 'portfolio' && (
          <div className="space-y-3">
            <div className={`${glass.card} rounded-2xl p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-white/35">Custodial Wallet</div>
                  <div className="text-lg font-bold text-white">${dashboardWalletBalance.toFixed(2)}</div>
                </div>
                <button
                  onClick={async () => { if (marketUserId) { await deposit(marketUserId, 25); await loadMarketData(); } }}
                  className="rounded-xl px-3 py-2 text-xs font-semibold text-white"
                  style={{ background: 'rgba(16,185,129,0.22)', border: '1px solid rgba(16,185,129,0.4)' }}
                >
                  Deposit +25
                </button>
              </div>
            </div>
            {marketTokens.length > 0 && (
              <div className="grid grid-cols-1 gap-2">
                {marketTokens.map((token) => (
                  <div key={token.id} className={`${glass.card} rounded-2xl p-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-white">{token.name} ({token.symbol})</div>
                        <div className="text-xs text-white/30">Price: ${Number(token.price).toFixed(4)} · MCap: ${(Number(token.price) * Number(token.supply)).toFixed(0)}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={async () => { if (marketUserId) { await buyToken(token.id, marketUserId, 1); await loadMarketData(); } }} className="rounded-lg px-2 py-1 text-xs text-emerald-300" style={{ background: 'rgba(16,185,129,0.12)' }}>Buy</button>
                        <button onClick={async () => { if (marketUserId) { await sellToken(token.id, marketUserId, 1); await loadMarketData(); } }} className="rounded-lg px-2 py-1 text-xs text-red-300" style={{ background: 'rgba(239,68,68,0.12)' }}>Sell</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {myVeksels.length === 0 ? (
              <div className={`${glass.card} rounded-2xl py-16 text-center`}>
                <div className="text-4xl mb-4 opacity-30">🎫</div>
                <div className="text-sm font-semibold text-white/30 mb-2">No tokens yet</div>
                <div className="text-xs text-white/20 mb-5">Buy SPL tokens from active ICO projects</div>
                <button onClick={() => setActiveTab('ico')} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.35)' }}>
                  Browse Projects
                </button>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className={`${glass.card} rounded-2xl p-4`}>
                  <div className="text-xs font-semibold text-white/40 mb-3">Portfolio Summary</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Invested', value: `${myVeksels.reduce((s, v) => s + v.amount * v.pricePaid, 0).toFixed(4)} SOL` },
                      { label: 'Value', value: `${totalVekselSol.toFixed(4)} SOL` },
                      { label: 'P&L', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(4)} SOL`, color: totalPnl >= 0 ? '#34d399' : '#f87171' },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <div className="text-xs font-bold tabular-nums" style={{ color: (s as { color?: string }).color ?? 'white' }}>{s.value}</div>
                        <div className="text-[9px] text-white/25 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {myVeksels.map(v => {
                  const project = projects.find(p => p.id === v.projectId);
                  const pnl = v.amount * (v.currentPrice - v.pricePaid);
                  const pnlPct = ((v.currentPrice - v.pricePaid) / v.pricePaid) * 100;
                  return (
                    <div key={v.projectId} className={`${glass.card} rounded-2xl p-5`}
                      style={{ borderColor: `${v.accentColor}22` }}>
                      <div className="flex items-start gap-3 mb-4">
                        <span className="text-2xl">{v.logo}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-bold text-white">{v.projectName}</span>
                            <Badge>{v.ticker}</Badge>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: `${v.accentColor}15`, color: v.accentColor }}>SPL</span>
                          </div>
                          <div className="text-[10px] text-white/25">Purchased {fmtDate(v.purchasedAt)}</div>
                          {v.mintAddress && (
                            <a href={`https://solscan.io/token/${v.mintAddress}${clusterQs}`} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] font-mono text-white/20 hover:text-white/40 transition">
                              {v.mintAddress.slice(0, 14)}…↗
                            </a>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold tabular-nums" style={{ color: pnlPct >= 0 ? '#34d399' : '#f87171' }}>
                            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-white/30">{pnl >= 0 ? '+' : ''}{pnl.toFixed(4)} SOL</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 mb-4">
                        {[
                          { l: 'Amount', v2: v.amount.toFixed(4) },
                          { l: 'Entry', v2: v.pricePaid.toFixed(5) },
                          { l: 'Current', v2: v.currentPrice.toFixed(5) },
                          { l: 'Value', v2: (v.amount * v.currentPrice).toFixed(4) },
                        ].map(s => (
                          <div key={s.l} className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <div className="text-xs font-bold text-white/70 tabular-nums">{s.v2}</div>
                            <div className="text-[9px] text-white/25 mt-0.5">{s.l}</div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        {project && project.status === 'active' && (
                          <button onClick={() => { setSelectedProject(project); setModal('buy'); }}
                            className="flex-1 rounded-xl py-2.5 text-xs font-bold text-white transition-all"
                            style={{ background: `${v.accentColor}25`, border: `1px solid ${v.accentColor}35` }}>
                            + Add More
                          </button>
                        )}
                        <button onClick={() => { if (project) { setSelectedProject(project); setModal('sell'); } }}
                          className="flex-1 rounded-xl py-2.5 text-xs font-semibold transition-all"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}>
                          Sell
                        </button>
                        <button onClick={() => setModal('swap')}
                          className="flex-1 rounded-xl py-2.5 text-xs font-semibold transition-all"
                          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)', color: '#fbbf24' }}>
                          Swap
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className={`${glass.card} rounded-2xl p-5`}>
              <div className="text-sm font-semibold text-white mb-3">Global Feed</div>
              <div className="space-y-2">
                {marketFeed.slice(0, 12).map((item) => (
                  <div key={item.id} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="text-[10px] text-violet-300">{item.type}</div>
                    <div className="text-xs text-white/75">{item.message}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${glass.card} rounded-2xl p-5`}>
              <div className="text-sm font-semibold text-white mb-3">Wallet Transactions</div>
              <div className="space-y-2">
                {walletHistory.slice(0, 20).map((tx) => (
                  <div key={tx.id} className="rounded-xl px-3 py-2 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div>
                      <div className="text-[10px] text-white/40">{tx.type}</div>
                      <div className="text-xs text-white/70">{tx.description}</div>
                    </div>
                    <div className="text-xs font-semibold text-white">${Number(tx.amount).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
            {icoTxs.length > 0 && (
              <div className={`${glass.card} rounded-2xl p-5`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-white">ICO Transactions</div>
                  <button onClick={() => loadIcoTxs(walletAddress ?? undefined)}
                    className="rounded-lg px-3 py-1.5 text-[10px] text-white/30 hover:text-white/60 transition flex items-center gap-1.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    Refresh
                  </button>
                </div>
                <div className="-mx-1 space-y-px">
                  {icoTxs.map((tx, i) => <IcoTxRow key={tx.txHash ?? i} tx={tx} />)}
                </div>
              </div>
            )}

            <div className={`${glass.card} rounded-2xl p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-white">SOL Transactions</div>
                {wallet.publicKey && (
                  <button onClick={() => fetchTransactions(wallet.publicKey!, connection)}
                    className="rounded-lg px-3 py-1.5 text-[10px] text-white/30 hover:text-white/60 transition flex items-center gap-1.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    Refresh
                  </button>
                )}
              </div>
              {!wallet.publicKey ? (
                <div className="py-10 text-center text-sm text-white/20">Connect your wallet to view history</div>
              ) : txLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }} />)}
                </div>
              ) : transactions.length === 0 ? (
                <div className="py-10 text-center text-sm text-white/20">No transactions found</div>
              ) : (
                <div className="-mx-1 space-y-px">{transactions.map(tx => <TxRow key={tx.signature} tx={tx} />)}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'rgba(6,8,16,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
        <div className="flex items-center justify-around h-16 max-w-2xl mx-auto px-2">
          {navItems.map(({ id, label, accent, icon, badge }) => {
            const isActive = id === 'airdrop-nav' ? modal === 'airdrop' : activeTab === id;
            return (
              <button key={id}
                onClick={() => { if (id === 'airdrop-nav') setModal('airdrop'); else setActiveTab(id as TabId); }}
                className="flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-all duration-200 active:scale-90"
                style={{ WebkitTapHighlightColor: 'transparent', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <div className="relative flex items-center justify-center rounded-2xl transition-all duration-300"
                  style={{ width: 40, height: 36, background: isActive ? `${accent}18` : 'transparent', transform: isActive ? 'translateY(-2px)' : 'none', color: isActive ? accent : 'rgba(255,255,255,0.28)' }}>
                  {icon}
                  {badge ? (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-white font-bold"
                      style={{ minWidth: 15, height: 15, fontSize: 8, background: '#ef4444', border: '2px solid #060810', padding: '0 2px' }}>
                      {badge}
                    </span>
                  ) : null}
                </div>
                <span className="text-[9px] font-medium transition-colors" style={{ color: isActive ? accent : 'rgba(255,255,255,0.25)' }}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};