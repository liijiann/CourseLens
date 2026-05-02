import type { ReactElement } from 'react';
import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { getStoredToken } from '@/lib/api';

const AdminPage = lazy(() => import('./pages/AdminPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RechargePage = lazy(() => import('./pages/RechargePage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const StudyPage = lazy(() => import('./pages/StudyPage'));

function ProtectedRoute({ children }: { children: ReactElement }) {
  const token = getStoredToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PublicRoute({ children }: { children: ReactElement }) {
  const token = getStoredToken();
  if (token) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function RouteFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white text-slate-600 dark:bg-[var(--dark-bg)] dark:text-[var(--dark-muted)]">
      Loading...
    </main>
  );
}

export default function App() {
  useEffect(() => {
    const root = document.documentElement;
    const saved = localStorage.getItem('courselens:theme');
    const theme = saved === 'dark' || saved === 'warm' || saved === 'light' ? saved : 'warm';

    root.classList.remove('dark', 'warm');
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'warm') {
      root.classList.add('warm');
    }
  }, []);

  return (
    <Routes>
      <Route
        path="/login"
        element={(
          <PublicRoute>
            <Suspense fallback={<RouteFallback />}>
              <LoginPage />
            </Suspense>
          </PublicRoute>
        )}
      />
      <Route
        path="/register"
        element={(
          <PublicRoute>
            <Suspense fallback={<RouteFallback />}>
              <RegisterPage />
            </Suspense>
          </PublicRoute>
        )}
      />
      <Route
        path="/"
        element={(
          <ProtectedRoute>
            <Suspense fallback={<RouteFallback />}>
              <HomePage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/study/:sessionId"
        element={(
          <ProtectedRoute>
            <Suspense fallback={<RouteFallback />}>
              <StudyPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin"
        element={(
          <ProtectedRoute>
            <Suspense fallback={<RouteFallback />}>
              <AdminPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/recharge"
        element={(
          <ProtectedRoute>
            <Suspense fallback={<RouteFallback />}>
              <RechargePage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
