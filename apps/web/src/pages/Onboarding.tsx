import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, auth } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { AssetIcon } from '@/components/AssetIcon';
import { ErrorNotice } from '@/components/ErrorNotice';
import { formatNgn, formatPercent, percentTone } from '@/lib/format';

/** The three-step mechanic, stated plainly. Copy carries the argument here. */
const STEPS = [
  {
    n: '1',
    t: 'Fund in naira',
    d: 'Deposit naira and receive cNGN, a fully-backed stablecoin where ₦1 is one token. No dollar account, no wire, no waiting on a correspondent bank.',
  },
  {
    n: '2',
    t: 'Buy tokenized equity',
    d: 'Swap cNGN for AAPLc, NVDAc, METAc or GOOGLc through an on-chain liquidity pool. Fractional by default, priced off a Chainlink feed, open outside NYSE hours.',
  },
  {
    n: '3',
    t: 'Hold it yourself',
    d: 'Shares land as an ERC-20 balance at your own address. We never take custody, and every position links out to a block explorer so you can check our arithmetic.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What’s a tokenized stock, really?',
    a: 'Coinbase’s B20 tokenized stocks (AAPL, NVDA, META, GOOGL) are ERC-20 assets on Base that track their NYSE-listed counterparts. In this demo the underlying is a mock ERC-20, since the B20 series is mainnet-only, but the mechanics are identical.',
  },
  {
    q: 'Why “own in your own wallet”?',
    a: 'A self-custody holder holds an ERC-20 balance at their own address. That’s the difference between an asset you can move anywhere on-chain and a row in a brokerage database. Everything here is verifiable on the explorer.',
  },
  {
    q: 'Is the naira rail real?',
    a: 'No. The deposit is a mocked on/off-ramp standing in for a licensed cNGN partner. You mint demo cNGN rather than moving real naira. A production build wires that leg to a licensed partner.',
  },
  {
    q: 'What does it cost?',
    a: 'A V2-style 30 bps pool fee, like any on-chain liquidity pool, plus gas on Base.',
  },
];

export function Onboarding() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (auth.isAuthenticated) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const { data: stocks } = useQuery({
    queryKey: ['stocks'],
    queryFn: api.stocks.list,
    refetchInterval: 30_000,
  });

  const createWallet = async () => {
    setCreating(true);
    setError(null);
    try {
      const created = await api.wallet.create();
      auth.set(created.session);
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'Could not create a wallet. Try again.'));
      setCreating(false);
    }
  };

  return (
    <div>
      {/* Hero, dark, title-case, Coinbase-institutional */}
      <section className="relative overflow-hidden" style={{ backgroundColor: theme === 'dark' ? 'var(--color-surface-dark)' : '#0a0b0d' }}>
        <div className="shell py-20 md:py-28">
          <div className="max-w-3xl">
            <h1 className="display-mega" style={{ color: theme === 'dark' ? 'var(--color-on-dark)' : '#f9fafb' }}>
              Own real US stocks,<br />
              in naira, on Base.
            </h1>
            <p className="mt-6 max-w-xl" style={{ color: theme === 'dark' ? 'var(--color-on-dark-soft)' : 'rgba(249, 250, 251, 0.76)', fontSize: '1.125rem', lineHeight: 1.6 }}>
              Fund with cNGN. Trade tokenized equities any hour. Hold them in your
              own wallet, an on-chain balance you can verify, not a database IOU.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={createWallet}
                disabled={creating}
                className="btn btn-hero btn-primary"
                data-tour="create-wallet"
              >
                {creating ? 'Creating your wallet…' : 'Create my self-custody wallet'}
              </button>
              <button
                type="button"
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="btn btn-hero btn-outline-dark"
              >
                How it works
              </button>
            </div>
            {error ? (
              <div className="mt-6">
                <ErrorNotice error={error} onRetry={createWallet} />
              </div>
            ) : null}
            <p className="mt-6 text-xs" style={{ color: 'var(--color-on-dark-soft)' }}>
              Demo wallet, testnet funds, no KYC. Nothing here is investment advice.
            </p>
          </div>
        </div>
      </section>

      {/* Ticker strip */}
      {stocks && stocks.length > 0 && (
        <section className="py-6" style={{ borderBottom: '1px solid var(--color-hairline)' }}>
          <div className="shell">
            <div className="flex justify-between gap-4 overflow-x-auto">
              {stocks.map((stock) => {
                const tone = percentTone(stock.price?.change24hPct ?? null);
                return (
                  <div key={stock.symbol} className="flex items-center gap-2.5">
                    <AssetIcon symbol={stock.symbol} size={36} />
                    <div>
                      <p className="title-sm" style={{ color: 'var(--color-ink)' }}>
                        {stock.symbol}
                      </p>
                      <p className="tnum text-xs" style={{ color: 'var(--color-muted)' }}>
                        {formatNgn(stock.price?.priceNgn ?? 0)}
                        <span
                          className="ml-1.5"
                          style={{
                            color:
                              tone === 'flat'
                                ? 'var(--color-muted-soft)'
                                : tone === 'up'
                                  ? 'var(--color-up)'
                                  : 'var(--color-down)',
                          }}
                        >
                          {formatPercent(stock.price?.change24hPct ?? null)}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* How-it-works band, 96px rhythm, white on white */}
      <section id="how-it-works" className="bg-white py-[96px]">
        <div className="shell">
          <div className="max-w-2xl">
            <p className="caption-strong mb-3 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
              How it works
            </p>
            <h2 className="display-md" style={{ color: 'var(--color-ink)' }}>
              You never hand over the keys.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="card card-soft">
                <p className="display-sm" style={{ color: 'var(--color-primary)' }}>
                  {s.n}
                </p>
                <h3 className="title-sm mt-4" style={{ color: 'var(--color-ink)' }}>
                  {s.t}
                </h3>
                <p className="mt-2" style={{ color: 'var(--color-body)' }}>
                  {s.d}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <button type="button" onClick={createWallet} disabled={creating} className="btn btn-primary">
              {creating ? 'Creating…' : 'Get started'}
            </button>
          </div>
        </div>
      </section>

      {/* FAQ, soft-gray elevation band, honest about what is simulated */}
      <section className="py-[96px]" style={{ backgroundColor: 'var(--color-surface-soft)' }}>
        <div className="shell">
          <div className="max-w-2xl">
            <p className="caption-strong mb-3 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
              Questions
            </p>
            <h2 className="display-md" style={{ color: 'var(--color-ink)' }}>
              What this is, and what it isn’t.
            </h2>
          </div>
          <dl className="mt-12 grid gap-6 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="card">
                <dt className="title-sm" style={{ color: 'var(--color-ink)' }}>
                  {item.q}
                </dt>
                <dd className="mt-2" style={{ color: 'var(--color-body)' }}>
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Pre-footer CTA band, the second and last blue moment on the page */}
      <section className="py-[96px]" style={{ backgroundColor: 'var(--color-surface-dark)' }}>
        <div className="shell text-center">
          <h2 className="display-md mx-auto max-w-2xl" style={{ color: 'var(--color-on-dark)' }}>
            Take custody of your own portfolio.
          </h2>
          <p className="mx-auto mt-5 max-w-xl" style={{ color: 'var(--color-on-dark-soft)' }}>
            A funded demo wallet, ready in one click. No email, no KYC, nothing to uninstall.
          </p>
          <div className="mt-8 flex justify-center">
            <button type="button" onClick={createWallet} disabled={creating} className="btn btn-hero btn-primary">
              {creating ? 'Creating your wallet…' : 'Create my self-custody wallet'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
