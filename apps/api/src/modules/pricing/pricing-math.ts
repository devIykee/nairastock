import { PRICE_FEED_DECIMALS, formatAmount, multiplyDecimals, parseAmount, roundDecimals } from '@nairastock/shared';

/**
 * Pure price conversions. Kept free of Nest and ethers so the unit tests can
 * assert the numbers directly, this is the math behind the hero number on the
 * dashboard, so it's worth pinning down.
 */

/** Chainlink answers are int256 with `decimals` (8 for USD equity feeds). */
export function feedAnswerToUsd(answer: bigint, decimals: number = PRICE_FEED_DECIMALS): string {
  if (answer <= 0n) {
    throw new Error(`price feed returned a non-positive answer (${answer})`);
  }
  return formatAmount(answer, decimals);
}

/** USD → NGN at a fixed rate. Production reads the rate from an FX oracle. */
export function usdToNgn(priceUsd: string, ngnUsdRate: number): string {
  return multiplyDecimals(priceUsd, String(ngnUsdRate));
}

export function ngnToUsd(priceNgn: string, ngnUsdRate: number): string {
  // Division isn't in the shared money helpers (it needs a rounding policy), so
  // scale up, divide as integers, and format back, 18dp of headroom.
  const SCALE = 18;
  const numerator = parseAmount(priceNgn, SCALE);
  const denominator = parseAmount(String(ngnUsdRate), SCALE);
  if (denominator === 0n) throw new Error('NGN_USD_RATE cannot be zero');
  return formatAmount((numerator * 10n ** BigInt(SCALE)) / denominator, SCALE);
}

/**
 * Value of a token holding: quantity (base units) × unit price (decimal string).
 * Returns a decimal string rounded to 2dp, money, so no floats anywhere.
 */
export function valueOfHolding(amountBase: bigint | string, decimals: number, unitPrice: string): string {
  const quantity = formatAmount(amountBase, decimals);
  return roundDecimals(multiplyDecimals(quantity, unitPrice), 2);
}

/** Percent change between two prices, as a signed 2dp string ("-1.42"). */
export function percentChange(from: string, to: string): string | null {
  const SCALE = 18;
  const start = parseAmount(from, SCALE);
  if (start === 0n) return null;
  const end = parseAmount(to, SCALE);

  const deltaScaled = ((end - start) * 10n ** BigInt(SCALE) * 100n) / start;
  return roundDecimals(formatAmount(deltaScaled, SCALE), 2);
}

/**
 * Random walk for the simulated testnet feed.
 *
 * Equity markets are closed for most of the hours a hackathon demo gets
 * recorded, and Chainlink publishes no equity feeds on Base Sepolia, so a
 * static price would make the chart look broken. This produces a mean-reverting
 * walk: each step is a small random move, pulled back toward the seed price so
 * a long-running demo doesn't drift to zero or to the moon.
 *
 * @param volatilityBps per-step standard deviation, in bps of current price
 * @param reversionBps  pull toward the seed price per step, in bps of the gap
 */
export function nextSimulatedPrice(
  current: bigint,
  seed: bigint,
  options: { volatilityBps?: number; reversionBps?: number; random?: () => number } = {},
): bigint {
  const volatilityBps = options.volatilityBps ?? 25; // 0.25% per 30s tick
  const reversionBps = options.reversionBps ?? 800; // close 8% of the gap each tick
  const random = options.random ?? Math.random;

  // Uniform in [-1, 1); enough shape for a demo chart, and cheap.
  const shock = random() * 2 - 1;
  const drift = (current * BigInt(Math.round(shock * volatilityBps))) / 10_000n;
  const reversion = ((seed - current) * BigInt(reversionBps)) / 10_000n;

  const next = current + drift + reversion;

  // Clamp to ±40% of seed. A judge watching for two minutes should see motion,
  // not a price that has wandered somewhere absurd.
  const floor = (seed * 60n) / 100n;
  const ceiling = (seed * 140n) / 100n;
  if (next < floor) return floor;
  if (next > ceiling) return ceiling;
  return next > 0n ? next : floor;
}
