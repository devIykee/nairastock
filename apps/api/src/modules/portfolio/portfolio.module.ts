import { Global, Module } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { PortfolioController } from './portfolio.controller';

/**
 * Global: WalletController also serves balances, and duplicating the valuation
 * logic there would be worse than sharing one service.
 */
@Global()
@Module({
  providers: [PortfolioService],
  controllers: [PortfolioController],
  exports: [PortfolioService],
})
export class PortfolioModule {}
