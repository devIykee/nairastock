import { Injectable, Logger } from '@nestjs/common';
import { type Token as TokenRow, TokenKind, TransactionStatus, TransactionType, type User } from '@prisma/client';
import { ethers } from 'ethers';
import {
  applySlippage,
  formatAmount,
  getAmountOut,
  getPriceImpactBps,
  parseAmount,
  roundDecimals,
  toTokenAmount,
  txUrl,
  type SwapQuote,
  type SwapResult,
  type SwapSide,
} from '@nairastock/shared';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app-exception';
import { PAIR_ABI, ROUTER_ABI } from '../../config/abis';
import { ChainService } from '../chain/chain.service';
import { Erc20Service } from '../chain/erc20.service';
import { StocksService } from '../stocks/stocks.service';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../pricing/pricing.service';

/** How long a returned quote is considered honourable before a re-quote. */
const QUOTE_TTL_MS = 30_000;

export interface QuoteParams {
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amountIn: string;
  slippageBps?: number;
}

export interface ExecuteParams extends QuoteParams {
  user: User;
}

/**
 * cNGN ⇄ tokenized-stock swaps. The core of the demo.
 *
 * Design notes:
 *  - Quotes come from the router's own `getReserves` where available, and the
 *    output is computed with the shared constant-product math rather than
 *    trusting `getAmountsOut`. Same formula, but it means price impact, spot
 *    price, and minimum-received all derive from one reserve snapshot and agree
 *    with each other. `getAmountsOut` is then used as a cross-check.
 *  - `amountOutMin` is passed to the router, so the guarantee shown to the user
 *    is enforced on-chain by the pair's k-invariant, not by this server.
 *  - Every failure mode named in the brief (insufficient balance, slippage
 *    exceeded, thin liquidity) maps to a distinct error code, and a failed swap
 *    still writes a FAILED transaction row so it appears in history.
 */
@Injectable()
export class SwapService {
  private readonly logger = new Logger(SwapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly chain: ChainService,
    private readonly erc20: Erc20Service,
    private readonly stocks: StocksService,
    private readonly wallet: WalletService,
    private readonly pricing: PricingService,
  ) {}

  // ── Quoting ────────────────────────────────────────────────────────────────

  async quote(params: QuoteParams): Promise<SwapQuote> {
    const { tokenIn, tokenOut, side } = this.resolvePair(params.tokenInSymbol, params.tokenOutSymbol);
    const slippageBps = this.normalizeSlippage(params.slippageBps);

    const amountIn = this.parsePositiveAmount(params.amountIn, tokenIn);
    const reserves = await this.getReserves(tokenIn, tokenOut);

    let amountOut: bigint;
    try {
      amountOut = getAmountOut(amountIn, reserves);
    } catch (error) {
      throw AppException.insufficientLiquidity({
        pair: `${tokenIn.symbol}/${tokenOut.symbol}`,
        requested: formatAmount(amountIn, tokenIn.decimals),
      });
    }

    if (amountOut <= 0n) {
      throw AppException.insufficientLiquidity({
        pair: `${tokenIn.symbol}/${tokenOut.symbol}`,
        requested: formatAmount(amountIn, tokenIn.decimals),
      });
    }

    // Cross-check against the router's own view. A mismatch means our reserve
    // snapshot is stale or the router isn't V2-compatible, worth knowing.
    await this.crossCheckWithRouter(tokenIn, tokenOut, amountIn, amountOut);

    const minAmountOut = applySlippage(amountOut, slippageBps);
    const impactBps = getPriceImpactBps(amountIn, amountOut, reserves);

    const inDisplay = formatAmount(amountIn, tokenIn.decimals);
    const outDisplay = formatAmount(amountOut, tokenOut.decimals);

    return {
      side,
      tokenIn: this.stocks.toDto(tokenIn),
      tokenOut: this.stocks.toDto(tokenOut),
      amountIn: toTokenAmount(amountIn, tokenIn.decimals),
      amountOut: toTokenAmount(amountOut, tokenOut.decimals),
      minAmountOut: toTokenAmount(minAmountOut, tokenOut.decimals),
      slippageBps,
      priceImpactPct: roundDecimals(String(impactBps / 100), 2),
      executionPrice: divideDecimals(outDisplay, inDisplay),
      spotPrice: divideDecimals(
        formatAmount(reserves.reserveOut, tokenOut.decimals),
        formatAmount(reserves.reserveIn, tokenIn.decimals),
      ),
      feeBps: 30,
      route: [tokenIn.symbol, tokenOut.symbol],
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    };
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  /**
   * Signs and submits the swap from the user's own wallet, waits for the
   * receipt, and records it. The tokens land at the user's address, nothing is
   * held by a house account, which is the whole point of the product.
   */
  async execute(params: ExecuteParams): Promise<SwapResult> {
    const { user } = params;
    const { tokenIn, tokenOut, side } = this.resolvePair(params.tokenInSymbol, params.tokenOutSymbol);
    const router = this.requireRouter();

    // Re-quote at execution time rather than trusting a client-supplied quote:
    // the price may have moved, and the min-out we enforce must come from the
    // reserves we just read.
    const quote = await this.quote(params);
    const amountIn = BigInt(quote.amountIn.base);
    const minAmountOut = BigInt(quote.minAmountOut.base);

    const signer = await this.wallet.getSigner(user);

    await this.assertSufficientBalance(tokenIn, signer.address, amountIn);
    await this.assertSufficientGas(signer.address);

    const transaction = await this.prisma.transaction.create({
      data: {
        userId: user.id,
        type: side === 'BUY' ? TransactionType.BUY : TransactionType.SELL,
        status: TransactionStatus.PENDING,
        tokenInId: tokenIn.id,
        tokenOutId: tokenOut.id,
        amountIn: amountIn.toString(),
        minAmountOut: minAmountOut.toString(),
        quotedAmountOut: quote.amountOut.base,
        slippageBps: quote.slippageBps,
        chainId: this.config.chainId,
        priceUsd: await this.priceUsdFor(tokenIn, tokenOut),
        priceNgn: await this.priceNgnFor(tokenIn, tokenOut),
      },
    });

    try {
      await this.erc20.ensureAllowance(tokenIn.address, signer, router, amountIn);

      const routerContract = new ethers.Contract(router, ROUTER_ABI, signer);
      const path = [tokenIn.address, tokenOut.address];
      const deadline = Math.floor(Date.now() / 1000) + this.config.swapDeadlineSeconds;

      // Simulate first. A revert here costs no gas and yields the real reason,
      // which is how "slippage exceeded" reaches the user as a clean message
      // instead of a failed transaction they have to interpret.
      try {
        await routerContract.swapExactTokensForTokens.staticCall(
          amountIn,
          minAmountOut,
          path,
          signer.address,
          deadline,
        );
      } catch (error) {
        throw this.mapRevert(error, tokenIn, tokenOut, quote);
      }

      const tx = (await routerContract.swapExactTokensForTokens(
        amountIn,
        minAmountOut,
        path,
        signer.address,
        deadline,
      )) as ethers.TransactionResponse;

      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { txHash: tx.hash },
      });

      const receipt = await tx.wait(this.config.swapConfirmations);
      if (!receipt) throw new Error('transaction receipt was null');

      if (receipt.status === 0) {
        throw AppException.txReverted({ txHash: tx.hash, reason: 'swap reverted on-chain' });
      }

      // Read the realised output from the Transfer log to the user, rather than
      // reporting the quote, what actually arrived is what we show.
      const amountOut = this.extractAmountReceived(receipt, tokenOut.address, signer.address) ?? BigInt(quote.amountOut.base);

      const updated = await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.CONFIRMED,
          amountOut: amountOut.toString(),
          blockNumber: BigInt(receipt.blockNumber),
          gasUsed: receipt.gasUsed.toString(),
          confirmedAt: new Date(),
        },
      });

      this.logger.log(
        `${side} ${formatAmount(amountIn, tokenIn.decimals)} ${tokenIn.symbol} → ` +
          `${formatAmount(amountOut, tokenOut.decimals)} ${tokenOut.symbol} for ${signer.address} (${tx.hash})`,
      );

      return {
        transactionId: updated.id,
        status: 'CONFIRMED',
        txHash: tx.hash,
        explorerUrl: txUrl(this.config.chainId, tx.hash, this.config.explorerBaseUrl) ?? '',
        amountIn: toTokenAmount(amountIn, tokenIn.decimals),
        amountOut: toTokenAmount(amountOut, tokenOut.decimals),
        side,
        tokenInSymbol: tokenIn.symbol,
        tokenOutSymbol: tokenOut.symbol,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      const reason = error instanceof AppException ? error.message : this.chain.decodeRevert(error);
      const code = error instanceof AppException ? error.code : 'TX_REVERTED';

      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.FAILED, failureReason: reason.slice(0, 500), failureCode: code },
      });

      this.logger.warn(`swap failed for ${user.walletAddress}: ${reason}`);
      throw error instanceof AppException
        ? error
        : AppException.txReverted({ txHash: '', reason });
    }
  }

  // ── Reserves & routing ─────────────────────────────────────────────────────

  /**
   * Reads the pool reserves oriented as (in, out).
   *
   * Prefers the router's `getReserves(tokenA, tokenB)` helper; falls back to
   * `pairFor` + the pair's own `getReserves()` + `token0()` ordering, which is
   * what a real V2 router (Aerodrome included) exposes.
   */
  private async getReserves(tokenIn: TokenRow, tokenOut: TokenRow): Promise<{ reserveIn: bigint; reserveOut: bigint }> {
    const router = this.requireRouter();
    const provider = this.chain.getProvider();
    const routerContract = new ethers.Contract(router, ROUTER_ABI, provider);

    try {
      const [reserveIn, reserveOut] = (await routerContract.getReserves(tokenIn.address, tokenOut.address)) as [
        bigint,
        bigint,
      ];
      if (reserveIn > 0n && reserveOut > 0n) return { reserveIn, reserveOut };
    } catch {
      // Real routers don't have this helper, use the pair directly.
    }

    return this.chain.withChainErrors(async () => {
      let pairAddress: string;
      try {
        pairAddress = (await routerContract.pairFor(tokenIn.address, tokenOut.address)) as string;
      } catch {
        throw AppException.insufficientLiquidity({ pair: `${tokenIn.symbol}/${tokenOut.symbol}` });
      }

      if (!pairAddress || pairAddress === ethers.ZeroAddress) {
        throw AppException.insufficientLiquidity({ pair: `${tokenIn.symbol}/${tokenOut.symbol}` });
      }

      const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
      const [token0, [reserve0, reserve1]] = await Promise.all([
        pair.token0() as Promise<string>,
        pair.getReserves() as Promise<[bigint, bigint]>,
      ]);

      const inIsToken0 = ethers.getAddress(token0) === ethers.getAddress(tokenIn.address);
      return inIsToken0
        ? { reserveIn: reserve0, reserveOut: reserve1 }
        : { reserveIn: reserve1, reserveOut: reserve0 };
    }, `read ${tokenIn.symbol}/${tokenOut.symbol} pool reserves`);
  }

  /**
   * Our math and the router's must agree. A drift beyond 1 wei means the reserve
   * snapshot moved between calls (fine, logged) or the router charges a
   * different fee than the 30 bps we assume (a real problem on a new venue).
   */
  private async crossCheckWithRouter(
    tokenIn: TokenRow,
    tokenOut: TokenRow,
    amountIn: bigint,
    computedOut: bigint,
  ): Promise<void> {
    try {
      const routerContract = new ethers.Contract(this.requireRouter(), ROUTER_ABI, this.chain.getProvider());
      const amounts = (await routerContract.getAmountsOut(amountIn, [tokenIn.address, tokenOut.address])) as bigint[];
      const routerOut = amounts[amounts.length - 1];

      const drift = routerOut > computedOut ? routerOut - computedOut : computedOut - routerOut;
      // 1 bp of tolerance covers a block landing mid-quote.
      if (drift > routerOut / 10_000n) {
        this.logger.warn(
          `quote drift on ${tokenIn.symbol}→${tokenOut.symbol}: local=${computedOut} router=${routerOut}. ` +
            'Check that the configured router uses a 30 bps input fee.',
        );
      }
    } catch (error) {
      this.logger.debug(`router cross-check skipped: ${(error as Error).message}`);
    }
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  private resolvePair(
    tokenInSymbol: string,
    tokenOutSymbol: string,
  ): { tokenIn: TokenRow; tokenOut: TokenRow; side: SwapSide } {
    const tokenIn = this.stocks.requireBySymbol(tokenInSymbol);
    const tokenOut = this.stocks.requireBySymbol(tokenOutSymbol);

    if (tokenIn.id === tokenOut.id) {
      throw AppException.unknownToken(`${tokenInSymbol}→${tokenOutSymbol} (same token)`);
    }

    const inIsCash = tokenIn.kind === TokenKind.STABLECOIN;
    const outIsCash = tokenOut.kind === TokenKind.STABLECOIN;

    // Only cash↔stock is routable: there is no stock/stock pool, and pretending
    // otherwise would surface as an unhelpful liquidity error.
    if (inIsCash === outIsCash) {
      throw AppException.insufficientLiquidity({
        pair: `${tokenIn.symbol}/${tokenOut.symbol}`,
        requested: 'route must be cNGN ↔ stock token',
      });
    }

    return { tokenIn, tokenOut, side: inIsCash ? 'BUY' : 'SELL' };
  }

  private normalizeSlippage(requested?: number): number {
    if (requested === undefined || requested === null) return this.config.defaultSlippageBps;
    if (!Number.isFinite(requested) || requested < 0) {
      throw AppException.slippageExceeded({ minAmountOut: '0', symbol: 'token' });
    }
    return Math.min(Math.round(requested), this.config.maxSlippageBps);
  }

  private parsePositiveAmount(input: string, token: TokenRow): bigint {
    let parsed: bigint;
    try {
      parsed = parseAmount(input, token.decimals);
    } catch (error) {
      throw AppException.unknownToken(`amount "${input}" for ${token.symbol}`);
    }
    if (parsed <= 0n) {
      throw AppException.insufficientBalance({
        symbol: token.symbol,
        required: 'more than 0',
        available: formatAmount(parsed, token.decimals),
      });
    }
    return parsed;
  }

  private async assertSufficientBalance(token: TokenRow, holder: string, required: bigint): Promise<void> {
    const balance = await this.erc20.balanceOf(token.address, holder);
    if (balance < required) {
      throw AppException.insufficientBalance({
        symbol: token.symbol,
        required: formatAmount(required, token.decimals),
        available: formatAmount(balance, token.decimals),
      });
    }
  }

  private async assertSufficientGas(address: string): Promise<void> {
    const balance = await this.chain.getNativeBalance(address);
    // Enough for an approve + a swap at any sane testnet gas price.
    if (balance < ethers.parseEther('0.0005')) {
      // Try a top-up before giving up, the faucet exists for exactly this.
      await this.wallet.ensureGas(address);
      const after = await this.chain.getNativeBalance(address);
      if (after < ethers.parseEther('0.0005')) {
        throw AppException.insufficientGas({ address, balance: ethers.formatEther(after) });
      }
    }
  }

  private requireRouter(): string {
    if (!this.config.routerAddress) {
      throw AppException.notConfigured('DEX_ROUTER_ADDRESS');
    }
    return this.config.routerAddress;
  }

  /**
   * Turns a router revert into the right user-facing error. The revert strings
   * are UniswapV2Router02's, so this mapping works against a real router too.
   */
  private mapRevert(error: unknown, tokenIn: TokenRow, tokenOut: TokenRow, quote: SwapQuote): AppException {
    const reason = this.chain.decodeRevert(error);

    if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(reason)) {
      return AppException.slippageExceeded({
        minAmountOut: quote.minAmountOut.display,
        symbol: tokenOut.symbol,
      });
    }
    if (/INSUFFICIENT_LIQUIDITY|PAIR_NOT_FOUND/i.test(reason)) {
      return AppException.insufficientLiquidity({
        pair: `${tokenIn.symbol}/${tokenOut.symbol}`,
        requested: quote.amountIn.display,
      });
    }
    if (/InsufficientBalance|TRANSFER_FROM_FAILED|transfer amount exceeds balance/i.test(reason)) {
      return AppException.insufficientBalance({
        symbol: tokenIn.symbol,
        required: quote.amountIn.display,
        available: 'less than that',
      });
    }
    if (/InsufficientAllowance/i.test(reason)) {
      return AppException.txReverted({ txHash: '', reason: `router is not approved to spend ${tokenIn.symbol}` });
    }
    if (/EXPIRED/i.test(reason)) {
      return AppException.quoteExpired();
    }
    return AppException.txReverted({ txHash: '', reason });
  }

  /** Sums ERC20 Transfer logs of `token` into `recipient` within a receipt. */
  private extractAmountReceived(
    receipt: ethers.TransactionReceipt,
    tokenAddress: string,
    recipient: string,
  ): bigint | null {
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const paddedRecipient = ethers.zeroPadValue(ethers.getAddress(recipient), 32).toLowerCase();
    const target = ethers.getAddress(tokenAddress);

    let total = 0n;
    for (const log of receipt.logs) {
      if (ethers.getAddress(log.address) !== target) continue;
      if (log.topics[0] !== transferTopic) continue;
      if (log.topics[2]?.toLowerCase() !== paddedRecipient) continue;
      total += BigInt(log.data);
    }
    return total > 0n ? total : null;
  }

  private async priceUsdFor(tokenIn: TokenRow, tokenOut: TokenRow): Promise<string | null> {
    const stock = tokenIn.kind === TokenKind.STOCK ? tokenIn : tokenOut;
    const price = await this.pricing.getPrice(stock.symbol);
    return price?.priceUsd ?? null;
  }

  private async priceNgnFor(tokenIn: TokenRow, tokenOut: TokenRow): Promise<string | null> {
    const stock = tokenIn.kind === TokenKind.STOCK ? tokenIn : tokenOut;
    const price = await this.pricing.getPrice(stock.symbol);
    return price?.priceNgn ?? null;
  }
}

/** Decimal-string division at 18dp, no floats in a price path. */
function divideDecimals(numerator: string, denominator: string): string {
  const SCALE = 18;
  const den = parseAmount(denominator, SCALE);
  if (den === 0n) return '0';
  const num = parseAmount(numerator, SCALE);
  return formatAmount((num * 10n ** BigInt(SCALE)) / den, SCALE);
}
