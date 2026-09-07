import type { TokenBalance } from '@nairastock/shared';
import { AssetIcon } from './AssetIcon';
import { TokenBalanceLink, AddressLink } from './ExplorerLink';
import { formatNgn, formatQuantity, shorten } from '@/lib/format';

/**
 * Asset rows for the portfolio dashboard and trade screen.
 *
 * The "Verify on explorer" link on every holding is the self-custody proof
 * point, it deep-links the explorer to this holder's balance of this token, so
 * a judge can see the positions are real on-chain, not a database row.
 */
export function BalanceList({
  balances,
  onDark = false,
  onSelect,
  showVerified = false,
  walletAddress,
}: {
  balances: TokenBalance[];
  onDark?: boolean;
  onSelect?: (symbol: string) => void;
  /** Renders the explorer proof link inline on each row. */
  showVerified?: boolean;
  /** Needed for the proof link; taken from the balances' wallet otherwise. */
  walletAddress?: string;
}) {
  if (balances.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: onDark ? 'var(--color-on-dark-soft)' : 'var(--color-muted)' }}>
        No positions yet.
      </p>
    );
  }

  return (
    <div className="row-divide">
      {balances.map((balance) => (
        <BalanceRow
          key={balance.token.symbol}
          balance={balance}
          onDark={onDark}
          onSelect={onSelect}
          showVerified={showVerified}
          walletAddress={walletAddress ?? ''}
        />
      ))}
    </div>
  );
}

function BalanceRow({
  balance,
  onDark,
  onSelect,
  showVerified,
  walletAddress,
}: {
  balance: TokenBalance;
  onDark?: boolean;
  onSelect?: (symbol: string) => void;
  showVerified?: boolean;
  walletAddress: string;
}) {
  const { token, amount, valueNgn } = balance;
  const inner = (
    <>
      <AssetIcon symbol={token.symbol} size={40} onDark={onDark} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="title-sm truncate" style={{ color: onDark ? '#fff' : 'var(--color-ink)' }}>
            {token.symbol}
          </span>
          <span className="hidden truncate text-xs sm:inline" style={{ color: onDark ? 'var(--color-on-dark-soft)' : 'var(--color-muted)' }}>
            {token.name}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs" style={{ color: onDark ? 'var(--color-on-dark-soft)' : 'var(--color-body)' }}>
          {balance.price
            ? `${formatNgn(balance.price.priceNgn)} / ${token.symbol}`
            : '-'}
        </p>
      </div>

      <div className="flex flex-col items-end gap-0.5 text-right">
        <span className="tnum text-[15px] font-medium" style={{ color: onDark ? '#fff' : 'var(--color-ink)' }}>
          {formatQuantity(amount.display)} {token.symbol}
        </span>
        <span className="tnum text-xs" style={{ color: onDark ? 'var(--color-on-dark-soft)' : 'var(--color-muted)' }}>
          {formatNgn(valueNgn)}
        </span>
      </div>
    </>
  );

  const row = onSelect ? (
    <button
      type="button"
      onClick={() => onSelect(token.symbol)}
      className="flex w-full items-center gap-4 py-4 text-left"
      style={{ background: 'transparent', border: 0, cursor: 'pointer' }}
    >
      {inner}
    </button>
  ) : (
    <div className="flex w-full items-center gap-4 py-4">{inner}</div>
  );

  return (
    <div>
      {row}
      {showVerified && walletAddress && (
        <div className="-mt-2 pb-4 pl-[56px]" style={{ color: 'var(--color-body)' }}>
          <TokenBalanceLink tokenAddress={token.address} holderAddress={walletAddress} compact />
        </div>
      )}
    </div>
  );
}

/** Read-only display of an address with its explorer link, used in dashboards. */
export function WalletLink({ address, onDark = false }: { address: string; onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tnum text-sm" style={{ color: onDark ? 'var(--color-on-dark-soft)' : 'var(--color-body)' }}>
        {shorten(address)}
      </span>
      <AddressLink address={address} label="View on explorer" compact />
    </span>
  );
}
