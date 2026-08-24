import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, Plus, UserRoundCheck, X } from 'lucide-react';
import { Company, User } from '../types';
import { userService } from '../services/userService';
import { storeService } from '../services/storeService';

type Props = {
  currentUser: User;
  company: Company;
};

const DirectorAccessPanel: React.FC<Props> = ({ currentUser, company }) => {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    if (currentUser.role !== 'admin') return;
    await storeService.syncDirectorScope(company.id);
    const all = await userService.getAll(company.id);
    setUsers(all);
  };

  useEffect(() => {
    if (open) load();
  }, [open, company.id]);

  const directors = useMemo(
    () => users.filter(user => user.role === 'director' && user.companyId === company.id),
    [users, company.id]
  );

  const saveDirector = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || !cleanEmail) return;

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await storeService.syncDirectorScope(company.id);
      const existing = await userService.getUser(cleanEmail);
      if (existing && existing.companyId && existing.companyId !== company.id) {
        throw new Error('Este e-mail já pertence a outra empresa no DealMaster.');
      }

      const next: User = {
        ...(existing || {} as User),
        id: cleanEmail,
        email: cleanEmail,
        name: cleanName,
        role: 'director',
        status: 'active',
        companyId: company.id,
        companyPlan: company.plan,
        companyStatus: company.status,
        companyModuleOverrides: company.moduleOverrides,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };

      delete next.storeId;
      delete next.goals;
      await userService.save(next);
      setName('');
      setEmail('');
      setMessage('Acesso de Diretoria criado. O usuário abrirá direto no Panorama do Grupo.');
      await load();
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível criar o acesso da Diretoria.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user: User) => {
    setSaving(true);
    setError('');
    try {
      await userService.save({ ...user, status: user.status === 'active' ? 'inactive' : 'active' });
      await load();
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível alterar o acesso.');
    } finally {
      setSaving(false);
    }
  };

  if (currentUser.role !== 'admin') return null;

  return <>
    <button
      onClick={() => setOpen(true)}
      className="fixed right-24 top-5 z-[532] flex h-10 items-center gap-2 rounded-xl border border-amber-300/20 bg-[#20242c] px-3 text-xs font-bold text-amber-200 shadow-xl"
    >
      <UserRoundCheck size={15}/> ACESSOS
    </button>

    {open && <div className="fixed inset-0 z-[560] grid place-items-center bg-black/75 p-4 backdrop-blur-md" onClick={() => setOpen(false)}>
      <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#20242c] p-5 text-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-300 text-black"><Landmark size={20}/></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.15em] text-amber-300">Acesso da Diretoria</p>
              <h3 className="mt-1 text-xl font-semibold">{company.name}</h3>
              <p className="mt-1 text-xs text-zinc-500">Somente panorama executivo. Sem negociação, comissão ou operação individual.</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={18}/></button>
        </div>

        <form onSubmit={saveDirector} className="mt-6 grid gap-3 sm:grid-cols-[1fr_1.25fr_auto]">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do diretor" className="h-11 rounded-xl border border-white/10 bg-black/15 px-3 text-sm outline-none focus:border-amber-300/40"/>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@empresa.com.br" className="h-11 rounded-xl border border-white/10 bg-black/15 px-3 text-sm outline-none focus:border-amber-300/40"/>
          <button disabled={saving || !name.trim() || !email.trim()} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-sm font-bold text-black disabled:opacity-40"><Plus size={15}/>{saving ? 'Salvando...' : 'Criar acesso'}</button>
        </form>

        {message && <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[.05] p-3 text-sm text-emerald-200">{message}</div>}
        {error && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[.05] p-3 text-sm text-red-200">{error}</div>}

        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.13em] text-zinc-500">Diretores cadastrados</p><span className="text-xs text-zinc-600">{directors.length}</span></div>
          <div className="mt-3 space-y-2">
            {directors.map(user => <div key={user.email} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 p-3">
              <div><p className="text-sm font-semibold">{user.name}</p><p className="mt-1 text-xs text-zinc-500">{user.email}</p></div>
              <button disabled={saving} onClick={() => toggleStatus(user)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${user.status === 'active' ? 'border-emerald-400/20 text-emerald-300' : 'border-zinc-600/30 text-zinc-400'}`}>{user.status === 'active' ? 'ATIVO' : 'REATIVAR'}</button>
            </div>)}
            {!directors.length && <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-zinc-500">Nenhum acesso de Diretoria cadastrado para este grupo.</div>}
          </div>
        </div>
      </div>
    </div>}
  </>;
};

export default DirectorAccessPanel;
