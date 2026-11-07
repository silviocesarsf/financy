import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui/misc';
import { AuthPage } from './pages/Auth';
import { DashboardPage } from './pages/Dashboard';
import { TransactionsPage } from './pages/Transactions';
import { ImportPage } from './pages/Import';
import { RecurringPage } from './pages/Recurring';
import { ForecastPage } from './pages/Forecast';
import { InsightsPage } from './pages/Insights';
import { GoalsPage } from './pages/Goals';
import { CategoriesPage } from './pages/Categories';
import { SettingsPage } from './pages/Settings';

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner className="min-h-screen" />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="transacoes" element={<TransactionsPage />} />
        <Route path="importar" element={<ImportPage />} />
        <Route path="recorrentes" element={<RecurringPage />} />
        <Route path="previsoes" element={<ForecastPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="metas" element={<GoalsPage />} />
        <Route path="categorias" element={<CategoriesPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
