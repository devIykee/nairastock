/**
 * The NairaStock mark: three ascending bars crossed by the naira double-stroke.
 *
 * Drawn as geometry rather than a glyph so it renders identically without the
 * brand font, and kept to two colors so it inverts onto the dark hero band by
 * swapping `plate`. The public/favicon.svg is the same artwork.
 */
export function Logo({
  size = 32,
  plate = 'var(--color-primary)',
  glyph = '#ffffff',
  className = '',
}: {
  size?: number;
  /** The rounded plate behind the mark. */
  plate?: string;
  /** The bars and crossbars. */
  glyph?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="NairaStock"
    >
      <rect width="40" height="40" rx="11" fill={plate} />
      <g fill={glyph}>
        {/* Ascending bars, the market. */}
        <rect x="10.4" y="21.6" width="4" height="8.4" rx="1.6" />
        <rect x="18" y="16.4" width="4" height="13.6" rx="1.6" />
        <rect x="25.6" y="10" width="4" height="20" rx="1.6" />
        {/* The naira double-stroke, which is what makes it read as ₦. */}
        <rect x="8.6" y="21.9" width="22.8" height="2.2" rx="1.1" />
        <rect x="8.6" y="25.6" width="22.8" height="2.2" rx="1.1" />
      </g>
    </svg>
  );
}

/** Logo + wordmark, as used in the top nav and the footer. */
export function Wordmark({
  size = 32,
  onDark = false,
  className = '',
}: {
  size?: number;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Logo size={size} plate={onDark ? '#ffffff' : 'var(--color-primary)'} glyph={onDark ? '#0a0b0d' : '#ffffff'} />
      <span
        className="title-sm"
        style={{ color: onDark ? 'var(--color-on-dark)' : 'var(--color-ink)', letterSpacing: '-0.01em' }}
      >
        NairaStock
      </span>
    </span>
  );
}
