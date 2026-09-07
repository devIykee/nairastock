import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { AppConfigService } from '../../config/app-config.service';
import { MULTICALL3_ABI } from '../../config/abis';
import { ChainService } from './chain.service';

export interface MulticallRequest {
  target: string;
  /** Encoded calldata for the target. */
  callData: string;
  /** When true a failing sub-call yields null instead of aborting the batch. */
  allowFailure?: boolean;
}

export interface MulticallResult {
  success: boolean;
  returnData: string;
}

/**
 * Batches read-only calls through Multicall3.
 *
 * The brief calls for batched balance reads rather than N sequential eth_calls:
 * five tokens × two users is 10 RPC round-trips serially, one batched. When
 * MULTICALL3_ADDRESS is unset the service degrades to parallel individual calls
 * so the app still works, slower, but never broken.
 */
@Injectable()
export class MulticallService {
  private readonly logger = new Logger(MulticallService.name);
  private readonly contract: ethers.Contract | null;
  private warnedAboutFallback = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly chain: ChainService,
  ) {
    this.contract = config.multicallAddress
      ? new ethers.Contract(config.multicallAddress, MULTICALL3_ABI, chain.getProvider())
      : null;
  }

  get isAvailable(): boolean {
    return this.contract !== null;
  }

  async aggregate(requests: MulticallRequest[]): Promise<MulticallResult[]> {
    if (requests.length === 0) return [];

    if (!this.contract) {
      if (!this.warnedAboutFallback) {
        this.logger.warn('MULTICALL3_ADDRESS unset, falling back to parallel eth_call.');
        this.warnedAboutFallback = true;
      }
      return this.fallbackAggregate(requests);
    }

    const calls = requests.map((r) => ({
      target: r.target,
      allowFailure: r.allowFailure ?? true,
      callData: r.callData,
    }));

    return this.chain.withChainErrors(async () => {
      const raw = (await this.contract!.aggregate3.staticCall(calls)) as Array<[boolean, string]>;
      return raw.map(([success, returnData]) => ({ success, returnData }));
    }, `batch ${requests.length} contract reads`);
  }

  /**
   * Convenience wrapper: one function on many contracts, decoded.
   * Returns null for any sub-call that failed, so callers decide the default.
   */
  async readMany<T>(
    targets: string[],
    iface: ethers.Interface,
    functionName: string,
    args: unknown[] = [],
  ): Promise<Array<T | null>> {
    const callData = iface.encodeFunctionData(functionName, args);
    const results = await this.aggregate(targets.map((target) => ({ target, callData, allowFailure: true })));

    return results.map((result, i) => {
      if (!result.success || result.returnData === '0x') {
        this.logger.debug(`${functionName} failed on ${targets[i]}`);
        return null;
      }
      try {
        const decoded = iface.decodeFunctionResult(functionName, result.returnData);
        return (decoded.length === 1 ? decoded[0] : decoded) as T;
      } catch (error) {
        this.logger.warn(`could not decode ${functionName} from ${targets[i]}: ${(error as Error).message}`);
        return null;
      }
    });
  }

  private async fallbackAggregate(requests: MulticallRequest[]): Promise<MulticallResult[]> {
    const provider = this.chain.getProvider();
    return Promise.all(
      requests.map(async (request) => {
        try {
          const returnData = await provider.call({ to: request.target, data: request.callData });
          return { success: true, returnData };
        } catch (error) {
          if (request.allowFailure === false) throw error;
          return { success: false, returnData: '0x' };
        }
      }),
    );
  }
}
