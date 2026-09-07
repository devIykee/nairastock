import { Navigate, Route, Routes } from 'react-router-dom';
import { auth } from '@/lib/api';
import { Onboarding } from '@/pages/Onboarding';
import { Dashboard } from '@/pages/Dashboard';
import { Trade } from '@/pages/Trade';
import { StockDetail } from '@/pages/StockDetail';
import { Footer } from '@/components/Footer';
import { TopNav } from '@/components/TopNav';

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
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
