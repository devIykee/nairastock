import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TokenKind, type Token as TokenRow } from '@prisma/client';
import { ethers } from 'ethers';
import {
  CNGN_REFERENCE,
  STOCK_REFERENCES,
  findStockReference,
  tokenBalanceUrl,
  addressUrl,
  type Token,
} from '@nairastock/shared';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app-exception';

/**
 * The tradeable universe.
 *
 * Rows are seeded from `.env` + the static reference table in packages/shared,
 * then cached in memory for the process lifetime, the whitelist is 5 tokens and
 * cannot change without a redeploy, so re-querying it per request is waste.
 * `GET /stocks` therefore costs one price-cache read and no database round-trip.
 */
@Injectable()
export class StocksService implements OnModuleInit {
  private readonly logger = new Logger(StocksService.name);
  private cache: TokenRow[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.cache = await this.prisma.token.findMany({
      where: { chainId: this.config.chainId, isActive: true },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
    });

    if (this.cache.length === 0) {
      this.logger.warn(
        `No tokens seeded for chain ${this.config.chainId}. Run \`pnpm chain:deploy && pnpm db:seed\`.`,
      );
      return;
    }
    const symbols = this.cache.map((t) => t.symbol).join(', ');
    this.logger.log(`loaded ${this.cache.length} tokens on chain ${this.config.chainId}: ${symbols}`);
  }

  /** Every token including cNGN. */
  all(): TokenRow[] {
    return this.cache;
  }

  /** Just the stock tokens, what the trade screen lists. */
  stocks(): TokenRow[] {
    return this.cache.filter((t) => t.kind === TokenKind.STOCK);
  }

  cash(): TokenRow {
    const cngn = this.cache.find((t) => t.kind === TokenKind.STABLECOIN);
    if (!cngn) {
      throw AppException.notConfigured(`the ${CNGN_REFERENCE.symbol} settlement token`);
    }
    return cngn;
  }

  findBySymbol(symbol: string): TokenRow | undefined {
    const needle = symbol.trim().toLowerCase();
    return this.cache.find((t) => t.symbol.toLowerCase() === needle);
  }

  requireBySymbol(symbol: string): TokenRow {
    const token = this.findBySymbol(symbol);
    if (!token) throw AppException.unknownToken(symbol);
    return token;
  }

  findByAddress(address: string): TokenRow | undefined {
    let checksummed: string;
    try {
      checksummed = ethers.getAddress(address);
    } catch {
      return undefined;
    }
    return this.cache.find((t) => ethers.getAddress(t.address) === checksummed);
  }

  /** Maps a DB row onto the shared wire type, attaching explorer links. */
  toDto(token: TokenRow): Token {
    const reference = findStockReference(token.symbol);
    return {
      symbol: token.symbol,
      name: token.name,
      kind: token.kind === TokenKind.STABLECOIN ? 'STABLECOIN' : 'STOCK',
      address: token.address,
      decimals: token.decimals,
      logoUrl: token.logoUrl,
      feedAddress: token.chainlinkFeedAddress,
      underlyingSymbol: token.underlyingSymbol ?? reference?.underlyingSymbol ?? null,
      explorerUrl: addressUrl(token.chainId, token.address, this.config.explorerBaseUrl) ?? '',
    };
  }

  /** The self-custody proof link: this holder's balance of this token. */
  balanceExplorerUrl(token: TokenRow, holder: string): string {
    return tokenBalanceUrl(token.chainId, token.address, holder, this.config.explorerBaseUrl) ?? '';
  }

  blurbFor(symbol: string): string | null {
    const row = this.findBySymbol(symbol);
    if (row?.blurb) return row.blurb;
    return findStockReference(symbol)?.blurb ?? null;
  }

  /** Static reference data, for the seed script and the stock detail page. */
  static references() {
    return { cngn: CNGN_REFERENCE, stocks: STOCK_REFERENCES };
  }
}
