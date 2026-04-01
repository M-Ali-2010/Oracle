import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceModule } from './binance/binance.module';
import { TradingModule } from './trading/trading.module';

@Module({
  imports: [
    // Load .env globally so every service can inject ConfigService
    ConfigModule.forRoot({ isGlobal: true }),
    BinanceModule,
    TradingModule,
  ],
})
export class AppModule {}
