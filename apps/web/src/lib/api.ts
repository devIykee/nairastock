/**
 * API client.
 *
 * One place that knows about the bearer token and the error envelope, so every
 * screen can `catch (error) { if (error instanceof ApiError) … }` and branch on
 * `error.code` rather than string-matching a message.
 */
import type {
  ApiErrorBody,
  ApiErrorCode,
  AuthNonce,
  AuthSession,
  ChainInfo,
  CreatedWallet,
  OnrampResult,
  Portfolio,
  PricePoint,
  SwapQuote,
  SwapResult,
  TokenBalance,
  TokenWithPrice,
  TransactionRecord,
} from '@nairastock/shared';
import { config, STORAGE_KEYS } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: ApiErrorCode | string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True for failures the user can act on by changing an input. */
  get isActionable(): boolean {
    return (
      this.code === 'INSUFFICIENT_BALANCE' ||
      this.code === 'SLIPPAGE_EXCEEDED' ||
      this.code === 'INSUFFICIENT_LIQUIDITY' ||
      this.code === 'QUOTE_EXPIRED'
    );
  }
}

let inMemoryToken: string | null = null;

export const auth = {
  get token(): string | null {
    if (inMemoryToken) return inMemoryToken;
    inMemoryToken = localStorage.getItem(STORAGE_KEYS.token);
    return inMemoryToken;
  },
  set(session: AuthSession): void {
    inMemoryToken = session.accessToken;
    localStorage.setItem(STORAGE_KEYS.token, session.accessToken);
    localStorage.setItem(STORAGE_KEYS.address, session.user.walletAddress);
    localStorage.setItem(STORAGE_KEYS.custodyMode, session.user.custodyMode);
  },
  clear(): void {
    inMemoryToken = null;
    for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key);
  },
  get address(): string | null {
    return localStorage.getItem(STORAGE_KEYS.address);
  },
  get isAuthenticated(): boolean {
    return Boolean(this.token);
  },
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(config.apiBaseUrl + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // A network-level failure is almost always "the API isn't running" during a
    // demo, so say that rather than surfacing "Failed to fetch".
    throw new ApiError(0, `Cannot reach the API at ${config.apiBaseUrl}. Is it running (\`pnpm dev\`)?`, 'NETWORK');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const error = (payload ?? {}) as ApiErrorBody;
    if (response.status === 401 && auth.token) {
      // Expired or invalidated session, drop it so the app routes to onboarding
      // instead of retrying with a dead token.
      auth.clear();
    }
    throw new ApiError(response.status, error.message ?? `Request failed (${response.status})`, error.code, error.details);
  }

  return payload as T;
}

export const api = {
  chain: () => request<ChainInfo>('GET', '/chain'),

  health: () =>
    request<{ status: string; checks: Record<string, { ok: boolean; detail?: string }> }>('GET', '/health'),

  wallet: {
    create: () => request<CreatedWallet & { session: AuthSession }>('POST', '/wallet/create', {}),
    import: (mnemonic: string) =>
      request<Omit<CreatedWallet, 'mnemonic'> & { session: AuthSession }>('POST', '/wallet/import', { mnemonic }),
    balances: (address: string) => request<TokenBalance[]>('GET', `/wallet/${address}/balances`),
    markBackedUp: () => request<void>('POST', '/wallet/backed-up'),
    topUpGas: () => request<void>('POST', '/wallet/gas'),
  },

  auth: {
    nonce: (address: string) => request<AuthNonce>('GET', `/auth/nonce/${address}`),
    verify: (params: { address: string; nonce: string; signature: string }) =>
      request<AuthSession>('POST', '/auth/verify', params),
    me: () =>
      request<{ id: string; walletAddress: string; custodyMode: string; mnemonicBackedUp: boolean }>('GET', '/auth/me'),
  },

  stocks: {
    list: () => request<TokenWithPrice[]>('GET', '/stocks'),
    detail: (symbol: string) => request<TokenWithPrice & { blurb: string | null }>('GET', `/stocks/${symbol}`),
    history: (symbol: string, hours = 24) =>
      request<PricePoint[]>('GET', `/stocks/${symbol}/history?hours=${hours}`),
  },

  swap: {
    quote: (params: { tokenIn: string; tokenOut: string; amountIn: string; slippageBps?: number }) =>
      request<SwapQuote>('POST', '/swap/quote', params),
    execute: (params: { tokenIn: string; tokenOut: string; amountIn: string; slippageBps?: number }) =>
      request<SwapResult>('POST', '/swap/execute', params),
  },

  onramp: {
    deposit: (ngnAmount: string) => request<OnrampResult>('POST', '/onramp/deposit', { ngnAmount }),
    withdraw: (ngnAmount: string) => request<OnrampResult>('POST', '/onramp/withdraw', { ngnAmount }),
  },

  portfolio: {
    get: () => request<Portfolio>('GET', '/portfolio'),
    transactions: (limit = 50) => request<TransactionRecord[]>('GET', `/portfolio/transactions?limit=${limit}`),
  },
};
