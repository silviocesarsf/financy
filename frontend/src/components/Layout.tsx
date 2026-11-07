import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  ArrowLeftRight,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Moon,
  Repeat,
  Settings,
  Sparkles,
  Sun,
  Tags,
  Target,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/format';

const NAV = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight },
  { to: '/importar', label: 'Importar fatura', icon: Upload },
  { to: '/recorrentes', label: 'Contas fixas', icon: Repeat },
  { to: '/previsoes', label: 'Previsões', icon: LineChart },
  { to: '/insights', label: 'Insights', icon: Sparkles },
  { to: '/metas', label: 'Metas', icon: Target },
  { to: '/categorias', label: 'Categorias', icon: Tags },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

const MOBILE_NAV = [NAV[0], NAV[1], NAV[2], NAV[4]];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('financy:theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
    setDark(next);
  };
  return { dark, toggle };
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white">F</div>
      <span className="text-lg font-semibold tracking-tight">financy</span>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/70',
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const [drawer, setDrawer] = useState(false);

  const footer = (
    <div className="flex items-center gap-3 border-t border-zinc-200/70 pt-4 dark:border-zinc-800">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold dark:bg-zinc-800">
        {user?.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user?.name}</p>
        <p className="truncate text-xs text-zinc-500">{user?.email}</p>
      </div>
      <button onClick={toggle} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Alternar tema">
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <button onClick={logout} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Sair">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col justify-between border-r border-zinc-200/70 bg-white px-4 py-6 lg:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-8">
          <div className="px-2">
            <Logo />
          </div>
          <NavItems />
        </div>
        {footer}
      </aside>

      {/* Topbar mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200/70 bg-white/80 px-4 py-3 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/80">
        <Logo />
        <div className="flex items-center gap-1">
          <button onClick={toggle} className="rounded-lg p-2 text-zinc-500" aria-label="Alternar tema">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-zinc-500" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-950/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 flex-col justify-between bg-white px-4 py-5 dark:bg-zinc-900">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between px-2">
                <Logo />
                <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-zinc-500" aria-label="Fechar menu">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <NavItems onNavigate={() => setDrawer(false)} />
            </div>
            {footer}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
        <Outlet />
      </main>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-zinc-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
        {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-zinc-900 dark:text-white' : 'text-zinc-400')
            }
          >
            <Icon className="h-5 w-5" />
            {label.split(' ')[0]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
