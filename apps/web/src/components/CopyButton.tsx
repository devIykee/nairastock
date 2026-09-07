import { useState } from 'react';

/** Copy-to-clipboard with the confirmation the user needs to trust it worked. */
export function CopyButton({
  value,
  label = 'Copy',
  className = '',
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API needs a secure context; fall back to a selection so the
      // user can still copy manually rather than getting silence.
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button type="button" onClick={copy} className={`btn btn-secondary ${className}`} aria-live="polite">
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 7.5L5.5 11L12 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <rect x="4.75" y="4.75" width="7.5" height="7.5" rx="1.75" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.25 4.25v-.5A2 2 0 0 0 7.25 1.75h-3.5a2 2 0 0 0-2 2v3.5a2 2 0 0 0 2 2h.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
