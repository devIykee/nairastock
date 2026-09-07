import { ApiError } from '@/lib/api';

/**
 * Failure surface. The API returns a machine-readable `code` with every error,
 * so this maps the ones a user can act on to a concrete next step instead of
 * restating the message. A demo that says "slippage exceeded, re-quote and try
 * again" is a demo that looks like it was built by someone who has traded.
 */
const REMEDIES: Record<string, string> = {
  INSUFFICIENT_BALANCE: 'Fund your wallet with naira first, or reduce the amount.',
  INSUFFICIENT_GAS: 'Your wallet needs a little ETH to pay for the transaction.',
  SLIPPAGE_EXCEEDED: 'The price moved while you were confirming. Fetch a fresh quote, or widen your slippage tolerance.',
  INSUFFICIENT_LIQUIDITY: 'This pool is too thin for that size. Try a smaller trade.',
  QUOTE_EXPIRED: 'That quote is stale. Refresh it before confirming.',
  CHAIN_UNAVAILABLE: 'The chain is unreachable. Check that your local node or RPC endpoint is running.',
  PRICE_UNAVAILABLE: 'The pricing job has not published a price for this token yet. Retry in a moment.',
  SIGNING_UNAVAILABLE: 'This wallet signs client-side, so the server cannot submit for it.',
  NETWORK: 'The API is not responding. Start it with `pnpm dev`.',
};

export function ErrorNotice({
  error,
  onRetry,
  className = '',
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  if (!error) return null;

  const apiError = error instanceof ApiError ? error : null;
  const message = error instanceof Error ? error.message : String(error);
  const remedy = apiError?.code ? REMEDIES[apiError.code] : undefined;

  return (
    <div
      role="alert"
      className={`rounded-[16px] px-4 py-3.5 ${className}`}
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-down) 6%, transparent)',
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-down) 22%, transparent)',
      }}
    >
      <div className="flex items-start gap-3">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mt-0.5 shrink-0" aria-hidden="true">
          <circle cx="9" cy="9" r="7.25" stroke="var(--color-down)" strokeWidth="1.5" />
          <path d="M9 5.5v4.25M9 12.25v.5" stroke="var(--color-down)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--color-ink)]">{message}</p>
          {remedy && <p className="mt-1 text-sm text-[var(--color-body)]">{remedy}</p>}
          {apiError?.code && (
            <p className="mt-1.5 font-mono text-xs text-[var(--color-muted-soft)]">{apiError.code}</p>
          )}
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn btn-text mt-1 text-sm">
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
