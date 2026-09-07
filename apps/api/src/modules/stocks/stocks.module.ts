import { Global, Module } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { StocksController } from './stocks.controller';

/**
 * Global so PricingService can depend on StocksService without PricingModule
 * importing this one, mutual imports would be a module cycle. PricingModule is
 * global too, so no import is needed in either direction; the provider graph
 * stays one-directional (stocks → pricing).
 */
@Global()
@Module({
  providers: [StocksService],
  controllers: [StocksController],
  exports: [StocksService],
})
export class StocksModule {}
