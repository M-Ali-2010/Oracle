/**
 * Technical indicators computed from raw candle close prices.
 * Pure functions — no external library needed.
 */

import { Candle } from '../binance/binance.service';

// ─── RSI ──────────────────────────────────────────────────────────────────────

/**
 * Compute RSI(period) from candles.
 * Returns the most recent RSI value.
 */
export function rsi(candles: Candle[], period = 14): number {
  const closes = candles.map(c => c.close);
  if (closes.length < period + 1) return 50; // not enough data

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains  += diff;
    else           losses -= diff;
  }

  let avgGain = gains  / period;
  let avgLoss = losses / period;

  // Smoothed RSI for subsequent values
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0))  / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

// ─── EMA ──────────────────────────────────────────────────────────────────────

/**
 * Compute EMA(period) series from close prices.
 * Returns array of EMA values (same length as closes).
 */
export function emaSeries(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = closes[0];
  result.push(ema);
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(parseFloat(ema.toFixed(8)));
  }
  return result;
}

/** Last EMA value */
export function ema(candles: Candle[], period: number): number {
  const series = emaSeries(candles.map(c => c.close), period);
  return series[series.length - 1];
}

// ─── MACD ─────────────────────────────────────────────────────────────────────

export interface MacdResult {
  value:     number;  // MACD line   = EMA(12) - EMA(26)
  signal:    number;  // Signal line = EMA(9) of MACD
  histogram: number;  // MACD - Signal
}

/**
 * Standard MACD (12, 26, 9).
 */
export function macd(candles: Candle[]): MacdResult {
  const closes  = candles.map(c => c.close);
  const ema12   = emaSeries(closes, 12);
  const ema26   = emaSeries(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = emaSeries(macdLine, 9);
  const last = macdLine.length - 1;

  return {
    value:     parseFloat(macdLine[last].toFixed(4)),
    signal:    parseFloat(signalLine[last].toFixed(4)),
    histogram: parseFloat((macdLine[last] - signalLine[last]).toFixed(4)),
  };
}

// ─── Bundle all indicators ────────────────────────────────────────────────────

export interface Indicators {
  rsi:  number;
  macd: MacdResult;
  ema:  { ema9: number; ema21: number; ema50: number };
  price: number;
}

export function computeAll(candles: Candle[]): Indicators {
  return {
    rsi:  rsi(candles, 14),
    macd: macd(candles),
    ema: {
      ema9:  ema(candles, 9),
      ema21: ema(candles, 21),
      ema50: ema(candles, 50),
    },
    price: candles[candles.length - 1].close,
  };
}
