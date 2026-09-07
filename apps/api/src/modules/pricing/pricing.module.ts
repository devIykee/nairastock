import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { PricingService } from './pricing.service';
import { PricingProcessor, PRICE_QUEUE } from './pricing.processor';

/**
 * BullMQ is configured here rather than globally: pricing is the only queue
 * consumer, and ioredis connections are worth keeping countable.
 *
 * Global for the same reason as StocksModule, stocks, portfolio, and swap all
 * read prices, and PricingService itself needs StocksService. Marking both
 * global keeps the module graph free of the cycle that mutual imports would
 * create, while the provider graph stays acyclic (stocks → pricing).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: { url: config.redisUrl, maxRetriesPerRequest: null },
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
      }),
    }),
    BullModule.registerQueue({ name: PRICE_QUEUE }),
  ],
  providers: [PricingService, PricingProcessor],
  exports: [PricingService],
})
export class PricingModule {}
