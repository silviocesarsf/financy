import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { User } from '../lib/types';
import { Card, CardTitle, PageHeader } from '../components/ui/misc';
import { Button, Field, Input, MoneyInput } from '../components/ui/controls';
import { useToast } from '../components/ui/Toast';

export function SettingsPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [profile, setProfile] = useState({ name: user!.name, monthlyIncome: String(user!.monthlyIncome || ''), payday: String(user!.payday) });
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });

  const saveProfile = useMutation({
    mutationFn: () =>
      api.put<User>('/auth/profile', {
        name: profile.name,
        monthlyIncome: Number(profile.monthlyIncome.replace(',', '.')) || 0,
        payday: Number(profile.payday),
      }),
    onSuccess: async (u) => {
      setUser(u);
      await Promise.all(['dashboard', 'forecast', 'insights'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast('Perfil atualizado');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const savePwd = useMutation({
    mutationFn: () => api.put('/auth/password', pwd),
    onSuccess: () => {
      setPwd({ currentPassword: '', newPassword: '' });
      toast('Senha alterada');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const submit = (fn: () => void) => (e: FormEvent) => {
    e.preventDefault();
    fn();
  };

  return (
    <>
      <PageHeader title="Configurações" subtitle="Seus dados e preferências." />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardTitle>Perfil e renda</CardTitle>
          <form onSubmit={submit(() => saveProfile.mutate())} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" className="sm:col-span-2">
              <Input required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Salário líquido mensal" hint="Base para salário comprometido e previsões.">
              <MoneyInput value={profile.monthlyIncome} onChange={(v) => setProfile({ ...profile, monthlyIncome: v })} />
            </Field>
            <Field label="Dia do pagamento">
              <Input type="number" min={1} max={31} value={profile.payday} onChange={(e) => setProfile({ ...profile, payday: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={saveProfile.isPending}>Salvar</Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardTitle>Alterar senha</CardTitle>
          <form onSubmit={submit(() => savePwd.mutate())} className="grid gap-4 sm:grid-cols-2">
            <Field label="Senha atual">
              <Input required type="password" autoComplete="current-password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />
            </Field>
            <Field label="Nova senha">
              <Input required type="password" minLength={6} autoComplete="new-password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" loading={savePwd.isPending}>Alterar senha</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
