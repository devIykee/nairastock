/**
 * Runtime config for the frontend, read from the repo-root .env via Vite.
 *
 * Chain facts are also served by `GET /api/chain`, and that is the authoritative
 * source once the app has loaded, these are the pre-flight defaults so the
 * first paint can render an honest network badge without waiting on a fetch.
 */
import { getChainMeta } from '@nairastock/shared';

const rawChainId = Number(import.meta.env.VITE_CHAIN_ID ?? 31337);

export const config = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, ''),
  chainId: Number.isFinite(rawChainId) ? rawChainId : 31337,
  rpcUrl: import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8545',
  explorerBaseUrl: import.meta.env.VITE_EXPLORER_BASE_URL ?? '',
  networkLabel: import.meta.env.VITE_NETWORK_LABEL ?? '',
} as const;

export const chainMeta = getChainMeta(config.chainId, config.explorerBaseUrl);

/** Storage keys. Namespaced so a shared localhost origin doesn't collide. */
export const STORAGE_KEYS = {
  token: 'nairastock.token',
  address: 'nairastock.address',
  custodyMode: 'nairastock.custody',
  /**
   * Whether the user has confirmed they wrote down their recovery phrase.
   * Client-side only; the server tracks the same flag, this just avoids a
   * round-trip before the first render.
   */
  backedUp: 'nairastock.backedUp',
} as const;
