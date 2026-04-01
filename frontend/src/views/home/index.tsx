/**
 * src/views/home/index.tsx  (FULLSTACK VERSION)
 *
 * Changes vs original:
 *  - BuyModal: after sending SOL → calls POST /api/buy to mint real tokens
 *  - SellModal: calls POST /api/sell after user transfers tokens back
 *  - PriceChart: fetches GET /api/chart and renders with recharts
 *  - Portfolio tab: fetches GET /api/portfolio for real on-chain balances
 *  - ICO stats: fetched from /api/chart (live raisedSol / price)
 *  - All existing features (Send/Receive/Swap/Airdrop) UNTOUCHED
 */

import { FC, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
import useUserSOLBalanceStore from '../../stores/useUserSOLBalanceStore';
import useTransactionStore, { TxRecord } from '../../stores/useTransactionStore';
import { notify } from '../../utils/notifications';
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
} from 'recharts';

const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const TradingPanel = dynamic(() => import('../../components/TradingPanel'), { ssr: false });

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
  color: string;
  glow: string;
  status: 'active' | 'completed' | 'upcoming';
  mintAddress?: string | null;
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
  color: string;
  logo: string;
  mintAddress?: string | null;
}

interface ChartPoint { timestamp: number; price: number; volume: number; }

// ─── Projects Data ────────────────────────────────────────────────────────────
const BASE_PROJECTS: IcoProject[] = [
  {
    id: 'oracle-data',
    name: 'Oracle Data Network',
    ticker: 'ODN',
    logo: '🔮',
    category: 'DeFi Infrastructure',
    description: 'Децентрализованная сеть оракулов для Solana. Реальные данные из мира — в блокчейн за миллисекунды.',
    promises: ['Запуск mainnet Q3 2025', 'Интеграция с 50+ DeFi протоколами', 'Стейкинг 12% APY для держателей', 'DAO-управление с 6 месяцев'],
    goalSol: 5000, raisedSol: 3247, vekselPrice: 0.15, totalVeksels: 100000, soldVeksels: 64200,
    deadline: '2025-08-01', apy: 12, tags: ['DeFi', 'Oracle', 'DAO'],
    color: 'rgba(139,92,246,0.12)', glow: 'rgba(139,92,246,0.8)', status: 'active',
  },
  {
    id: 'green-chain',
    name: 'GreenChain Protocol',
    ticker: 'GCP',
    logo: '🌱',
    category: 'RWA / Carbon',
    description: 'Токенизация углеродных кредитов на Solana. Каждый вексель = 1 тонна CO₂. Верифицировано Verra.',
    promises: ['Партнёрство с Verra Registry', 'Листинг на Raydium Q4 2025', 'Buyback 20% прибыли ежеквартально', 'Аудит Certik в процессе'],
    goalSol: 8000, raisedSol: 2150, vekselPrice: 0.08, totalVeksels: 200000, soldVeksels: 41800,
    deadline: '2025-10-15', apy: 18, tags: ['RWA', 'Carbon', 'ESG'],
    color: 'rgba(16,185,129,0.1)', glow: 'rgba(16,185,129,0.8)', status: 'active',
  },
  {
    id: 'ai-compute',
    name: 'NeuralMesh AI',
    ticker: 'NMA',
    logo: '🤖',
    category: 'AI / Compute',
    description: 'Распределённая GPU-сеть для AI-инференса. Продавай вычислительные мощности, получай NMA.',
    promises: ['Первая транзакция AI Q2 2025', '500 GPU-узлов к концу года', 'Интеграция с Render Network', 'Токен-сплит 2:1 при капитализации $10M'],
    goalSol: 12000, raisedSol: 9800, vekselPrice: 0.25, totalVeksels: 80000, soldVeksels: 72000,
    deadline: '2025-07-01', apy: 22, tags: ['AI', 'GPU', 'Compute'],
    color: 'rgba(59,130,246,0.1)', glow: 'rgba(59,130,246,0.8)', status: 'active',
  },
  {
    id: 'reit-sol',
    name: 'SolEstate REIT',
    ticker: 'SREIT',
    logo: '🏢',
    category: 'Real Estate / RWA',
    description: 'Токенизированная недвижимость в ОАЭ и Сингапуре. NFT = доля в конкретном объекте.',
    promises: ['3 объекта уже в портфеле', 'Рентный доход 8% годовых в USDC', 'Ежемесячные выплаты держателям', 'Юридическая структура SPV Дубай'],
    goalSol: 20000, raisedSol: 4500, vekselPrice: 1.2, totalVeksels: 10000, soldVeksels: 2800,
    deadline: '2025-12-31', apy: 8, tags: ['RWA', 'Real Estate', 'REIT'],
    color: 'rgba(245,158,11,0.1)', glow: 'rgba(245,158,11,0.8)', status: 'active',
  },
  {
    id: 'depin-mesh',
    name: 'MeshNet DePIN',
    ticker: 'MESH',
    logo: '📡',
    category: 'DePIN',
    description: 'Децентрализованная 5G-сеть. Устанавливай хотспот — получай MESH. Пилот в 12 городах.',
    promises: ['Пилот в Ташкенте, Дубае, Сингапуре', 'Хардварные устройства Q3 2025', 'Роуминг-партнёрство с операторами', '15% от выручки сети — держателям'],
    goalSol: 3000, raisedSol: 3000, vekselPrice: 0.05, totalVeksels: 500000, soldVeksels: 500000,
    deadline: '2025-06-01', apy: 15, tags: ['DePIN', '5G', 'IoT'],
    color: 'rgba(236,72,153,0.1)', glow: 'rgba(236,72,153,0.8)', status: 'completed',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function short(addr: string) {
  if (!addr || addr.length < 8) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function daysLeft(deadline: string) {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000));
}
function pct(a: number, b: number) {
  return Math.min(100, Math.round((a / b) * 100));
}

// ─── UI Components ────────────────────────────────────────────────────────────
const Tab: FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button onClick={onClick} className="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200"
    style={{ background: active ? 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.15))' : 'transparent', border: `1px solid ${active ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`, color: active ? '#c4b5fd' : '#64748b' }}>
    {children}
  </button>
);

const ProgressBar: FC<{ value: number; color: string }> = ({ value, color }) => (
  <div className="relative h-2 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color, boxShadow: `0 0 10px ${color}88` }} />
  </div>
);

const ActionBtn: FC<{ label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; color: string; glow: string }> = ({ label, icon, onClick, disabled, color, glow }) => (
  <button onClick={onClick} disabled={disabled}
    className="flex flex-col items-center gap-1.5 rounded-2xl p-3 transition-all duration-200 disabled:opacity-40 active:scale-95"
    style={{ background: color, border: '1px solid rgba(255,255,255,0.07)' }}
    onMouseEnter={e => !disabled && ((e.currentTarget as HTMLElement).style.boxShadow = glow, (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}>
    <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: 'rgba(255,255,255,0.07)' }}>{icon}</span>
    <span className="text-[9px] font-bold text-slate-500 tracking-wide leading-tight text-center">{label}</span>
  </button>
);

// ─── Price Chart Component ────────────────────────────────────────────────────
const PriceChart: FC<{ projectId: string; glow: string }> = ({ projectId, glow }) => {
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [period, setPeriod] = useState<'1h' | '24h' | '7d'>('24h');
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ currentPrice: number; change24h: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/chart?projectId=${projectId}&period=${period}`)
      .then(r => r.json())
      .then(d => {
        setPoints(d.points ?? []);
        setMeta({ currentPrice: d.currentPrice, change24h: d.change24h });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId, period]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    if (period === '7d') return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const color = glow.replace('0.8', '1');
  const priceUp = (meta?.change24h ?? 0) >= 0;

  return (
    <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-black text-white">
            {meta ? `${meta.currentPrice.toFixed(6)} SOL` : '…'}
          </span>
          {meta && (
            <span className={`ml-2 text-xs font-bold ${priceUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {priceUp ? '▲' : '▼'} {Math.abs(meta.change24h).toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {(['1h', '24h', '7d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className="rounded-xl px-2 py-0.5 text-[10px] font-bold transition-all"
              style={{ background: period === p ? 'rgba(139,92,246,0.22)' : 'rgba(255,255,255,0.04)', color: period === p ? '#c4b5fd' : '#64748b', border: `1px solid ${period === p ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}` }}>
              {p}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="h-24 flex items-center justify-center text-xs text-slate-600">Загружаем…</div>
      ) : points.length < 2 ? (
        <div className="h-24 flex items-center justify-center text-xs text-slate-600">Недостаточно данных</div>
      ) : (
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="timestamp" tickFormatter={fmtTime} tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => v.toFixed(4)} />
            <Tooltip
              contentStyle={{ background: '#0f1729', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11 }}
              labelFormatter={fmtTime}
              formatter={(v: number) => [`${v.toFixed(6)} SOL`, 'Цена']}
            />
            <Line type="monotone" dataKey="price" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color }} />
          </LineChart>
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

  return (
    <div className="relative overflow-hidden rounded-[24px] p-5 transition-all duration-300"
      style={{ background: `linear-gradient(145deg, ${p.color} 0%, rgba(255,255,255,0.015) 100%)`, border: `1px solid ${p.glow.replace('0.8', '0.18')}`, boxShadow: mine ? `0 0 30px ${p.glow.replace('0.8', '0.1')}` : 'none' }}>
      <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full pointer-events-none" style={{ background: `radial-gradient(ellipse, ${p.glow.replace('0.8', '0.15')} 0%, transparent 70%)` }} />

      <div className="flex items-start gap-3 mb-3">
        <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }}>{p.logo}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-black text-white">{p.name}</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.07)', color: '#64748b' }}>{p.ticker}</span>
            {isCompleted && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-400" style={{ background: 'rgba(16,185,129,0.12)' }}>✓ Завершён</span>}
            {mine && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-violet-300" style={{ background: 'rgba(139,92,246,0.15)' }}>✦ Есть</span>}
            {p.mintAddress && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-300" style={{ background: 'rgba(16,185,129,0.1)' }}>🪙 On-chain</span>}
          </div>
          <span className="text-[10px] text-slate-600">{p.category}</span>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-black text-white">{p.vekselPrice.toFixed(6)} SOL</div>
          <div className="text-[10px] text-slate-600">за токен</div>
        </div>
      </div>

      {/* Live chart toggle */}
      <button
        onClick={() => onToggleChart(p.id)}
        className="mb-3 w-full rounded-xl py-1.5 text-[10px] font-bold transition-all flex items-center justify-center gap-1.5"
        style={{ background: showChart === p.id ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${showChart === p.id ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)'}`, color: showChart === p.id ? '#c4b5fd' : '#64748b' }}>
        📈 {showChart === p.id ? 'Скрыть график' : 'График цены'}
      </button>
      {showChart === p.id && <PriceChart projectId={p.id} glow={p.glow} />}

      <p className="text-xs text-slate-400 leading-relaxed mb-3">{p.description}</p>

      <div className="mb-3 space-y-1">
        {p.promises.map((pr, i) => (
          <div key={i} className="flex items-start gap-1.5 text-xs text-slate-300">
            <span className="flex-shrink-0 text-emerald-400 mt-0.5">✓</span><span>{pr}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {p.tags.map(t => <span key={t} className="rounded-xl px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.05)' }}>{t}</span>)}
        <span className="rounded-xl px-2 py-0.5 text-[10px] font-bold text-emerald-400" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.12)' }}>APY {p.apy}%</span>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-500">Сбор</span>
          <span className="font-bold text-white">{p.raisedSol.toLocaleString('en-US')} / {p.goalSol.toLocaleString('en-US')} SOL · {progress}%</span>
        </div>
        <ProgressBar value={progress} color={p.glow} />
        <div className="flex justify-between mt-1 text-[10px] text-slate-600">
          <span>Осталось: {isCompleted ? '—' : `${daysLeft(p.deadline)} дн.`}</span>
          <span>Токенов: {p.soldVeksels.toLocaleString('en-US')} / {p.totalVeksels.toLocaleString('en-US')}</span>
        </div>
      </div>

      {mine && (
        <div className="mb-3 rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)' }}>
          <div className="flex justify-between text-xs">
            <span className="text-violet-300 font-semibold">Моя позиция: {mine.amount.toFixed(4)} токенов</span>
            <span className={mine.currentPrice >= mine.pricePaid ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
              {mine.currentPrice >= mine.pricePaid ? '+' : ''}{(((mine.currentPrice - mine.pricePaid) / mine.pricePaid) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => onBuy(p)} disabled={isCompleted}
          className="flex-1 rounded-2xl py-2.5 text-xs font-black text-white transition-all duration-200 disabled:opacity-40"
          style={{ background: isCompleted ? 'rgba(255,255,255,0.04)' : `linear-gradient(135deg, ${p.glow}, ${p.glow.replace('0.8', '0.5')})`, boxShadow: isCompleted ? 'none' : `0 4px 16px ${p.glow.replace('0.8', '0.3')}` }}>
          {isCompleted ? 'Завершён' : '🎫 Купить токены'}
        </button>
        {mine && (
          <button onClick={() => onSell(p)}
            className="flex-1 rounded-2xl py-2.5 text-xs font-black transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#94a3b8' }}>
            💱 Продать
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Buy Modal (REAL SPL minting) ─────────────────────────────────────────────
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_WALLET ?? 'DVXt9pcAUPNEfFRuiXGxNMFuT7SAabABcxqb7Hn5Y7FE';

const BuyModal: FC<{
  project: IcoProject;
  balance: number;
  onClose: () => void;
  onSuccess: (v: MyVeksel) => void;
}> = ({ project: p, balance, onClose, onSuccess }) => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
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
      // ── Step 1: ensure token is created ─────────────────────────────────────
      if (!p.mintAddress) {
        setStep('minting');
        const createRes = await fetch('/api/create-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: p.id }),
        });
        if (!createRes.ok) {
          const { error } = await createRes.json();
          throw new Error(error ?? 'Failed to create token');
        }
      }

      // ── Step 2: send SOL to treasury ─────────────────────────────────────────
      setStep('sending');
      const lamports = Math.round(total * LAMPORTS_PER_SOL);
      const ix = [SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(TREASURY),
        lamports,
      })];
      const lb = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: lb.blockhash,
        instructions: ix,
      }).compileToLegacyMessage();
      const sig = await sendTransaction(new VersionedTransaction(msg), connection);
      await connection.confirmTransaction({ signature: sig, ...lb }, 'confirmed');
      notify({ type: 'success', message: `💸 SOL отправлен (${sig.slice(0, 8)}…)`, txid: sig });

      // ── Step 3: call backend to mint tokens ───────────────────────────────────
      setStep('minting');
      const buyRes = await fetch('/api/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          projectId: p.id,
          solAmount: total,
          txHash: sig,
        }),
      });

      if (!buyRes.ok) {
        const { error } = await buyRes.json();
        throw new Error(error ?? 'Backend buy failed');
      }

      const data = await buyRes.json();
      notify({
        type: 'success',
        message: `🎫 Куплено ${data.tokenAmount.toFixed(4)} ${p.ticker}! ATA: ${data.ata.slice(0, 8)}…`,
        txid: sig,
      });

      setStep('done');
      onSuccess({
        projectId: p.id,
        projectName: p.name,
        ticker: p.ticker,
        logo: p.logo,
        amount: data.tokenAmount,
        pricePaid: p.vekselPrice,
        currentPrice: data.newPrice ?? p.vekselPrice,
        type: 'spl',
        purchasedAt: Date.now() / 1000,
        color: p.glow,
        mintAddress: data.mintAddress,
      });
      onClose();
    } catch (e: any) {
      notify({ type: 'error', message: e.message ?? 'Ошибка' });
      setStep('input');
    }
    setBusy(false);
  };

  const stepLabel = { input: null, sending: 'Отправляем SOL…', minting: 'Минтим токены…', done: 'Готово!' }[step];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'linear-gradient(145deg, #12172a, #0b0f1e)', border: `1px solid ${p.glow.replace('0.8', '0.22')}`, boxShadow: `0 0 50px ${p.glow.replace('0.8', '0.1')}, 0 30px 80px rgba(0,0,0,0.8)` }}
        onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{p.logo}</span>
              <div>
                <div className="text-base font-black text-white">{p.name}</div>
                <div className="text-xs text-slate-500">{p.ticker} · {p.vekselPrice.toFixed(6)} SOL/токен · SPL</div>
              </div>
            </div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/6 text-slate-400 hover:text-white transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>

          {p.mintAddress && (
            <div className="mb-3 rounded-xl px-3 py-2 text-[10px] text-emerald-400 font-mono" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
              Mint: {p.mintAddress.slice(0, 20)}…
            </div>
          )}

          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold text-slate-500 uppercase tracking-wider">Количество токенов</label>
            <div className="flex items-center gap-2">
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="1" step="1"
                className="flex-1 rounded-2xl px-4 py-3 text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
              {[1, 5, 10].map(n => (
                <button key={n} onClick={() => setAmount(String(n))}
                  className="rounded-xl px-3 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>{n}</button>
              ))}
            </div>
          </div>

          <div className="mb-4 rounded-2xl p-4 space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex justify-between text-xs text-slate-400"><span>Цена × кол-во</span><span className="text-white">{p.vekselPrice.toFixed(6)} × {qty} = {total.toFixed(6)} SOL</span></div>
            <div className="h-px bg-white/5" />
            <div className="flex justify-between text-sm font-black"><span className="text-slate-300">Итого</span><span className="text-white">{total.toFixed(6)} SOL</span></div>
            {total > balance && <p className="text-xs text-red-400">Недостаточно SOL (у вас {balance.toFixed(4)})</p>}
          </div>

          {stepLabel && (
            <div className="mb-3 text-xs text-amber-400 text-center animate-pulse">{stepLabel}</div>
          )}

          <button onClick={onBuy} disabled={busy || !canBuy}
            className="w-full rounded-2xl py-3.5 text-sm font-black text-white transition-all disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${p.glow}, ${p.glow.replace('0.8', '0.5')})`, boxShadow: canBuy ? `0 8px 28px ${p.glow.replace('0.8', '0.35')}` : 'none' }}>
            {busy
              ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" /></svg>{stepLabel ?? 'Покупка…'}</span>
              : `🎫 Купить ${qty} токенов за ${total.toFixed(6)} SOL`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Sell Modal (REAL token transfer) ─────────────────────────────────────────
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
      if (!veksel.mintAddress) notify({ type: 'error', message: 'Mint address missing. The token may not have been created on-chain yet.' });
      return;
    }
    setBusy(true);
    try {
      // Dynamic import to avoid SSR issues
      const { getOrCreateAssociatedTokenAccount, createTransferCheckedInstruction, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      const { Transaction } = await import('@solana/web3.js');

      const mintPubkey = new PublicKey(veksel.mintAddress);
      const treasuryPubkey = new PublicKey(TREASURY);
      const decimals = 6;

      // Get sender ATA (buyer's)
      const { getAssociatedTokenAddressSync } = await import('@solana/spl-token');
      const senderAta = getAssociatedTokenAddressSync(mintPubkey, publicKey);
      const receiverAta = getAssociatedTokenAddressSync(mintPubkey, treasuryPubkey);

      const rawAmount = BigInt(Math.floor(qty * Math.pow(10, decimals)));

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      const transferIx = createTransferCheckedInstruction(
        senderAta,
        mintPubkey,
        receiverAta,
        publicKey,
        rawAmount,
        decimals
      );

      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey });
      tx.add(transferIx);

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      notify({ type: 'success', message: `✅ Токены отправлены! Ожидаем SOL…`, txid: sig });

      // Call backend to send SOL back
      const sellRes = await fetch('/api/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          projectId: p.id,
          tokenAmount: qty,
          txHash: sig,
        }),
      });

      if (!sellRes.ok) {
        const { error } = await sellRes.json();
        throw new Error(error ?? 'Backend sell failed');
      }

      const data = await sellRes.json();
      notify({ type: 'success', message: `💱 Продано! Получено ${data.solPayout.toFixed(6)} SOL`, txid: data.payoutTxHash });
      onSuccess(p.id, qty);
      onClose();
    } catch (e: any) {
      notify({ type: 'error', message: e.message ?? 'Ошибка продажи' });
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'linear-gradient(145deg, #12172a, #0b0f1e)', border: '1px solid rgba(239,68,68,0.18)', boxShadow: '0 0 50px rgba(239,68,68,0.07), 0 30px 80px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-base font-black text-white">Продать токены</div>
              <div className="text-xs text-slate-500">{p.name} · {p.ticker}</div>
            </div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/6 text-slate-400 hover:text-white transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>

          <div className="mb-4 rounded-2xl p-3.5" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.14)' }}>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Позиция: <span className="text-white font-bold">{veksel.amount.toFixed(4)} токенов 🪙 SPL</span></span>
              <span className={pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{pnl >= 0 ? '+' : ''}{(((veksel.currentPrice - veksel.pricePaid) / veksel.pricePaid) * 100).toFixed(1)}%</span>
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold text-slate-500 uppercase tracking-wider">Продать (макс. {veksel.amount.toFixed(4)})</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="1" max={veksel.amount}
              className="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>

          <div className="mb-4 rounded-2xl p-4 space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex justify-between text-xs text-slate-400"><span>Цена продажи</span><span className="text-white">{veksel.currentPrice.toFixed(6)} SOL/шт.</span></div>
            <div className="flex justify-between text-xs text-slate-400"><span>Комиссия платформы</span><span className="text-white">3%</span></div>
            <div className="h-px bg-white/5" />
            <div className="flex justify-between text-sm font-black"><span className="text-slate-300">Получите</span><span className="text-emerald-400">{receiveSOL.toFixed(6)} SOL</span></div>
          </div>

          {!veksel.mintAddress && (
            <div className="mb-3 text-xs text-amber-400 rounded-xl px-3 py-2" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
              ⚠️ Mint address отсутствует. Продажа работает только для on-chain токенов.
            </div>
          )}

          <button onClick={onSell} disabled={busy || qty <= 0 || !veksel.mintAddress}
            className="w-full rounded-2xl py-3.5 text-sm font-black text-white transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', boxShadow: qty > 0 ? '0 8px 28px rgba(220,38,38,0.3)' : 'none' }}>
            {busy
              ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" /></svg>Продажа…</span>
              : `💱 Продать ${qty.toFixed(4)} шт. → ${receiveSOL.toFixed(6)} SOL`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Airdrop Modal ────────────────────────────────────────────────────────────
// ─── ICO Airdrop data (per project, simulated drops) ─────────────────────────
const ICO_AIRDROPS = [
  { projectId: 'oracle-data', name: 'Oracle Data Network', ticker: 'ODN', logo: '🔮', bonus: 500, deadline: '2025-07-15', color: 'rgba(139,92,246,0.8)', desc: 'Ранний холдер бонус × 5 за каждый токен' },
  { projectId: 'green-chain', name: 'GreenChain Protocol', ticker: 'GCP', logo: '🌱', bonus: 300, deadline: '2025-08-01', color: 'rgba(16,185,129,0.8)', desc: 'Экологический аирдроп для держателей' },
  { projectId: 'ai-compute', name: 'NeuralMesh AI', ticker: 'NMA', logo: '🤖', bonus: 1000, deadline: '2025-06-30', color: 'rgba(59,130,246,0.8)', desc: 'AI Genesis Drop — первым участникам' },
  { projectId: 'reit-sol', name: 'SolEstate REIT', ticker: 'SREIT', logo: '🏢', bonus: 200, deadline: '2025-12-01', color: 'rgba(245,158,11,0.8)', desc: 'Рентный бонус для держателей SREIT' },
];

const AirdropModal: FC<{ onClose: () => void; myVeksels: MyVeksel[]; onOpenCreateICO: () => void }> = ({ onClose, myVeksels, onOpenCreateICO }) => {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
const getUserSOLBalance = useUserSOLBalanceStore(s => s.getUserSOLBalance);
const solPrice = useUserSOLBalanceStore(s => s.solPrice);
  const [busy, setBusy] = useState(false);
  const [claimedDevnet, setClaimedDevnet] = useState(false);
  const [claimedIco, setClaimedIco] = useState<string[]>([]);
  const [tab, setTab] = useState<'devnet' | 'ico'>('devnet');
  const [network, setNetwork] = useState<'devnet' | 'mainnet'>('devnet');

  const devnetAirdrop = async () => {
    if (!publicKey) return;
    if (network === 'mainnet') {
      notify({ type: 'error', message: 'Аирдроп SOL доступен только на Devnet' });
      return;
    }
    setBusy(true);
    try {
      const sig = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
      const lb = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...lb }, 'confirmed');
      notify({ type: 'success', message: '⚡ Аирдроп 1 SOL получен!', txid: sig });
      getUserSOLBalance(publicKey, connection);
      setClaimedDevnet(true);
    } catch (e: any) {
      notify({ type: 'error', message: 'Ошибка аирдропа. Убедитесь что подключены к Devnet.' });
    }
    setBusy(false);
  };

  const claimIcoAirdrop = async (projectId: string, bonus: number, ticker: string) => {
    if (!publicKey) return;
    setBusy(true);
    await new Promise(r => setTimeout(r, 1500));
    notify({ type: 'success', message: `🎉 Получено ${bonus} ${ticker} от аирдропа!` });
    setClaimedIco(prev => [...prev, projectId]);
    setBusy(false);
  };

  // Eligible drops = projects where user holds tokens
  const eligibleDrops = ICO_AIRDROPS.filter(d => myVeksels.some(v => v.projectId === d.projectId));
  const upcomingDrops = ICO_AIRDROPS.filter(d => !myVeksels.some(v => v.projectId === d.projectId));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'linear-gradient(145deg, #12172a, #0b0f1e)', border: '1px solid rgba(59,130,246,0.22)', boxShadow: '0 0 50px rgba(59,130,246,0.1), 0 30px 80px rgba(0,0,0,0.8)', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div><div className="text-lg font-black text-white">🎁 Аирдроп</div><div className="text-xs text-slate-500">Бесплатные токены от проектов</div></div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/6 text-slate-400 hover:text-white transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>

          <div className="flex gap-2 mb-5">
            <Tab active={tab === 'devnet'} onClick={() => setTab('devnet')}>Devnet SOL</Tab>
            <Tab active={tab === 'ico'} onClick={() => setTab('ico')}>ICO Токены</Tab>
          </div>

          {tab === 'devnet' && (
            <div className="space-y-4">
              {/* Network switcher */}
              <div className="flex gap-1.5 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {(['devnet', 'mainnet'] as const).map(net => (
                  <button key={net} onClick={() => setNetwork(net)}
                    className="flex-1 rounded-xl py-2 text-xs font-bold transition-all"
                    style={{ background: network === net ? (net === 'devnet' ? 'rgba(37,99,235,0.4)' : 'rgba(139,92,246,0.3)') : 'transparent', color: network === net ? 'white' : '#64748b', border: `1px solid ${network === net ? (net === 'devnet' ? 'rgba(37,99,235,0.5)' : 'rgba(139,92,246,0.4)') : 'transparent'}` }}>
                    {net === 'devnet' ? '🧪 Devnet' : '🌐 Mainnet'}
                  </button>
                ))}
              </div>

              {network === 'devnet' ? (
                <>
                  <div className="rounded-2xl p-4" style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.14)' }}>
                    <p className="text-sm font-bold text-white mb-1">Devnet тестовый SOL</p>
                    <p className="text-xs text-slate-400">Получи 1 SOL бесплатно для тестирования. Только Devnet, без реальной ценности.</p>
                  </div>
                  <button onClick={devnetAirdrop} disabled={busy || claimedDevnet}
                    className="w-full rounded-2xl py-3.5 text-sm font-black text-white transition-all disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', boxShadow: '0 8px 28px rgba(37,99,235,0.35)' }}>
                    {busy ? '⏳ Запрашиваем…' : claimedDevnet ? '✅ Получено!' : '⚡ Получить 1 SOL (Devnet)'}
                  </button>
                </>
              ) : (
                <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <div className="text-3xl mb-2">🌐</div>
                  <p className="text-sm font-bold text-white mb-1">Mainnet</p>
                  <p className="text-xs text-slate-400 mb-4">На Mainnet нет бесплатного SOL аирдропа. Используйте биржу или купите SOL.</p>
                  <button onClick={() => { onClose(); }}
                    className="rounded-2xl px-5 py-2.5 text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                    Своп / купить SOL →
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'ico' && (
            <div className="space-y-4">
              {/* Create your own token CTA */}
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(99,102,241,0.06))', border: '1px solid rgba(139,92,246,0.22)' }}>
                <span className="text-2xl flex-shrink-0">🪙</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-violet-300">Хочешь свой ICO?</p>
                  <p className="text-[10px] text-slate-500">Выпусти свою монету и запусти аирдроп</p>
                </div>
                <button onClick={() => { onClose(); onOpenCreateICO(); }}
                  className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-black text-white"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                  Создать →
                </button>
              </div>

              {/* Eligible drops (user holds tokens) */}
              {eligibleDrops.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-emerald-400 mb-2 uppercase tracking-wider">✅ Доступные аирдропы</div>
                  <div className="space-y-2">
                    {eligibleDrops.map(d => {
                      const isClaimed = claimedIco.includes(d.projectId);
                      const myVeksel = myVeksels.find(v => v.projectId === d.projectId);
                      const myBonus = myVeksel ? Math.floor(myVeksel.amount * 5) : d.bonus;
                      return (
                        <div key={d.projectId} className="rounded-2xl p-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">{d.logo}</span>
                            <div className="flex-1">
                              <div className="text-sm font-bold text-white">{d.name}</div>
                              <div className="text-[10px] text-slate-500">{d.desc}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-black text-emerald-400">+{myBonus} {d.ticker}</div>
                              <div className="text-[10px] text-slate-600">бонус</div>
                            </div>
                          </div>
                          <button onClick={() => claimIcoAirdrop(d.projectId, myBonus, d.ticker)} disabled={busy || isClaimed}
                            className="w-full rounded-xl py-2 text-xs font-black text-white transition-all disabled:opacity-40"
                            style={{ background: isClaimed ? 'rgba(16,185,129,0.15)' : 'linear-gradient(135deg, #059669, #047857)', color: isClaimed ? '#34d399' : 'white' }}>
                            {isClaimed ? '✅ Получено!' : busy ? '⏳ Начисляем…' : `🎁 Получить ${myBonus} ${d.ticker}`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upcoming/unavailable drops */}
              <div>
                <div className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
                  {eligibleDrops.length === 0 ? '📋 Все аирдропы проектов' : '🔒 Недоступные аирдропы'}
                </div>
                <div className="space-y-2">
                  {upcomingDrops.map(d => (
                    <div key={d.projectId} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xl opacity-50">{d.logo}</span>
                        <div className="flex-1">
                          <div className="text-sm font-bold text-slate-400">{d.name}</div>
                          <div className="text-[10px] text-slate-600">{d.desc}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-slate-600">+{d.bonus} {d.ticker}</div>
                          <div className="text-[10px] text-red-500 font-bold">Купи токены →</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {upcomingDrops.length > 0 && (
                  <p className="text-[10px] text-slate-600 mt-2 text-center">Купи токены проекта чтобы участвовать в аирдропе</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Create ICO Modal ─────────────────────────────────────────────────────────
const CreateICOModal: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { publicKey } = useWallet();
  const [step, setStep] = useState<'form' | 'creating' | 'done'>('form');
  const [form, setForm] = useState({ name: '', ticker: '', supply: '1000000', price: '0.01', description: '', logo: '🪙' });
  const [result, setResult] = useState<{ mintAddress: string; projectId: string } | null>(null);

  const logos = ['🪙', '🚀', '💎', '🔥', '⚡', '🌟', '🦁', '🐉', '🎯', '🏆'];

  const onCreate = async () => {
    if (!publicKey || !form.name || !form.ticker) return;
    setStep('creating');
    // Simulate token creation (real integration would call /api/create-token)
    await new Promise(r => setTimeout(r, 2500));
    const fakeMint = `${Math.random().toString(36).slice(2, 10).toUpperCase()}mint${Math.random().toString(36).slice(2, 6)}`;
    setResult({ mintAddress: fakeMint, projectId: form.ticker.toLowerCase() });
    setStep('done');
    notify({ type: 'success', message: `🎉 Токен ${form.ticker} создан! Запускайте ICO!` });
  };

  const canCreate = !!publicKey && form.name.trim().length > 1 && form.ticker.trim().length >= 2 && form.ticker.length <= 6;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'linear-gradient(145deg, #12172a, #0b0f1e)', border: '1px solid rgba(139,92,246,0.25)', boxShadow: '0 0 50px rgba(139,92,246,0.12), 0 30px 80px rgba(0,0,0,0.8)', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-lg font-black text-white">🪙 Создать токен</div>
              <div className="text-xs text-slate-500">Выпусти свою монету и запусти ICO</div>
            </div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/6 text-slate-400 hover:text-white transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>

          {step === 'done' && result ? (
            <div className="space-y-4 text-center">
              <div className="text-5xl mb-2">{form.logo}</div>
              <div className="text-xl font-black text-white">{form.name}</div>
              <div className="text-sm text-emerald-400 font-bold">${form.ticker} успешно создан!</div>
              <div className="rounded-2xl p-4 text-left" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}>
                <div className="text-xs text-slate-500 mb-1">Mint Address</div>
                <div className="font-mono text-xs text-emerald-400 break-all">{result.mintAddress}</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: 'Тикер', v: `$${form.ticker}` },
                  { l: 'Эмиссия', v: parseInt(form.supply).toLocaleString('en-US') },
                  { l: 'Цена', v: `${form.price} SOL` },
                ].map(s => (
                  <div key={s.l} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-xs font-black text-white">{s.v}</div>
                    <div className="text-[9px] text-slate-600 mt-0.5">{s.l}</div>
                  </div>
                ))}
              </div>
              <button onClick={onClose}
                className="w-full rounded-2xl py-3.5 text-sm font-black text-white"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                Отлично! Закрыть →
              </button>
            </div>
          ) : step === 'creating' ? (
            <div className="py-12 text-center space-y-4">
              <div className="text-4xl animate-bounce">{form.logo}</div>
              <div className="text-base font-bold text-white">Создаём токен…</div>
              <div className="text-xs text-slate-500">Минтим SPL токен на Devnet Solana</div>
              <div className="flex justify-center gap-1 mt-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-2 w-2 rounded-full animate-pulse" style={{ background: 'rgba(139,92,246,0.8)', animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Logo picker */}
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Логотип</div>
                <div className="flex gap-2 flex-wrap">
                  {logos.map(l => (
                    <button key={l} onClick={() => setForm(f => ({ ...f, logo: l }))}
                      className="h-10 w-10 rounded-xl text-xl transition-all"
                      style={{ background: form.logo === l ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)', border: `1px solid ${form.logo === l ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.07)'}`, transform: form.logo === l ? 'scale(1.1)' : 'scale(1)' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {[
                { key: 'name', label: 'Название токена', placeholder: 'Например: My Awesome Token', maxLen: 50 },
                { key: 'ticker', label: 'Тикер (2–6 букв)', placeholder: 'Например: MAT', maxLen: 6 },
                { key: 'description', label: 'Описание (опционально)', placeholder: 'Расскажи о своём проекте…', maxLen: 200 },
              ].map(({ key, label, placeholder, maxLen }) => (
                <div key={key}>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</div>
                  <input
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value.slice(0, maxLen) }))}
                    placeholder={placeholder}
                    className="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'supply', label: 'Эмиссия токенов', placeholder: '1000000' },
                  { key: 'price', label: 'Цена (SOL/токен)', placeholder: '0.01' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</div>
                    <input
                      value={(form as any)[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      type="number"
                      min="0"
                      className="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                  </div>
                ))}
              </div>

              {!publicKey && (
                <div className="rounded-xl px-4 py-3 text-xs text-amber-400" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  ⚠️ Подключите кошелёк для создания токена
                </div>
              )}

              <button onClick={onCreate} disabled={!canCreate}
                className="w-full rounded-2xl py-3.5 text-sm font-black text-white transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: canCreate ? '0 8px 28px rgba(124,58,237,0.38)' : 'none' }}>
                🪙 Создать токен и запустить ICO
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Swap Modal ───────────────────────────────────────────────────────────────
const SOL_MINT = 'So11111111111111111111111111111111111111112';
interface JupToken { address: string; symbol: string; name: string; decimals: number; logoURI?: string; }

const SwapModal: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { getUserSOLBalance } = useUserSOLBalanceStore();
  const [tokens, setTokens] = useState<JupToken[]>([]);
  const [search, setSearch] = useState('');
  const [outMint, setOutMint] = useState<JupToken | null>(null);
  const [inAmount, setInAmount] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'select' | 'swap'>('select');
  const debRef = useRef<any>(null);

  useEffect(() => { fetch('https://token.jup.ag/strict').then(r => r.json()).then((l: JupToken[]) => setTokens(l.filter(t => t.address !== SOL_MINT))).catch(() => {}); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return tokens.slice(0, 80);
    const q = search.toLowerCase();
    return tokens.filter(t => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)).slice(0, 60);
  }, [tokens, search]);

  useEffect(() => {
    if (!outMint || !inAmount || parseFloat(inAmount) <= 0) { setQuote(null); return; }
    clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      setQuoting(true);
      try {
        const res = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${outMint.address}&amount=${Math.round(parseFloat(inAmount) * LAMPORTS_PER_SOL)}&slippageBps=50`);
        const data = await res.json();
        setQuote(data.error ? null : data);
      } catch { setQuote(null); }
      setQuoting(false);
    }, 600);
  }, [outMint, inAmount]);

  const outAmount = useMemo(() => {
    if (!quote || !outMint) return null;
    return (parseInt(quote.outAmount) / Math.pow(10, outMint.decimals)).toFixed(4);
  }, [quote, outMint]);

  const onSwap = useCallback(async () => {
    if (!publicKey || !quote || !outMint) return;
    setBusy(true);
    try {
      const { swapTransaction, error } = await (await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteResponse: quote, userPublicKey: publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: 'auto' }),
      })).json();
      if (error) throw new Error(error);
      const tx = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(swapTransaction, 'base64')));
      const sig = await sendTransaction(tx, connection, { skipPreflight: false, maxRetries: 3 });
      const lb = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...lb }, 'confirmed');
      notify({ type: 'success', message: `✅ ${inAmount} SOL → ${outAmount} ${outMint.symbol}`, txid: sig });
      getUserSOLBalance(publicKey, connection);
      onClose();
    } catch (e: any) { notify({ type: 'error', message: e.message ?? 'Своп не удался' }); }
    setBusy(false);
  }, [publicKey, quote, outMint, inAmount, outAmount, connection, sendTransaction, getUserSOLBalance, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl flex flex-col"
        style={{ background: 'linear-gradient(145deg, #12172a, #0b0f1e)', border: '1px solid rgba(251,191,36,0.2)', boxShadow: '0 0 50px rgba(251,191,36,0.08), 0 30px 80px rgba(0,0,0,0.8)', maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 pb-4 flex-shrink-0">
          <div><div className="text-lg font-black text-white">{step === 'select' ? '🔍 Выбери токен' : '💱 Своп SOL'}</div><div className="text-xs text-slate-500 mt-0.5">{step === 'select' ? 'SOL → любой SPL токен' : 'Jupiter · лучший маршрут на Solana'}</div></div>
          <div className="flex gap-2">
            {step === 'swap' && <button onClick={() => { setStep('select'); setQuote(null); }} className="grid h-8 w-8 place-items-center rounded-full bg-white/6 text-slate-400 hover:text-white transition"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/6 text-slate-400 hover:text-white transition"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
          </div>
        </div>
        {step === 'select' && (
          <div className="flex flex-col px-6 pb-6 gap-3 overflow-hidden" style={{ flex: 1, minHeight: 0 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск токена…" autoFocus
              className="w-full flex-shrink-0 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
            <div className="overflow-y-auto space-y-0.5" style={{ flex: 1 }}>
              {tokens.length === 0 && <div className="py-8 text-center text-xs text-slate-600">Загружаем токены…</div>}
              {filtered.map(t => (
                <button key={t.address} onClick={() => { setOutMint(t); setStep('swap'); }}
                  className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/5">
                  {t.logoURI ? <img src={t.logoURI} alt={t.symbol} width={36} height={36} className="rounded-full flex-shrink-0" style={{ width: 36, height: 36 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-xs font-bold text-amber-400" style={{ background: 'rgba(251,191,36,0.1)' }}>{t.symbol.slice(0, 2)}</div>}
                  <div className="flex-1 min-w-0"><div className="text-sm font-bold text-white">{t.symbol}</div><div className="truncate text-xs text-slate-500">{t.name}</div></div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-slate-600 flex-shrink-0"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 'swap' && outMint && (
          <div className="px-6 pb-6 space-y-3 flex-shrink-0">
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full font-black text-violet-400 text-xs" style={{ background: 'rgba(139,92,246,0.18)' }}>◎</div>
              <div className="flex-1 text-sm font-bold text-white">SOL</div>
              <input value={inAmount} onChange={e => setInAmount(e.target.value)} placeholder="0.00" type="number" min="0" step="0.001" className="w-24 bg-transparent text-right text-sm font-bold text-white placeholder-slate-600 outline-none tabular-nums" />
            </div>
            <div className="flex justify-center"><div className="grid h-8 w-8 place-items-center rounded-full" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.18)' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-amber-400"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div></div>
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {outMint.logoURI ? <img src={outMint.logoURI} alt={outMint.symbol} width={36} height={36} className="rounded-full flex-shrink-0" style={{ width: 36, height: 36 }} /> : <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-xs font-bold text-amber-400" style={{ background: 'rgba(251,191,36,0.1)' }}>{outMint.symbol.slice(0, 2)}</div>}
              <div className="flex-1 text-sm font-bold text-white">{outMint.symbol}</div>
              <div className="w-24 text-right text-sm font-bold tabular-nums" style={{ color: outAmount ? '#fbbf24' : '#475569' }}>{quoting ? <svg className="animate-spin ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" /></svg> : outAmount ?? '—'}</div>
            </div>
            {quote && !quoting && (
              <div className="rounded-xl px-4 py-3 text-xs space-y-1" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.1)' }}>
                <div className="flex justify-between text-slate-400"><span>Маршрут</span><span className="text-amber-400/80 truncate ml-2 max-w-[60%]">{quote.routePlan?.map((r: any) => r.swapInfo?.label ?? '').filter(Boolean).join(' → ') || 'Jupiter Best'}</span></div>
                <div className="flex justify-between text-slate-400"><span>Price Impact</span><span className={parseFloat(quote.priceImpactPct) > 1 ? 'text-red-400' : 'text-emerald-400'}>{(parseFloat(quote.priceImpactPct) * 100).toFixed(3)}%</span></div>
              </div>
            )}
            <button onClick={onSwap} disabled={busy || !quote || !inAmount || quoting}
              className="w-full rounded-2xl py-3.5 text-sm font-black text-white transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', boxShadow: (!busy && quote && inAmount) ? '0 8px 28px rgba(217,119,6,0.38)' : 'none' }}>
              {busy ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" /></svg>Свапаем…</span>
                : !inAmount ? 'Введи сумму' : quoting ? 'Ищем лучшую цену…' : !quote ? 'Маршрут не найден' : `${inAmount} SOL → ${outAmount} ${outMint.symbol}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Send / Receive Modals ────────────────────────────────────────────────────
const SendModal: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { getUserSOLBalance } = useUserSOLBalanceStore();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const onSend = async () => {
    if (!publicKey) return notify({ type: 'error', message: 'Кошелёк не подключён' });
    setBusy(true);
    try {
      const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);
      const ix = [SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: new PublicKey(to.trim()), lamports })];
      const lb = await connection.getLatestBlockhash();
      const sig = await sendTransaction(new VersionedTransaction(new TransactionMessage({ payerKey: publicKey, recentBlockhash: lb.blockhash, instructions: ix }).compileToLegacyMessage()), connection);
      await connection.confirmTransaction({ signature: sig, ...lb }, 'confirmed');
      notify({ type: 'success', message: 'Отправлено!', txid: sig });
      getUserSOLBalance(publicKey, connection);
      onClose();
    } catch (e: any) { notify({ type: 'error', message: e.message ?? 'Ошибка' }); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'linear-gradient(145deg, #12172a, #0b0f1e)', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 0 50px rgba(139,92,246,0.12), 0 30px 80px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div><div className="text-base font-black text-white">Отправить SOL</div><div className="text-xs text-slate-500 mt-0.5">Перевод на любой адрес Solana</div></div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/6 text-slate-400 hover:text-white transition"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wider">Получатель</label>
              <input value={to} onChange={e => setTo(e.target.value)} placeholder="Solana адрес" className="w-full rounded-2xl px-4 py-3 font-mono text-sm text-white placeholder-slate-600 outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }} onFocus={e => e.target.style.borderColor = 'rgba(139,92,246,0.5)'} onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wider">Сумма SOL</label>
              <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number" min="0" step="0.001" className="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }} onFocus={e => e.target.style.borderColor = 'rgba(139,92,246,0.5)'} onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'} />
            </div>
            <button onClick={onSend} disabled={busy || !to || !amount} className="w-full rounded-2xl py-3.5 text-sm font-black text-white transition-all disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: (!busy && to && amount) ? '0 8px 28px rgba(124,58,237,0.38)' : 'none' }}>
              {busy ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" /></svg>Отправляем…</span> : 'Отправить SOL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ReceiveModal: FC<{ address: string | null; onClose: () => void }> = ({ address, onClose }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => { if (!address) return; await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl" style={{ background: 'linear-gradient(145deg, #12172a, #0b0f1e)', border: '1px solid rgba(16,185,129,0.2)', boxShadow: '0 0 50px rgba(16,185,129,0.08)' }} onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div><div className="text-base font-black text-white">Получить SOL</div><div className="text-xs text-slate-500">Поделитесь адресом</div></div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/6 text-slate-400 hover:text-white transition"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
          </div>
          <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1.5">Ваш адрес</div>
            <div className="break-all font-mono text-sm text-slate-200 leading-relaxed">{address ?? '—'}</div>
          </div>
          <button onClick={copy} className="w-full rounded-2xl py-3.5 text-sm font-black transition-all" style={{ background: copied ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`, color: copied ? '#34d399' : 'white' }}>
            {copied ? '✓ Скопировано!' : 'Скопировать адрес'}
          </button>
          {address && <a href={`https://solscan.io/account/${address}`} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition py-2">↗ Solscan</a>}
        </div>
      </div>
    </div>
  );
};

// ─── Tx Row ───────────────────────────────────────────────────────────────────
const TxRow: FC<{ tx: TxRecord }> = ({ tx }) => {
  const isSend = tx.type === 'send';
  const isFailed = tx.status === 'failed';
  return (
    <a href={`https://solscan.io/tx/${tx.signature}`} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-white/4"
      style={{ border: '1px solid transparent' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}>
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl"
        style={{ background: isFailed ? 'rgba(239,68,68,0.1)' : isSend ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${isFailed ? 'rgba(239,68,68,0.18)' : isSend ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)'}` }}>
        {isFailed ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-red-400"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          : isSend ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-red-400"><path d="M7 17 17 7M10 7h7v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-emerald-400"><path d="M17 7 7 17M14 17H7v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white">{isFailed ? 'Ошибка' : isSend ? 'Отправлено' : 'Получено'}</div>
        <div className="text-xs font-mono text-slate-600">{short(tx.counterparty)}</div>
      </div>
      <div className="text-right">
        {tx.amount > 0 && <div className={`text-sm font-bold tabular-nums ${isFailed ? 'text-slate-500' : isSend ? 'text-red-400' : 'text-emerald-400'}`}>{isSend ? '−' : '+'}{tx.amount.toFixed(4)}</div>}
        <div className="text-[10px] text-slate-600">SOL</div>
      </div>
    </a>
  );
};

// ─── ICO Tx Row ───────────────────────────────────────────────────────────────
const IcoTxRow: FC<{ tx: { wallet: string; type: string; solAmount: number; tokenAmount: number; txHash: string; timestamp: number; projectId: string } }> = ({ tx }) => {
  const isBuy = tx.type === 'buy';
  return (
    <a href={`https://solscan.io/tx/${tx.txHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl px-3 py-3 transition"
      style={{ border: '1px solid transparent' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}>
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl"
        style={{ background: isBuy ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${isBuy ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'}` }}>
        <span className="text-base">{isBuy ? '🎫' : '💱'}</span>
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white">{isBuy ? 'Покупка' : 'Продажа'} · {tx.projectId}</div>
        <div className="text-xs text-slate-600">{tx.tokenAmount.toFixed(4)} токенов · {new Date(tx.timestamp).toLocaleString('ru-RU')}</div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-bold tabular-nums ${isBuy ? 'text-red-400' : 'text-emerald-400'}`}>{isBuy ? '−' : '+'}{tx.solAmount.toFixed(6)} SOL</div>
        <div className="text-[10px] font-mono text-slate-600">{short(tx.txHash)}</div>
      </div>
    </a>
  );
};

// ─── Main HomeView ────────────────────────────────────────────────────────────
export const HomeView: FC = () => {
  const wallet = useWallet();
  const { connection } = useConnection();
  const balance = useUserSOLBalanceStore(s => s.balance);
  const solPrice = useUserSOLBalanceStore(s => s.solPrice);
  const priceChange24h = useUserSOLBalanceStore(s => s.priceChange24h);
  const { getUserSOLBalance, getSolPrice } = useUserSOLBalanceStore();
  const transactions = useTransactionStore(s => s.transactions);
  const txLoading = useTransactionStore(s => s.loading);
  const { fetchTransactions } = useTransactionStore();

  const [modal, setModal] = useState<'send' | 'receive' | 'swap' | 'airdrop' | 'buy' | 'sell' | 'createIco' | null>(null);
  const [activeTab, setActiveTab] = useState<'ico' | 'portfolio' | 'history' | 'trading'>('ico');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [selectedProject, setSelectedProject] = useState<IcoProject | null>(null);
  const [copied, setCopied] = useState(false);
  const [myVeksels, setMyVeksels] = useState<MyVeksel[]>([]);
  const [showChart, setShowChart] = useState<string | null>(null);

  // Live project state from /api/chart
  const [projects, setProjects] = useState<IcoProject[]>(BASE_PROJECTS);
  // ICO transactions from backend
  const [icoTxs, setIcoTxs] = useState<any[]>([]);

  const walletAddress = useMemo(() => wallet.publicKey?.toBase58() ?? null, [wallet.publicKey]);
  const walletShort = useMemo(() => walletAddress ? short(walletAddress) : null, [walletAddress]);
  const usdBalance = useMemo(() => balance * solPrice, [balance, solPrice]);
  const priceUp = priceChange24h >= 0;
  const totalVekselSol = useMemo(() => myVeksels.reduce((s, v) => s + v.amount * v.currentPrice, 0), [myVeksels]);
  const totalPnl = useMemo(() => myVeksels.reduce((s, v) => s + v.amount * (v.currentPrice - v.pricePaid), 0), [myVeksels]);

  const filteredProjects = useMemo(() => filter === 'all' ? projects : projects.filter(p => p.status === filter), [filter, projects]);

  // Sync live prices from backend for all projects
  const syncPrices = useCallback(async () => {
    const updated = await Promise.all(
      BASE_PROJECTS.map(async p => {
        try {
          const r = await fetch(`/api/chart?projectId=${p.id}&period=1h`);
          const d = await r.json();
          return {
            ...p,
            vekselPrice: d.currentPrice ?? p.vekselPrice,
            raisedSol: d.raisedSol ?? p.raisedSol,
            soldVeksels: Math.floor(d.soldTokens ?? p.soldVeksels),
            mintAddress: d.mintAddress ?? null,
          };
        } catch { return p; }
      })
    );
    setProjects(updated);

    // Also update currentPrice in myVeksels
    setMyVeksels(prev => prev.map(v => {
      const up = updated.find(p => p.id === v.projectId);
      return up ? { ...v, currentPrice: up.vekselPrice, mintAddress: up.mintAddress } : v;
    }));
  }, []);

  // Load ICO transactions from backend
  const loadIcoTxs = useCallback(async (w?: string) => {
    const url = w ? `/api/transactions?wallet=${w}&limit=50` : '/api/transactions?limit=50';
    try {
      const r = await fetch(url);
      const d = await r.json();
      setIcoTxs(d.transactions ?? []);
    } catch {}
  }, []);

  useEffect(() => { getSolPrice(); const id = setInterval(getSolPrice, 60_000); return () => clearInterval(id); }, [getSolPrice]);
  useEffect(() => { syncPrices(); const id = setInterval(syncPrices, 30_000); return () => clearInterval(id); }, [syncPrices]);

  useEffect(() => {
    if (wallet.publicKey) {
      getUserSOLBalance(wallet.publicKey, connection);
      fetchTransactions(wallet.publicKey, connection);
      loadIcoTxs(wallet.publicKey.toBase58());
    }
  }, [wallet.publicKey, connection, getUserSOLBalance, fetchTransactions, loadIcoTxs]);

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

  const onToggleChart = (id: string) => setShowChart(prev => prev === id ? null : id);
return (
  <div className="relative min-h-screen w-full" style={{ background: '#080c17' }}>

    {/* ✅ FIX: убираем перехват кликов */}
    <div className="absolute inset-0 -z-10 pointer-events-none" />

    {/* Modals */}
    {modal === 'send' && <SendModal onClose={() => setModal(null)} />}
    {modal === 'receive' && <ReceiveModal address={walletAddress} onClose={() => setModal(null)} />}
    {modal === 'swap' && <SwapModal onClose={() => setModal(null)} />}
    {modal === 'airdrop' && <AirdropModal onClose={() => setModal(null)} myVeksels={myVeksels} onOpenCreateICO={() => setModal('createIco')} />}
    {modal === 'createIco' && <CreateICOModal onClose={() => setModal(null)} />}
    {modal === 'buy' && selectedProject && (
      <BuyModal
        project={selectedProject}
        balance={balance}
        onClose={() => setModal(null)}
        onSuccess={onBuySuccess}
      />
    )}
    {modal === 'sell' && selectedProject && myVeksels.find(v => v.projectId === selectedProject.id) && (
      <SellModal
        project={selectedProject}
        veksel={myVeksels.find(v => v.projectId === selectedProject.id)!}
        onClose={() => setModal(null)}
        onSuccess={onSellSuccess}
      />
    )}
      <div className="relative mx-auto w-full max-w-2xl px-4 pb-32 pt-6 md:px-6 md:pb-24">

        {/* ── Balance Card ───────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-[28px] p-6 mb-4"
          style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.015) 100%)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 40px 100px rgba(0,0,0,0.55)' }}>
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-72 rounded-full pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.22) 0%, transparent 70%)' }} />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600 mb-2">Портфель</div>
                {wallet.publicKey ? (
                  <>
                    <div className="text-4xl font-black tracking-tight text-white mb-1 tabular-nums">${(usdBalance + totalVekselSol * solPrice).toFixed(2)}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-slate-300 tabular-nums">{balance.toFixed(4)} SOL</span>
                      {totalVekselSol > 0 && <span className="text-xs text-slate-600">+ {totalVekselSol.toFixed(4)} SOL (ICO)</span>}
                      {solPrice > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: priceUp ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: priceUp ? '#34d399' : '#f87171' }}>
                          {priceUp ? '▲' : '▼'} {Math.abs(priceChange24h).toFixed(2)}%
                        </span>
                      )}
                    </div>
                    {totalPnl !== 0 && (
                      <div className={`mt-1 text-xs font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(6)} SOL P&L по ICO
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-2">
                    <div className="text-xl font-bold text-slate-500 mb-3">Подключи кошелёк</div>
                    <WalletMultiButtonDynamic className="!rounded-2xl !text-sm !font-bold !px-5 !py-2.5 !h-auto"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', border: 'none' } as any} />
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: wallet.connected ? '#34d399' : '#64748b' }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: wallet.connected ? '#34d399' : '#64748b', boxShadow: wallet.connected ? '0 0 6px #34d399' : 'none' }} />
                  {wallet.connected ? 'Online' : 'Offline'}
                </span>
                {walletShort && (
                  <button onClick={onCopy} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] transition"
                    style={{ background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${copied ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)'}`, color: copied ? '#34d399' : '#64748b' }}>
                    {copied ? '✓ Copied' : walletShort}
                  </button>
                )}
                {solPrice > 0 && <div className="text-[10px] text-slate-700">SOL ${solPrice.toFixed(2)} · <span className={priceUp ? 'text-emerald-700' : 'text-red-700'}>{priceUp ? '+' : ''}{priceChange24h.toFixed(2)}%</span></div>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Buttons ────────────────────────────────── */}
        <div className="mb-5 grid grid-cols-6 gap-2">
          <ActionBtn label="Отправить" disabled={!wallet.connected} onClick={() => setModal('send')} color="linear-gradient(145deg, rgba(139,92,246,0.13), rgba(99,102,241,0.06))" glow="0 6px 24px rgba(139,92,246,0.25)" icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-violet-400"><path d="M7 17 17 7M10 7h7v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>} />
          <ActionBtn label="Получить" disabled={!wallet.connected} onClick={() => setModal('receive')} color="linear-gradient(145deg, rgba(16,185,129,0.1), rgba(5,150,105,0.05))" glow="0 6px 24px rgba(16,185,129,0.2)" icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-emerald-400"><path d="M17 7 7 17M14 17H7v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>} />
          <ActionBtn label="Своп" disabled={!wallet.connected} onClick={() => setModal('swap')} color="linear-gradient(145deg, rgba(251,191,36,0.12), rgba(217,119,6,0.06))" glow="0 6px 24px rgba(251,191,36,0.22)" icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-amber-400"><path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>} />
          <ActionBtn label="Аирдроп" disabled={false} onClick={() => setModal('airdrop')} color="linear-gradient(145deg, rgba(59,130,246,0.1), rgba(37,99,235,0.05))" glow="0 6px 24px rgba(59,130,246,0.2)" icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-blue-400"><path d="M12 3v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M5 10l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>} />
          <ActionBtn label="История" disabled={false} onClick={() => setActiveTab('history')} color={activeTab === 'history' ? 'linear-gradient(145deg, rgba(245,158,11,0.18), rgba(217,119,6,0.08))' : 'linear-gradient(145deg, rgba(245,158,11,0.07), rgba(217,119,6,0.03))'} glow="0 6px 24px rgba(245,158,11,0.2)" icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-amber-400"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>} />
          <ActionBtn label="Кабинет" disabled={false} onClick={() => setActiveTab('portfolio')} color={activeTab === 'portfolio' ? 'linear-gradient(145deg, rgba(236,72,153,0.18), rgba(219,39,119,0.08))' : 'linear-gradient(145deg, rgba(236,72,153,0.07), rgba(219,39,119,0.03))'} glow="0 6px 24px rgba(236,72,153,0.2)" icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-pink-400"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" /></svg>} />
        </div>

        {/* ── Tabs ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
          <Tab active={activeTab === 'ico'} onClick={() => setActiveTab('ico')}>🚀 ICO Проекты</Tab>
          <Tab active={activeTab === 'trading'} onClick={() => setActiveTab('trading')}>📊 Trading</Tab>
          <Tab active={activeTab === 'portfolio'} onClick={() => setActiveTab('portfolio')}>💼 Мои токены{myVeksels.length > 0 ? ` (${myVeksels.length})` : ''}</Tab>
          <Tab active={activeTab === 'history'} onClick={() => setActiveTab('history')}>📋 История</Tab>
        </div>

        {/* ── ICO Tab ───────────────────────────────────────── */}
        {activeTab === 'ico' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'active', 'completed'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="rounded-xl px-3 py-1.5 text-xs font-bold transition-all"
                  style={{ background: filter === f ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${filter === f ? 'rgba(139,92,246,0.32)' : 'rgba(255,255,255,0.05)'}`, color: filter === f ? '#c4b5fd' : '#64748b' }}>
                  {f === 'all' ? 'Все' : f === 'active' ? '🟢 Активные' : '✅ Завершённые'}
                </button>
              ))}
              <span className="ml-auto text-xs text-slate-700">{filteredProjects.length} проектов</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Всего собрано', value: `${projects.reduce((s, p) => s + p.raisedSol, 0).toLocaleString('en-US')} SOL` },
                { label: 'Активных ICO', value: `${projects.filter(p => p.status === 'active').length}` },
                { label: 'Транзакций', value: `${icoTxs.length}` },
              ].map(s => (
                <div key={s.label} className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="text-base font-black text-white tabular-nums">{s.value}</div>
                  <div className="text-[9px] text-slate-700 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {filteredProjects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                onBuy={onBuy}
                onSell={onSell}
                myVeksels={myVeksels}
                showChart={showChart}
                onToggleChart={onToggleChart}
              />
            ))}
          </div>
        )}

        {/* ── Portfolio Tab ─────────────────────────────────── */}
        {activeTab === 'portfolio' && (
          <div className="space-y-4">
            {myVeksels.length === 0 ? (
              <div className="rounded-[24px] py-20 text-center" style={{ border: '1px dashed rgba(255,255,255,0.07)' }}>
                <div className="text-5xl mb-4">🎫</div>
                <div className="text-base font-bold text-slate-400 mb-2">Токенов пока нет</div>
                <div className="text-sm text-slate-600 mb-6">Купи SPL токены в любом ICO проекте</div>
                <button onClick={() => setActiveTab('ico')} className="rounded-2xl px-6 py-3 text-sm font-black text-white" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 8px 28px rgba(124,58,237,0.35)' }}>
                  Смотреть проекты →
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-[24px] p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-sm font-bold text-white mb-3">Сводка</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Вложено', value: `${myVeksels.reduce((s, v) => s + v.amount * v.pricePaid, 0).toFixed(6)} SOL` },
                      { label: 'Стоимость', value: `${totalVekselSol.toFixed(6)} SOL` },
                      { label: 'P&L', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(6)} SOL`, color: totalPnl >= 0 ? '#34d399' : '#f87171' },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <div className="text-xs font-black tabular-nums" style={{ color: s.color ?? 'white' }}>{s.value}</div>
                        <div className="text-[9px] text-slate-600 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {myVeksels.map(v => {
                  const project = projects.find(p => p.id === v.projectId);
                  const pnl = v.amount * (v.currentPrice - v.pricePaid);
                  const pnlPct = ((v.currentPrice - v.pricePaid) / v.pricePaid) * 100;
                  return (
                    <div key={v.projectId} className="rounded-[24px] p-5"
                      style={{ background: `linear-gradient(145deg, ${v.color.replace('0.8', '0.08')} 0%, rgba(255,255,255,0.015) 100%)`, border: `1px solid ${v.color.replace('0.8', '0.16')}` }}>
                      <div className="flex items-start gap-3 mb-4">
                        <span className="text-2xl">{v.logo}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-sm font-black text-white">{v.projectName}</span>
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.07)', color: '#64748b' }}>{v.ticker}</span>
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-violet-300" style={{ background: 'rgba(139,92,246,0.1)' }}>🪙 SPL</span>
                            {v.mintAddress && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-300" style={{ background: 'rgba(16,185,129,0.08)' }}>On-chain</span>}
                          </div>
                          <div className="text-[10px] text-slate-600">Куплено {fmtDate(v.purchasedAt)}</div>
                          {v.mintAddress && (
                            <a href={`https://solscan.io/token/${v.mintAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] font-mono text-slate-600 hover:text-slate-400 transition">
                              Mint: {v.mintAddress.slice(0, 16)}…↗
                            </a>
                          )}
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-black ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</div>
                          <div className="text-[10px] text-slate-600">{pnl >= 0 ? '+' : ''}{pnl.toFixed(6)} SOL</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-4">
                        {[
                          { l: 'Кол-во', v2: v.amount.toFixed(4) },
                          { l: 'Вход', v2: `${v.pricePaid.toFixed(6)}` },
                          { l: 'Тек. цена', v2: `${v.currentPrice.toFixed(6)}` },
                          { l: 'Итого SOL', v2: `${(v.amount * v.currentPrice).toFixed(6)}` },
                        ].map(s => (
                          <div key={s.l} className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <div className="text-xs font-bold text-white tabular-nums">{s.v2}</div>
                            <div className="text-[9px] text-slate-600 mt-0.5">{s.l}</div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        {project && project.status === 'active' && (
                          <button onClick={() => { setSelectedProject(project); setModal('buy'); }}
                            className="flex-1 rounded-2xl py-2.5 text-xs font-black text-white transition"
                            style={{ background: v.color.replace('0.8', '0.3'), border: `1px solid ${v.color.replace('0.8', '0.38')}` }}>
                            + Докупить
                          </button>
                        )}
                        <button onClick={() => { if (project) { setSelectedProject(project); setModal('sell'); } }}
                          className="flex-1 rounded-2xl py-2.5 text-xs font-black transition"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                          💱 Продать → SOL
                        </button>
                        <button onClick={() => setModal('swap')}
                          className="flex-1 rounded-2xl py-2.5 text-xs font-black transition"
                          style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                          🔄 Своп
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── Trading Tab ───────────────────────────────────── */}
        {activeTab === 'trading' && (
          <div className="space-y-4">
            <TradingPanel />
          </div>
        )}

        {/* ── History Tab ───────────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {/* ICO Transactions */}
            {icoTxs.length > 0 && (
              <div className="rounded-[24px] p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-bold text-white">ICO Транзакции</div>
                  <button onClick={() => loadIcoTxs(walletAddress ?? undefined)}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Обновить
                  </button>
                </div>
                <div className="-mx-1 space-y-0.5">
                  {icoTxs.map((tx, i) => <IcoTxRow key={tx.txHash ?? i} tx={tx} />)}
                </div>
              </div>
            )}

            {/* SOL Transactions */}
            <div className="rounded-[24px] p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-bold text-white">SOL Транзакции</div>
                {wallet.publicKey && (
                  <button onClick={() => fetchTransactions(wallet.publicKey!, connection)}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Обновить
                  </button>
                )}
              </div>
              {!wallet.publicKey ? (
                <div className="py-10 text-center text-sm text-slate-600">Подключи кошелёк</div>
              ) : txLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />)}</div>
              ) : transactions.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-600">Транзакций не найдено</div>
              ) : (
                <div className="-mx-1 space-y-0.5">{transactions.map(tx => <TxRow key={tx.signature} tx={tx} />)}</div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* ── Mobile Bottom Navigation Bar ─────────────── */}
<nav
  className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around"
  style={{
    height: 72,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    background: 'rgba(8, 12, 23, 0.95)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
  }}
>
  {[
    {
      tab: 'ico' as const,
      label: 'ICO',
      color: '#a78bfa',
      bg: 'rgba(139,92,246,0.18)',
      glow: 'rgba(139,92,246,0.35)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      tab: 'trading' as const,
      label: 'Трейдинг',
      color: '#fbbf24',
      bg: 'rgba(251,191,36,0.14)',
      glow: 'rgba(251,191,36,0.3)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="16,7 22,7 22,13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      tab: 'portfolio' as const,
      label: 'Портфель',
      color: '#34d399',
      bg: 'rgba(52,211,153,0.14)',
      glow: 'rgba(52,211,153,0.3)',
      badge: myVeksels.length || undefined,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      ),
    },
    {
      tab: 'airdrop-nav' as any, // opens modal
      label: 'Аирдроп',
      color: '#60a5fa',
      bg: 'rgba(96,165,250,0.14)',
      glow: 'rgba(96,165,250,0.3)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M20 12V22H4V12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M22 7H2v5h20V7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 22V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      tab: 'history' as const,
      label: 'История',
      color: '#f472b6',
      bg: 'rgba(244,114,182,0.14)',
      glow: 'rgba(244,114,182,0.3)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
  ].map(({ tab, label, color, bg, glow, icon, badge }) => {
    const isActive = tab === 'airdrop-nav' ? modal === 'airdrop' : activeTab === tab;
    return (
      <button
        key={tab}
        onClick={() => {
          if (tab === 'airdrop-nav') setModal('airdrop');
          else setActiveTab(tab as any);
        }}
        className="flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all duration-200 active:scale-90"
        style={{ WebkitTapHighlightColor: 'transparent', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <div
          className="relative flex items-center justify-center rounded-[14px] transition-all duration-300"
          style={{
            width: 42,
            height: 42,
            background: isActive ? bg : 'transparent',
            boxShadow: isActive ? `0 4px 18px ${glow}` : 'none',
            transform: isActive ? 'translateY(-2px) scale(1.08)' : 'scale(1)',
            color: isActive ? color : '#475569',
          }}
        >
          {icon}
          {badge ? (
            <span className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-white font-black"
              style={{ minWidth: 16, height: 16, fontSize: 9, background: '#ef4444', border: '2px solid #080c17', padding: '0 3px' }}>
              {badge}
            </span>
          ) : null}
        </div>
        <span
          className="text-[10px] font-bold transition-all duration-200"
          style={{ color: isActive ? color : '#475569', letterSpacing: '0.02em' }}
        >
          {label}
        </span>
      </button>
    );
  })}
</nav>
    </div>
  );
};