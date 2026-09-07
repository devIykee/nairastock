/**
 * Static reference data for the tradeable universe.
 *
 * Contract addresses are NOT here, those are env-driven, because they differ
 * per chain (real B20 tokens on Base mainnet vs. mock ERC20s on anvil/Sepolia).
 * This file holds only the facts that don't change with the deployment target:
 * the ticker mapping, decimals, and the copy shown on the stock detail screen.
 */

export interface StockReference {
  symbol: string;
  name: string;
  underlyingSymbol: string;
  decimals: number;
  logoUrl: string;
  /** Shown on the stock detail page. Static copy is fine for the demo. */
  blurb: string;
  /** Seed price used by the simulated aggregator when no real feed exists. */
  seedPriceUsd: string;
  /** Env var carrying this token's contract address. */
  addressEnvKey: string;
  /** Env var carrying this token's Chainlink-compatible aggregator. */
  feedEnvKey: string;
  /**
   * Coinbase B20 tokenized-stock address on Base MAINNET, for reference only.
   * Left null because the B20 series is mainnet-only and not deployed to
   * Sepolia; the demo runs against mock ERC20s with identical decimals so the
   * swap path is byte-for-byte the same code on mainnet.
   */
  mainnetReferenceAddress: string | null;
}

export const CNGN_SYMBOL = 'cNGN';
export const CNGN_DECIMALS = 18;

/**
 * cNGN is the naira-pegged stablecoin issued by the Africa Stablecoin
 * Consortium. Mainnet cNGN on Base is a real contract; the demo deploys a mock
 * with the same 18 decimals so balances and swap math carry over unchanged.
 */
export const CNGN_REFERENCE = {
  symbol: CNGN_SYMBOL,
  name: 'Compliant Naira',
  decimals: CNGN_DECIMALS,
  logoUrl: '/tokens/cngn.svg',
  addressEnvKey: 'CNGN_ADDRESS',
} as const;

export const STOCK_REFERENCES: StockReference[] = [
  {
    symbol: 'AAPLc',
    name: 'Apple Inc. (tokenized)',
    underlyingSymbol: 'AAPL',
    decimals: 18,
    logoUrl: '/tokens/aaplc.svg',
    blurb:
      'Apple designs and sells the iPhone, Mac, iPad and Watch, and runs one of the largest services businesses in technology. AAPLc is a tokenized share of AAPL that settles on Base, you hold the token in your own wallet, and it trades whenever a pool has liquidity, not only 2:30pm–9pm WAT.',
    seedPriceUsd: '231.40',
    addressEnvKey: 'AAPLC_ADDRESS',
    feedEnvKey: 'AAPLC_FEED_ADDRESS',
    mainnetReferenceAddress: null,
  },
  {
    symbol: 'NVDAc',
    name: 'NVIDIA Corporation (tokenized)',
    underlyingSymbol: 'NVDA',
    decimals: 18,
    logoUrl: '/tokens/nvdac.svg',
    blurb:
      'NVIDIA builds the GPUs and networking that train and serve most of the world’s AI models. NVDAc gives naira holders exposure to NVDA without a domiciliary account, an FX form, or a custodian holding the position on their behalf.',
    seedPriceUsd: '178.60',
    addressEnvKey: 'NVDAC_ADDRESS',
    feedEnvKey: 'NVDAC_FEED_ADDRESS',
    mainnetReferenceAddress: null,
  },
  {
    symbol: 'METAc',
    name: 'Meta Platforms, Inc. (tokenized)',
    underlyingSymbol: 'META',
    decimals: 18,
    logoUrl: '/tokens/metac.svg',
    blurb:
      'Meta operates Facebook, Instagram and WhatsApp, the apps most Nigerians already use daily, and is spending heavily on AI and Reality Labs. METAc turns that familiarity into a position you actually custody.',
    seedPriceUsd: '612.75',
    addressEnvKey: 'METAC_ADDRESS',
    feedEnvKey: 'METAC_FEED_ADDRESS',
    mainnetReferenceAddress: null,
  },
  {
    symbol: 'GOOGLc',
    name: 'Alphabet Inc. Class A (tokenized)',
    underlyingSymbol: 'GOOGL',
    decimals: 18,
    logoUrl: '/tokens/googlc.svg',
    blurb:
      'Alphabet runs Google Search, YouTube, Android and Google Cloud, plus the Gemini model family. GOOGLc is a tokenized GOOGL share: transferable, composable with onchain lending, and verifiable on BaseScan at any hour.',
    seedPriceUsd: '196.30',
    addressEnvKey: 'GOOGLC_ADDRESS',
    feedEnvKey: 'GOOGLC_FEED_ADDRESS',
    mainnetReferenceAddress: null,
  },
];

export const STOCK_SYMBOLS = STOCK_REFERENCES.map((s) => s.symbol);

export function findStockReference(symbol: string): StockReference | undefined {
  const needle = symbol.trim().toLowerCase();
  return STOCK_REFERENCES.find((s) => s.symbol.toLowerCase() === needle);
}

/** Chainlink feeds report USD prices with 8 decimals; mocks match that. */
export const PRICE_FEED_DECIMALS = 8;
