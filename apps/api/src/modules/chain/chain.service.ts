import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ethers } from 'ethers';
import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../../common/app-exception';

/**
 * Owns the single JsonRpcProvider for the process and the faucet signer.
 *
 * ethers v6 is the choice over viem here for one reason that matters to this
 * build: `HDNodeWallet.fromPhrase`/`fromSeed` gives BIP32/BIP44 derivation,
 * message signing, and contract interaction from one dependency, matching the
 * derivation pattern already used in the MCW wallet package. viem would need
 * viem + a separate HD library and two mental models for the same job.
 */
@Injectable()
export class ChainService implements OnModuleDestroy {
  private readonly logger = new Logger(ChainService.name);
  private readonly provider: ethers.JsonRpcProvider;
  private faucetWallet: ethers.Wallet | null = null;
  /** Tail of the faucet send queue, see withFaucet. */
  private faucetQueue: Promise<void> = Promise.resolve();

  constructor(private readonly config: AppConfigService) {
    this.provider = new ethers.JsonRpcProvider(
      config.rpcUrl,
      { chainId: config.chainId, name: config.networkLabel },
      // staticNetwork: the chain id is known from config, so skip the extra
      // eth_chainId round-trip on every call and never auto-detect a change.
      { staticNetwork: true, polling: false },
    );
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  /**
   * Funded account used to mint demo cNGN and to top up gas for fresh wallets.
   * On testnet this is anvil account #0 / a throwaway Sepolia key.
   */
  getFaucetWallet(): ethers.Wallet {
    if (!this.faucetWallet) {
      this.faucetWallet = new ethers.Wallet(this.config.faucetPrivateKey, this.provider);
    }
    return this.faucetWallet;
  }

  getFaucetAddress(): string {
    return this.getFaucetWallet().address;
  }

  /**
   * Serialises every faucet-signed transaction.
   *
   * The faucet account is shared by three writers, the naira on-ramp, gas
   * top-ups, and the simulated price feed, so two concurrent sends race for the
   * same nonce and the node rejects the loser with "replacement transaction
   * underpriced". A promise chain is the right tool: ethers already fetches the
   * pending nonce per send, so all this needs to guarantee is that no two sends
   * are in flight at once.
   */
  async withFaucet<T>(fn: (faucet: ethers.Wallet) => Promise<T>): Promise<T> {
    const run = this.faucetQueue.then(
      () => fn(this.getFaucetWallet()),
      () => fn(this.getFaucetWallet()),
    );
    // Keep the chain alive past a rejection so one failure doesn't wedge the queue.
    this.faucetQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async getBlockNumber(): Promise<number> {
    return this.withChainErrors(() => this.provider.getBlockNumber(), 'read block number');
  }

  async getNativeBalance(address: string): Promise<bigint> {
    return this.withChainErrors(() => this.provider.getBalance(address), `read ETH balance of ${address}`);
  }

  /**
   * Wraps any RPC call so a dead node surfaces as a 503 with an actionable
   * message rather than an ethers `SERVER_ERROR` blob.
   */
  async withChainErrors<T>(fn: () => Promise<T>, what: string): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const err = error as { code?: string; shortMessage?: string; message?: string };
      const isConnectivity =
        err.code === 'NETWORK_ERROR' ||
        err.code === 'SERVER_ERROR' ||
        err.code === 'TIMEOUT' ||
        /ECONNREFUSED|fetch failed|socket hang up/i.test(err.message ?? '');

      if (isConnectivity) {
        this.logger.error(`RPC unreachable while trying to ${what}: ${err.message}`);
        throw AppException.chainUnavailable(
          `could not ${what}, no response from ${this.config.rpcUrl}. ` +
            (this.config.chainId === 31337
              ? 'Start a local chain with `pnpm chain:up`.'
              : 'Check RPC_URL in .env.'),
        );
      }
      throw error;
    }
  }

  /**
   * Extracts a usable reason from a reverted call/transaction. Handles the three
   * shapes ethers hands back: a decoded custom error, a require-string, and raw
   * revert data that needs manual decoding.
   */
  decodeRevert(error: unknown): string {
    const err = error as {
      shortMessage?: string;
      reason?: string;
      revert?: { name?: string; args?: unknown[] };
      data?: string;
      info?: { error?: { message?: string } };
      message?: string;
    };

    if (err.reason) return err.reason;
    if (err.revert?.name) {
      const args = err.revert.args?.map((a) => String(a)).join(', ');
      return args ? `${err.revert.name}(${args})` : err.revert.name;
    }
    if (err.data && err.data !== '0x') {
      const decoded = tryDecodeErrorString(err.data);
      if (decoded) return decoded;
    }
    if (err.info?.error?.message) return err.info.error.message;
    return err.shortMessage ?? err.message ?? 'unknown revert';
  }

  onModuleDestroy(): void {
    this.provider.destroy();
  }
}

/** Decodes the standard `Error(string)` selector 0x08c379a0. */
function tryDecodeErrorString(data: string): string | null {
  if (!data.startsWith('0x08c379a0')) return null;
  try {
    const [reason] = ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + data.slice(10));
    return String(reason);
  } catch {
    return null;
  }
}
