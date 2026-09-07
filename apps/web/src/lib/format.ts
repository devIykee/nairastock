/**
 * Display formatting.
 *
 * Every number the user sees passes through here, so rounding is consistent
 * between the dashboard hero, the trade preview, and the transaction list.
 * Amounts arrive as decimal strings and stay strings until the final render,  * `Number()` appears only inside Intl calls, where the value is already rounded
 * to a display precision.
 */
import { roundDecimals } from '@nairastock/shared';

const NGN_FORMATTER = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'symbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NGN_COMPACT = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'symbol',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNgn(value: string | number, options: { compact?: boolean } = {}): string {
  const n = typeof value === 'number' ? value : Number(roundDecimals(String(value || '0'), 2));
  if (!Number.isFinite(n)) return '₦0.00';
  return options.compact ? NGN_COMPACT.format(n) : NGN_FORMATTER.format(n);
}

export function formatUsd(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(roundDecimals(String(value || '0'), 2));
  if (!Number.isFinite(n)) return '$0.00';
  return USD_FORMATTER.format(n);
}

/**
 * Token quantities. Shares are shown to 6dp, enough to see a fractional
 * position clearly, and short enough not to wrap on a phone. Trailing zeros are
 * dropped so a whole number reads as "5" and not "5.000000".
 */
export function formatQuantity(value: string, maxDecimals = 6): string {
  const trimmed = roundDecimals(value || '0', maxDecimals);
  const [whole, fraction] = trimmed.split('.');
  const groupedWhole = Number(whole).toLocaleString('en-US');
  if (!fraction) return groupedWhole;
  const cleaned = fraction.replace(/0+$/, '');
  return cleaned ? `${groupedWhole}.${cleaned}` : groupedWhole;
}

/** Signed percentage with an explicit + for gains. */
export function formatPercent(value: string | null): string {
  if (value === null || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function percentTone(value: string | null): 'up' | 'down' | 'flat' {
  if (value === null || value === '') return 'flat';
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

export function shorten(value: string, lead = 6, tail = 4): string {
  if (!value) return '';
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/** Relative time for the transaction list, "2m ago" reads better than a stamp. */
export function timeAgo(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(isoDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

export function formatClockTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

/** Initials for the circular asset plate: "AAPLc" → "AA", "cNGN" → "₦". */
export function assetInitials(symbol: string): string {
  if (symbol === 'cNGN') return '₦';
  return symbol.replace(/c$/, '').slice(0, 4);
}
