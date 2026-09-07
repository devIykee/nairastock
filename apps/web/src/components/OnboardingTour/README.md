# OnboardingTour

Zero-to-trading guided tour using [react-joyride](https://docs.react-joyride.com/).

## Behavior

- **Auto-start**: runs on first login when `localStorage.getItem('nairastock_onboarding_v1')` is `null`.
- **Manual trigger**: call `<OnboardingTour manualTrigger={true} />` to restart the tour (e.g., from a `?` icon in the nav).
- **Persistence**: once completed or skipped, the tour never auto-starts again unless the user clears localStorage.
- **Analytics**: skip/complete events log to console. Wire to Posthog, Amplitude, or your provider in `OnboardingTour.tsx` line 34.

## Steps

Defined in `steps.ts`. Each step anchors to a `data-tour` attribute in the target component:

| Target                      | Component        | Description                              |
|-----------------------------|------------------|------------------------------------------|
| `[data-tour="create-wallet"]` | `Onboarding.tsx` | Wallet creation CTA                      |
| `[data-tour="nav-portfolio"]` | `TopNav.tsx`     | Dashboard link                           |
| `[data-tour="nav-trade"]`     | `TopNav.tsx`     | Trade link                               |
| `[data-tour="swap-form"]`     | `Trade.tsx`      | The AMM swap surface                     |
| `[data-tour="portfolio-table"]` | `Dashboard.tsx` | Holdings table                           |
| `[data-tour="explorer-link"]` | `BalanceList.tsx` | Block explorer link on a balance row   |

## Theming

Tour inherits design tokens from `index.css` so light/dark mode works automatically. Override via the `styles` prop if needed.

## Usage

```tsx
import { OnboardingTour } from '@/components/OnboardingTour';

export function App() {
  const [showTour, setShowTour] = useState(false);

  return (
    <>
      <OnboardingTour manualTrigger={showTour} />
      <button onClick={() => setShowTour(true)}>Restart tour</button>
      {/* rest of app */}
    </>
  );
}
```
