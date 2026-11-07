import { useState, type FormEvent } from 'react';
import { BarChart3, ShieldCheck, Upload } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button, Field, Input } from '../components/ui/controls';

export function AuthPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-zinc-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 font-bold">F</div>
          <span className="text-xl font-semibold">financy</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">Seu dinheiro, organizado sem esforço.</h2>
          <p className="mt-4 text-zinc-400">Importe a fatura do Nubank, entenda para onde vai cada real e planeje os próximos meses.</p>
          <ul className="mt-10 space-y-4 text-sm text-zinc-300">
            <li className="flex items-center gap-3"><Upload className="h-4 w-4 text-brand-400" /> Importação automática de faturas e extratos</li>
            <li className="flex items-center gap-3"><BarChart3 className="h-4 w-4 text-brand-400" /> Previsões, insights e salário comprometido</li>
            <li className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-brand-400" /> Seus dados ficam apenas com você</li>
          </ul>
        </div>
        <p className="text-xs text-zinc-500">© {new Date().getFullYear()} Financy</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 font-bold text-white">F</div>
            <span className="text-xl font-semibold">financy</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h1>
          <p className="mt-1 text-sm text-zinc-500">Entre para ver suas finanças.</p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
            <Field label="E-mail">
              <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
            </Field>
            <Field label="Senha">
              <Input
                required
                type="password"
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
              />
            </Field>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
            <Button type="submit" loading={loading} className="mt-2 w-full">
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
