import type { Step } from 'react-joyride';

/**
 * Onboarding tour steps: zero to trading in six stops.
 *
 * Each step anchors to a `data-tour` attribute in the actual component. The copy
 * is terse and action-oriented (not explanatory prose), matching the tone of the
 * rest of the app.
 */
export const tourSteps: Step[] = [
  {
    target: '[data-tour="create-wallet"]',
    content: 'Create your self-custody wallet. The private key never leaves your device.',
    placement: 'bottom',
    showProgress: true,
  },
  {
    target: '[data-tour="nav-portfolio"]',
    content: 'Check your portfolio: balances and recent transactions live on-chain.',
    placement: 'bottom',
    showProgress: true,
  },
  {
    target: '[data-tour="nav-trade"]',
    content: 'Swap cNGN for tokenized stocks. Each trade settles on Base in seconds.',
    placement: 'bottom',
    showProgress: true,
  },
  {
    target: '[data-tour="swap-form"]',
    content: 'Pick an asset, enter an amount, and preview the swap. The price comes from the AMM pool.',
    placement: 'right',
    showProgress: true,
  },
  {
    target: '[data-tour="portfolio-table"]',
    content: 'Your holdings table updates live. Click any row to see price history and transfer controls.',
    placement: 'top',
    showProgress: true,
  },
  {
    target: '[data-tour="explorer-link"]',
    content: 'Every balance links to the block explorer. Verify it yourself, that is the whole argument for self-custody.',
    placement: 'left',
    showProgress: true,
  },
];
