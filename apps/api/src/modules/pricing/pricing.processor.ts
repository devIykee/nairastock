import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, type Job } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { PricingService } from './pricing.service';

export const PRICE_QUEUE = 'pricing';
const POLL_JOB = 'poll-feeds';

/**
 * BullMQ repeatable job that keeps prices fresh.
 *
 * Runs on an interval rather than per-request so `GET /stocks` is a cache read:
 * with four feeds and a 30s cadence the RPC load is fixed regardless of traffic,
 * and a demo page refresh never waits on a chain round-trip.
 */
@Processor(PRICE_QUEUE, { concurrency: 1 })
export class PricingProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PricingProcessor.name);

  constructor(
    @InjectQueue(PRICE_QUEUE) private readonly queue: Queue,
    private readonly pricing: PricingService,
    private readonly config: AppConfigService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      // Remove any scheduler left from a previous run with a different interval,
      // otherwise changing PRICE_POLL_INTERVAL_MS leaves two schedulers running.
      const existing = await this.queue.getJobSchedulers();
      await Promise.all(existing.map((s) => this.queue.removeJobScheduler(s.key)));

      await this.queue.upsertJobScheduler(
        POLL_JOB,
        { every: this.config.pricePollIntervalMs, immediately: true },
        { name: POLL_JOB, opts: { removeOnComplete: 50, removeOnFail: 50 } },
      );

      this.logger.log(`price polling every ${this.config.pricePollIntervalMs / 1000}s`);
    } catch (error) {
      // Redis down shouldn't stop the API from booting; prices then come from
      // the last snapshot in Postgres.
      this.logger.warn(`could not schedule price polling: ${(error as Error).message}`);
    }
  }

  async process(job: Job): Promise<{ polled: number }> {
    try {
      const readings = await this.pricing.pollAllFeeds();
      return { polled: readings.length };
    } catch (error) {
      // Logged and swallowed: a transient RPC failure must not become an
      // unhandled rejection, and the next tick is 30s away.
      this.logger.warn(`price poll (job ${job.id}) failed: ${(error as Error).message}`);
      return { polled: 0 };
    }
  }
}
