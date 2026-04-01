import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BinanceService, Candle } from '../binance/binance.service';
import { computeAll, Indicators } from '../common/indicators';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalAction = 'BUY' | 'SELL' | 'HOLD';

export interface Signal {
  action:     SignalAction;
  confidence: number;   // 0–1
  reason:     string;
  indicators: Indicators;
  symbol:     string;
  timeframe:  string;
  timestamp:  number;
}

export interface TradeConfig {
  symbol:        string;
  timeframe:     string;
  maxPosPct:     number;  // % of USDT balance to use
  stopLossPct:   number;
  takeProfitPct: number;
}

export interface TradeSummary {
  signal:      Signal;
  order?:      any;
  skipped?:    string;  // reason if trade was not placed
  stopLoss?:   number;
  takeProfit?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private readonly binance: BinanceService,
    private readonly config:  ConfigService,
  ) {}

  // ─── 1. Analyse market → produce signal ────────────────────────────────────

  /**
   * Fetch candles and compute RSI strategy signal.
   *
   * RSI Rules:
   *  BUY  — RSI < 30 (oversold) AND price above EMA50
   *  SELL — RSI > 70 (overbought) OR MACD histogram turns negative
   *  HOLD — everything else
   */
  async analyseRSI(symbol: string, timeframe: string): Promise<Signal> {
    const candles = await this.binance.getCandles(symbol, timeframe, 100);
    const ind     = computeAll(candles);

    let action:     SignalAction = 'HOLD';
    let confidence: number       = 0.5;
    let reason:     string       = '';

    const { rsi, macd, ema, price } = ind;

    if (rsi < 30 && price > ema.ema50) {
      action     = 'BUY';
      confidence = this.normalize(30 - rsi, 0, 30);   // deeper oversold = higher confidence
      reason     = `RSI ${rsi} — oversold. Price $${price} above EMA50 $${ema.ema50}. Bullish reversal likely.`;
    } else if (rsi > 70) {
      action     = 'SELL';
      confidence = this.normalize(rsi - 70, 0, 30);
      reason     = `RSI ${rsi} — overbought. Consider taking profit.`;
    } else if (macd.histogram < 0 && macd.histogram < -Math.abs(macd.value) * 0.1) {
      action     = 'SELL';
      confidence = 0.55;
      reason     = `MACD histogram ${macd.histogram} negative — bearish momentum.`;
    } else {
      reason = `RSI ${rsi} neutral. No clear signal. EMA9=${ema.ema9}, EMA21=${ema.ema21}.`;
    }

    return {
      action,
      confidence: parseFloat(confidence.toFixed(3)),
      reason,
      indicators: ind,
      symbol,
      timeframe,
      timestamp: Date.now(),
    };
  }

  // ─── 2. Execute trade based on signal ──────────────────────────────────────

  /**
   * Full trading cycle:
   *  1. Get signal
   *  2. Check balance
   *  3. Calculate position size
   *  4. Place order (if signal is BUY/SELL)
   *  5. Return summary
   */
  async executeTrade(cfg: TradeConfig): Promise<TradeSummary> {
    // Step 1 — get signal
    const signal = await this.analyseRSI(cfg.symbol, cfg.timeframe);
    this.logger.log(
      `[${cfg.symbol}] Signal: ${signal.action} (conf: ${signal.confidence}) — ${signal.reason}`,
    );

    if (signal.action === 'HOLD') {
      return { signal, skipped: 'Signal is HOLD — no trade placed' };
    }

    // Step 2 — check balance
    const balances = await this.binance.getBalance();
    const usdtBal  = balances.find(b => b.asset === 'USDT');

    if (!usdtBal || usdtBal.free < 10) {
      return { signal, skipped: `Insufficient USDT balance: ${usdtBal?.free ?? 0}` };
    }

    // Step 3 — position size
    const usdtToSpend = usdtBal.free * (cfg.maxPosPct / 100);
    const price       = signal.indicators.price;
    const quantity    = parseFloat((usdtToSpend / price).toFixed(6));

    if (quantity <= 0) {
      return { signal, skipped: 'Calculated quantity is zero' };
    }

    // Step 4 — place market order
    try {
      const order = await this.binance.placeMarketOrder(
        cfg.symbol,
        signal.action as 'BUY' | 'SELL',
        quantity,
      );

      const fillPrice = order.price || price;

      // Calculate SL/TP prices for reference (not yet placed as orders)
      const stopLoss   = signal.action === 'BUY'
        ? parseFloat((fillPrice * (1 - cfg.stopLossPct   / 100)).toFixed(2))
        : parseFloat((fillPrice * (1 + cfg.stopLossPct   / 100)).toFixed(2));

      const takeProfit = signal.action === 'BUY'
        ? parseFloat((fillPrice * (1 + cfg.takeProfitPct / 100)).toFixed(2))
        : parseFloat((fillPrice * (1 - cfg.takeProfitPct / 100)).toFixed(2));

      this.logger.log(
        `✅ Order placed | ${signal.action} ${quantity} ${cfg.symbol} @ ~$${fillPrice} | SL: $${stopLoss} | TP: $${takeProfit}`,
      );

      return { signal, order, stopLoss, takeProfit };
    } catch (err) {
      this.logger.error(`Order failed: ${err.message}`);
      throw err;
    }
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  /** Map a value in [0, max] to [0.5, 1.0] */
  private normalize(value: number, min: number, max: number): number {
    const clamped = Math.min(Math.max(value, min), max);
    return 0.5 + (clamped / max) * 0.5;
  }
}
