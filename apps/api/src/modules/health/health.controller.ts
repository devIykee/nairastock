import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { ChainService } from '../chain/chain.service';
import { StocksService } from '../stocks/stocks.service';

interface HealthReport {
  status: 'ok' | 'degraded';
  checks: {
    database: { ok: boolean; detail?: string };
    redis: { ok: boolean; detail?: string };
    chain: { ok: boolean; blockNumber?: number; detail?: string };
    contracts: { ok: boolean; detail?: string };
  };
  chainId: number;
  networkLabel: string;
  version: string;
}

/**
 * Boot diagnostics. Deliberately reports per-dependency rather than a single
 * boolean, because "the demo isn't working" almost always resolves to one of
 * these four lines, and this endpoint answers which.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly chain: ChainService,
    private readonly stocks: StocksService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Dependency health' })
  async check(): Promise<HealthReport> {
    const [database, redis, chain] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkChain(),
    ]);

    const tokenCount = this.stocks.all().length;
    const contracts = this.config.isChainConfigured
      ? { ok: tokenCount > 0, detail: `${tokenCount} tokens loaded` }
      : { ok: false, detail: 'contract addresses missing, run `pnpm chain:deploy && pnpm db:seed`' };

    const allOk = database.ok && redis.ok && chain.ok && contracts.ok;

    return {
      status: allOk ? 'ok' : 'degraded',
      checks: { database, redis, chain, contracts },
      chainId: this.config.chainId,
      networkLabel: this.config.networkLabel,
      version: '0.1.0',
    };
  }

  private async checkDatabase(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (error) {
      return { ok: false, detail: `postgres unreachable, try \`pnpm infra:up\` (${(error as Error).message})` };
    }
  }

  private async checkRedis(): Promise<{ ok: boolean; detail?: string }> {
    const ok = await this.cache.ping();
    return ok ? { ok } : { ok, detail: 'redis unreachable, prices fall back to the last DB snapshot' };
  }

  private async checkChain(): Promise<{ ok: boolean; blockNumber?: number; detail?: string }> {
    try {
      return { ok: true, blockNumber: await this.chain.getBlockNumber() };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }
}
