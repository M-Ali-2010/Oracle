import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FeedItemType, Prisma, WalletTxType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../services/ai.service';
import { CreateEventDto, CreateTokenDto, CreateUserDto, PlaceBetDto } from './dto';

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  private durationToDate(duration: string) {
    const now = Date.now();
    if (duration === '1h') return new Date(now + 3600_000);
    if (duration === '7d') return new Date(now + 7 * 24 * 3600_000);
    return new Date(now + 24 * 3600_000);
  }

  async createUser(dto: CreateUserDto) {
    const existing = dto.phantomAddress
      ? await this.prisma.user.findUnique({ where: { phantomAddress: dto.phantomAddress }, include: { wallet: true } })
      : await this.prisma.user.findUnique({ where: { username: dto.username }, include: { wallet: true } });
    if (existing) return existing;

    return this.prisma.user.create({
      data: {
        username: dto.username,
        phantomAddress: dto.phantomAddress,
        wallet: { create: {} },
      },
      include: { wallet: true },
    });
  }

  async listEvents() {
    return this.prisma.marketEvent.findMany({
      orderBy: { createdAt: 'desc' },
      include: { options: true, bets: true },
    });
  }

  async listTokens() {
    return this.prisma.platformToken.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async listUsersForAdmin() {
    return this.prisma.user.findMany({
      include: { wallet: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createEvent(dto: CreateEventDto, createdBy = 'admin') {
    const event = await this.prisma.marketEvent.create({
      data: {
        title: dto.title,
        description: dto.description,
        endTime: this.durationToDate(dto.duration),
        createdBy,
        options: {
          create: dto.options.map((label) => ({ label })),
        },
      },
      include: { options: true },
    });

    await this.addFeed(FeedItemType.EVENT_CREATED, `New event: ${event.title}`, { eventId: event.id });
    return event;
  }

  async placeBet(eventId: string, dto: PlaceBetDto) {
    const event = await this.prisma.marketEvent.findUnique({
      where: { id: eventId },
      include: { options: true },
    });
    if (!event || event.status !== 'OPEN') {
      throw new BadRequestException('Event is not open for betting');
    }

    const option = event.options.find((item) => item.id === dto.optionId);
    if (!option) throw new NotFoundException('Option not found');

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: dto.userId } });
      if (!wallet) throw new NotFoundException('Wallet not found');
      if (Number(wallet.balance) < dto.amount) throw new BadRequestException('Insufficient balance');

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: dto.amount } },
      });
      await tx.walletTx.create({
        data: {
          walletId: wallet.id,
          type: WalletTxType.BET_DEBIT,
          amount: new Prisma.Decimal(dto.amount),
          description: `Bet on event ${event.title}`,
          refId: event.id,
        },
      });

      const bet = await tx.bet.create({
        data: {
          userId: dto.userId,
          eventId,
          optionId: dto.optionId,
          amount: new Prisma.Decimal(dto.amount),
        },
      });

      await tx.eventOption.update({
        where: { id: dto.optionId },
        data: { liquidity: { increment: dto.amount } },
      });
      await tx.marketEvent.update({
        where: { id: eventId },
        data: { totalLiquidity: { increment: dto.amount } },
      });

      await this.recomputePercentages(eventId, tx);
      await this.addFeed(FeedItemType.BET_PLACED, `Bet placed: ${dto.amount} on ${option.label}`, {
        eventId,
        userId: dto.userId,
      });
      return bet;
    });
  }

  async deposit(userId: string, amount: number) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: amount } },
    });
    await this.prisma.walletTx.create({
      data: {
        walletId: wallet.id,
        type: WalletTxType.DEPOSIT,
        amount: new Prisma.Decimal(amount),
        description: 'Custodial wallet top-up',
      },
    });
    await this.addFeed(FeedItemType.WALLET_ACTION, `Deposit: ${amount}`, { userId });
    return this.getDashboard(userId);
  }

  async getDashboard(userId: string) {
    const [wallet, activeBets, history, holdings] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.bet.findMany({
        where: { userId, event: { status: 'OPEN' } },
        include: { event: true, option: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bet.findMany({
        where: { userId, event: { status: 'RESOLVED' } },
        include: { event: true, option: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.userTokenHolding.findMany({
        where: { userId },
        include: { token: true },
      }),
    ]);
    return { wallet, activeBets, history, holdings };
  }

  async createToken(dto: CreateTokenDto) {
    const token = await this.prisma.platformToken.create({
      data: {
        name: dto.name,
        symbol: dto.symbol.toUpperCase(),
        supply: new Prisma.Decimal(dto.supply),
        logoUrl: dto.logoUrl,
      },
    });
    await this.addFeed(FeedItemType.TOKEN_CREATED, `Token listed: ${token.symbol}`, { tokenId: token.id });
    return token;
  }

  async buyToken(tokenId: string, userId: string, amount: number) {
    return this.tradeToken(tokenId, userId, amount, 'BUY');
  }

  async sellToken(tokenId: string, userId: string, amount: number) {
    return this.tradeToken(tokenId, userId, amount, 'SELL');
  }

  async getFeed(limit = 50) {
    return this.prisma.feedItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async getWalletTransactions(userId: string, limit = 50) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return this.prisma.walletTx.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async adminOverview() {
    const [users, openEvents, totalBets, txs] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.marketEvent.count({ where: { status: 'OPEN' } }),
      this.prisma.bet.count(),
      this.prisma.walletTx.count(),
    ]);
    return { users, openEvents, totalBets, walletTransactions: txs };
  }

  async triggerAiCycle() {
    const ideas = await this.ai.generateEventIdeas();
    for (const idea of ideas.slice(0, 2)) {
      await this.createEvent(
        {
          title: idea.title,
          description: idea.description,
          duration: '24h',
          options: ['YES', 'NO'],
        },
        'ai',
      );
    }
    await this.addFeed(FeedItemType.AI_ACTIVITY, await this.ai.generateFeedText('Generated market events'));
    return { created: ideas.length };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async minuteJobs() {
    await this.refreshEventPercentages();
    await this.resolveFinishedEvents();
  }

  @Cron('*/2 * * * *')
  async aiAutoActivity() {
    const openEvents = await this.prisma.marketEvent.findMany({
      where: { status: 'OPEN' },
      include: { options: true },
      take: 20,
    });
    if (openEvents.length === 0) {
      await this.triggerAiCycle();
      return;
    }

    const users = await this.prisma.user.findMany({ include: { wallet: true }, take: 10 });
    for (let i = 0; i < 2; i++) {
      const event = openEvents[Math.floor(Math.random() * openEvents.length)];
      const user = users[Math.floor(Math.random() * users.length)];
      if (!event || !user?.wallet || !event.options.length) continue;
      const amount = Number(user.wallet.balance) > 2 ? 1 + Math.random() * 2 : 0;
      if (amount <= 0) continue;
      const option = event.options[Math.floor(Math.random() * event.options.length)];
      try {
        await this.placeBet(event.id, {
          userId: user.id,
          optionId: option.id,
          amount: Number(amount.toFixed(2)),
        });
      } catch {
        // ignore single-user liquidity errors
      }
    }

    const videoPrompt = await this.ai.generateVideoPrompt('latest crypto prediction activity');
    await this.addFeed(FeedItemType.VIDEO_GENERATED, 'AI generated video idea', {
      prompt: videoPrompt,
      videoUrl: 'https://ai.google.dev/gemini-api/docs/video',
    });
  }

  private async refreshEventPercentages() {
    const events = await this.prisma.marketEvent.findMany({ where: { status: 'OPEN' } });
    for (const event of events) {
      await this.recomputePercentages(event.id, this.prisma);
    }
  }

  private async resolveFinishedEvents() {
    const events = await this.prisma.marketEvent.findMany({
      where: { status: 'OPEN', endTime: { lte: new Date() } },
      include: { options: true, bets: true },
    });

    for (const event of events) {
      const winningOption = [...event.options].sort((a, b) => Number(b.liquidity) - Number(a.liquidity))[0];
      if (!winningOption) continue;

      await this.prisma.$transaction(async (tx) => {
        await tx.marketEvent.update({
          where: { id: event.id },
          data: { status: 'RESOLVED', winningOption: winningOption.label },
        });

        const losersPool = event.bets
          .filter((bet) => bet.optionId !== winningOption.id)
          .reduce((sum, item) => sum + Number(item.amount), 0);
        const winners = event.bets.filter((bet) => bet.optionId === winningOption.id);
        const winnersStake = winners.reduce((sum, item) => sum + Number(item.amount), 0);

        for (const bet of event.bets) {
          const isWinner = bet.optionId === winningOption.id;
          const payout = isWinner && winnersStake > 0
            ? Number(bet.amount) + (Number(bet.amount) / winnersStake) * losersPool
            : 0;

          await tx.bet.update({
            where: { id: bet.id },
            data: {
              isWinner,
              payout: new Prisma.Decimal(payout),
              resolvedAt: new Date(),
            },
          });

          if (payout > 0) {
            const wallet = await tx.wallet.findUnique({ where: { userId: bet.userId } });
            if (wallet) {
              await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: payout } },
              });
              await tx.walletTx.create({
                data: {
                  walletId: wallet.id,
                  type: WalletTxType.REWARD_CREDIT,
                  amount: new Prisma.Decimal(payout),
                  description: `Event reward for ${event.title}`,
                  refId: event.id,
                },
              });
            }
          }
        }
      });

      await this.addFeed(
        FeedItemType.EVENT_RESOLVED,
        `Event resolved: ${event.title} (${winningOption.label})`,
        { eventId: event.id, winningOption: winningOption.label },
      );
      this.logger.log(`Resolved event ${event.id}`);
    }
  }

  private async recomputePercentages(eventId: string, tx: PrismaService | Prisma.TransactionClient) {
    const options = await tx.eventOption.findMany({ where: { eventId } });
    const total = options.reduce((sum, item) => sum + Number(item.liquidity), 0);
    for (const option of options) {
      const percentage = total === 0 ? 0 : (Number(option.liquidity) / total) * 100;
      await tx.eventOption.update({
        where: { id: option.id },
        data: { percentage: new Prisma.Decimal(percentage.toFixed(2)) },
      });
    }
  }

  private async addFeed(type: FeedItemType, message: string, metadata?: Record<string, any>) {
    await this.prisma.feedItem.create({
      data: { type, message, metadata },
    });
  }

  private async tradeToken(tokenId: string, userId: string, amount: number, side: 'BUY' | 'SELL') {
    const [token, wallet] = await Promise.all([
      this.prisma.platformToken.findUnique({ where: { id: tokenId } }),
      this.prisma.wallet.findUnique({ where: { userId } }),
    ]);
    if (!token || !wallet) throw new NotFoundException('Token or wallet not found');

    const notional = amount * Number(token.price);
    return this.prisma.$transaction(async (tx) => {
      const holding = await tx.userTokenHolding.findUnique({
        where: { userId_tokenId: { userId, tokenId } },
      });

      if (side === 'BUY') {
        if (Number(wallet.balance) < notional) throw new BadRequestException('Insufficient wallet balance');
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: notional } } });
        await tx.userTokenHolding.upsert({
          where: { userId_tokenId: { userId, tokenId } },
          create: { userId, tokenId, amount: amount },
          update: { amount: { increment: amount } },
        });
      } else {
        const current = Number(holding?.amount ?? 0);
        if (current < amount) throw new BadRequestException('Insufficient token holdings');
        await tx.userTokenHolding.update({
          where: { userId_tokenId: { userId, tokenId } },
          data: { amount: { decrement: amount } },
        });
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: notional } } });
      }

      const drift = side === 'BUY' ? 1.01 : 0.99;
      const updatedToken = await tx.platformToken.update({
        where: { id: tokenId },
        data: { price: new Prisma.Decimal((Number(token.price) * drift).toFixed(6)) },
      });

      await this.addFeed(FeedItemType.AI_ACTIVITY, `${side} ${amount} ${token.symbol}`, { userId, tokenId });
      return updatedToken;
    });
  }
}
