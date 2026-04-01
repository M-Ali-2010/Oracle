import { Module } from '@nestjs/common';
import { BinanceService } from './binance.service';
import { BinanceController } from './binance.controller';

@Module({
  providers:   [BinanceService],
  controllers: [BinanceController],
  exports:     [BinanceService],  // so TradingModule can inject it
})
export class BinanceModule {}
