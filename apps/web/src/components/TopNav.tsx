import { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '@/lib/api';
import { chainMeta } from '@/lib/config';
import { useTheme } from '@/lib/theme';
import { shorten } from '@/lib/format';
import { Wordmark } from './Logo';
import { CopyButton } from './CopyButton';

/**
 * Top navigation. Light shell on the white canvas: the logo wordmark, the wallet
 * address when signed in, and a sign-out affordance. Sticky so a scrolling demo
 * never loses the address it's verifying on the explorer.
 */
export function TopNav({ children }: PropsWithChildren) {
  const address = auth.address;
  const { toggle, theme } = useTheme();

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md"
      style={{ backgroundColor: 'rgba(255,255,255,0.82)', borderBottom: '1px solid var(--color-hairline)' }}
    >
      <div className="shell flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link to="/" className="no-underline" data-tour="brand">
            <Wordmark size={32} />
          </Link>
          <nav className="hidden items-center gap-6 sm:flex" aria-label="Primary">
            <Link
              to="/dashboard"
              className="nav-link no-underline"
              style={{ fontSize: '0.875rem', fontWeight: 500 }}
              data-tour="nav-portfolio"
            >
              Dashboard
            </Link>
            <Link
              to="/trade"
              className="nav-link no-underline"
              style={{ fontSize: '0.875rem', fontWeight: 500 }}
              data-tour="nav-trade"
            >
              Trade
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            className="flex size-9 items-center justify-center rounded-full transition-colors"
            style={{ backgroundColor: 'var(--color-surface-soft)' }}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M13.3 13.3l-1.06-1.06M3.76 3.76L2.7 2.7M13.3 2.7l-1.06 1.06M3.76 12.24L2.7 13.3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M14 8.34A6.5 6.5 0 017.66 2 6.5 6.5 0 108 14a6.48 6.48 0 006-5.66z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          {address ? (
            <div className="flex items-center gap-2 rounded-full border px-1.5 py-1" style={{ borderColor: 'var(--color-hairline)' }}>
              <span className="tnum pl-1.5 text-sm" style={{ color: 'var(--color-body)' }}>
                {shorten(address)}
              </span>
              <CopyButton value={address} label="" className="!min-h-0 !rounded-full !px-2 !py-1 !text-xs" />
              {children}
            </div>
          ) : (
            <Link to="/" className="btn btn-primary">
              Get started
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function SignOutButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        auth.clear();
        window.location.assign('/');
      }}
      className={`btn btn-text ${className}`}
      title={`Connected to ${chainMeta.label}`}
    >
      Sign out
    </button>
  );
}
