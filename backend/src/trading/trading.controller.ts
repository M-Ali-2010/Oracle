import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { TradingService } from './trading.service';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class ExecuteTradeDto {
  @IsString()
  symbol: string = 'BTCUSDT';

  @IsString()
  @IsOptional()
  timeframe?: string = '15m';

  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @Max(100)
  maxPosPct?: number = 2;

  @IsNumber()
  @IsOptional()
  stopLossPct?: number = 1.5;

  @IsNumber()
  @IsOptional()
  takeProfitPct?: number = 3;
}

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('trading')
export class TradingController {
  constructor(private readonly trading: TradingService) {}

  /**
   * GET /api/trading/signal?symbol=BTCUSDT&timeframe=15m
   *
   * Returns the current RSI signal WITHOUT placing an order.
   * Use this to inspect what the strategy would do.
   */
  @Get('signal')
  getSignal(
    @Query('symbol')    symbol    = 'BTCUSDT',
    @Query('timeframe') timeframe = '15m',
  ) {
    return this.trading.analyseRSI(symbol.toUpperCase(), timeframe);
  }

  /**
   * POST /api/trading/execute
   * Body: { symbol, timeframe, maxPosPct, stopLossPct, takeProfitPct }
   *
   * Runs the full cycle: analyse → validate → place order.
   * Uses TESTNET by default.
   */
  @Post('execute')
  executeTrade(@Body() dto: ExecuteTradeDto) {
    return this.trading.executeTrade({
      symbol:        dto.symbol?.toUpperCase() || 'BTCUSDT',
      timeframe:     dto.timeframe             || '15m',
      maxPosPct:     dto.maxPosPct             ?? 2,
      stopLossPct:   dto.stopLossPct           ?? 1.5,
      takeProfitPct: dto.takeProfitPct         ?? 3,
    });
  }
}
