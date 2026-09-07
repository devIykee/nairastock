import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './modules/cache/cache.module';
import { ChainModule } from './modules/chain/chain.module';
import { AuthModule } from './modules/auth/auth.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { StocksModule } from './modules/stocks/stocks.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { SwapModule } from './modules/swap/swap.module';
import { OnrampModule } from './modules/onramp/onramp.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { HealthModule } from './modules/health/health.module';
import { PricingService } from './modules/pricing/pricing.service';

@Module({
  imports: [
    // Infrastructure (all global): config → db → cache → chain
    AppConfigModule,
    PrismaModule,
    CacheModule,
    ChainModule,

    // Domain
    PricingModule,
    StocksModule,
    AuthModule,
    WalletModule,
    PortfolioModule,
    SwapModule,
    OnrampModule,
    HealthModule,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly pricing: PricingService) {}

  /**
   * Seeds one price snapshot per token if the table is empty, so the chart on the
   * stock detail screen has something to draw before the first 30s tick lands.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.pricing.backfillIfEmpty().catch(() => undefined);
  }
}
