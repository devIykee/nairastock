import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SwapQuote, SwapResult, TokenWithPrice } from '@nairastock/shared';
import { api } from '@/lib/api';
import { AssetIcon } from '@/components/AssetIcon';
import { ErrorNotice } from '@/components/ErrorNotice';
import { TxLink } from '@/components/ExplorerLink';
import { PriceCell } from '@/components/PriceCell';
import { formatNgn, formatPercent, formatQuantity } from '@/lib/format';

const CASH = 'cNGN';

/** Slippage presets in bps. 100 = 1%, matching DEFAULT_SLIPPAGE_BPS on the API. */
const SLIPPAGE_PRESETS = [50, 100, 300] as const;

/** Deposit shortcuts, in naira. */
const DEPOSIT_PRESETS = ['100000', '500000', '2000000'] as const;

type Side = 'BUY' | 'SELL';

/**
 * Trade, the buy/sell surface.
 *
 * Quotes are advisory: the naira number shown is what the pool would pay at this
 * instant, and the trade is submitted with an on-chain `amountOutMin` floor
 * derived from the chosen slippage. If the pool moves past that floor the swap
 * reverts rather than filling at a worse price, and the revert is mapped back to
 * a `SLIPPAGE_EXCEEDED` code the user can act on.
 */
export function Trade() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const [side, setSide] = useState<Side>('BUY');
  const [symbol, setSymbol] = useState(params.get('symbol') ?? '');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [quoteError, setQuoteError] = useState<unknown>(null);

  const { data: stocks } = useQuery({ queryKey: ['stocks'], queryFn: api.stocks.list, refetchInterval: 30_000 });
  const {
    data: portfolio,
    refetch: refetchPortfolio,
  } = useQuery({ queryKey: ['portfolio'], queryFn: api.portfolio.get, refetchInterval: 15_000 });

  // Default to the first stock once the list arrives.
  useEffect(() => {
    if (!symbol && stocks && stocks.length > 0) setSymbol(stocks[0].symbol);
  }, [stocks, symbol]);

  const selected: TokenWithPrice | undefined = useMemo(
    () => stocks?.find((s) => s.symbol === symbol),
    [stocks, symbol],
  );

  const tokenIn = side === 'BUY' ? CASH : symbol;
  const tokenOut = side === 'BUY' ? symbol : CASH;

  const cashBalance = portfolio?.cash.amount.display ?? '0';
  const positionBalance =
    portfolio?.holdings.find((h) => h.token.symbol === symbol)?.amount.display ?? '0';
  const available = side === 'BUY' ? cashBalance : positionBalance;

  const debouncedAmount = useDebounced(amount, 350);

  // A quote is only meaningful for a positive amount on a chosen pair.
  const quoteEnabled =
    Boolean(symbol) && Number(debouncedAmount) > 0 && Number.isFinite(Number(debouncedAmount));

  const {
    data: quote,
    isFetching: quoting,
    error: quoteFetchError,
  } = useQuery({
    queryKey: ['quote', tokenIn, tokenOut, debouncedAmount, slippageBps],
    queryFn: () => api.swap.quote({ tokenIn, tokenOut, amountIn: debouncedAmount, slippageBps }),
    enabled: quoteEnabled,
    // Quotes go stale fast; refresh while the user is deciding.
    refetchInterval: 12_000,
    retry: false,
  });

  const execute = useMutation({
    mutationFn: () => api.swap.execute({ tokenIn, tokenOut, amountIn: amount, slippageBps }),
    onSuccess: async (swap) => {
      setResult(swap);
      setAmount('');
      setQuoteError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
        queryClient.invalidateQueries({ queryKey: ['quote'] }),
      ]);
    },
  });

  const overspending = Number(amount) > Number(available);
  const canSubmit =
    quoteEnabled && Boolean(quote) && !quoting && !overspending && !execute.isPending;

  return (
    <div className="shell py-8 md:py-10">
      {/* Live price for the selected asset, so the quote has context */}
      <div className="mx-auto mb-6 flex max-w-5xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {symbol && <AssetIcon symbol={symbol} size={44} />}
          <div>
            <h1 className="title-lg" style={{ color: 'var(--color-ink)' }}>
              {selected?.name ?? 'Trade'}
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {symbol ? `${symbol} · tokenized equity on ${portfolio?.networkLabel ?? 'Base'}` : 'Loading assets…'}
            </p>
          </div>
        </div>
        <PriceCell price={selected?.price ?? null} size="lg" align="end" />
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SwapCard
            side={side}
            onSideChange={(next) => {
              setSide(next);
              setAmount('');
              setResult(null);
              setQuoteError(null);
            }}
            stocks={stocks ?? []}
            symbol={symbol}
            onSymbolChange={(next) => {
              setSymbol(next);
              setResult(null);
            }}
            amount={amount}
            onAmountChange={(next) => {
              setAmount(next);
              setResult(null);
            }}
            available={available}
            quote={quote ?? null}
            quoting={quoting}
            slippageBps={slippageBps}
            onSlippageChange={setSlippageBps}
            overspending={overspending}
            canSubmit={canSubmit}
            submitting={execute.isPending}
            onSubmit={() => {
              setQuoteError(null);
              execute.mutate();
            }}
          />

          {(execute.error || quoteFetchError || quoteError) != null && (
            <div className="mt-4">
              <ErrorNotice error={execute.error ?? quoteFetchError ?? quoteError} />
            </div>
          )}

          {result && (
            <div className="mt-4">
              <SwapReceipt result={result} onDone={() => navigate('/dashboard')} />
            </div>
          )}
        </section>

        <aside className="lg:col-span-2">
          <DepositCard
            cashBalance={cashBalance}
            onDeposited={async () => {
              await refetchPortfolio();
              await queryClient.invalidateQueries({ queryKey: ['quote'] });
            }}
          />
        </aside>
      </div>
    </div>
  );
}

/** Debounce so a quote isn't requested on every keystroke. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function SwapCard({
  side,
  onSideChange,
  stocks,
  symbol,
  onSymbolChange,
  amount,
  onAmountChange,
  available,
  quote,
  quoting,
  slippageBps,
  onSlippageChange,
  overspending,
  canSubmit,
  submitting,
  onSubmit,
}: {
  side: Side;
  onSideChange: (side: Side) => void;
  stocks: TokenWithPrice[];
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  available: string;
  quote: SwapQuote | null;
  quoting: boolean;
  slippageBps: number;
  onSlippageChange: (bps: number) => void;
  overspending: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const unitLabel = side === 'BUY' ? CASH : symbol;

  return (
    <div className="card" data-tour="swap-form">
      {/* Buy / Sell toggle */}
      <div
        className="inline-flex rounded-[100px] p-1"
        style={{ backgroundColor: 'var(--color-surface-strong)' }}
        role="tablist"
        aria-label="Trade direction"
      >
        {(['BUY', 'SELL'] as const).map((option) => {
          const active = side === option;
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSideChange(option)}
              className="rounded-[100px] px-5 py-2 text-sm font-semibold transition-colors"
              style={{
                backgroundColor: active ? 'var(--color-canvas)' : 'transparent',
                color: active ? 'var(--color-ink)' : 'var(--color-muted)',
                boxShadow: active ? 'var(--shadow-soft)' : 'none',
              }}
            >
              {option === 'BUY' ? 'Buy' : 'Sell'}
            </button>
          );
        })}
      </div>

      {/* Asset picker */}
      <div className="mt-6">
        <label className="caption-strong uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
          {side === 'BUY' ? 'Asset to buy' : 'Asset to sell'}
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {stocks.map((stock) => {
            const active = stock.symbol === symbol;
            return (
              <button
                key={stock.symbol}
                type="button"
                onClick={() => onSymbolChange(stock.symbol)}
                aria-pressed={active}
                className="inline-flex items-center gap-2 rounded-[100px] py-2 pl-2 pr-4 text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: active ? 'var(--color-primary)' : 'var(--color-surface-soft)',
                  color: active ? 'var(--color-on-primary)' : 'var(--color-ink)',
                }}
              >
                <AssetIcon symbol={stock.symbol} size={24} />
                {stock.symbol}
              </button>
            );
          })}
        </div>
      </div>
      {/* Amount entry */}
      <div className="mt-6 rounded-[16px] p-5" style={{ backgroundColor: 'var(--color-surface-soft)' }}>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="trade-amount" className="caption-strong uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
            You pay
          </label>
          <button
            type="button"
            className="btn btn-text text-xs"
            onClick={() => onAmountChange(available)}
            style={{ minHeight: 0, padding: 0 }}
          >
            Max
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="trade-amount"
            className="input input-amount"
            style={{ backgroundColor: 'transparent' }}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(event) => {
              // Decimal strings only, no float parsing anywhere in a money path.
              const next = event.target.value.replace(/[^0-9.]/g, '');
              if (next.split('.').length > 2) return;
              onAmountChange(next);
            }}
            aria-describedby="trade-available"
          />
          <span className="title-sm shrink-0" style={{ color: 'var(--color-body)' }}>
            {unitLabel}
          </span>
        </div>
        <p id="trade-available" className="tnum mt-2 text-xs" style={{ color: 'var(--color-muted)' }}>
          Available {formatQuantity(available)} {unitLabel}
          {side === 'BUY' && Number(available) > 0 ? ` · ${formatNgn(available)}` : ''}
        </p>
        {overspending && (
          <p className="mt-2 text-xs" style={{ color: 'var(--color-down)' }}>
            That’s more than you hold. Reduce the amount or deposit more naira.
          </p>
        )}
      </div>

      {/* Slippage presets */}
      <div className="mt-5">
        <span className="caption-strong uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
          Max slippage
        </span>
        <div className="mt-2 flex gap-2">
          {SLIPPAGE_PRESETS.map((bps) => {
            const active = bps === slippageBps;
            return (
              <button
                key={bps}
                type="button"
                aria-pressed={active}
                onClick={() => onSlippageChange(bps)}
                className="rounded-[100px] px-4 py-1.5 text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: active ? 'var(--color-ink)' : 'var(--color-surface-soft)',
                  color: active ? 'var(--color-on-dark)' : 'var(--color-body)',
                }}
              >
                {bps / 100}%
              </button>
            );
          })}
        </div>
      </div>

      <QuoteSummary quote={quote} quoting={quoting} side={side} />

      <button
        type="button"
        className="btn btn-primary btn-block mt-6"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {submitting
          ? 'Submitting to the chain…'
          : side === 'BUY'
            ? `Buy ${symbol || 'stock'}`
            : `Sell ${symbol || 'stock'}`}
      </button>
      <p className="mt-3 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
        Settles on-chain from your own wallet. A 30 bps pool fee applies.
      </p>
    </div>
  );
}

/**
 * The quote breakdown. Price impact is called out above 1% because that is the
 * point where the pool, not the fee, is the dominant cost of the trade.
 */
function QuoteSummary({ quote, quoting, side }: { quote: SwapQuote | null; quoting: boolean; side: Side }) {
  if (!quote) {
    return (
      <div className="mt-5 min-h-[92px] rounded-[16px] p-5" style={{ backgroundColor: 'var(--color-surface-soft)' }}>
        {quoting ? (
          <>
            <div className="skeleton h-6 w-40" />
            <div className="skeleton mt-2 h-4 w-56" />
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Enter an amount to see what the pool pays right now.
          </p>
        )}
      </div>
    );
  }

  const impact = Number(quote.priceImpactPct);
  const heavyImpact = Number.isFinite(impact) && impact >= 1;

  return (
    <div
      className="mt-5 rounded-[16px] p-5"
      style={{ backgroundColor: 'var(--color-surface-soft)', opacity: quoting ? 0.6 : 1 }}
      aria-live="polite"
      aria-busy={quoting}
    >
      <p className="caption-strong uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        You receive
      </p>
      <p className="tnum display-sm mt-1" style={{ color: 'var(--color-ink)' }}>
        {formatQuantity(quote.amountOut.display)}{' '}
        <span className="text-base" style={{ color: 'var(--color-body)' }}>
          {quote.tokenOut.symbol}
        </span>
      </p>
      {side === 'SELL' && (
        <p className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
          {formatNgn(quote.amountOut.display)}
        </p>
      )}

      <dl className="mt-4 grid gap-2 text-sm">
        <Row label="Rate">
          <span className="tnum">
            1 {quote.tokenIn.symbol} = {formatQuantity(quote.executionPrice, 8)} {quote.tokenOut.symbol}
          </span>
        </Row>
        <Row label="Price impact">
          <span className="tnum" style={{ color: heavyImpact ? 'var(--color-down)' : 'var(--color-body)' }}>
            {formatPercent(quote.priceImpactPct)}
          </span>
        </Row>
        <Row label={`Minimum at ${quote.slippageBps / 100}% slippage`}>
          <span className="tnum">
            {formatQuantity(quote.minAmountOut.display)} {quote.tokenOut.symbol}
          </span>
        </Row>
        <Row label="Pool fee">
          <span className="tnum">{quote.feeBps / 100}%</span>
        </Row>
      </dl>

      {heavyImpact && (
        <p className="mt-3 text-xs" style={{ color: 'var(--color-down)' }}>
          This trade is large relative to pool depth, so it moves the price against you. Consider a smaller size.
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--color-muted)' }}>{label}</dt>
      <dd style={{ color: 'var(--color-ink)' }}>{children}</dd>
    </div>
  );
}

/** Post-trade receipt. The explorer link is the point: proof, not a toast. */
function SwapReceipt({ result, onDone }: { result: SwapResult; onDone: () => void }) {
  const bought = result.side === 'BUY';

  return (
    <div className="card" style={{ boxShadow: 'inset 0 0 0 1px var(--color-up)' }}>
      <div className="flex items-start gap-3">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
          <circle cx="11" cy="11" r="9.25" stroke="var(--color-up)" strokeWidth="1.5" />
          <path d="M7 11.4l2.6 2.6L15 8.6" stroke="var(--color-up)" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <div className="min-w-0 flex-1">
          <h3 className="title-md" style={{ color: 'var(--color-ink)' }}>
            {bought ? 'Purchase settled' : 'Sale settled'}
          </h3>
          <p className="tnum mt-1 text-sm" style={{ color: 'var(--color-body)' }}>
            {formatQuantity(result.amountIn.display)} {result.tokenInSymbol} →{' '}
            {formatQuantity(result.amountOut.display)} {result.tokenOutSymbol}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
            {bought
              ? `${result.tokenOutSymbol} is now held at your own address.`
              : 'Naira proceeds are back in your cash balance.'}
            {result.blockNumber !== null ? ` Block ${result.blockNumber}.` : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <TxLink txHash={result.txHash} />
            <button type="button" className="btn btn-text text-sm" onClick={onDone}>
              Back to portfolio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The naira on-ramp. Mocked: it mints demo cNGN rather than moving real money,
 * and says so, a licensed partner would own this leg in production.
 */
function DepositCard({
  cashBalance,
  onDeposited,
}: {
  cashBalance: string;
  onDeposited: () => Promise<void>;
}) {
  const [ngnAmount, setNgnAmount] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);

  const deposit = useMutation({
    mutationFn: () => api.onramp.deposit(ngnAmount),
    onSuccess: async (res) => {
      setReceipt(res.cngnAmount.display);
      setNgnAmount('');
      await onDeposited();
    },
  });

  return (
    <div className="card">
      <h2 className="title-md" style={{ color: 'var(--color-ink)' }}>
        Add naira
      </h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-body)' }}>
        Deposit naira and receive cNGN at ₦1 per token.
      </p>

      <p className="caption-strong mt-5 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        Cash balance
      </p>
      <p className="tnum display-sm" style={{ color: 'var(--color-ink)' }}>
        {formatNgn(cashBalance)}
      </p>

      <div className="mt-5">
        <label htmlFor="deposit-amount" className="caption-strong uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
          Amount
        </label>
        <input
          id="deposit-amount"
          className="input mt-2"
          inputMode="decimal"
          autoComplete="off"
          placeholder="500000"
          value={ngnAmount}
          onChange={(event) => {
            const next = event.target.value.replace(/[^0-9.]/g, '');
            if (next.split('.').length > 2) return;
            setNgnAmount(next);
            setReceipt(null);
          }}
        />
        <div className="mt-2 flex gap-2">
          {DEPOSIT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setNgnAmount(preset);
                setReceipt(null);
              }}
              className="rounded-[100px] px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: 'var(--color-surface-soft)', color: 'var(--color-body)' }}
            >
              {formatNgn(preset, { compact: true })}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-secondary btn-block mt-5"
        disabled={deposit.isPending || !(Number(ngnAmount) > 0)}
        onClick={() => deposit.mutate()}
      >
        {deposit.isPending ? 'Depositing…' : 'Deposit naira'}
      </button>

      {deposit.error != null && (
        <div className="mt-4">
          <ErrorNotice error={deposit.error} />
        </div>
      )}

      {receipt && (
        <p className="tnum mt-4 text-sm" style={{ color: 'var(--color-up)' }}>
          + {formatQuantity(receipt)} cNGN added to your wallet.
        </p>
      )}

      <p className="mt-5 text-xs" style={{ color: 'var(--color-muted)' }}>
        Demo rail. No real naira moves, this mints test cNGN so the trade flow is
        exercisable end to end. A production build wires this to a licensed cNGN partner.
      </p>
    </div>
  );
}
