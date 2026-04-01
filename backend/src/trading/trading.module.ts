import { Module } from '@nestjs/common';
import { TradingService } from './trading.service';
import { TradingController } from './trading.controller';
import { BinanceModule } from '../binance/binance.module';

@Module({
  imports:     [BinanceModule],   // gives TradingService access to BinanceService
  providers:   [TradingService],
  controllers: [TradingController],
  exports:     [TradingService],
})
export class TradingModule {}
