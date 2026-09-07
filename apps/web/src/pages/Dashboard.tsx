import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { BalanceList, WalletLink } from '@/components/BalanceList';
import { ErrorNotice } from '@/components/ErrorNotice';
import { TransactionList } from '@/components/TransactionList';
import { formatNgn, formatUsd } from '@/lib/format';
import { useState } from 'react';

/**
 * Dashboard, the "my money" home. Total portfolio value in naira (the money
 * the user thinks in) with USD secondary, an explicit cash balance, holdings
 * with live prices, and a recent-activity feed where each trade links to the
 * explorer. Nothing here is read from a database ledger; every balance is
 * fetched from chain.
 */
export function Dashboard() {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: portfolio,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['portfolio'],
    queryFn: api.portfolio.get,
    refetchInterval: 15_000,
  });

  const onSelectStock = (symbol: string) => navigate(`/stock/${symbol}`);

  if (isLoading && !portfolio) {
    return (
      <div className="shell py-10">
        <div className="skeleton h-8 w-56" />
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shell py-10">
        <ErrorNotice error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!portfolio) return null;

  const { cash, holdings, transactions } = portfolio;
  const allBalances = [cash, ...holdings];

  return (
    <div className="shell py-8 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="caption-strong uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
            Portfolio
          </p>
          <h1 className="display-sm mt-1" style={{ color: 'var(--color-ink)' }}>
            {formatNgn(portfolio.totalValueNgn)}
          </h1>
          <p className="tnum mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
            ≈ {formatUsd(portfolio.totalValueUsd)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <WalletLink address={portfolio.walletAddress} />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              setRefreshing(true);
              await refetch();
              setRefreshing(false);
            }}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Top stat band */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="card card-soft">
          <p className="caption-strong uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
            Cash balance
          </p>
          <p className="tnum display-md mt-2" style={{ color: 'var(--color-ink)' }}>
            {formatNgn(cash.valueNgn)}
          </p>
          <p className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
            {cash.amount.display} {cash.token.symbol}
          </p>
        </div>
        <div className="card card-soft">
          <p className="caption-strong uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
            Invested
          </p>
          <p className="tnum display-md mt-2" style={{ color: 'var(--color-ink)' }}>
            {formatNgn(portfolio.investedValueNgn)}
          </p>
          <p className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
            {holdings.length} positions
          </p>
        </div>
        <div className="card card-soft">
          <p className="caption-strong uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
            Gas (ETH)
          </p>
          <p className="tnum display-md mt-2" style={{ color: 'var(--color-ink)' }}>
            {portfolio.gasBalance.display}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            For transaction fees on {portfolio.networkLabel}
          </p>
        </div>
      </div>

      {/* Holdings + recent activity */}
      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="title-md" style={{ color: 'var(--color-ink)' }}>
                Holdings
              </h2>
              <button type="button" onClick={() => navigate('/trade')} className="btn btn-text">
                Trade
              </button>
            </div>
            <BalanceList balances={allBalances} onSelect={onSelectStock} showVerified walletAddress={portfolio.walletAddress} />
          </div>
        </section>

        <section className="lg:col-span-2">
          <div className="card">
            <h2 className="title-md mb-2" style={{ color: 'var(--color-ink)' }}>
              Recent activity
            </h2>
            <TransactionList rows={transactions.slice(0, 8)} />
          </div>
        </section>
      </div>
    </div>
  );
}
