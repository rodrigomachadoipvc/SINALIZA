import { UserRole } from '@sinaliza/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router';

import { ApiError } from './api/client';
import { AuthProvider, useAuth } from './auth/auth';
import { ToastProvider } from './components/Toast';
import { AppLayout } from './layout/AppLayout';
import { CategoriesPage } from './pages/CategoriesPage';
import { LoginPage } from './pages/LoginPage';
import { ManagersPage } from './pages/ManagersPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OccurrencesPage } from './pages/OccurrencesPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages';
import { ProfilePage } from './pages/ProfilePage';

// Leaflet and Recharts are heavy, so the pages that use them load on first visit.
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })));
const OccurrenceDetailPage = lazy(() =>
  import('./pages/OccurrenceDetailPage').then((m) => ({ default: m.OccurrenceDetailPage })),
);

function RequireSession({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === UserRole.ADMIN ? children : <NotFoundPage />;
}

export const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/recuperar-palavra-passe', element: <ForgotPasswordPage /> },
  { path: '/redefinir-palavra-passe', element: <ResetPasswordPage /> },
  {
    element: (
      <RequireSession>
        <AppLayout />
      </RequireSession>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'ocorrencias', element: <OccurrencesPage /> },
      { path: 'ocorrencias/:id', element: <OccurrenceDetailPage /> },
      { path: 'mapa', element: <MapPage /> },
      {
        path: 'categorias',
        element: (
          <RequireAdmin>
            <CategoriesPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'gestores',
        element: (
          <RequireAdmin>
            <ManagersPage />
          </RequireAdmin>
        ),
      },
      { path: 'perfil', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (404, 403…) will not change by retrying.
        retry: (count, error) =>
          count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

/** Providers shared by the app and the tests. */
export function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

export function App() {
  return (
    <Providers client={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  );
}
