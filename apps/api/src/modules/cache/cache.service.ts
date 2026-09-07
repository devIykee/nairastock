import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Thin Redis wrapper for the price cache and auth nonces.
 *
 * Degrades to a no-op on connection failure rather than taking the API down: a
 * cache miss means one extra chain read, which is slower but correct. BullMQ
 * holds its own connection (it needs blocking commands), so this client is only
 * for direct get/set.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis;
  private healthy = true;

  constructor(private readonly config: AppConfigService) {
    this.client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
    });

    this.client.on('error', (error) => {
      if (this.healthy) {
        this.healthy = false;
        this.logger.warn(`Redis unavailable (${error.message}), serving without cache. Try \`pnpm infra:up\`.`);
      }
    });
    this.client.on('ready', () => {
      if (!this.healthy) this.logger.log('Redis reconnected');
      this.healthy = true;
    });
  }

  get isHealthy(): boolean {
    return this.healthy;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.healthy) return null;
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.debug(`cache get ${key} failed: ${(error as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.healthy) return;
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, payload, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, payload);
      }
    } catch (error) {
      this.logger.debug(`cache set ${key} failed: ${(error as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.healthy) return;
    try {
      await this.client.del(key);
    } catch {
      /* cache deletion is best-effort */
    }
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
