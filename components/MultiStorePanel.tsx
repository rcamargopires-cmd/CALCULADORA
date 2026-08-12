import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Eye, MapPin, Plus, Store as StoreIcon, Users, X } from 'lucide-react';
import { Store, User } from '../types';
import { userService } from '../services/userService';
import { DEFAULT_STORE, DEFAULT_STORE_ID, storeIdForUser, storeService } from '../services/storeService';
import { STORE_SCOPE_EVENT, storeScopeService } from '../services/storeScopeService';

const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const MultiStorePanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  const [stores, setStores] = useState<Store[]>([DEFAULT_STORE]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState(() => storeScopeService.get(currentUser));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [storeData, userData] = await Promise.all([storeService.getAll(), userService.getAll()]);
      setStores(storeData);
      setUsers(userData);
      setSelectedStoreId(storeScopeService.ensureValid(storeData, currentUser));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => {
    const sync = (event: Event) => { const next = (event as CustomEvent<{ storeId?: string }>).detail?.storeId; if (next) setSelectedStoreId(next); };
    window.addEventListener(STORE_SCOPE_EVENT, sync);
    return () => window.removeEventListener(STORE_SCOPE_EVENT, sync);
  }, []);

  const activeStores = useMemo(() => stores.filter(store => store.active), [stores]);

  const addStore = async () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const idBase = slugify(code.trim() || cleanName) || `unidade-${stores.length + 1}`;
    let id = idBase; let counter = 2;
    while (stores.some(store => store.id === id)) id = `${idBase}-${counter++}`;
    const next: Store = { id, name: cleanName, code: (code.trim() || cleanName.slice(0, 8)).toUpperCase(), active: true };
    const updated = [...stores, next];
    setSaving('store-new');
    try {
      await storeService.saveAll(updated); setStores(updated); setName(''); setCode('');
      setMessage(`${cleanName} criada. Agora você pode vincular a equipe e visualizar a unidade.`);
    } finally { setSaving(null); }
  };

  const toggleStore = async (store: Store) => {
    if (store.id === DEFAULT_STORE_ID) return;
    const updated = stores.map(item => item.id === store.id ? { ...item, active: !item.active } : item);
    setSaving(store.id);
    try {
      await storeService.saveAll(updated); setStores(updated);
      if (selectedStoreId === store.id && store.active) storeScopeService.set(DEFAULT_STORE_ID);
    } finally { setSaving(null); }
  };

  const assignUser = async (user: User, storeId: string) => {
    setSaving(user.id);
    try {
      await userService.save({ ...user, storeId });
      setUsers(prev => prev.map(item => item.id === user.id ? { ...item, storeId } : item));
      setMessage(`${user.name} vinculado a ${storeService.getName(stores, storeId)}.`);
    } finally { setSaving(null); }
  };

  const viewStore = (store: Store) => {
    storeScopeService.set(store.id);
    setSelectedStoreId(store.id);
    setMessage(`Agora o Command Center, Executive, Smart Alerts e DealMaster AI estão lendo ${store.name}.`);
  };

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-32 left-5 z-[144] flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl"><Building2 size={17}/> Unidades</button>
    {open && <div className="fixed inset-0 z-[225] overflow-y-auto bg-black/75 p-3 backdrop-blur-md" onClick={() => setOpen(false)}><div className="mx-auto mt-6 max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-white/10 p-5 md:p-6"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black"><Building2 size={21}/></div><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Multi-Store V2</p><h3 className="mt-1 text-xl font-semibold text-white">Unidades do grupo</h3><p className="mt-1 text-xs text-zinc-500">Selecione a unidade que o DealMaster deve analisar e mantenha a equipe organizada por loja.</p></div></div><button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button></div>
      <div className="space-y-6 p-5 md:p-6">
        <section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center gap-2"><StoreIcon size={17} className="text-zinc-500"/><p className="text-xs font-semibold uppercase tracking-[0.13em] text-zinc-500">Estrutura atual</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{stores.map(store => {
            const selected = selectedStoreId === store.id;
            const people = users.filter(user => user.role !== 'admin' && storeIdForUser(user) === store.id).length;
            return <div key={store.id} className={`rounded-[22px] border p-4 ${selected ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : store.active ? 'border-white/10 bg-black/20' : 'border-white/5 bg-black/10 opacity-50'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{store.name}</p><p className="mt-1 text-xs text-zinc-500">{store.code}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${selected ? 'bg-emerald-500/15 text-emerald-300' : store.active ? 'bg-white/[0.06] text-zinc-400' : 'bg-zinc-800 text-zinc-500'}`}>{selected ? 'Visualizando' : store.active ? 'Ativa' : 'Inativa'}</span></div><div className="mt-4 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-xs text-zinc-600"><Users size={13}/>{people} pessoa(s)</span><div className="flex gap-2">{store.active && !selected && <button onClick={() => viewStore(store)} className="flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-xs font-semibold text-black"><Eye size={13}/> Ver dados</button>}{store.id !== DEFAULT_STORE_ID && <button disabled={saving === store.id} onClick={() => toggleStore(store)} className="text-xs font-medium text-zinc-500 hover:text-zinc-300">{store.active ? 'Desativar' : 'Reativar'}</button>}</div></div></div>;
          })}</div></div>
          <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-5"><div className="flex items-center gap-2"><Plus size={16} className="text-zinc-500"/><p className="text-xs font-semibold uppercase tracking-[0.13em] text-zinc-500">Nova unidade</p></div><p className="mt-3 text-sm leading-6 text-zinc-400">Cadastre outra loja. Ela nasce vazia e só recebe dados quando você importar estoque/mapa com ela selecionada.</p><label className="mt-5 block"><span className="text-xs text-zinc-500">Nome da unidade</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Abrão Reze Itu" className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none"/></label><label className="mt-3 block"><span className="text-xs text-zinc-500">Código curto</span><input value={code} onChange={event => setCode(event.target.value)} placeholder="Ex.: ITU" className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm uppercase text-white outline-none"/></label><button disabled={!name.trim() || saving === 'store-new'} onClick={addStore} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-black disabled:opacity-30"><Plus size={16}/>{saving === 'store-new' ? 'Criando...' : 'Criar unidade'}</button></div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5"><div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><div className="flex items-center gap-2 text-zinc-500"><MapPin size={16}/><p className="text-xs font-semibold uppercase tracking-[0.13em]">Vínculo da equipe</p></div><h4 className="mt-1 text-lg font-semibold text-white">Quem pertence a cada unidade</h4></div><p className="text-xs text-zinc-600">Usuários antigos sem vínculo explícito continuam no Outlet Sorocaba.</p></div><div className="mt-5 grid gap-3 lg:grid-cols-2">{users.filter(user => user.role !== 'admin').map(user => <div key={user.id} className="flex flex-col gap-3 rounded-[22px] border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-white">{user.name}</p><p className="mt-1 text-xs text-zinc-500">{user.email} · {user.role === 'manager' ? 'Gestor' : 'Vendedor'}</p></div><select disabled={saving === user.id} value={storeIdForUser(user)} onChange={event => assignUser(user, event.target.value)} className="h-10 min-w-44 rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none disabled:opacity-50">{activeStores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div>)}</div></section>

        <section className="rounded-[24px] border border-blue-400/15 bg-blue-400/[0.06] p-4"><p className="text-sm font-medium text-blue-200">Isolamento ativo</p><p className="mt-1 text-xs leading-5 text-blue-200/60">A unidade marcada como “Visualizando” alimenta Command Center, Executive Insights, Smart Alerts, DealMaster AI e Dados da Loja. Gestores ficam presos à unidade cadastrada no próprio usuário.</p></section>
        {message && <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4 text-sm text-emerald-300"><CheckCircle2 size={17}/>{message}</div>}
        {loading && <p className="text-center text-xs text-zinc-600">Atualizando estrutura...</p>}
      </div>
    </div></div>}
  </>;
};

export default MultiStorePanel;
