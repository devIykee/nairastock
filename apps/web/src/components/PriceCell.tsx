import type { TokenPrice } from '@nairastock/shared';
import { formatNgn, formatPercent, formatUsd, percentTone } from '@/lib/format';

/**
 * A stock's current price with its 24h change, the hero number on the trade
 * and detail screens. Naira leads (that's the money the user thinks in), with
 * USD secondary; the change tone is color-only, never a background fill.
 */
export function PriceCell({
  price,
  size = 'md',
  align = 'end',
}: {
  price: TokenPrice | null;
  size?: 'md' | 'lg';
  /** Right-aligned inside list rows, left-aligned as a standalone hero number. */
  align?: 'start' | 'end';
}) {
  if (!price) {
    return (
      <span className="tnum text-sm" style={{ color: 'var(--color-muted-soft)' }}>
,       </span>
    );
  }

  const tone = percentTone(price.change24hPct);
  const changeColor =
    tone === 'flat' ? 'var(--color-muted-soft)' : tone === 'up' ? 'var(--color-up)' : 'var(--color-down)';
  const arrow = tone === 'flat' ? '·' : tone === 'up' ? '▲' : '▼';

  const moneySize = size === 'lg' ? 'text-2xl' : 'text-lg';
  const subSize = size === 'lg' ? 'text-sm' : 'text-xs';

  return (
    <span
      className={`tnum flex flex-col gap-0.5 ${align === 'end' ? 'items-end' : 'items-start'}`}
      style={{ color: 'var(--color-ink)' }}
    >
      <span className={moneySize}>
        {formatNgn(price.priceNgn)}
        <span className={`ml-2 ${subSize}`} style={{ color: changeColor }}>
          {arrow} {formatPercent(price.change24hPct)}
        </span>
      </span>
      <span className={subSize} style={{ color: 'var(--color-muted)' }}>
        ≈ {formatUsd(price.priceUsd)}
      </span>
    </span>
  );
}
