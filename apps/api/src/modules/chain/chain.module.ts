import { Global, Module } from '@nestjs/common';
import { ChainService } from './chain.service';
import { Erc20Service } from './erc20.service';
import { MulticallService } from './multicall.service';

/**
 * Chain access layer, global because wallet/swap/pricing/portfolio/onramp all
 * need it and a single provider instance per process is the point.
 */
@Global()
@Module({
  providers: [ChainService, MulticallService, Erc20Service],
  exports: [ChainService, MulticallService, Erc20Service],
})
export class ChainModule {}
