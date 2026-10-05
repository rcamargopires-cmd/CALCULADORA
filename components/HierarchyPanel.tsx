import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, ShieldCheck, SlidersHorizontal, Trash2, UserCog, Users, X } from 'lucide-react';
import { Company, DmsAccessProfile, DmsPermissionKey, SellerGoals, Store, User, UserRole, UserStatus } from '../types';
import { dmsAccessLabel } from '../services/dmsPermissions';
import DmsPermissionEditor from './DmsPermissionEditor';
import StoreAccessEditor from './StoreAccessEditor';
import { userService } from '../services/userService';
import { companyIdForUser, companyService, DEFAULT_COMPANY } from '../services/companyService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from '../services/companyScopeService';

const roleLabel = (user: User) => dmsAccessLabel(user);

const DEFAULT_GOALS: SellerGoals = { monthly: 15, firstHalf: 6, capture: 60, margin: 8 };
const emptyForm = {
  name: '',
  email: '',
  role: 'seller' as UserRole,
  dmsAccessProfile: 'management' as DmsAccessProfile,
  dmsPermissionOverrides: {} as Partial<Record<DmsPermissionKey,boolean>>,
  status: 'active' as UserStatus,
  storeId: '',
  storeIds: [] as string[],
};

const HierarchyPanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const isAdmin = currentUser.role === 'admin';
  const isManager = currentUser.role === 'manager';
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState(() => isAdmin ? companyScopeService.get(currentUser) : companyIdForUser(currentUser));
  const [saving, setSaving] = useState<string | null>(null);
  const [editingGoals, setEditingGoals] = useState<User | null>(null);
  const [goals, setGoals] = useState<SellerGoals>(DEFAULT_GOALS);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const companyName = useMemo(() => {
    if (!isAdmin) return 'Sua empresa';
    return companies.find(company => company.id === companyId)?.name || DEFAULT_COMPANY.name;
  }, [companies, companyId, isAdmin]);

  const load = async (targetCompany = companyId) => {
    setLoading(true);
    setError('');
    try {
      const [context, companyList] = await Promise.all([
        userService.getManagementContext(currentUser, targetCompany),
        isAdmin ? companyService.getAll() : Promise.resolve([] as Company[]),
      ]);
      setUsers(context.users);
      setStores(context.stores.filter(store => store.active !== false));
      if (isAdmin) setCompanies(companyList);
    } catch (cause: any) {
      console.error('Equipe & Usuários: falha ao carregar escopo.', cause);
      setError(cause?.message || 'Não foi possível carregar a equipe agora.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) void load(); }, [open]);

  useEffect(() => {
    if (!editingUser || form.storeId || stores.length !== 1) return;
    setForm(current => ({ ...current, storeId: stores[0].id }));
  }, [editingUser, form.storeId, stores]);

  useEffect(() => {
    if (!isAdmin) return;
    const sync = (event: Event) => {
      const next = String((event as CustomEvent<{ companyId?: string }>).detail?.companyId || '');
      if (!next) return;
      setCompanyId(next);
      if (open) void load(next);
    };
    window.addEventListener(COMPANY_SCOPE_EVENT, sync);
    return () => window.removeEventListener(COMPANY_SCOPE_EVENT, sync);
  }, [isAdmin, open]);

  const resetForm = () => {
    setEditingUser(null);
    const initial=stores[0]?.id || currentUser.storeId || '';
    setForm({ ...emptyForm, storeId: initial, storeIds: initial?[initial]:[] });
    setError('');
  };

  const beginCreate = () => {
    resetForm();
    setEditingUser({} as User);
  };

  const beginEdit = (user: User) => {
    setEditingUser(user);
    setForm({
      name: user.name || '',
      email: user.email || '',
      role: user.role === 'user' ? 'seller' : user.role,
      dmsAccessProfile: user.dmsAccessProfile || 'management',
      dmsPermissionOverrides: user.dmsPermissionOverrides || {},
      status: user.status,
      storeId: user.storeId || stores[0]?.id || '',
      storeIds: user.storeIds?.length ? user.storeIds : [user.storeId || stores[0]?.id || ''].filter(Boolean),
    });
    setError('');
  };

  const companySnapshot = () => {
    if (!isAdmin) {
      return {
        companyPlan: currentUser.companyPlan,
        companyStatus: currentUser.companyStatus,
        companyModuleOverrides: currentUser.companyModuleOverrides,
      };
    }
    const company = companies.find(item => item.id === companyId);
    return {
      companyPlan: company?.plan,
      companyStatus: company?.status,
      companyModuleOverrides: company?.moduleOverrides,
    };
  };

  const saveUser = async () => {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name || !email || !email.includes('@')) {
      setError('Informe nome e e-mail válidos.');
      return;
    }
    if (!form.storeId) {
      setError('Escolha a unidade deste usuário.');
      return;
    }
    if (isManager && (form.role === 'admin' || form.role === 'director')) {
      setError('Somente o administrador master pode criar esse perfil.');
      return;
    }
    setSaving(email);
    setError('');
    try {
      const base = editingUser && editingUser.email ? editingUser : null;
      const next: User = {
        ...(base || {}),
        id: email,
        email,
        name,
        role: form.role,
        dmsAccessProfile:form.role==='manager'?form.dmsAccessProfile:undefined,
        dmsPermissionOverrides:form.role==='manager'?form.dmsPermissionOverrides:undefined,
        status: form.status,
        companyId,
        storeId: form.storeId,
        storeIds: form.storeIds.length ? form.storeIds : [form.storeId].filter(Boolean),
        createdAt: base?.createdAt || new Date().toISOString(),
        ...companySnapshot(),
      };
      if (base?.goals) next.goals = base.goals;
      await userService.saveManaged(currentUser, next);
      setEditingUser(null);
      setMessage(base ? 'Usuário atualizado.' : 'Usuário criado. Ele já pode entrar com o e-mail cadastrado.');
      await load();
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível salvar o usuário.');
    } finally {
      setSaving(null);
    }
  };

  const removeUser = async (user: User) => {
    if (user.email === currentUser.email) {
      setError('Você não pode remover seu próprio usuário.');
      return;
    }
    if (!window.confirm(`Remover ${user.name} do Motyq? O acesso desse e-mail será bloqueado.`)) return;
    setSaving(user.email);
    setError('');
    try {
      await userService.deleteManaged(currentUser, user);
      setMessage(`${user.name} removido com sucesso.`);
      await load();
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível remover o usuário.');
    } finally {
      setSaving(null);
    }
  };

  const editGoals = (user: User) => {
    setEditingGoals(user);
    setGoals({ ...DEFAULT_GOALS, ...(user.goals || {}) });
  };

  const saveGoals = async () => {
    if (!editingGoals) return;
    setSaving(editingGoals.email);
    setError('');
    try {
      await userService.saveManaged(currentUser, { ...editingGoals, goals });
      setEditingGoals(null);
      setMessage('Metas atualizadas.');
      await load();
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível salvar as metas.');
    } finally {
      setSaving(null);
    }
  };

  if (!isAdmin && !isManager) return null;

  const roleOptions: Array<{ value: UserRole; label: string }> = [
    { value: 'seller', label: 'Vendedor' },
    { value: 'reception', label: 'Recepção' },
    { value: 'evaluator', label: 'Avaliador MarketIQ' },
    { value: 'manager', label: 'Gestor' },
    ...(isAdmin ? [
      { value: 'director' as UserRole, label: 'Diretoria' },
      { value: 'admin' as UserRole, label: 'Administrador master' },
    ] : []),
  ];

  return <>
    <button type="button" title="Equipe & Usuários" onClick={() => setOpen(true)} className="hidden">Equipe & Usuários</button>

    {open && <div className="fixed inset-0 z-[620] overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[30px] border border-slate-200 bg-white text-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Users size={20}/></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-700">PESSOAS & ACESSOS</p>
              <h3 className="mt-1 text-2xl font-semibold">Equipe & Usuários</h3>
              <p className="mt-1 text-sm text-slate-500">{companyName} · {isAdmin ? 'administração master' : 'você administra somente sua empresa'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={beginCreate} className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"><Plus size={16}/> Novo usuário</button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={18}/></button>
          </div>
        </header>

        <div className="p-5 md:p-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Metric label="Usuários" value={loading ? undefined : users.length}/>
            <Metric label="Ativos" value={loading ? undefined : users.filter(user => user.status === 'active').length}/>
            <Metric label="Gestores" value={loading ? undefined : users.filter(user => user.role === 'manager').length}/>
          </div>

          {isAdmin && <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900">
            Você está administrando <b>{companyName}</b>. Para outra empresa, troque o ambiente ativo no topo do Motyq e volte aqui.
          </div>}
          {message && <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={16}/>{message}</div>}
          {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[820px] text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[.1em] text-slate-500">
                <tr><th className="p-3">Pessoa</th><th className="p-3">Perfil</th><th className="p-3">Unidade</th><th className="p-3">Status</th><th className="p-3 text-right">Ações</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(user => {
                  const seller = user.role === 'seller' || user.role === 'user';
                  const storeName = stores.find(store => store.id === user.storeId)?.name || user.storeId || 'Sem unidade';
                  const protectedTarget = !isAdmin && (user.role === 'admin' || user.role === 'director');
                  return <tr key={user.email} className="hover:bg-slate-50/70">
                    <td className="p-3"><p className="font-semibold text-slate-900">{user.name}</p><p className="mt-1 text-xs text-slate-500">{user.email}</p></td>
                    <td className="p-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{roleLabel(user)}</span></td>
                    <td className="p-3 text-sm text-slate-600">{storeName}</td>
                    <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{user.status === 'active' ? 'Ativo' : 'Inativo'}</span></td>
                    <td className="p-3"><div className="flex justify-end gap-2">
                      {seller && <button onClick={() => editGoals(user)} className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><SlidersHorizontal size={14}/> Metas</button>}
                      {!protectedTarget && <button onClick={() => beginEdit(user)} className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><UserCog size={14}/> Editar</button>}
                      {!protectedTarget && user.email !== currentUser.email && <button disabled={saving === user.email} onClick={() => void removeUser(user)} className="grid h-9 w-9 place-items-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50 disabled:opacity-40" title="Remover usuário"><Trash2 size={14}/></button>}
                    </div></td>
                  </tr>;
                })}
                {loading?<tr><td colSpan={5} className="p-10 text-center text-sm text-slate-500">Carregando usuários...</td></tr>:!users.length && <tr><td colSpan={5} className="p-10 text-center text-sm text-slate-500">Nenhum usuário cadastrado nesta empresa.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>}

    {editingUser && <div className="fixed inset-0 z-[650] overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-4" onClick={() => setEditingUser(null)}>
      <div className="mx-auto my-2 w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl sm:my-6 sm:p-6" onClick={event => event.stopPropagation()}>
        <div className="sticky top-0 z-10 -mx-1 flex items-start justify-between bg-white/95 px-1 pb-3 backdrop-blur"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-blue-700">{editingUser.email ? 'EDITAR ACESSO' : 'NOVO ACESSO'}</p><h3 className="mt-1 text-2xl font-semibold">{editingUser.email ? editingUser.name : 'Cadastrar usuário'}</h3></div><button onClick={() => setEditingUser(null)} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-500"><X size={17}/></button></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo" value={form.name} onChange={value => setForm({...form,name:value})} wide/>
          <Field label="E-mail" value={form.email} onChange={value => setForm({...form,email:value})} type="email" wide disabled={Boolean(editingUser.email)}/>
          <label><span className="text-xs font-semibold text-slate-500">Perfil</span><select disabled={editingUser.email === currentUser.email} value={form.role} onChange={event => setForm({...form,role:event.target.value as UserRole})} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 disabled:bg-slate-50">{roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span className="text-xs font-semibold text-slate-500">Status</span><select value={form.status} onChange={event => setForm({...form,status:event.target.value as UserStatus})} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
          {form.role==='manager'&&<div className="sm:col-span-2"><DmsPermissionEditor profile={form.dmsAccessProfile} overrides={form.dmsPermissionOverrides} onProfileChange={value=>setForm(current=>({...current,dmsAccessProfile:value}))} onOverridesChange={value=>setForm(current=>({...current,dmsPermissionOverrides:value}))}/></div>}
          <div className="sm:col-span-2"><StoreAccessEditor stores={stores} primaryStoreId={form.storeId} storeIds={form.storeIds} onChange={(primary,ids)=>setForm(current=>({...current,storeId:primary,storeIds:ids}))}/></div>
        </div>
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <button disabled={Boolean(saving)} onClick={() => void saveUser()} className="mt-6 h-12 w-full rounded-2xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40">{saving ? 'Salvando...' : editingUser.email ? 'Salvar alterações' : 'Criar usuário'}</button>
      </div>
    </div>}

    {editingGoals && <div className="fixed inset-0 z-[660] overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-4" onClick={() => setEditingGoals(null)}>
      <div className="mx-auto my-2 w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl sm:my-6 sm:p-6" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-blue-700">METAS INDIVIDUAIS</p><h3 className="mt-1 text-2xl font-semibold">{editingGoals.name}</h3></div><button onClick={() => setEditingGoals(null)} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500"><X size={17}/></button></div>
        <div className="mt-6 grid grid-cols-2 gap-3"><GoalField label="Meta mensal" value={goals.monthly} onChange={value=>setGoals({...goals,monthly:value})}/><GoalField label="Meta quinzena" value={goals.firstHalf} onChange={value=>setGoals({...goals,firstHalf:value})}/><GoalField label="Captura %" value={goals.capture} onChange={value=>setGoals({...goals,capture:value})}/><GoalField label="Margem %" value={goals.margin} step="0.1" onChange={value=>setGoals({...goals,margin:value})}/></div>
        <button disabled={Boolean(saving)} onClick={() => void saveGoals()} className="mt-6 h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white disabled:opacity-40">{saving ? 'Salvando...' : 'Salvar metas'}</button>
      </div>
    </div>}
  </>;
};

const Metric = ({ label, value }: { label: string; value?: number }) => <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{value===undefined?'…':value}</p></div>;
const Field = ({label,value,onChange,type='text',wide=false,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;type?:string;wide?:boolean;disabled?:boolean}) => <label className={wide?'sm:col-span-2':''}><span className="text-xs font-semibold text-slate-500">{label}</span><input type={type} disabled={disabled} value={value} onChange={event=>onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"/></label>;
const GoalField=({label,value,onChange,step='1'}:{label:string;value:number;onChange:(value:number)=>void;step?:string})=><label className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs text-slate-500">{label}</span><input type="number" min="0" step={step} value={value} onChange={event=>onChange(Math.max(0,Number(event.target.value)||0))} className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-lg font-semibold text-slate-900 outline-none"/></label>;

export default HierarchyPanel;
