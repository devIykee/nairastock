import { useEffect, useState } from 'react';
import { Joyride, STATUS, ACTIONS, EVENTS, type EventData } from 'react-joyride';
import { tourSteps } from './steps';

const STORAGE_KEY = 'nairastock_onboarding_v1';

interface TourState {
  run: boolean;
  stepIndex: number;
}

/**
 * Zero-to-trading onboarding tour.
 *
 * Auto-starts on first login (when localStorage key is missing), then never shows
 * again unless manually triggered via the `?` icon in the nav. Skip/complete events
 * log to console (wire to your analytics provider here). Theme inherits from design
 * tokens so light/dark mode just works.
 */
export function OnboardingTour({ manualTrigger = false }: { manualTrigger?: boolean }) {
  const [state, setState] = useState<TourState>(() => {
    const completed = localStorage.getItem(STORAGE_KEY) === 'completed';
    return { run: manualTrigger || !completed, stepIndex: 0 };
  });

  useEffect(() => {
    if (manualTrigger) {
      setState({ run: true, stepIndex: 0 });
    }
  }, [manualTrigger]);

  const handleEvent = (data: EventData) => {
    const { status, action, index, type } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      localStorage.setItem(STORAGE_KEY, 'completed');
      setState({ run: false, stepIndex: 0 });

      // Analytics hook: wire to your provider (Posthog, Amplitude, etc.)
      console.log('[OnboardingTour]', {
        event: status === STATUS.FINISHED ? 'tour_completed' : 'tour_skipped',
        stepIndex: index,
        totalSteps: tourSteps.length,
      });
    } else if (type === EVENTS.STEP_AFTER && action === ACTIONS.NEXT) {
      setState((prev) => ({ ...prev, stepIndex: index + 1 }));
    } else if (type === EVENTS.STEP_AFTER && action === ACTIONS.PREV) {
      setState((prev) => ({ ...prev, stepIndex: index - 1 }));
    }
  };

  if (!state.run) return null;

  return (
    <Joyride
      steps={tourSteps}
      run={state.run}
      stepIndex={state.stepIndex}
      continuous
      onEvent={handleEvent}
      styles={{
        tooltip: {
          backgroundColor: 'var(--color-surface-strong)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.875rem',
          padding: '1rem',
          color: 'var(--color-body)',
        },
        arrow: {
          color: 'var(--color-surface-strong)',
        },
        buttonPrimary: {
          backgroundColor: 'var(--color-primary)',
          borderRadius: 'var(--radius-pill)',
          fontSize: '0.875rem',
          padding: '0.5rem 1.25rem',
        },
        buttonBack: {
          color: 'var(--color-body)',
          fontSize: '0.875rem',
        },
        buttonSkip: {
          color: 'var(--color-muted)',
          fontSize: '0.875rem',
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
        },
        floater: {
          zIndex: 10000,
        },
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip tour',
      }}
    />
  );
}
