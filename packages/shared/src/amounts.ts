/**
 * Amount handling shared by the API and the web app.
 *
 * Every on-chain amount that crosses the wire is carried as a pair of strings:
 * `base` (integer, token base units, the value the EVM actually sees) and
 * `display` (human decimal string). Nothing is ever a JS `number`: 1e18-scale
 * integers exceed Number.MAX_SAFE_INTEGER, and naira/USD valuations are money.
 * Formatting/parsing lives here so both sides round identically.
 */

export interface TokenAmount {
  /** Integer string in token base units, e.g. "1500000000000000000". */
  base: string;
  /** Human decimal string, e.g. "1.5". */
  display: string;
  decimals: number;
}

const TEN = 10n;

function pow10(n: number): bigint {
  return TEN ** BigInt(n);
}

/**
 * Parses a human decimal string into base units. Truncates (never rounds up)
 * beyond `decimals` so a parsed amount can never exceed what the user typed,  * important when the value becomes a transfer amount.
 */
export function parseAmount(input: string, decimals: number): bigint {
  const trimmed = String(input ?? '').trim();
  if (trimmed === '') return 0n;
  if (!/^-?\d*(\.\d*)?$/.test(trimmed)) {
    throw new Error(`"${input}" is not a valid decimal amount`);
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', fraction = ''] = unsigned.split('.');

  const paddedFraction = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  const magnitude = BigInt(whole === '' ? '0' : whole) * pow10(decimals) + BigInt(paddedFraction === '' ? '0' : paddedFraction);

  return negative ? -magnitude : magnitude;
}

/** Renders base units as a human decimal string with trailing zeros stripped. */
export function formatAmount(value: bigint | string, decimals: number): string {
  const raw = typeof value === 'bigint' ? value : BigInt(value || '0');
  const negative = raw < 0n;
  const magnitude = negative ? -raw : raw;

  const divisor = pow10(decimals);
  const whole = magnitude / divisor;
  const fraction = magnitude % divisor;

  let out = whole.toString();
  if (fraction > 0n) {
    const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
    out = `${out}.${fractionStr}`;
  }
  return negative ? `-${out}` : out;
}

export function toTokenAmount(value: bigint | string, decimals: number): TokenAmount {
  const base = (typeof value === 'bigint' ? value : BigInt(value || '0')).toString();
  return { base, display: formatAmount(base, decimals), decimals };
}

export function zeroAmount(decimals: number): TokenAmount {
  return { base: '0', display: '0', decimals };
}

/**
 * Fixed-point money math on decimal strings, used for USD/NGN valuations where
 * float drift would show up as a wrong hero number on the dashboard.
 * `scale` is the number of decimals kept internally (18 is plenty for fiat).
 */
export const MONEY_SCALE = 18;

export function multiplyDecimals(a: string, b: string, scale = MONEY_SCALE): string {
  const product = parseAmount(a, scale) * parseAmount(b, scale);
  return formatAmount(product / pow10(scale), scale);
}

export function addDecimals(a: string, b: string, scale = MONEY_SCALE): string {
  return formatAmount(parseAmount(a, scale) + parseAmount(b, scale), scale);
}

export function compareDecimals(a: string, b: string, scale = MONEY_SCALE): -1 | 0 | 1 {
  const left = parseAmount(a, scale);
  const right = parseAmount(b, scale);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Rounds a decimal string to `places` decimals, half-up, for display only. */
export function roundDecimals(value: string, places: number): string {
  const scaled = parseAmount(value, places + 1);
  const negative = scaled < 0n;
  const magnitude = negative ? -scaled : scaled;
  const lastDigit = magnitude % 10n;
  const rounded = magnitude / 10n + (lastDigit >= 5n ? 1n : 0n);
  return formatAmount(negative ? -rounded : rounded, places);
}

/** Basis points (1 bp = 0.01%) applied to base units, floored. */
export function applyBps(value: bigint, bps: number): bigint {
  return (value * BigInt(Math.round(bps))) / 10_000n;
}

/** Subtracts a bps tolerance, used to turn amountOut into minAmountOut. */
export function subtractBps(value: bigint, bps: number): bigint {
  return value - applyBps(value, bps);
}
