import { Injectable, Logger } from '@nestjs/common';
import { TransactionStatus, TransactionType, type User } from '@prisma/client';
import { ethers } from 'ethers';
import { formatAmount, parseAmount, roundDecimals, toTokenAmount, txUrl, type OnrampResult } from '@nairastock/shared';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app-exception';
import { ChainService } from '../chain/chain.service';
import { Erc20Service } from '../chain/erc20.service';
import { StocksService } from '../stocks/stocks.service';
import { WalletService } from '../wallet/wallet.service';

/**
 * Mocked naira rail.
 *
 * In production this module is a thin client over a licensed cNGN on/off-ramp
 * partner (Busha or Quidax): the user pays by bank transfer, the partner
 * confirms via webhook, and cNGN is released to the user's address. The
 * regulated leg, NIBSS/bank collection, KYC tiering, CBN reporting, belongs to
 * the partner, not to us.
 *
 * For the hackathon the bank rail is simulated: a deposit mints test cNGN from
 * the faucet directly into the user's own wallet at the fixed FX rate, and a
 * withdrawal returns cNGN to the faucet and records a payout. What is real is
 * the destination, the cNGN genuinely lands at the user's address, and the
 * transfer is visible on-chain.
 */
@Injectable()
export class OnrampService {
  private readonly logger = new Logger(OnrampService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly chain: ChainService,
    private readonly erc20: Erc20Service,
    private readonly stocks: StocksService,
    private readonly wallet: WalletService,
  ) {}

  /** ₦ in → cNGN at the user's address. 1 cNGN = ₦1 by peg. */
  async deposit(user: User, ngnAmount: string): Promise<OnrampResult> {
    const cngn = this.stocks.cash();
    const amount = this.parseNgn(ngnAmount);
    const address = ethers.getAddress(user.walletAddress);

    const transaction = await this.prisma.transaction.create({
      data: {
        userId: user.id,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        tokenOutId: cngn.id,
        amountOut: amount.toString(),
        ngnAmount: formatAmount(amount, cngn.decimals),
        priceNgn: '1',
        chainId: this.config.chainId,
      },
    });

    try {
      // Serialised through the faucet queue: the on-ramp, gas top-ups, and the
      // price simulator all sign with this account, and concurrent sends would
      // collide on the nonce.
      const receipt = await this.chain.withFaucet((faucet) => this.releaseCngn(cngn.address, faucet, address, amount));

      // A fresh wallet also needs gas before it can trade.
      await this.wallet.ensureGas(address);

      const updated = await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.CONFIRMED,
          txHash: receipt.hash,
          blockNumber: BigInt(receipt.blockNumber),
          gasUsed: receipt.gasUsed.toString(),
          confirmedAt: new Date(),
        },
      });

      this.logger.log(`deposit ₦${formatAmount(amount, cngn.decimals)} → ${address} (${receipt.hash})`);

      return {
        transactionId: updated.id,
        status: 'CONFIRMED',
        ngnAmount: roundDecimals(formatAmount(amount, cngn.decimals), 2),
        cngnAmount: toTokenAmount(amount, cngn.decimals),
        rate: '1',
        txHash: receipt.hash,
        explorerUrl: txUrl(this.config.chainId, receipt.hash, this.config.explorerBaseUrl),
      };
    } catch (error) {
      const reason = error instanceof AppException ? error.message : this.chain.decodeRevert(error);
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.FAILED, failureReason: reason.slice(0, 500) },
      });
      this.logger.warn(`deposit failed for ${address}: ${reason}`);
      throw error instanceof AppException ? error : AppException.txReverted({ txHash: '', reason });
    }
  }

  /** cNGN out → simulated naira payout. */
  async withdraw(user: User, ngnAmount: string): Promise<OnrampResult> {
    const cngn = this.stocks.cash();
    const amount = this.parseNgn(ngnAmount);
    const address = ethers.getAddress(user.walletAddress);

    const balance = await this.erc20.balanceOf(cngn.address, address);
    if (balance < amount) {
      throw AppException.insufficientBalance({
        symbol: cngn.symbol,
        required: formatAmount(amount, cngn.decimals),
        available: formatAmount(balance, cngn.decimals),
      });
    }

    const signer = await this.wallet.getSigner(user);

    const transaction = await this.prisma.transaction.create({
      data: {
        userId: user.id,
        type: TransactionType.WITHDRAW,
        status: TransactionStatus.PENDING,
        tokenInId: cngn.id,
        amountIn: amount.toString(),
        ngnAmount: formatAmount(amount, cngn.decimals),
        priceNgn: '1',
        chainId: this.config.chainId,
      },
    });

    try {
      // cNGN returns to the issuer/faucet, mirroring a partner burning on payout.
      const receipt = await this.erc20.transfer(cngn.address, signer, this.chain.getFaucetAddress(), amount);

      const updated = await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.CONFIRMED,
          txHash: receipt.hash,
          blockNumber: BigInt(receipt.blockNumber),
          gasUsed: receipt.gasUsed.toString(),
          confirmedAt: new Date(),
        },
      });

      this.logger.log(`withdraw ₦${formatAmount(amount, cngn.decimals)} from ${address} (${receipt.hash})`);

      return {
        transactionId: updated.id,
        status: 'CONFIRMED',
        ngnAmount: roundDecimals(formatAmount(amount, cngn.decimals), 2),
        cngnAmount: toTokenAmount(amount, cngn.decimals),
        rate: '1',
        txHash: receipt.hash,
        explorerUrl: txUrl(this.config.chainId, receipt.hash, this.config.explorerBaseUrl),
      };
    } catch (error) {
      const reason = error instanceof AppException ? error.message : this.chain.decodeRevert(error);
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.FAILED, failureReason: reason.slice(0, 500) },
      });
      this.logger.warn(`withdrawal failed for ${address}: ${reason}`);
      throw error instanceof AppException ? error : AppException.txReverted({ txHash: '', reason });
    }
  }

  /**
   * Mints when the faucet holds the minter role (mock cNGN on testnet), and
   * falls back to a plain transfer from the faucet's float when it doesn't,    * which is what happens against real cNGN on mainnet.
   */
  private async releaseCngn(
    tokenAddress: string,
    faucet: ethers.Wallet,
    to: string,
    amount: bigint,
  ): Promise<ethers.TransactionReceipt> {
    try {
      const minter = (await this.erc20.contract(tokenAddress).minter()) as string;
      if (ethers.getAddress(minter) === ethers.getAddress(faucet.address)) {
        return await this.erc20.mint(tokenAddress, faucet, to, amount);
      }
    } catch {
      // No `minter()`, a real cNGN contract. Transfer from the float instead.
    }

    const float = await this.erc20.balanceOf(tokenAddress, faucet.address);
    if (float < amount) {
      throw AppException.insufficientLiquidity({
        pair: 'cNGN faucet float',
        requested: formatAmount(amount, 18),
      });
    }
    return this.erc20.transfer(tokenAddress, faucet, to, amount);
  }

  private parseNgn(input: string): bigint {
    const cngn = this.stocks.cash();
    let amount: bigint;
    try {
      amount = parseAmount(input, cngn.decimals);
    } catch {
      throw AppException.unknownToken(`naira amount "${input}"`);
    }

    const min = parseAmount(String(this.config.onrampMinNgn), cngn.decimals);
    const max = parseAmount(String(this.config.onrampMaxNgn), cngn.decimals);

    if (amount < min) {
      throw AppException.insufficientBalance({
        symbol: 'NGN',
        required: `at least ₦${this.config.onrampMinNgn.toLocaleString('en-NG')}`,
        available: formatAmount(amount, cngn.decimals),
      });
    }
    if (amount > max) {
      throw AppException.insufficientLiquidity({
        pair: 'naira rail',
        requested: `₦${formatAmount(amount, cngn.decimals)} exceeds the ₦${this.config.onrampMaxNgn.toLocaleString('en-NG')} demo limit`,
      });
    }
    return amount;
  }
}
