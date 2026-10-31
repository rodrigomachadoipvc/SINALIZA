import { UserRole } from '@sinaliza/shared';
import {
  FolderTree,
  LayoutDashboard,
  ListChecks,
  LogOut,
  type LucideIcon,
  Map,
  UserCog,
  UserRound,
} from 'lucide-react';
import { Suspense, useCallback } from 'react';
import { NavLink, Outlet } from 'react-router';

import { useAuth } from '../auth/auth';
import { useInactivity } from '../auth/useInactivity';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Logo } from '../components/Logo';
import { PageLoading } from '../components/Spinner';
import { INACTIVITY_LIMIT_MS, INACTIVITY_WARNING_MS } from '../config';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/ocorrencias', label: 'Ocorrências', icon: ListChecks },
  { to: '/mapa', label: 'Mapa', icon: Map },
  { to: '/categorias', label: 'Categorias', icon: FolderTree, adminOnly: true },
  { to: '/gestores', label: 'Gestores municipais', icon: UserCog, adminOnly: true },
  { to: '/perfil', label: 'Perfil', icon: UserRound },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  CIDADAO: 'Cidadão',
  GESTOR: 'Gestor municipal',
  ADMIN: 'Administrador',
};

/** Fixed 240 px blue side menu (active item in yellow) and a top bar with the user. */
export function AppLayout() {
  const { user, logout } = useAuth();
  const onTimeout = useCallback(() => void logout('inactive'), [logout]);
  const { warning, remainingMs, stayActive } = useInactivity(
    INACTIVITY_LIMIT_MS,
    INACTIVITY_WARNING_MS,
    onTimeout,
  );
  if (!user) return null;
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || user.role === UserRole.ADMIN);

  return (
    <div className="flex min-h-screen">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-campo bg-amarelo px-4 py-2 text-azul focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar para o conteúdo
      </a>
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col bg-azul text-branco">
        <div className="flex h-20 items-center rounded-b-cartao bg-branco px-4">
          <Logo className="h-12" />
        </div>
        <nav aria-label="Menu principal" className="flex flex-col gap-1 p-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-campo px-3 font-medium ${
                  isActive ? 'bg-amarelo text-azul' : 'text-branco hover:bg-azul-pressionado'
                }`
              }
            >
              <Icon size={24} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="ml-60 flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-end gap-4 border-b border-cinza-divisoria bg-branco px-8">
          <div className="text-right">
            <p className="font-semibold">{user.name}</p>
            <p className="text-legenda text-cinza-texto">{ROLE_LABELS[user.role]}</p>
          </div>
          <Button
            variant="secondary"
            icon={<LogOut size={20} aria-hidden="true" />}
            onClick={() => void logout()}
          >
            Terminar sessão
          </Button>
        </header>
        <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-[1600px] flex-1 p-8">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <ConfirmDialog
        open={warning}
        title="A sessão vai terminar"
        message={`Por inatividade, a sessão termina dentro de ${Math.ceil(remainingMs / 1000)} segundos.`}
        confirmLabel="Continuar sessão"
        onConfirm={stayActive}
        onClose={stayActive}
      />
    </div>
  );
}
