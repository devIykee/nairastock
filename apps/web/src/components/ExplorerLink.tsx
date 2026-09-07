/**
 * Explorer links, the self-custody proof point.
 *
 * A judge should be able to click through from any balance or transaction to a
 * block explorer and see the asset sitting at the user's own address. When the
 * chain has no browsable explorer (local anvil), the component renders the
 * reason rather than a dead link: pretending there's a link to click would be
 * exactly the kind of thing this product is arguing against.
 */
import { addressUrl, tokenBalanceUrl, txUrl } from '@nairastock/shared';
import { chainMeta, config } from '@/lib/config';

interface Props {
  className?: string;
  label?: string;
  compact?: boolean;
}

function LinkOut({ href, label, className, compact }: Props & { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`link-inline inline-flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'} ${className ?? ''}`}
    >
      {label}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0">
        <path d="M4.5 2h5.5v5.5M10 2L2.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </a>
  );
}

function Unavailable({ compact, what }: { compact?: boolean; what: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'} text-[var(--color-muted-soft)]`}
      title={`${chainMeta.label} (chain ${config.chainId}) has no block explorer. Deploy against Base Sepolia to make ${what} verifiable in a recording.`}
    >
      no explorer on {chainMeta.label}
    </span>
  );
}

export function TxLink({ txHash, ...props }: Props & { txHash: string }) {
  const href = txUrl(config.chainId, txHash, config.explorerBaseUrl);
  if (!href) return <Unavailable compact={props.compact} what="transactions" />;
  return <LinkOut {...props} href={href} label={props.label ?? `View on ${chainMeta.explorerName}`} />;
}

export function AddressLink({ address, ...props }: Props & { address: string }) {
  const href = addressUrl(config.chainId, address, config.explorerBaseUrl);
  if (!href) return <Unavailable compact={props.compact} what="this wallet" />;
  return <LinkOut {...props} href={href} label={props.label ?? `View wallet on ${chainMeta.explorerName}`} />;
}

/** Deep link to one holder's balance of one token, the strongest proof. */
export function TokenBalanceLink({
  tokenAddress,
  holderAddress,
  ...props
}: Props & { tokenAddress: string; holderAddress: string }) {
  const href = tokenBalanceUrl(config.chainId, tokenAddress, holderAddress, config.explorerBaseUrl);
  if (!href) return <Unavailable compact={props.compact} what="this holding" />;
  return <LinkOut {...props} href={href} label={props.label ?? `Verify on ${chainMeta.explorerName}`} />;
}
