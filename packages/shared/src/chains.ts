/**
 * Chain identity + explorer link construction.
 *
 * The "View on BaseScan" links are a product requirement, not a nicety: they're
 * how a judge verifies the tokens really sit in the user's own wallet. Both the
 * API and the web app build them from this one table so they can't drift.
 */

export interface ChainMeta {
  chainId: number;
  label: string;
  explorerBaseUrl: string;
  explorerName: string;
  /** Anything that isn't Base mainnet gets the "Testnet Demo" treatment in the UI. */
  testnet: boolean;
}

export const BASE_MAINNET_ID = 8453;
export const BASE_SEPOLIA_ID = 84532;
export const LOCAL_ANVIL_ID = 31337;

export const CHAINS: Record<number, ChainMeta> = {
  [BASE_MAINNET_ID]: {
    chainId: BASE_MAINNET_ID,
    label: 'Base',
    explorerBaseUrl: 'https://basescan.org',
    explorerName: 'BaseScan',
    testnet: false,
  },
  [BASE_SEPOLIA_ID]: {
    chainId: BASE_SEPOLIA_ID,
    label: 'Base Sepolia',
    explorerBaseUrl: 'https://sepolia.basescan.org',
    explorerName: 'BaseScan Sepolia',
    testnet: true,
  },
  [LOCAL_ANVIL_ID]: {
    chainId: LOCAL_ANVIL_ID,
    label: 'Local Anvil',
    explorerBaseUrl: '',
    explorerName: 'local chain',
    testnet: true,
  },
};

export function getChainMeta(chainId: number, explorerBaseUrlOverride?: string): ChainMeta {
  const known = CHAINS[chainId];
  const base: ChainMeta = known ?? {
    chainId,
    label: `Chain ${chainId}`,
    explorerBaseUrl: '',
    explorerName: 'explorer',
    testnet: true,
  };
  // An override lets a self-hosted explorer (or a local blockscout) be pointed at
  // without editing this table.
  if (explorerBaseUrlOverride && /^https?:\/\//.test(explorerBaseUrlOverride) && !explorerBaseUrlOverride.includes('localhost:8545')) {
    return { ...base, explorerBaseUrl: explorerBaseUrlOverride.replace(/\/+$/, '') };
  }
  return base;
}

/** Returns null when the chain has no browsable explorer (local anvil). */
export function txUrl(chainId: number, txHash: string, explorerBaseUrl?: string): string | null {
  const { explorerBaseUrl: base } = getChainMeta(chainId, explorerBaseUrl);
  return base ? `${base}/tx/${txHash}` : null;
}

export function addressUrl(chainId: number, address: string, explorerBaseUrl?: string): string | null {
  const { explorerBaseUrl: base } = getChainMeta(chainId, explorerBaseUrl);
  return base ? `${base}/address/${address}` : null;
}

/** Explorer page for one holder's balance of one token, the self-custody proof. */
export function tokenBalanceUrl(chainId: number, tokenAddress: string, holderAddress: string, explorerBaseUrl?: string): string | null {
  const { explorerBaseUrl: base } = getChainMeta(chainId, explorerBaseUrl);
  return base ? `${base}/token/${tokenAddress}?a=${holderAddress}` : null;
}

export function shortenAddress(address: string, lead = 6, tail = 4): string {
  if (!address) return '';
  if (address.length <= lead + tail + 2) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
