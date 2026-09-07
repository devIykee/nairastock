import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CNGN_REFERENCE, STOCK_REFERENCES, getChainMeta } from '@nairastock/shared';
import type { Env } from './env.schema';

export interface ConfiguredToken {
  symbol: string;
  address: string;
  feedAddress: string | null;
}

/**
 * Typed accessor over validated env, plus the derived chain facts every module
 * needs (explorer base URL, whether we're on a mock deployment, which token
 * addresses actually got deployed).
 *
 * Deliberately reads config once at construction: the values are immutable for
 * the process lifetime, and a typed getter beats `configService.get<string>()`
 * scattered across nine modules.
 */
@Injectable()
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name);

  readonly nodeEnv: Env['NODE_ENV'];
  readonly apiPort: number;
  readonly frontendOrigins: string[];

  readonly redisUrl: string;

  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
  readonly authNonceTtlSeconds: number;
  readonly walletEncryptionKey: string;

  readonly chainId: number;
  readonly rpcUrl: string;
  readonly explorerBaseUrl: string;
  readonly networkLabel: string;
  readonly isTestnet: boolean;
  readonly multicallAddress: string | null;
  readonly routerAddress: string | null;
  readonly factoryAddress: string | null;
  readonly faucetPrivateKey: string;

  readonly cngnAddress: string | null;

  readonly ngnUsdRate: number;
  readonly pricePollIntervalMs: number;
  readonly priceCacheTtlSeconds: number;
  readonly priceSimulationEnabled: boolean;

  readonly defaultSlippageBps: number;
  readonly maxSlippageBps: number;
  readonly swapDeadlineSeconds: number;
  readonly swapConfirmations: number;

  readonly onrampMinNgn: number;
  readonly onrampMaxNgn: number;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.nodeEnv = this.config.get('NODE_ENV', { infer: true });
    this.apiPort = this.config.get('API_PORT', { infer: true });
    this.frontendOrigins = this.config
      .get('FRONTEND_ORIGINS', { infer: true })
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    this.redisUrl = this.config.get('REDIS_URL', { infer: true });

    this.jwtSecret = this.config.get('JWT_SECRET', { infer: true });
    this.jwtExpiresIn = this.config.get('JWT_EXPIRES_IN', { infer: true });
    this.authNonceTtlSeconds = this.config.get('AUTH_NONCE_TTL_SECONDS', { infer: true });
    this.walletEncryptionKey = this.config.get('WALLET_ENCRYPTION_KEY', { infer: true });

    this.chainId = this.config.get('CHAIN_ID', { infer: true });
    this.rpcUrl = this.config.get('RPC_URL', { infer: true });

    const chainMeta = getChainMeta(this.chainId, this.config.get('EXPLORER_BASE_URL', { infer: true }));
    this.explorerBaseUrl = chainMeta.explorerBaseUrl;
    this.networkLabel = chainMeta.label;
    this.isTestnet = chainMeta.testnet;

    this.multicallAddress = emptyToNull(this.config.get('MULTICALL3_ADDRESS', { infer: true }));
    this.routerAddress = emptyToNull(this.config.get('DEX_ROUTER_ADDRESS', { infer: true }));
    this.factoryAddress = emptyToNull(this.config.get('DEX_FACTORY_ADDRESS', { infer: true }));
    this.faucetPrivateKey = this.config.get('FAUCET_PRIVATE_KEY', { infer: true });

    this.cngnAddress = emptyToNull(this.config.get('CNGN_ADDRESS', { infer: true }));

    this.ngnUsdRate = this.config.get('NGN_USD_RATE', { infer: true });
    this.pricePollIntervalMs = this.config.get('PRICE_POLL_INTERVAL_MS', { infer: true });
    this.priceCacheTtlSeconds = this.config.get('PRICE_CACHE_TTL_SECONDS', { infer: true });
    this.priceSimulationEnabled = this.config.get('PRICE_SIMULATION_ENABLED', { infer: true });

    this.defaultSlippageBps = this.config.get('DEFAULT_SLIPPAGE_BPS', { infer: true });
    this.maxSlippageBps = this.config.get('MAX_SLIPPAGE_BPS', { infer: true });
    this.swapDeadlineSeconds = this.config.get('SWAP_DEADLINE_SECONDS', { infer: true });
    this.swapConfirmations = this.config.get('SWAP_CONFIRMATIONS', { infer: true });

    this.onrampMinNgn = this.config.get('ONRAMP_MIN_NGN', { infer: true });
    this.onrampMaxNgn = this.config.get('ONRAMP_MAX_NGN', { infer: true });
  }

  /** The four stock tokens, restricted to those whose address is configured. */
  get configuredStocks(): ConfiguredToken[] {
    return STOCK_REFERENCES.map((ref) => ({
      symbol: ref.symbol,
      address: this.rawEnv(ref.addressEnvKey),
      feedAddress: this.rawEnv(ref.feedEnvKey),
    })).filter((t): t is ConfiguredToken => t.address !== null);
  }

  /**
   * Escape hatch for env keys the schema knows but code addresses dynamically,    * the per-token address/feed vars, which are looked up by name from the shared
   * reference table rather than written out one by one.
   */
  private rawEnv(key: string): string | null {
    const untyped = this.config as unknown as { get(key: string): string | undefined };
    return emptyToNull(untyped.get(key));
  }

  get cngnSymbol(): string {
    return CNGN_REFERENCE.symbol;
  }

  /** True once contracts are deployed and the app can actually trade. */
  get isChainConfigured(): boolean {
    return Boolean(this.routerAddress && this.cngnAddress && this.configuredStocks.length > 0);
  }

  onModuleInit(): void {
    this.logger.log(`env=${this.nodeEnv} chain=${this.chainId} (${this.networkLabel}) rpc=${this.rpcUrl}`);

    if (!this.isChainConfigured) {
      // A warning rather than a hard failure: the API should still boot so
      // /health and the docs are reachable while someone runs the deploy step.
      this.logger.warn(
        'Chain addresses are incomplete (router/cNGN/stock tokens). Trading endpoints will return 503. ' +
          'Run `pnpm chain:up` then `pnpm chain:deploy` to populate .env.',
      );
    }
    if (!this.multicallAddress) {
      this.logger.warn('MULTICALL3_ADDRESS unset, balance reads will fall back to sequential eth_call.');
    }
    if (this.isTestnet && !this.explorerBaseUrl) {
      this.logger.warn(
        `Chain ${this.chainId} has no block explorer, so "View on BaseScan" links are hidden. ` +
          'Point RPC_URL/CHAIN_ID at Base Sepolia (84532) for verifiable links in a demo recording.',
      );
    }
    if (this.nodeEnv === 'production') {
      if (this.jwtSecret.includes('dev-only-change-me')) {
        throw new Error('JWT_SECRET is still the .env.example placeholder, refusing to boot in production.');
      }
      if (this.walletEncryptionKey.includes('dev-only-change-me')) {
        throw new Error('WALLET_ENCRYPTION_KEY is still the .env.example placeholder, refusing to boot in production.');
      }
    }
  }
}

function emptyToNull(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
