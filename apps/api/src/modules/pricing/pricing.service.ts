import { Injectable, Logger } from '@nestjs/common';
import { type Token as TokenRow, TokenKind } from '@prisma/client';
import { ethers } from 'ethers';
import { PRICE_FEED_DECIMALS, findStockReference, type PricePoint, type TokenPrice } from '@nairastock/shared';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app-exception';
import { AGGREGATOR_V3_ABI, MOCK_AGGREGATOR_ABI } from '../../config/abis';
import { ChainService } from '../chain/chain.service';
import { MulticallService } from '../chain/multicall.service';
import { CacheService } from '../cache/cache.service';
import { StocksService } from '../stocks/stocks.service';
import { feedAnswerToUsd, nextSimulatedPrice, percentChange, usdToNgn } from './pricing-math';

const CACHE_KEY_PREFIX = 'price:';

/**
 * Lookback the chart and the 24h-change calculation both use. Shared so the
 * boot-time backfill guard measures freshness against the same window the
 * frontend actually queries.
 */
export const CHART_WINDOW_HOURS = 24;

interface CachedPrice extends TokenPrice {
  cachedAt: string;
}

export interface FeedReading {
  symbol: string;
  priceUsd: string;
  priceNgn: string;
  roundId: string | null;
  updatedAt: Date;
  simulated: boolean;
}

/**
 * Reads Chainlink-shaped price feeds, caches in Redis, and persists snapshots for
 * the chart.
 *
 * Feed addresses come from env. On Base mainnet they are real Chainlink
 * aggregators; on testnet they are MockAggregatorV3 instances the pricing job
 * nudges with a mean-reverting random walk (equity feeds don't exist on Base
 * Sepolia, and the underlying market is closed for most demo recordings).
 * Either way this service only calls `latestRoundData()`.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly aggregatorIface = new ethers.Interface(AGGREGATOR_V3_ABI);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly chain: ChainService,
    private readonly multicall: MulticallService,
    private readonly cache: CacheService,
    private readonly stocks: StocksService,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  /** Cache-first, so `GET /stocks` never blocks on an RPC call. */
  async getPrice(symbol: string): Promise<TokenPrice | null> {
    const cached = await this.cache.get<CachedPrice>(CACHE_KEY_PREFIX + symbol);
    if (cached) return stripCacheMeta(cached);

    // Cold cache (fresh boot, or Redis down): fall back to the newest snapshot.
    const token = this.stocks.findBySymbol(symbol);
    if (!token) return null;

    const snapshot = await this.prisma.priceSnapshot.findFirst({
      where: { tokenId: token.id },
      orderBy: { timestamp: 'desc' },
    });
    if (!snapshot) return null;

    const price: TokenPrice = {
      symbol,
      priceUsd: snapshot.priceUsd,
      priceNgn: snapshot.priceNgn,
      change24hPct: await this.change24h(token.id, snapshot.priceUsd),
      updatedAt: snapshot.timestamp.toISOString(),
      simulated: snapshot.simulated,
    };
    await this.cachePrice(price);
    return price;
  }

  async getPrices(symbols: string[]): Promise<Record<string, TokenPrice | null>> {
    const entries = await Promise.all(symbols.map(async (s) => [s, await this.getPrice(s)] as const));
    return Object.fromEntries(entries);
  }

  async requirePrice(symbol: string): Promise<TokenPrice> {
    const price = await this.getPrice(symbol);
    if (!price) throw AppException.priceUnavailable(symbol);
    return price;
  }

  /** Chart data. Defaults to the last 24h. */
  async getHistory(symbol: string, hours = CHART_WINDOW_HOURS, limit = 288): Promise<PricePoint[]> {
    const token = this.stocks.requireBySymbol(symbol);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const snapshots = await this.prisma.priceSnapshot.findMany({
      where: { tokenId: token.id, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      take: limit,
    });

    return snapshots.map((s) => ({
      timestamp: s.timestamp.toISOString(),
      priceUsd: s.priceUsd,
      priceNgn: s.priceNgn,
    }));
  }

  // ── Feed polling ───────────────────────────────────────────────────────────

  /**
   * Reads every configured feed in one batched call, writes a snapshot per token,
   * and refreshes the cache. Called by the BullMQ repeatable job.
   */
  async pollAllFeeds(): Promise<FeedReading[]> {
    const tokens = this.stocks.stocks().filter((t) => t.chainlinkFeedAddress);
    if (tokens.length === 0) {
      this.logger.debug('no feeds configured, nothing to poll');
      return [];
    }

    if (this.config.priceSimulationEnabled) {
      // Push the walk before reading, so the read reflects this tick.
      await this.advanceSimulatedFeeds(tokens);
    }

    const callData = this.aggregatorIface.encodeFunctionData('latestRoundData');
    const results = await this.multicall.aggregate(
      tokens.map((t) => ({ target: t.chainlinkFeedAddress!, callData, allowFailure: true })),
    );

    const readings: FeedReading[] = [];

    for (const [i, token] of tokens.entries()) {
      const result = results[i];
      if (!result.success || result.returnData === '0x') {
        this.logger.warn(`feed read failed for ${token.symbol} at ${token.chainlinkFeedAddress}`);
        continue;
      }

      try {
        const decoded = this.aggregatorIface.decodeFunctionResult('latestRoundData', result.returnData);
        const roundId = decoded[0] as bigint;
        const answer = decoded[1] as bigint;
        const updatedAtSeconds = decoded[3] as bigint;

        const priceUsd = feedAnswerToUsd(answer, PRICE_FEED_DECIMALS);
        const priceNgn = usdToNgn(priceUsd, this.config.ngnUsdRate);
        const updatedAt = updatedAtSeconds > 0n ? new Date(Number(updatedAtSeconds) * 1000) : new Date();

        readings.push({
          symbol: token.symbol,
          priceUsd,
          priceNgn,
          roundId: roundId.toString(),
          updatedAt,
          simulated: token.isTestnetMock,
        });
      } catch (error) {
        this.logger.warn(`could not decode feed answer for ${token.symbol}: ${(error as Error).message}`);
      }
    }

    await this.persistReadings(tokens, readings);
    return readings;
  }

  private async persistReadings(tokens: TokenRow[], readings: FeedReading[]): Promise<void> {
    if (readings.length === 0) return;
    const bySymbol = new Map(tokens.map((t) => [t.symbol, t]));

    await this.prisma.priceSnapshot.createMany({
      data: readings.map((r) => ({
        tokenId: bySymbol.get(r.symbol)!.id,
        priceUsd: r.priceUsd,
        priceNgn: r.priceNgn,
        ngnUsdRate: String(this.config.ngnUsdRate),
        roundId: r.roundId,
        simulated: r.simulated,
        timestamp: r.updatedAt,
      })),
    });

    await Promise.all(
      readings.map(async (r) => {
        const token = bySymbol.get(r.symbol)!;
        await this.cachePrice({
          symbol: r.symbol,
          priceUsd: r.priceUsd,
          priceNgn: r.priceNgn,
          change24hPct: await this.change24h(token.id, r.priceUsd),
          updatedAt: r.updatedAt.toISOString(),
          simulated: r.simulated,
        });
      }),
    );

    this.logger.debug(`polled ${readings.length} feeds: ${readings.map((r) => `${r.symbol}=$${r.priceUsd}`).join(' ')}`);
  }

  /**
   * Advances each mock aggregator one step. Only runs against MockAggregatorV3
   * (a real Chainlink feed has no `pushAnswer`, and `isTestnetMock` gates it).
   */
  private async advanceSimulatedFeeds(tokens: TokenRow[]): Promise<void> {
    const mocks = tokens.filter((t) => t.isTestnetMock && t.chainlinkFeedAddress);
    if (mocks.length === 0) return;

    for (const token of mocks) {
      try {
        // Serialised with every other faucet-signed send (on-ramp, gas top-ups)
        // so concurrent transactions can't collide on the account's nonce.
        await this.chain.withFaucet(async (faucet) => {
          const contract = new ethers.Contract(token.chainlinkFeedAddress!, MOCK_AGGREGATOR_ABI, faucet);

          // Only the aggregator's updater can push. The deploy script sets that
          // to the faucet account; if someone repointed the env, skip quietly.
          const updater = (await contract.updater()) as string;
          if (ethers.getAddress(updater) !== ethers.getAddress(faucet.address)) {
            this.logger.debug(`${token.symbol} feed updater is ${updater}, not the faucet, skipping simulation`);
            return;
          }

          const [, currentAnswer] = (await contract.latestRoundData()) as [bigint, bigint, bigint, bigint, bigint];
          const reference = findStockReference(token.symbol);
          const seed = reference
            ? BigInt(Math.round(Number(reference.seedPriceUsd) * 10 ** PRICE_FEED_DECIMALS))
            : currentAnswer;

          const next = nextSimulatedPrice(currentAnswer, seed);
          const tx = (await contract.pushAnswer(next)) as ethers.TransactionResponse;
          await tx.wait();
        });
      } catch (error) {
        // A failed simulation tick is cosmetic; the feed keeps its last answer.
        this.logger.debug(`could not advance simulated feed for ${token.symbol}: ${(error as Error).message}`);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async cachePrice(price: TokenPrice): Promise<void> {
    await this.cache.set(
      CACHE_KEY_PREFIX + price.symbol,
      { ...price, cachedAt: new Date().toISOString() } satisfies CachedPrice,
      this.config.priceCacheTtlSeconds,
    );
  }

  private async change24h(tokenId: string, currentUsd: string): Promise<string | null> {
    const since = new Date(Date.now() - CHART_WINDOW_HOURS * 60 * 60 * 1000);
    const oldest = await this.prisma.priceSnapshot.findFirst({
      where: { tokenId, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      select: { priceUsd: true },
    });
    if (!oldest) return null;
    return percentChange(oldest.priceUsd, currentUsd);
  }

  /**
   * Seeds a snapshot per token so the chart isn't empty on first boot.
   *
   * Checks for a *recent* snapshot rather than any snapshot: the chart queries a
   * 24h window, so a database full of last week's points is indistinguishable
   * from an empty one as far as the chart is concerned. Resuming a demo after a
   * day off used to leave the chart blank until the first 30s tick landed.
   */
  async backfillIfEmpty(): Promise<void> {
    const since = new Date(Date.now() - CHART_WINDOW_HOURS * 60 * 60 * 1000);
    const recent = await this.prisma.priceSnapshot.count({ where: { timestamp: { gte: since } } });
    if (recent > 0) return;
    this.logger.log(`no price history in the last ${CHART_WINDOW_HOURS}h, polling feeds once to seed the chart`);
    await this.pollAllFeeds().catch((error) => {
      this.logger.warn(`initial feed poll failed: ${(error as Error).message}`);
    });
  }

  get isSimulated(): boolean {
    return this.config.priceSimulationEnabled && this.stocks.stocks().some((t) => t.isTestnetMock);
  }

  /** cNGN is the unit of account: 1 cNGN = ₦1 by construction. */
  cashPrice(): TokenPrice {
    const rate = this.config.ngnUsdRate;
    return {
      symbol: this.stocks.cash().symbol,
      priceUsd: (1 / rate).toFixed(8),
      priceNgn: '1',
      change24hPct: '0',
      updatedAt: new Date().toISOString(),
      simulated: true,
    };
  }

  isCash(token: TokenRow): boolean {
    return token.kind === TokenKind.STABLECOIN;
  }
}

function stripCacheMeta(cached: CachedPrice): TokenPrice {
  const { cachedAt: _cachedAt, ...price } = cached;
  return price;
}
