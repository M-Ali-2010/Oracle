import { Controller, Get, Param, Query } from '@nestjs/common';
import { BinanceService } from './binance.service';

@Controller('binance')
export class BinanceController {
  constructor(private readonly binance: BinanceService) {}

  /**
   * GET /api/binance/ticker/BTCUSDT
   * Returns current price + 24h stats.
   */
  @Get('ticker/:symbol')
  getTicker(@Param('symbol') symbol: string) {
    return this.binance.getTicker(symbol.toUpperCase());
  }

  /**
   * GET /api/binance/candles/BTCUSDT?interval=15m&limit=50
   * Returns OHLCV candles.
   */
  @Get('candles/:symbol')
  getCandles(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '15m',
    @Query('limit') limit = '50',
  ) {
    return this.binance.getCandles(symbol.toUpperCase(), interval, parseInt(limit));
  }

  /**
   * GET /api/binance/balance
   * Returns account balances (testnet).
   */
  @Get('balance')
  getBalance() {
    return this.binance.getBalance();
  }
}
