import type { ChainInfo } from '@nairastock/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { chainMeta } from '@/lib/config';
import { Wordmark } from './Logo';

/**
 * Footer. The legal band is deliberately openly honest about what this is: a
 * hackathon demo on testnet with a server-held key, not a licensed brokerage.
 * That candour is part of the pitch to judges.
 */
export function Footer() {
  const { data: chain } = useQuery<ChainInfo>({
    queryKey: ['chain'],
    queryFn: api.chain,
    staleTime: Infinity,
  });

  const label = chain?.networkLabel ?? chainMeta.label;

  return (
    <footer className="mt-auto">
      <div style={{ borderTop: '1px solid var(--color-hairline-soft)' }}>
        <div className="shell py-10">
          <div className="flex flex-col justify-between gap-8 md:flex-row">
            <div className="max-w-sm">
              <Wordmark size={28} className="mb-3" />
              <p className="text-sm" style={{ color: 'var(--color-body)' }}>
                Own real US stocks with naira, on Base, in your own wallet rather than a
                custodian's ledger.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-12 text-sm">
              <div>
                <p className="caption-strong mb-3 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                  Tradeable
                </p>
                <ul className="space-y-2" style={{ color: 'var(--color-body)' }}>
                  {['AAPLc', 'NVDAc', 'METAc', 'GOOGLc'].map((s) => (
                    <li key={s}>
                      <a href={`/stock/${s}`} className="no-underline hover:underline" style={{ color: 'inherit' }}>
                        {s}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="caption-strong mb-3 uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                  Build
                </p>
                <ul className="space-y-2" style={{ color: 'var(--color-body)' }}>
                  <li>
                    <a href="/api/docs" target="_blank" rel="noreferrer" className="no-underline hover:underline" style={{ color: 'inherit' }}>
                      API docs
                    </a>
                  </li>
                  <li>
                    <a href="/api/health" target="_blank" rel="noreferrer" className="no-underline hover:underline" style={{ color: 'inherit' }}>
                      Health
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="shell pb-8">
        <p className="caption" style={{ color: 'var(--color-muted-soft)', fontSize: '0.75rem', lineHeight: 1.6 }}>
          Testnet research demo on {label}. Not a licensed brokerage or investment adviser; no real naira is
          moved, prices are simulated, and the demo wallet's key is held by the demo server. Nothing here is
          financial advice. NairaStock is not affiliated with Coinbase, the Africa Stablecoin Consortium, or
          Chainlink. © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
