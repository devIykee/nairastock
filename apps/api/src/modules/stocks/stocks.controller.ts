import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ChainInfo, PricePoint, TokenWithPrice } from '@nairastock/shared';
import { AppConfigService } from '../../config/app-config.service';
import { HistoryQueryDto } from '../../common/dto';
import { PricingService } from '../pricing/pricing.service';
import { StocksService } from './stocks.service';

@ApiTags('stocks')
@Controller()
export class StocksController {
  constructor(
    private readonly stocks: StocksService,
    private readonly pricing: PricingService,
    private readonly config: AppConfigService,
  ) {}

  @Get('stocks')
  @ApiOperation({
    summary: 'Tradeable tokenized stocks with live prices',
    description:
      'Prices come from the Redis cache written by the pricing job every PRICE_POLL_INTERVAL_MS, so this ' +
      'endpoint makes no chain call. `price.simulated` marks a quote sourced from the testnet mock ' +
      'aggregator rather than a live Chainlink feed.',
  })
  async list(): Promise<TokenWithPrice[]> {
    const tokens = this.stocks.stocks();
    const prices = await this.pricing.getPrices(tokens.map((t) => t.symbol));
    return tokens.map((token) => ({
      ...this.stocks.toDto(token),
      price: prices[token.symbol] ?? null,
    }));
  }

  @Get('stocks/:symbol')
  @ApiOperation({ summary: 'One stock with its price and company blurb' })
  async detail(@Param('symbol') symbol: string): Promise<TokenWithPrice & { blurb: string | null }> {
    const token = this.stocks.requireBySymbol(symbol);
    const price = await this.pricing.getPrice(token.symbol);
    return { ...this.stocks.toDto(token), price, blurb: this.stocks.blurbFor(token.symbol) };
  }

  @Get('stocks/:symbol/history')
  @ApiOperation({
    summary: 'Price snapshots for the chart',
    description: 'Defaults to the last 24 hours of snapshots written by the pricing job.',
  })
  async history(@Param('symbol') symbol: string, @Query() query: HistoryQueryDto): Promise<PricePoint[]> {
    this.stocks.requireBySymbol(symbol);
    return this.pricing.getHistory(symbol, query.hours ?? 24);
  }

  @Get('chain')
  @ApiOperation({
    summary: 'Chain + deployment metadata',
    description: 'What the frontend needs to build explorer links and render the network badge honestly.',
  })
  chain(): ChainInfo {
    return {
      chainId: this.config.chainId,
      networkLabel: this.config.networkLabel,
      rpcUrl: this.config.rpcUrl,
      explorerBaseUrl: this.config.explorerBaseUrl,
      routerAddress: this.config.routerAddress ?? '',
      simulatedPricing: this.pricing.isSimulated,
      testnet: this.config.isTestnet,
    };
  }
}
