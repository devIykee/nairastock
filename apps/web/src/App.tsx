import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { auth } from '@/lib/api';
import { Onboarding } from '@/pages/Onboarding';
import { Dashboard } from '@/pages/Dashboard';
import { Trade } from '@/pages/Trade';
import { StockDetail } from '@/pages/StockDetail';
import { Footer } from '@/components/Footer';
import { TopNav } from '@/components/TopNav';
import { OnboardingTour } from '@/components/OnboardingTour';

export default function App() {
  const [showTour, setShowTour] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <OnboardingTour manualTrigger={showTour} />
      <TopNav>
        {auth.isAuthenticated && (
          <button
            type="button"
            onClick={() => setShowTour(true)}
            className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-surface-soft)]"
            aria-label="Restart tour"
            title="Restart tour"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M8 5.5v3.25M8 11h.01"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </TopNav>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Onboarding />} />
          <Route
            path="/dashboard"
            element={auth.isAuthenticated ? <Dashboard /> : <Navigate to="/" replace />}
          />
          <Route
            path="/trade"
            element={auth.isAuthenticated ? <Trade /> : <Navigate to="/" replace />}
          />
          <Route
            path="/stock/:symbol"
            element={auth.isAuthenticated ? <StockDetail /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
