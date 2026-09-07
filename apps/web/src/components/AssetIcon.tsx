import { useState } from 'react';
import { assetInitials } from '@/lib/format';

/**
 * Circular asset plate.
 *
 * Prefers the real brand mark from /tokens/<symbol>.svg and falls back to ticker
 * initials if that file is missing, so a deployment without the art still renders
 * something deliberate rather than a broken-image icon.
 */
export function AssetIcon({
  symbol,
  size = 40,
  onDark = false,
  className = '',
}: {
  symbol: string;
  size?: number;
  onDark?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const isCash = symbol === 'cNGN';

  if (!failed) {
    return (
      <img
        src={`/tokens/${symbol.toLowerCase()}.svg`}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={`shrink-0 rounded-full ${className}`}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={`asset-icon ${onDark ? 'asset-icon-dark' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: isCash ? size * 0.46 : Math.min(size * 0.3, 13),
        // cNGN gets the one non-brand accent in the system: a naira glyph on a
        // faint green plate, marking "this is cash, not a position".
        ...(isCash && !onDark
          ? { backgroundColor: 'color-mix(in srgb, var(--color-up) 12%, transparent)', color: 'var(--color-up)' }
          : {}),
      }}
      aria-hidden="true"
    >
      {assetInitials(symbol)}
    </span>
  );
}
