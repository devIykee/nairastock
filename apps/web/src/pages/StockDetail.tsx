import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { PricePoint } from '@nairastock/shared';
import { api } from '@/lib/api';
import { AssetIcon } from '@/components/AssetIcon';
import { ErrorNotice } from '@/components/ErrorNotice';
import { TokenBalanceLink } from '@/components/ExplorerLink';
import { PriceCell } from '@/components/PriceCell';
import { formatClockTime, formatNgn, formatQuantity, formatUsd, percentTone } from '@/lib/format';

/** Chart ranges. Hours map to the API's `?hours=` window. */
const RANGES = [
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 24 * 7 },
] as const;

/**
 * StockDetail, one asset: its live price, a history sparkline, the user's
 * position, and an explorer deep-link proving that position is an on-chain
 * balance at their own address rather than a number we are asserting.
 */
export function StockDetail() {
  const { symbol = '' } = useParams();
  const navigate = useNavigate();
  const [hours, setHours] = useState<number>(24);

  const {
    data: stock,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['stock', symbol],
    queryFn: () => api.stocks.detail(symbol),
    refetchInterval: 30_000,
    enabled: Boolean(symbol),
  });

  const { data: history } = useQuery({
    queryKey: ['history', symbol, hours],
    queryFn: () => api.stocks.history(symbol, hours),
    refetchInterval: 30_000,
    enabled: Boolean(symbol),
  });

  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: api.portfolio.get });
  const position = portfolio?.holdings.find((h) => h.token.symbol === symbol);

  if (isLoading && !stock) {
    return (
      <div className="shell py-10">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton mt-6 h-[280px]" />
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

  if (!stock) return null;

  return (
    <div className="shell py-8 md:py-10">
      <button type="button" className="btn btn-text text-sm" onClick={() => navigate('/dashboard')}>
        ← Portfolio
      </button>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-center gap-4">
          <AssetIcon symbol={stock.symbol} size={56} />
          <div>
            <h1 className="display-sm" style={{ color: 'var(--color-ink)' }}>
              {stock.name}
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {stock.symbol} · tokenized equity
            </p>
          </div>
        </div>
        <PriceCell price={stock.price} size="lg" align="end" />
      </div>

      {/* Chart */}
      <section className="card mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="title-md" style={{ color: 'var(--color-ink)' }}>
            Price history
          </h2>
          <div className="flex gap-2">
            {RANGES.map((range) => {
              const active = range.hours === hours;
              return (
                <button
                  key={range.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setHours(range.hours)}
                  className="rounded-[100px] px-3.5 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--color-ink)' : 'var(--color-surface-soft)',
                    color: active ? 'var(--color-on-dark)' : 'var(--color-body)',
                  }}
                >
                  {range.label}
                </button>
              );
            })}
          </div>
        </div>
        <PriceChart points={history ?? []} tone={percentTone(stock.price?.change24hPct ?? null)} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Position + the self-custody proof */}
        <section className="card lg:col-span-3">
          <h2 className="title-md" style={{ color: 'var(--color-ink)' }}>
            Your position
          </h2>

          {position && Number(position.amount.display) > 0 ? (
            <>
              <p className="tnum display-sm mt-3" style={{ color: 'var(--color-ink)' }}>
                {formatQuantity(position.amount.display)}{' '}
                <span className="text-base" style={{ color: 'var(--color-body)' }}>
                  {stock.symbol}
                </span>
              </p>
              <p className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                {formatNgn(position.valueNgn)}
              </p>

              <div
                className="mt-5 rounded-[16px] p-4"
                style={{ backgroundColor: 'var(--color-surface-soft)' }}
              >
                <p className="title-sm" style={{ color: 'var(--color-ink)' }}>
                  Verify this position on the explorer
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-body)' }}>
                  This balance lives at your address on-chain, not in our database. Check it
                  yourself. That is the whole argument for self-custody.
                </p>
                <div className="mt-3">
                  {portfolio && (
                    <TokenBalanceLink
                      tokenAddress={stock.address}
                      holderAddress={portfolio.walletAddress}
                      label="Verify this position on the explorer"
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm" style={{ color: 'var(--color-body)' }}>
              You don’t hold {stock.symbol} yet.
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/trade?symbol=${stock.symbol}`)}
            >
              Buy {stock.symbol}
            </button>
            {position && Number(position.amount.display) > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(`/trade?symbol=${stock.symbol}`)}
              >
                Sell
              </button>
            )}
          </div>
        </section>

        {/* About */}
        <section className="card lg:col-span-2">
          <h2 className="title-md" style={{ color: 'var(--color-ink)' }}>
            About
          </h2>
          <p className="mt-3 text-sm" style={{ color: 'var(--color-body)' }}>
            {stock.blurb ?? `${stock.name} (${stock.symbol}) is a tokenized equity tracking its NYSE-listed counterpart.`}
          </p>
          <dl className="mt-5 grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: 'var(--color-muted)' }}>Contract</dt>
              <dd className="tnum" style={{ color: 'var(--color-ink)' }}>
                {stock.address.slice(0, 6)}…{stock.address.slice(-4)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: 'var(--color-muted)' }}>Decimals</dt>
              <dd className="tnum" style={{ color: 'var(--color-ink)' }}>
                {stock.decimals}
              </dd>
            </div>
            {stock.price?.simulated && (
              <div className="flex items-center justify-between gap-3">
                <dt style={{ color: 'var(--color-muted)' }}>Price feed</dt>
                <dd style={{ color: 'var(--color-ink)' }}>Simulated</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}

/**
 * Single-series price area chart.
 *
 * Tone follows the 24h direction, so the fill agrees with the change figure above
 * it. Both tones clear CVD separation against each other and the white surface;
 * the green sits under 3:1 contrast, so the value is always also reachable as
 * text, the axis labels, the tooltip, and the hero price, never by color alone.
 * Y is domain-fitted rather than zero-based: on a 24h equity window a zero
 * baseline flattens the entire day into a single line.
 */
function PriceChart({ points, tone }: { points: PricePoint[]; tone: 'up' | 'down' | 'flat' }) {
  if (points.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No snapshots in this window yet. The pricing job writes one every 30 seconds.
        </p>
      </div>
    );
  }

  const stroke =
    tone === 'up' ? 'var(--color-up)' : tone === 'down' ? 'var(--color-down)' : 'var(--color-muted)';
  const gradientId = `price-fill-${tone}`;

  const data = points.map((p) => ({
    t: p.timestamp,
    label: formatClockTime(p.timestamp),
    ngn: Number(p.priceNgn),
    usd: p.priceUsd,
  }));

  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis
            domain={['dataMin', 'dataMax']}
            width={72}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickFormatter={(value: number) => formatNgn(value, { compact: true })}
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-hairline)', strokeWidth: 1 }}
            content={<PriceTooltip />}
          />
          <Area
            type="monotone"
            dataKey="ngn"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: stroke, stroke: 'var(--color-canvas)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Value leads, label follows, the reader already knows the series. */
function PriceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { label: string; ngn: number; usd: string } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  return (
    <div
      className="rounded-[12px] px-3 py-2"
      style={{
        backgroundColor: 'var(--color-surface-dark)',
        color: 'var(--color-on-dark)',
        boxShadow: 'var(--shadow-lifted)',
      }}
    >
      <p className="tnum text-sm">{formatNgn(point.ngn)}</p>
      <p className="tnum text-xs" style={{ color: 'var(--color-on-dark-soft)' }}>
        {formatUsd(point.usd)} · {point.label}
      </p>
    </div>
  );
}
