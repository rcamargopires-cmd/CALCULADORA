import React, { useEffect, useMemo, useState } from 'react';
import { Building, CheckCircle2, ChevronRight, Plus, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { Company, CompanyPlan, Store, User } from '../types';
import { companyIdForUser, companyService, DEFAULT_COMPANY, DEFAULT_COMPANY_ID } from '../services/companyService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from '../services/companyScopeService';
import { DEFAULT_STORE_ID, storeCompanyId, storeService } from '../services/storeService';
import { storeScopeService } from '../services/storeScopeService';
import { userService } from '../services/userService';

const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 52);
const planLabel: Record<CompanyPlan, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };
const planHint: Record<CompanyPlan, string> = { starter: 'Operação essencial', pro: 'Gestão + inteligência', enterprise: 'Multi-Store completo' };

const CompaniesPanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([DEFAULT_COMPANY]);
  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => companyScopeService.get(currentUser));
  const [name, setName] = useState('');
  const [plan, setPlan] = useState<CompanyPlan>('pro');
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    const [companyList, storeList, userList] = await Promise.all([companyService.getAll(), storeService.getAll(), userService.getAll()]);
    setCompanies(companyList);
    setStores(storeList);
    setUsers(userList);
    setSelectedCompanyId(companyScopeService.ensureValid(companyList, currentUser));
  };

  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      if (next) setSelectedCompanyId(next);
    };
    window.addEventListener(COMPANY_SCOPE_EVENT, sync);
    return () => window.removeEventListener(COMPANY_SCOPE_EVENT, sync);
  }, []);

  const cards = useMemo(() => companies.map(company => ({
    company,
    stores: stores.filter(store => storeCompanyId(store) === company.id),
    users: users.filter(user => user.role !== 'admin' && companyIdForUser(user) === company.id),
  })), [companies, stores, users]);

  const createCompany = async () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const base = slugify(cleanName) || `cliente-${companies.length + 1}`;
    let id = base; let counter = 2;
    while (companies.some(company => company.id === id)) id = `${base}-${counter++}`;
    const now = new Date();
    const trial = new Date(now); trial.setDate(trial.getDate() + 14);
    const company: Company = { id, slug: id, name: cleanName, plan, status: 'trial', createdAt: now.toISOString(), trialEndsAt: trial.toISOString() };
    const defaultStore: Store = { id: `${id}-principal`, code: 'MATRIZ', name: `${cleanName} · Principal`, active: true, companyId: id };
    setSaving('new');
    try {
      await companyService.saveAll([...companies, company]);
      await storeService.saveAll([...stores, defaultStore]);
      setCompanies(prev => [...prev, company]);
      setStores(prev => [...prev, defaultStore]);
      setName('');
      setMessage(`${cleanName} criada com 14 dias de avaliação e uma unidade principal pronta.`);
    } finally { setSaving(null); }
  };

  const updateCompany = async (company: Company, patch: Partial<Company>) => {
    const updated = companies.map(item => item.id === company.id ? { ...item, ...patch } : item);
    setSaving(company.id);
    try { await companyService.saveAll(updated); setCompanies(updated); }
    finally { setSaving(null); }
  };

  const viewCompany = (company: Company) => {
    const companyStores = stores.filter(store => store.active && storeCompanyId(store) === company.id);
    const fallbackStore = company.id === DEFAULT_COMPANY_ID ? DEFAULT_STORE_ID : companyStores[0]?.id;
    companyScopeService.set(company.id);
    if (fallbackStore) storeScopeService.set(fallbackStore);
    setSelectedCompanyId(company.id);
    setMessage(`Agora o DealMaster está no ambiente ${company.name}.`);
  };

  const assignUser = async (user: User, companyId: string) => {
    const companyStores = stores.filter(store => store.active && storeCompanyId(store) === companyId);
    const storeId = companyId === DEFAULT_COMPANY_ID ? DEFAULT_STORE_ID : companyStores[0]?.id;
    setSaving(user.id);
    try {
      const next = { ...user, companyId, ...(storeId ? { storeId } : {}) };
      await userService.save(next);
      setUsers(prev => prev.map(item => item.id === user.id ? next : item));
      setMessage(`${user.name} agora pertence a ${companyService.getName(companies, companyId)}.`);
    } finally { setSaving(null); }
  };

  if (currentUser.role !== 'admin') return null;

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-56 left-5 z-[142] flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl"><Building size={18}/> Empresas</button>
    {open && <div className="fixed inset-0 z-[235] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}><div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[34px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={event => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-white/10 p-5 md:p-6"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black"><Building size={21}/></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">SaaS Foundation</p><h3 className="mt-1 text-xl font-semibold text-white">Empresas clientes</h3><p className="mt-1 text-xs text-zinc-500">Empresa → unidades → usuários → dados. A Abrão Reze permanece como ambiente padrão.</p></div></div><button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button></header>

      <div className="space-y-6 p-5 md:p-6">
        <section className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-zinc-500">Carteira</p><h4 className="mt-1 text-lg font-semibold text-white">Ambientes cadastrados</h4></div><span className="text-xs text-zinc-600">{companies.length} empresa(s)</span></div><div className="mt-4 grid gap-3 md:grid-cols-2">{cards.map(({ company, stores: companyStores, users: companyUsers }) => {
            const selected = selectedCompanyId === company.id;
            return <div key={company.id} className={`rounded-[23px] border p-4 ${selected ? 'border-white/25 bg-white/[0.07]' : 'border-white/10 bg-black/20'}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{company.name}</p>{selected && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-black">Visualizando</span>}</div><p className="mt-1 text-xs text-zinc-500">{planLabel[company.plan]} · {company.status === 'trial' ? 'Avaliação' : company.status === 'suspended' ? 'Suspensa' : 'Ativa'}</p></div><button onClick={() => viewCompany(company)} disabled={company.status === 'suspended'} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-zinc-400 disabled:opacity-30"><ChevronRight size={16}/></button></div><div className="mt-4 grid grid-cols-2 gap-2"><Info label="Unidades" value={`${companyStores.filter(store => store.active).length}`}/><Info label="Usuários" value={`${companyUsers.length}`}/></div>{company.id !== DEFAULT_COMPANY_ID && <div className="mt-3 flex gap-2"><select value={company.plan} disabled={saving === company.id} onChange={event => updateCompany(company, { plan: event.target.value as CompanyPlan })} className="h-9 flex-1 rounded-xl border border-white/10 bg-zinc-900 px-2 text-xs text-zinc-300"><option value="starter">Starter</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select><button disabled={saving === company.id} onClick={() => updateCompany(company, { status: company.status === 'suspended' ? 'active' : 'suspended' })} className="rounded-xl border border-white/10 px-3 text-xs text-zinc-400">{company.status === 'suspended' ? 'Reativar' : 'Suspender'}</button></div>}</div>})}</div></div>

          <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-5"><div className="flex items-center gap-2 text-zinc-500"><Plus size={16}/><p className="text-xs font-semibold uppercase tracking-[0.13em]">Novo cliente</p></div><h4 className="mt-2 text-lg font-semibold text-white">Criar ambiente</h4><p className="mt-1 text-sm leading-6 text-zinc-500">A empresa nasce com uma unidade principal e avaliação de 14 dias.</p><label className="mt-5 block"><span className="text-xs text-zinc-500">Empresa / grupo</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Grupo Automax" className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none"/></label><div className="mt-3 grid gap-2">{(['starter','pro','enterprise'] as CompanyPlan[]).map(item => <button key={item} onClick={() => setPlan(item)} className={`rounded-2xl border p-3 text-left ${plan === item ? 'border-white/30 bg-white/[0.08]' : 'border-white/10 bg-white/[0.025]'}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold text-white">{planLabel[item]}</span>{plan === item && <CheckCircle2 size={15} className="text-emerald-300"/>}</div><p className="mt-1 text-xs text-zinc-600">{planHint[item]}</p></button>)}</div><button disabled={!name.trim() || saving === 'new'} onClick={createCompany} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-black disabled:opacity-30"><Sparkles size={16}/>{saving === 'new' ? 'Criando...' : 'Criar empresa'}</button></div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-zinc-500"><Users size={16}/><p className="text-xs font-semibold uppercase tracking-[0.13em]">Acesso por empresa</p></div><h4 className="mt-1 text-lg font-semibold text-white">Vincular usuários</h4></div><p className="hidden text-xs text-zinc-600 md:block">Ao trocar a empresa, o usuário recebe a unidade principal daquele ambiente.</p></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{users.filter(user => user.role !== 'admin').map(user => <div key={user.id} className="flex flex-col gap-3 rounded-[22px] border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-white">{user.name}</p><p className="mt-1 text-xs text-zinc-500">{user.email} · {user.role === 'manager' ? 'Gestor' : 'Vendedor'}</p></div><select disabled={saving === user.id} value={companyIdForUser(user)} onChange={event => assignUser(user, event.target.value)} className="h-10 min-w-48 rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none">{companies.filter(company => company.status !== 'suspended').map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>)}</div></section>

        <section className="rounded-[24px] border border-violet-400/15 bg-violet-400/[0.055] p-4"><div className="flex gap-3"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-violet-300"/><div><p className="text-sm font-medium text-violet-200">Fundação multiempresa ativa</p><p className="mt-1 text-xs leading-5 text-violet-200/60">Novas empresas recebem IDs de unidade exclusivos, evitando colisão entre clientes. O próximo passo é endurecer as permissões do Firestore por empresa e habilitar onboarding/autocadastro.</p></div></div></section>
        {message && <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4 text-sm text-emerald-300"><CheckCircle2 size={17}/>{message}</div>}
      </div>
    </div></div>}
  </>;
};

const Info = ({ label, value }: { label: string; value: string }) => <div className="rounded-xl bg-white/[0.04] p-2.5"><p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-200">{value}</p></div>;
export default CompaniesPanel;
