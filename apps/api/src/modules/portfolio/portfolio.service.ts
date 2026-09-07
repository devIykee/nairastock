import { Injectable, Logger } from '@nestjs/common';
import { TokenKind, TransactionStatus, type Transaction, type Token as TokenRow, type User } from '@prisma/client';
import { ethers } from 'ethers';
import {
  addDecimals,
  addressUrl,
  formatAmount,
  roundDecimals,
  toTokenAmount,
  txUrl,
  type Portfolio,
  type TokenBalance,
  type TransactionRecord,
} from '@nairastock/shared';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';
import { Erc20Service } from '../chain/erc20.service';
import { StocksService } from '../stocks/stocks.service';
import { PricingService } from '../pricing/pricing.service';
import { valueOfHolding } from '../pricing/pricing-math';

/**
 * Aggregates chain state into the dashboard payload.
 *
 * Every balance is read from chain on each request (one batched multicall) and
 * then written to the `Balance` cache table. The cache exists so a future
 * offline/optimistic render is possible; it is never the answer we serve. That
 * ordering is the product's core claim, the user's holdings are whatever the
 * chain says they are, not what our database remembers.
 */
@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly chain: ChainService,
    private readonly erc20: Erc20Service,
    private readonly stocks: StocksService,
    private readonly pricing: PricingService,
  ) {}

  async getPortfolio(user: User, options: { transactionLimit?: number } = {}): Promise<Portfolio> {
    const address = ethers.getAddress(user.walletAddress);
    const tokens = this.stocks.all();

    if (tokens.length === 0) {
      // Nothing seeded yet, return an honest empty portfolio rather than 500.
      return this.emptyPortfolio(address);
    }

    const [balances, gasBalance, blockNumber, transactions] = await Promise.all([
      this.erc20.balancesOf(
        tokens.map((t) => t.address),
        address,
      ),
      this.chain.getNativeBalance(address).catch(() => 0n),
      this.chain.getBlockNumber().catch(() => 0),
      this.recentTransactions(user.id, options.transactionLimit ?? 20),
    ]);

    const priceMap = await this.pricing.getPrices(tokens.filter((t) => t.kind === TokenKind.STOCK).map((t) => t.symbol));

    const cashToken = this.stocks.cash();
    const cash = this.toBalanceDto(cashToken, balances[cashToken.address] ?? 0n, address, this.pricing.cashPrice());

    const holdings = tokens
      .filter((t) => t.kind === TokenKind.STOCK)
      .map((token) => this.toBalanceDto(token, balances[token.address] ?? 0n, address, priceMap[token.symbol] ?? null));

    const investedUsd = holdings.reduce((sum, h) => addDecimals(sum, h.valueUsd), '0');
    const investedNgn = holdings.reduce((sum, h) => addDecimals(sum, h.valueNgn), '0');

    // Fire-and-forget cache write; a failure here must not fail the dashboard.
    void this.syncBalanceCache(user.id, tokens, balances, blockNumber).catch((error) => {
      this.logger.debug(`balance cache sync failed: ${(error as Error).message}`);
    });

    return {
      walletAddress: address,
      explorerUrl: addressUrl(this.config.chainId, address, this.config.explorerBaseUrl) ?? '',
      chainId: this.config.chainId,
      networkLabel: this.config.networkLabel,
      cash,
      holdings,
      totalValueUsd: roundDecimals(addDecimals(investedUsd, cash.valueUsd), 2),
      totalValueNgn: roundDecimals(addDecimals(investedNgn, cash.valueNgn), 2),
      investedValueUsd: roundDecimals(investedUsd, 2),
      investedValueNgn: roundDecimals(investedNgn, 2),
      transactions,
      gasBalance: toTokenAmount(gasBalance, 18),
      syncedAt: new Date().toISOString(),
    };
  }

  /** Balances only, used by `GET /wallet/:address/balances`, which needs no auth-scoped history. */
  async getBalances(address: string): Promise<TokenBalance[]> {
    const checksummed = ethers.getAddress(address);
    const tokens = this.stocks.all();
    if (tokens.length === 0) return [];

    const balances = await this.erc20.balancesOf(
      tokens.map((t) => t.address),
      checksummed,
    );
    const priceMap = await this.pricing.getPrices(tokens.filter((t) => t.kind === TokenKind.STOCK).map((t) => t.symbol));

    return tokens.map((token) =>
      this.toBalanceDto(
        token,
        balances[token.address] ?? 0n,
        checksummed,
        token.kind === TokenKind.STABLECOIN ? this.pricing.cashPrice() : priceMap[token.symbol] ?? null,
      ),
    );
  }

  async recentTransactions(userId: string, limit = 20): Promise<TransactionRecord[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { tokenIn: true, tokenOut: true },
    });
    return rows.map((row) => this.toTransactionDto(row));
  }

  toTransactionDto(row: Transaction & { tokenIn?: TokenRow | null; tokenOut?: TokenRow | null }): TransactionRecord {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      tokenInSymbol: row.tokenIn?.symbol ?? null,
      tokenOutSymbol: row.tokenOut?.symbol ?? null,
      amountIn: row.amountIn && row.tokenIn ? formatAmount(row.amountIn, row.tokenIn.decimals) : row.amountIn,
      amountOut: row.amountOut && row.tokenOut ? formatAmount(row.amountOut, row.tokenOut.decimals) : row.amountOut,
      txHash: row.txHash,
      explorerUrl: row.txHash ? txUrl(row.chainId, row.txHash, this.config.explorerBaseUrl) : null,
      failureReason: row.failureReason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toBalanceDto(
    token: TokenRow,
    amount: bigint,
    holder: string,
    price: { priceUsd: string; priceNgn: string; symbol: string; change24hPct: string | null; updatedAt: string; simulated: boolean } | null,
  ): TokenBalance {
    return {
      token: this.stocks.toDto(token),
      amount: toTokenAmount(amount, token.decimals),
      valueUsd: price ? valueOfHolding(amount, token.decimals, price.priceUsd) : '0',
      valueNgn: price ? valueOfHolding(amount, token.decimals, price.priceNgn) : '0',
      price,
      // The proof point: a link a judge can click to see this balance on-chain.
      explorerUrl: this.stocks.balanceExplorerUrl(token, holder),
    };
  }

  private async syncBalanceCache(
    userId: string,
    tokens: TokenRow[],
    balances: Record<string, bigint>,
    blockNumber: number,
  ): Promise<void> {
    await this.prisma.$transaction(
      tokens.map((token) =>
        this.prisma.balance.upsert({
          where: { userId_tokenId: { userId, tokenId: token.id } },
          create: {
            userId,
            tokenId: token.id,
            amount: (balances[token.address] ?? 0n).toString(),
            syncedAtBlock: BigInt(blockNumber),
          },
          update: {
            amount: (balances[token.address] ?? 0n).toString(),
            syncedAtBlock: BigInt(blockNumber),
          },
        }),
      ),
    );
  }

  private emptyPortfolio(address: string): Portfolio {
    const zero = toTokenAmount(0n, 18);
    const placeholderToken = {
      symbol: this.config.cngnSymbol,
      name: 'Compliant Naira',
      kind: 'STABLECOIN' as const,
      address: ethers.ZeroAddress,
      decimals: 18,
      logoUrl: null,
      feedAddress: null,
      underlyingSymbol: null,
      explorerUrl: '',
    };
    return {
      walletAddress: address,
      explorerUrl: addressUrl(this.config.chainId, address, this.config.explorerBaseUrl) ?? '',
      chainId: this.config.chainId,
      networkLabel: this.config.networkLabel,
      cash: { token: placeholderToken, amount: zero, valueUsd: '0', valueNgn: '0', price: null, explorerUrl: '' },
      holdings: [],
      totalValueUsd: '0',
      totalValueNgn: '0',
      investedValueUsd: '0',
      investedValueNgn: '0',
      transactions: [],
      gasBalance: zero,
      syncedAt: new Date().toISOString(),
    };
  }

  /** Convenience for the transaction-history endpoint. */
  async countTransactions(userId: string, status?: TransactionStatus): Promise<number> {
    return this.prisma.transaction.count({ where: { userId, ...(status ? { status } : {}) } });
  }
}
