/**
 * Client-side signing.
 *
 * viem is used here rather than ethers because the frontend needs exactly one
 * thing from a crypto library, sign a message with a locally held key, and
 * viem's tree-shaken account module is a fraction of the bundle. The API side
 * uses ethers for HD derivation; that split is deliberate and documented in the
 * README.
 *
 * The signing path exists to demonstrate the self-custody direction of travel:
 * even though the demo's swaps are server-signed, login can already be proven
 * client-side with a key the server never sees.
 */
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

export interface LocalSigner {
  address: string;
  signMessage(message: string): Promise<string>;
}

/** BIP44 account 0 on the Ethereum path, the same derivation the API uses. */
export function signerFromMnemonic(mnemonic: string, accountIndex = 0): LocalSigner {
  const account = mnemonicToAccount(mnemonic.trim().replace(/\s+/g, ' '), {
    path: `m/44'/60'/0'/0/${accountIndex}`,
  });
  return {
    address: account.address,
    signMessage: (message: string) => account.signMessage({ message }),
  };
}

export function signerFromPrivateKey(privateKey: string): LocalSigner {
  const account = privateKeyToAccount(privateKey as Hex);
  return {
    address: account.address,
    signMessage: (message: string) => account.signMessage({ message }),
  };
}

/**
 * An injected wallet (MetaMask, Coinbase Wallet, Rabby), if present. This is the
 * path a production build would use exclusively, no key material anywhere near
 * the server.
 */
export async function signerFromInjectedWallet(): Promise<LocalSigner | null> {
  const injected = (globalThis as { ethereum?: InjectedProvider }).ethereum;
  if (!injected) return null;

  const accounts = (await injected.request({ method: 'eth_requestAccounts' })) as string[];
  const address = accounts?.[0];
  if (!address) return null;

  return {
    address,
    signMessage: async (message: string) =>
      (await injected.request({ method: 'personal_sign', params: [message, address] })) as string,
  };
}

export function hasInjectedWallet(): boolean {
  return Boolean((globalThis as { ethereum?: InjectedProvider }).ethereum);
}

interface InjectedProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
