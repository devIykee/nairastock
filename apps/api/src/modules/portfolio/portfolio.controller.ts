import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { Portfolio, TransactionRecord } from '@nairastock/shared';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolio')
@Controller('portfolio')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  @ApiOperation({
    summary: 'Everything the dashboard needs',
    description:
      'Wallet address, cNGN balance, every stock holding with live price × quantity, totals in NGN and USD, ' +
      'the native gas balance, and recent transactions. Balances are read from chain on every request (one ' +
      'batched multicall), the `Balance` table is only a write-behind cache, never the answer served.',
  })
  async get(@CurrentUser() user: User): Promise<Portfolio> {
    return this.portfolio.getPortfolio(user);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Transaction history with explorer links' })
  async transactions(
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
  ): Promise<TransactionRecord[]> {
    const parsed = Number(limit);
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50;
    return this.portfolio.recentTransactions(user.id, take);
  }
}
