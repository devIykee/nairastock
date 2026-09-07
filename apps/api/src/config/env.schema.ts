import { z } from 'zod';

/**
 * Boot-time env validation.
 *
 * The rule from the quality bar: every var either has a default, or the process
 * exits with a message naming the variable and what it's for. Nothing should
 * surface as a cryptic Prisma or ethers error three layers down.
 */

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed 20-byte address');

const optionalAddress = z.union([hexAddress, z.literal('')]).optional();

const numeric = (name: string) =>
  z.coerce.number({ invalid_type_error: `${name} must be a number` });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: numeric('API_PORT').int().positive().default(4000),
  FRONTEND_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required, start Postgres with `pnpm infra:up` and copy .env.example')
    .refine((v) => v.startsWith('postgres'), 'DATABASE_URL must be a postgresql:// connection string'),

  REDIS_URL: z.string().min(1).default('redis://localhost:6380'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters, generate one with `openssl rand -hex 32`'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  AUTH_NONCE_TTL_SECONDS: numeric('AUTH_NONCE_TTL_SECONDS').int().positive().default(300),

  WALLET_ENCRYPTION_KEY: z
    .string()
    .min(32, 'WALLET_ENCRYPTION_KEY must be at least 32 characters, generate one with `openssl rand -hex 32`'),

  CHAIN_ID: numeric('CHAIN_ID').int().positive().default(31337),
  RPC_URL: z.string().url('RPC_URL must be a URL, e.g. http://127.0.0.1:8545').default('http://127.0.0.1:8545'),
  EXPLORER_BASE_URL: z.string().default(''),
  MULTICALL3_ADDRESS: optionalAddress,
  DEX_ROUTER_ADDRESS: optionalAddress,
  DEX_FACTORY_ADDRESS: optionalAddress,

  FAUCET_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'FAUCET_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key'),

  CNGN_ADDRESS: optionalAddress,
  AAPLC_ADDRESS: optionalAddress,
  NVDAC_ADDRESS: optionalAddress,
  METAC_ADDRESS: optionalAddress,
  GOOGLC_ADDRESS: optionalAddress,
  AAPLC_FEED_ADDRESS: optionalAddress,
  NVDAC_FEED_ADDRESS: optionalAddress,
  METAC_FEED_ADDRESS: optionalAddress,
  GOOGLC_FEED_ADDRESS: optionalAddress,

  NGN_USD_RATE: numeric('NGN_USD_RATE').positive().default(1600),
  PRICE_POLL_INTERVAL_MS: numeric('PRICE_POLL_INTERVAL_MS').int().min(1000).default(30_000),
  PRICE_CACHE_TTL_SECONDS: numeric('PRICE_CACHE_TTL_SECONDS').int().positive().default(120),
  PRICE_SIMULATION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  DEFAULT_SLIPPAGE_BPS: numeric('DEFAULT_SLIPPAGE_BPS').int().min(0).max(10_000).default(100),
  MAX_SLIPPAGE_BPS: numeric('MAX_SLIPPAGE_BPS').int().min(0).max(10_000).default(5000),
  SWAP_DEADLINE_SECONDS: numeric('SWAP_DEADLINE_SECONDS').int().positive().default(600),
  SWAP_CONFIRMATIONS: numeric('SWAP_CONFIRMATIONS').int().min(1).default(1),

  ONRAMP_MIN_NGN: numeric('ONRAMP_MIN_NGN').positive().default(1000),
  ONRAMP_MAX_NGN: numeric('ONRAMP_MAX_NGN').positive().default(50_000_000),
});

export type Env = z.infer<typeof envSchema>;

/** Called by ConfigModule.forRoot({ validate }). Throws a readable multi-line error. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  throw new Error(
    [
      'Invalid environment configuration:',
      ...lines,
      '',
      'Fix your .env (start from .env.example, or run `pnpm setup`).',
    ].join('\n'),
  );
}
