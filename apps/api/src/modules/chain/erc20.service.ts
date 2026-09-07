import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ERC20_ABI, MINTABLE_ERC20_ABI } from '../../config/abis';
import { AppException } from '../../common/app-exception';
import { ChainService } from './chain.service';
import { MulticallService } from './multicall.service';

export interface Erc20Metadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

/** ERC20 reads/writes. All balance reads go through multicall. */
@Injectable()
export class Erc20Service {
  private readonly logger = new Logger(Erc20Service.name);
  private readonly iface = new ethers.Interface(ERC20_ABI);

  constructor(
    private readonly chain: ChainService,
    private readonly multicall: MulticallService,
  ) {}

  contract(address: string, runner?: ethers.ContractRunner): ethers.Contract {
    return new ethers.Contract(address, MINTABLE_ERC20_ABI, runner ?? this.chain.getProvider());
  }

  /** One batched call for every (token, holder) pair. */
  async balancesOf(tokenAddresses: string[], holder: string): Promise<Record<string, bigint>> {
    if (tokenAddresses.length === 0) return {};

    const callData = this.iface.encodeFunctionData('balanceOf', [holder]);
    const results = await this.multicall.aggregate(
      tokenAddresses.map((target) => ({ target, callData, allowFailure: true })),
    );

    const balances: Record<string, bigint> = {};
    results.forEach((result, i) => {
      const address = tokenAddresses[i];
      if (!result.success || result.returnData === '0x') {
        // A token that can't be read is reported as zero rather than failing the
        // whole dashboard, one bad address shouldn't blank the portfolio.
        this.logger.warn(`balanceOf failed for token ${address}; treating as 0`);
        balances[address] = 0n;
        return;
      }
      balances[address] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], result.returnData)[0] as bigint;
    });
    return balances;
  }

  async balanceOf(tokenAddress: string, holder: string): Promise<bigint> {
    const balances = await this.balancesOf([tokenAddress], holder);
    return balances[tokenAddress] ?? 0n;
  }

  async metadata(address: string): Promise<Erc20Metadata> {
    const contract = this.contract(address);
    return this.chain.withChainErrors(async () => {
      const [name, symbol, decimals] = await Promise.all([
        contract.name() as Promise<string>,
        contract.symbol() as Promise<string>,
        contract.decimals() as Promise<bigint>,
      ]);
      return { address: ethers.getAddress(address), name, symbol, decimals: Number(decimals) };
    }, `read ERC20 metadata at ${address}`);
  }

  async allowance(tokenAddress: string, owner: string, spender: string): Promise<bigint> {
    return this.chain.withChainErrors(
      () => this.contract(tokenAddress).allowance(owner, spender) as Promise<bigint>,
      `read allowance for ${tokenAddress}`,
    );
  }

  /**
   * Ensures `spender` can move at least `amount` on behalf of `signer`.
   * Approves the exact amount rather than MaxUint256: an unlimited approval to a
   * mock router is a habit worth not teaching, and the gas difference is noise.
   */
  async ensureAllowance(
    tokenAddress: string,
    signer: ethers.Wallet,
    spender: string,
    amount: bigint,
  ): Promise<ethers.TransactionReceipt | null> {
    const current = await this.allowance(tokenAddress, signer.address, spender);
    if (current >= amount) return null;

    const contract = this.contract(tokenAddress, signer);
    try {
      const tx = (await contract.approve(spender, amount)) as ethers.TransactionResponse;
      return await tx.wait();
    } catch (error) {
      throw AppException.txReverted({
        txHash: '',
        reason: `approve failed: ${this.chain.decodeRevert(error)}`,
      });
    }
  }

  /** Mock-only mint, used by the naira on-ramp. Signer must be the token minter. */
  async mint(tokenAddress: string, signer: ethers.Wallet, to: string, amount: bigint): Promise<ethers.TransactionReceipt> {
    const contract = this.contract(tokenAddress, signer);
    try {
      const tx = (await contract.mint(to, amount)) as ethers.TransactionResponse;
      const receipt = await tx.wait();
      if (!receipt) throw new Error('mint receipt was null');
      return receipt;
    } catch (error) {
      throw AppException.txReverted({ txHash: '', reason: `cNGN mint failed: ${this.chain.decodeRevert(error)}` });
    }
  }

  async transfer(tokenAddress: string, signer: ethers.Wallet, to: string, amount: bigint): Promise<ethers.TransactionReceipt> {
    const contract = this.contract(tokenAddress, signer);
    try {
      const tx = (await contract.transfer(to, amount)) as ethers.TransactionResponse;
      const receipt = await tx.wait();
      if (!receipt) throw new Error('transfer receipt was null');
      return receipt;
    } catch (error) {
      throw AppException.txReverted({ txHash: '', reason: `transfer failed: ${this.chain.decodeRevert(error)}` });
    }
  }
}
