import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface Ticker {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePct: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
}

export interface OrderResult {
  orderId: number;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price: number;
  status: string;
  executedQty: number;
  cummulativeQuoteQty: number;
  transactTime: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BinanceService implements OnModuleInit {
  private readonly logger = new Logger(BinanceService.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly isTestnet: boolean;

  // Testnet vs mainnet base URLs
  private readonly BASE_URL_REST: string;

  constructor(private config: ConfigService) {
    this.apiKey    = this.config.get<string>('BINANCE_API_KEY', '');
    this.secretKey = this.config.get<string>('BINANCE_SECRET_KEY', '');
    this.isTestnet = this.config.get<string>('BINANCE_TESTNET', 'true') === 'true';

    this.BASE_URL_REST = this.isTestnet
      ? 'https://testnet.binance.vision/api'
      : 'https://api.binance.com/api';

    this.http = axios.create({
      baseURL: this.BASE_URL_REST,
      timeout: 10_000,
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    // Retry on rate limit or network error
    this.http.interceptors.response.use(
      res => res,
      async err => {
        const status = err?.response?.status;
        if (status === 429 || status === 418) {
          // Rate limited — wait and retry once
          const retryAfter = parseInt(err.response.headers['retry-after'] || '5', 10);
          this.logger.warn(`Rate limited. Retrying after ${retryAfter}s`);
          await this.sleep(retryAfter * 1000);
          return this.http.request(err.config);
        }
        return Promise.reject(err);
      },
    );
  }

  async onModuleInit() {
    // Verify connectivity on startup
    try {
      await this.ping();
      this.logger.log(
        `✅ Binance connected — ${this.isTestnet ? 'TESTNET' : 'MAINNET'} — ${this.BASE_URL_REST}`,
      );
    } catch (e) {
      this.logger.error(`❌ Binance connection failed: ${e.message}`);
      this.logger.error('Check BINANCE_API_KEY / BINANCE_SECRET_KEY in your .env');
    }
  }

  // ─── Public endpoints (no signature needed) ─────────────────────────────────

  async ping(): Promise<boolean> {
    await this.http.get('/v3/ping');
    return true;
  }

  async getServerTime(): Promise<number> {
    const res = await this.http.get('/v3/time');
    return res.data.serverTime;
  }

  /**
   * Fetch OHLCV candles.
   * @param symbol  e.g. 'BTCUSDT'
   * @param interval e.g. '15m', '1h', '4h'
   * @param limit   number of candles (max 1000)
   */
  async getCandles(symbol: string, interval: string, limit = 100): Promise<Candle[]> {
    const res = await this.http.get('/v3/klines', {
      params: { symbol, interval, limit },
    });

    return (res.data as any[]).map(c => ({
      openTime:  Number(c[0]),
      open:      parseFloat(c[1]),
      high:      parseFloat(c[2]),
      low:       parseFloat(c[3]),
      close:     parseFloat(c[4]),
      volume:    parseFloat(c[5]),
      closeTime: Number(c[6]),
    }));
}

/**
 * Get current ticker price + 24h stats.
 */
async getTicker(symbol: string): Promise<Ticker> {
    const res = await this.http.get('/v3/ticker/24hr', { params: { symbol } });
    const d = res.data;
    return {
      symbol:         d.symbol,
      price:          parseFloat(d.lastPrice),
      priceChange:    parseFloat(d.priceChange),
      priceChangePct: parseFloat(d.priceChangePercent),
      high24h:        parseFloat(d.highPrice),
      low24h:         parseFloat(d.lowPrice),
      volume24h:      parseFloat(d.volume),
    };
  }

  // ─── Private endpoints (require HMAC signature) ──────────────────────────────

  /**
   * Get account balances. Filters out zero balances.
   */
  async getBalance(): Promise<Balance[]> {
    const res = await this.signedGet('/v3/account');
    return (res.balances as any[])
      .map(b => ({
        asset:  b.asset,
        free:   parseFloat(b.free),
        locked: parseFloat(b.locked),
      }))
      .filter(b => b.free > 0 || b.locked > 0);
  }

  /**
   * Place a MARKET order.
   * For testnet: quantity must meet Binance minimum lot size.
   *
   * @param symbol   'BTCUSDT'
   * @param side     'BUY' | 'SELL'
   * @param quantity base asset quantity (e.g. 0.001 BTC)
   */
  async placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
  ): Promise<OrderResult> {
    const res = await this.signedPost('/v3/order', {
      symbol,
      side,
      type: 'MARKET',
      quantity: quantity.toFixed(8),
    });

    return {
      orderId:                  res.orderId,
      symbol:                   res.symbol,
      side:                     res.side,
      type:                     res.type,
      quantity:                 parseFloat(res.origQty),
      price:                    parseFloat(res.fills?.[0]?.price || '0'),
      status:                   res.status,
      executedQty:              parseFloat(res.executedQty),
      cummulativeQuoteQty:      parseFloat(res.cummulativeQuoteQty),
      transactTime:             res.transactTime,
    };
  }

  /**
   * Place a LIMIT order with stop-loss and take-profit context.
   * Returns order result — caller is responsible for managing SL/TP.
   */
  async placeLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
  ): Promise<OrderResult> {
    const res = await this.signedPost('/v3/order', {
      symbol,
      side,
      type: 'LIMIT',
      timeInForce: 'GTC',
      quantity:    quantity.toFixed(8),
      price:       price.toFixed(2),
    });

    return {
      orderId:             res.orderId,
      symbol:              res.symbol,
      side:                res.side,
      type:                res.type,
      quantity:            parseFloat(res.origQty),
      price:               parseFloat(res.price),
      status:              res.status,
      executedQty:         parseFloat(res.executedQty),
      cummulativeQuoteQty: parseFloat(res.cummulativeQuoteQty),
      transactTime:        res.transactTime,
    };
  }

  /**
   * Cancel an open order by orderId.
   */
  async cancelOrder(symbol: string, orderId: number): Promise<void> {
    await this.signedDelete('/v3/order', { symbol, orderId });
    this.logger.log(`Cancelled order ${orderId} on ${symbol}`);
  }

  /**
   * Get open orders for a symbol.
   */
  async getOpenOrders(symbol: string): Promise<any[]> {
    return this.signedGet('/v3/openOrders', { symbol });
  }

  // ─── HMAC signing helpers ────────────────────────────────────────────────────

  private sign(params: Record<string, any>): string {
    const query = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(query)
      .digest('hex');
  }

  private async signedGet(path: string, extra: Record<string, any> = {}): Promise<any> {
    const timestamp = await this.getServerTime();
    const params    = { ...extra, timestamp, recvWindow: 5000 };
    const signature = this.sign(params);
    const res = await this.http.get(path, { params: { ...params, signature } });
    return res.data;
  }

  private async signedPost(path: string, body: Record<string, any>): Promise<any> {
    const timestamp = await this.getServerTime();
    const params    = { ...body, timestamp, recvWindow: 5000 };
    const signature = this.sign(params);
    const res = await this.http.post(
      path,
      new URLSearchParams({ ...params, signature } as any).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return res.data;
  }

  private async signedDelete(path: string, params: Record<string, any>): Promise<any> {
    const timestamp = await this.getServerTime();
    const p         = { ...params, timestamp, recvWindow: 5000 };
    const signature = this.sign(p);
    const res = await this.http.delete(path, { params: { ...p, signature } });
    return res.data;
  }

  private sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
  }
}
