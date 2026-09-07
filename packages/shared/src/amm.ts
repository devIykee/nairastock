/**
 * Constant-product (Uniswap V2 style) AMM math.
 *
 * Kept here rather than in the API so that (a) the quote math the API returns is
 * the same math the unit tests assert against, and (b) the web app can sanity
 * check a quote locally. Mirrors UniswapV2Library exactly, including the
 * 30 bps fee applied to the input amount and floor division everywhere.
 */

export const DEFAULT_FEE_BPS = 30;
const BPS_DENOMINATOR = 10_000n;

export interface PairReserves {
  reserveIn: bigint;
  reserveOut: bigint;
}

export class AmmMathError extends Error {
  constructor(
    message: string,
    readonly code: 'INSUFFICIENT_INPUT' | 'INSUFFICIENT_LIQUIDITY' | 'INSUFFICIENT_OUTPUT',
  ) {
    super(message);
    this.name = 'AmmMathError';
  }
}

/**
 * amountOut = (amountIn * (1 - fee) * reserveOut) / (reserveIn + amountIn * (1 - fee))
 * Fee is charged on the input leg, matching UniswapV2's 997/1000.
 */
export function getAmountOut(amountIn: bigint, { reserveIn, reserveOut }: PairReserves, feeBps = DEFAULT_FEE_BPS): bigint {
  if (amountIn <= 0n) {
    throw new AmmMathError('amountIn must be greater than zero', 'INSUFFICIENT_INPUT');
  }
  if (reserveIn <= 0n || reserveOut <= 0n) {
    throw new AmmMathError('pool has no liquidity for this pair', 'INSUFFICIENT_LIQUIDITY');
  }

  const amountInWithFee = amountIn * (BPS_DENOMINATOR - BigInt(feeBps));
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * BPS_DENOMINATOR + amountInWithFee;
  return numerator / denominator;
}

/** Inverse of getAmountOut: the exact input needed for a desired output. */
export function getAmountIn(amountOut: bigint, { reserveIn, reserveOut }: PairReserves, feeBps = DEFAULT_FEE_BPS): bigint {
  if (amountOut <= 0n) {
    throw new AmmMathError('amountOut must be greater than zero', 'INSUFFICIENT_OUTPUT');
  }
  if (reserveIn <= 0n || reserveOut <= 0n) {
    throw new AmmMathError('pool has no liquidity for this pair', 'INSUFFICIENT_LIQUIDITY');
  }
  if (amountOut >= reserveOut) {
    throw new AmmMathError('requested output exceeds pool reserves', 'INSUFFICIENT_LIQUIDITY');
  }

  const numerator = reserveIn * amountOut * BPS_DENOMINATOR;
  const denominator = (reserveOut - amountOut) * (BPS_DENOMINATOR - BigInt(feeBps));
  return numerator / denominator + 1n;
}

/**
 * Price impact in bps: how far the realised execution price sits below the
 * pre-trade mid-price. Computed on ratios scaled by 1e18 to stay integral.
 *
 *   spot      = reserveOut / reserveIn
 *   execution = amountOut  / amountIn
 *   impact    = (spot - execution) / spot
 *
 * The LP fee is part of this number, which is what a trader actually feels.
 */
export function getPriceImpactBps(amountIn: bigint, amountOut: bigint, { reserveIn, reserveOut }: PairReserves): number {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0;

  const SCALE = 10n ** 18n;
  const spot = (reserveOut * SCALE) / reserveIn;
  if (spot === 0n) return 0;

  const execution = (amountOut * SCALE) / amountIn;
  if (execution >= spot) return 0;

  const impact = ((spot - execution) * BPS_DENOMINATOR) / spot;
  return Number(impact);
}

/** Pool mid-price (reserveOut per 1 reserveIn) as a scaled bigint ratio. */
export function getSpotPrice({ reserveIn, reserveOut }: PairReserves, scale = 10n ** 18n): bigint {
  if (reserveIn <= 0n) return 0n;
  return (reserveOut * scale) / reserveIn;
}

/**
 * Applies a slippage tolerance to a quoted output. The result is what gets
 * passed to the router as `amountOutMin`, so the chain, not the server,  * enforces the guarantee we showed the user.
 */
export function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  if (slippageBps < 0) throw new AmmMathError('slippage cannot be negative', 'INSUFFICIENT_OUTPUT');
  return amountOut - (amountOut * BigInt(Math.round(slippageBps))) / BPS_DENOMINATOR;
}
