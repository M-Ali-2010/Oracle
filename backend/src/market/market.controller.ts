import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  CreateEventDto,
  CreateTokenDto,
  CreateUserDto,
  PlaceBetDto,
  TradeTokenDto,
  WalletDepositDto,
} from './dto';
import { MarketService } from './market.service';

@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.market.createUser(dto);
  }

  @Get('events')
  listEvents() {
    return this.market.listEvents();
  }

  @Get('tokens')
  listTokens() {
    return this.market.listTokens();
  }

  @Post('events')
  createEvent(@Body() dto: CreateEventDto) {
    return this.market.createEvent(dto);
  }

  @Post('events/:eventId/bets')
  placeBet(@Param('eventId') eventId: string, @Body() dto: PlaceBetDto) {
    return this.market.placeBet(eventId, dto);
  }

  @Post('wallet/deposit')
  deposit(@Body() dto: WalletDepositDto) {
    return this.market.deposit(dto.userId, dto.amount);
  }

  @Get('dashboard/:userId')
  dashboard(@Param('userId') userId: string) {
    return this.market.getDashboard(userId);
  }

  @Post('tokens')
  createToken(@Body() dto: CreateTokenDto) {
    return this.market.createToken(dto);
  }

  @Post('tokens/:tokenId/buy')
  buyToken(@Param('tokenId') tokenId: string, @Body() dto: TradeTokenDto) {
    return this.market.buyToken(tokenId, dto.userId, dto.amount);
  }

  @Post('tokens/:tokenId/sell')
  sellToken(@Param('tokenId') tokenId: string, @Body() dto: TradeTokenDto) {
    return this.market.sellToken(tokenId, dto.userId, dto.amount);
  }

  @Get('feed')
  feed(@Query('limit', new ParseIntPipe({ optional: true })) limit = 50) {
    return this.market.getFeed(limit);
  }

  @Get('wallet/transactions/:userId')
  walletTransactions(
    @Param('userId') userId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50,
  ) {
    return this.market.getWalletTransactions(userId, limit);
  }

  @Get('admin/overview')
  adminOverview() {
    return this.market.adminOverview();
  }

  @Get('admin/users')
  adminUsers() {
    return this.market.listUsersForAdmin();
  }

  @Post('admin/ai/run')
  runAiCycle() {
    return this.market.triggerAiCycle();
  }
}
