/**
 * src/components/TradingPanel.tsx
 *
 * Self-contained trading widget that connects to the NestJS backend.
 * Displays: real Binance ticker, RSI signal, indicators, and trade execution.
 * Supports an Auto-Trading toggle that polls for signals and executes automatically.
 */

import { FC, useEffect, useRef, useState, useCallback } from 'react';
import {
  getTicker,
  getSignal,
  executeTrade,
  getBalance,
  Ticker,
  Signal,
  Balance,
  TradeSummary,
} from '../lib/tradingApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h'];

const SignalBadge: FC<{ action: 'BUY' | 'SELL' | 'HOLD' }> = ({ action }) => {
  const styles: Record<string, { bg: string; color: string; glow: string }> = {
    BUY: {
      bg: 'rgba(16,185,129,0.14)',
      color: '#34d399',
      glow: '0 0 16px rgba(16,185,129,0.4)',
    },
    SELL: {
      bg: 'rgba(239,68,68,0.14)',
      color: '#f87171',
      glow: '0 0 16px rgba(239,68,68,0.4)',
    },
    HOLD: {
      bg: 'rgba(251,191,36,0.1)',
      color: '#fbbf24',
      glow: 'none',
    },
  };
  const s = styles[action];
  return (
    <span
      className="rounded-xl px-3 py-1 text-sm font-black tracking-wider"
      style={{ background: s.bg, color: s.color, boxShadow: s.glow }}
    >
      {action === 'BUY' ? '▲ BUY' : action === 'SELL' ? '▼ SELL' : '⏸ HOLD'}
    </span>
  );
};

const ConfidenceBar: FC<{ value: number; action: 'BUY' | 'SELL' | 'HOLD' }> = ({
  value,
  action,
}) => {
  const color =
    action === 'BUY'
      ? '#34d399'
      : action === 'SELL'
      ? '#f87171'
      : '#fbbf24';
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${(value * 100).toFixed(0)}%`,
            background: color,
            boxShadow: `0 0 8px ${color}88`,
          }}
        />
      </div>
      <span className="w-10 text-right text-xs font-bold tabular-nums" style={{ color }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const TradingPanel: FC = () => {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [lastTrade, setLastTrade] = useState<TradeSummary | null>(null);
  const [autoTrading, setAutoTrading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [execLoading, setExecLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const autoRef = useRef(autoTrading);
  autoRef.current = autoTrading;

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 30));
  }, []);

  // ── Fetch ticker + signal ─────────────────────────────────────────
  const refresh = useCallback(
    async (sym = symbol, tf = timeframe, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [t, s, b] = await Promise.all([
          getTicker(sym),
          getSignal(sym, tf),
          getBalance(),
        ]);
        setTicker(t);
        setSignal(s);
        setBalances(b);
        setBackendOnline(true);
        if (!silent) addLog(`Signal: ${s.action} (${(s.confidence * 100).toFixed(0)}%) — ${sym}`);
      } catch (e: any) {
        setBackendOnline(false);
        setError(e.message ?? 'Backend unreachable');
        if (!silent) addLog(`Error: ${e.message}`);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [symbol, timeframe, addLog]
  );

  // ── Manual execute ────────────────────────────────────────────────
  const onExecute = async () => {
    setExecLoading(true);
    try {
      const result = await executeTrade({ symbol, timeframe });
      setLastTrade(result);
      if (result.skipped) {
        addLog(`Skipped: ${result.skipped}`);
      } else if (result.order) {
        addLog(
          `✅ Order ${result.order.side} ${result.order.quantity} ${symbol} @ $${result.order.price} | SL $${result.stopLoss} TP $${result.takeProfit}`
        );
      }
      await refresh(symbol, timeframe, true);
    } catch (e: any) {
      addLog(`Execute error: ${e.message}`);
    } finally {
      setExecLoading(false);
    }
  };

  // ── Auto trading loop (poll every 30 sec) ─────────────────────────
  useEffect(() => {
    if (!autoTrading) return;
    addLog('🤖 Auto-Trading ON — polling every 30s');
    const id = setInterval(async () => {
      if (!autoRef.current) return;
      try {
        const s = await getSignal(symbol, timeframe);
        if (s.action !== 'HOLD') {
          addLog(`Auto: ${s.action} signal detected — executing…`);
          const result = await executeTrade({ symbol, timeframe });
          if (result.skipped) {
            addLog(`Auto skipped: ${result.skipped}`);
          } else if (result.order) {
            addLog(`Auto ✅ ${result.order.side} ${result.order.quantity} @ $${result.order.price}`);
          }
          setLastTrade(result);
          setSignal(s);
        } else {
          setSignal(s);
          addLog(`Auto: HOLD — ${s.reason.slice(0, 60)}…`);
        }
      } catch (e: any) {
        addLog(`Auto error: ${e.message}`);
      }
    }, 30_000);
    return () => {
      clearInterval(id);
      addLog('🤖 Auto-Trading OFF');
    };
  }, [autoTrading, symbol, timeframe, addLog]);

  // ── Initial load ──────────────────────────────────────────────────
  useEffect(() => {
    refresh();
  }, [symbol, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  const usdt = balances.find((b) => b.asset === 'USDT');
  const btc = balances.find((b) => b.asset === 'BTC');
  const priceUp = (ticker?.priceChangePct ?? 0) >= 0;

  return (
    <div
      className="rounded-[24px] overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, rgba(30,20,60,0.6) 0%, rgba(8,12,23,0.9) 100%)',
        border: '1px solid rgba(139,92,246,0.22)',
        boxShadow: '0 0 60px rgba(139,92,246,0.06)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-base font-black text-white">📊 Trading</span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{
              background:
                backendOnline === null
                  ? 'rgba(255,255,255,0.05)'
                  : backendOnline
                  ? 'rgba(16,185,129,0.12)'
                  : 'rgba(239,68,68,0.12)',
              color:
                backendOnline === null ? '#64748b' : backendOnline ? '#34d399' : '#f87171',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  backendOnline === null
                    ? '#64748b'
                    : backendOnline
                    ? '#34d399'
                    : '#ef4444',
                boxShadow: backendOnline ? '0 0 6px #34d399' : 'none',
              }}
            />
            {backendOnline === null ? 'Connecting' : backendOnline ? 'Binance Testnet' : 'Offline'}
          </span>
        </div>

        {/* Auto Trading toggle */}
        <button
          onClick={() => setAutoTrading((v) => !v)}
          className="flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black transition-all"
          style={{
            background: autoTrading
              ? 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))'
              : 'rgba(255,255,255,0.05)',
            border: `1px solid ${autoTrading ? 'rgba(139,92,246,0.45)' : 'rgba(255,255,255,0.08)'}`,
            color: autoTrading ? '#c4b5fd' : '#64748b',
            boxShadow: autoTrading ? '0 0 18px rgba(139,92,246,0.25)' : 'none',
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: autoTrading ? '#c4b5fd' : '#475569',
              animation: autoTrading ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          {autoTrading ? '⚡ Auto ON' : 'Auto OFF'}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* ── Symbol / Timeframe selectors ──────────────────── */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              Symbol
            </label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm font-bold text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s} style={{ background: '#0b0f1e' }}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              Timeframe
            </label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm font-bold text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {TIMEFRAMES.map((t) => (
                <option key={t} value={t} style={{ background: '#0b0f1e' }}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Error banner ──────────────────────────────────── */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 text-xs text-red-300"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            ⚠️ {error}
            <br />
            <span className="text-slate-500">Make sure the backend is running on port 4000.</span>
          </div>
        )}

        {/* ── Ticker ────────────────────────────────────────── */}
        {ticker && (
          <div
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] text-slate-600 mb-1">{ticker.symbol}</div>
                <div className="text-2xl font-black text-white tabular-nums">
                  ${ticker.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-right">
                <div
                  className="text-sm font-black"
                  style={{ color: priceUp ? '#34d399' : '#f87171' }}
                >
                  {priceUp ? '▲' : '▼'} {Math.abs(ticker.priceChangePct).toFixed(2)}%
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">
                  H: ${ticker.high24h.toLocaleString()} · L: ${ticker.low24h.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Signal ────────────────────────────────────────── */}
        {signal && (
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                RSI Signal
              </span>
              <SignalBadge action={signal.action} />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] text-slate-600">Confidence</span>
              </div>
              <ConfidenceBar value={signal.confidence} action={signal.action} />
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">{signal.reason}</p>

            {/* Indicators grid */}
            {signal.indicators && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {[
                  { label: 'RSI', value: signal.indicators.rsi.toFixed(2) },
                  { label: 'MACD', value: signal.indicators.macd.histogram.toFixed(4) },
                  { label: 'EMA9', value: signal.indicators.ema.ema9.toFixed(2) },
                  { label: 'EMA50', value: signal.indicators.ema.ema50.toFixed(2) },
                ].map((ind) => (
                  <div
                    key={ind.label}
                    className="rounded-xl px-3 py-2"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    <div className="text-[9px] text-slate-600 uppercase tracking-wider">
                      {ind.label}
                    </div>
                    <div className="text-xs font-bold text-white tabular-nums mt-0.5">
                      {ind.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Balances ──────────────────────────────────────── */}
        {balances.length > 0 && (
          <div
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
              Binance Testnet Balance
            </div>
            <div className="flex gap-3 flex-wrap">
              {balances.slice(0, 6).map((b) => (
                <div key={b.asset} className="text-center">
                  <div className="text-xs font-black text-white tabular-nums">
                    {b.free.toFixed(4)}
                  </div>
                  <div className="text-[9px] text-slate-600">{b.asset}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Last trade result ─────────────────────────────── */}
        {lastTrade && (
          <div
            className="rounded-2xl p-4"
            style={{
              background: lastTrade.order
                ? 'rgba(16,185,129,0.07)'
                : 'rgba(251,191,36,0.05)',
              border: `1px solid ${lastTrade.order ? 'rgba(16,185,129,0.18)' : 'rgba(251,191,36,0.14)'}`,
            }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Last Execution
            </div>
            {lastTrade.skipped ? (
              <p className="text-xs text-amber-300">⏭ {lastTrade.skipped}</p>
            ) : lastTrade.order ? (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Order ID</span>
                  <span className="font-bold text-emerald-400">#{lastTrade.order.orderId}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Side</span>
                  <span
                    className="font-black"
                    style={{ color: lastTrade.order.side === 'BUY' ? '#34d399' : '#f87171' }}
                  >
                    {lastTrade.order.side}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Qty</span>
                  <span className="font-bold text-white tabular-nums">
                    {lastTrade.order.quantity}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Price</span>
                  <span className="font-bold text-white tabular-nums">
                    ${lastTrade.order.price.toFixed(2)}
                  </span>
                </div>
                {lastTrade.stopLoss && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">SL / TP</span>
                    <span className="font-bold text-red-400 tabular-nums">
                      ${lastTrade.stopLoss} / ${lastTrade.takeProfit}
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* ── Action buttons ────────────────────────────────── */}
        <div className="flex gap-2">
          <button
            onClick={() => refresh()}
            disabled={loading}
            className="flex-1 rounded-2xl py-3 text-xs font-black transition-all disabled:opacity-40"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: '#94a3b8',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg
                  className="animate-spin"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
                </svg>
                Fetching…
              </span>
            ) : (
              '🔄 Refresh Signal'
            )}
          </button>

          <button
            onClick={onExecute}
            disabled={execLoading || !signal || signal.action === 'HOLD'}
            className="flex-1 rounded-2xl py-3 text-xs font-black text-white transition-all disabled:opacity-40"
            style={{
              background:
                signal?.action === 'BUY'
                  ? 'linear-gradient(135deg, #059669, #047857)'
                  : signal?.action === 'SELL'
                  ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                  : 'rgba(255,255,255,0.04)',
              boxShadow:
                signal?.action === 'BUY'
                  ? '0 6px 20px rgba(5,150,105,0.35)'
                  : signal?.action === 'SELL'
                  ? '0 6px 20px rgba(220,38,38,0.35)'
                  : 'none',
            }}
          >
            {execLoading ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
                </svg>
                Executing…
              </span>
            ) : signal?.action === 'BUY' ? (
              '▲ Execute BUY'
            ) : signal?.action === 'SELL' ? (
              '▼ Execute SELL'
            ) : (
              '⏸ No Signal'
            )}
          </button>
        </div>

        {/* ── Activity log ──────────────────────────────────── */}
        {log.length > 0 && (
          <div
            className="rounded-2xl p-3"
            style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-700 mb-2">
              Activity Log
            </div>
            <div className="space-y-0.5 max-h-28 overflow-y-auto">
              {log.map((entry, i) => (
                <div key={i} className="text-[10px] font-mono text-slate-500 leading-relaxed">
                  {entry}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradingPanel;
