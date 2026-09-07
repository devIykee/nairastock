/** Domain types shared by the API and the web app. */

import type { TokenAmount } from './amounts';

export type TokenKind = 'STABLECOIN' | 'STOCK';

export interface Token {
  symbol: string;
  name: string;
  kind: TokenKind;
  address: string;
  decimals: number;
  logoUrl: string | null;
  /** Chainlink-compatible aggregator; null for the cNGN base asset. */
  feedAddress: string | null;
  /** Underlying equity ticker, e.g. AAPL for AAPLc. Null for cNGN. */
  underlyingSymbol: string | null;
  explorerUrl: string;
}

export interface TokenPrice {
  symbol: string;
  priceUsd: string;
  priceNgn: string;
  /** Percent change over the last 24h of snapshots, e.g. "-1.42". */
  change24hPct: string | null;
  /** Chainlink round updatedAt, or the mock aggregator's last nudge. */
  updatedAt: string;
  /** True when the quote came from the simulated testnet aggregator. */
  simulated: boolean;
}

export interface TokenWithPrice extends Token {
  price: TokenPrice | null;
}

export interface TokenBalance {
  token: Token;
  amount: TokenAmount;
  valueUsd: string;
  valueNgn: string;
  price: TokenPrice | null;
  /** Direct link to this token's balance for this holder on the explorer. */
  explorerUrl: string;
}

export interface PricePoint {
  timestamp: string;
  priceUsd: string;
  priceNgn: string;
}

export type TransactionType = 'DEPOSIT' | 'BUY' | 'SELL' | 'WITHDRAW';
export type TransactionStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export interface TransactionRecord {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  tokenInSymbol: string | null;
  tokenOutSymbol: string | null;
  amountIn: string | null;
  amountOut: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface Portfolio {
  walletAddress: string;
  explorerUrl: string;
  chainId: number;
  networkLabel: string;
  cash: TokenBalance;
  holdings: TokenBalance[];
  totalValueUsd: string;
  totalValueNgn: string;
  investedValueUsd: string;
  investedValueNgn: string;
  transactions: TransactionRecord[];
  /** Native gas balance, surfaced so a stuck demo is diagnosable in the UI. */
  gasBalance: TokenAmount;
  syncedAt: string;
}

export type SwapSide = 'BUY' | 'SELL';

export interface SwapQuote {
  side: SwapSide;
  tokenIn: Token;
  tokenOut: Token;
  amountIn: TokenAmount;
  amountOut: TokenAmount;
  minAmountOut: TokenAmount;
  slippageBps: number;
  /** Percent, e.g. "0.31", how far the trade moves the pool mid-price. */
  priceImpactPct: string;
  /** amountOut per 1 amountIn, as a decimal string. */
  executionPrice: string;
  /** Pool mid-price before the trade, same units as executionPrice. */
  spotPrice: string;
  /** LP fee taken by the router, in bps. */
  feeBps: number;
  route: string[];
  expiresAt: string;
}

export interface SwapResult {
  transactionId: string;
  status: TransactionStatus;
  txHash: string;
  explorerUrl: string;
  amountIn: TokenAmount;
  amountOut: TokenAmount;
  side: SwapSide;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  gasUsed: string | null;
  blockNumber: number | null;
}

export interface CreatedWallet {
  address: string;
  /** Returned exactly once, at creation. Never persisted in plaintext. */
  mnemonic: string;
  derivationPath: string;
  chainId: number;
  explorerUrl: string;
}

export interface AuthNonce {
  address: string;
  nonce: string;
  /** The exact string the client must sign. */
  message: string;
  expiresAt: string;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: string;
  user: {
    id: string;
    walletAddress: string;
    custodyMode: CustodyMode;
    createdAt: string;
  };
}

/**
 * DEMO_CUSTODIAL: the API holds an AES-256-GCM-encrypted mnemonic and can sign
 * for the user, a hackathon shortcut so the demo needs no browser extension.
 * SELF_SIGNED: the key never left the client; the API only ever reads chain state.
 */
export type CustodyMode = 'DEMO_CUSTODIAL' | 'SELF_SIGNED';

export interface OnrampResult {
  transactionId: string;
  status: TransactionStatus;
  ngnAmount: string;
  cngnAmount: TokenAmount;
  rate: string;
  txHash: string | null;
  explorerUrl: string | null;
}

export interface ChainInfo {
  chainId: number;
  networkLabel: string;
  rpcUrl: string;
  explorerBaseUrl: string;
  routerAddress: string;
  simulatedPricing: boolean;
  /** True when pointed at anvil/Sepolia rather than Base mainnet. */
  testnet: boolean;
}

/** Shape of every non-2xx API body, so the web client can render one thing. */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  error?: string;
  /** Machine-readable discriminator, e.g. INSUFFICIENT_BALANCE. */
  code?: string;
  details?: Record<string, unknown>;
}

export const API_ERROR_CODES = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_GAS: 'INSUFFICIENT_GAS',
  SLIPPAGE_EXCEEDED: 'SLIPPAGE_EXCEEDED',
  INSUFFICIENT_LIQUIDITY: 'INSUFFICIENT_LIQUIDITY',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  UNKNOWN_TOKEN: 'UNKNOWN_TOKEN',
  CHAIN_UNAVAILABLE: 'CHAIN_UNAVAILABLE',
  PRICE_UNAVAILABLE: 'PRICE_UNAVAILABLE',
  SIGNING_UNAVAILABLE: 'SIGNING_UNAVAILABLE',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  NONCE_EXPIRED: 'NONCE_EXPIRED',
  TX_REVERTED: 'TX_REVERTED',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
