import React, { useEffect, useState } from 'react';
import { ShieldCheck, SlidersHorizontal, Users, X } from 'lucide-react';
import { SellerGoals, User, UserRole } from '../types';
import { userService } from '../services/userService';

const roleLabel = (role: UserRole) => role === 'admin' ? 'Administrador' : role === 'manager' ? 'Gestor' : 'Vendedor';
const DEFAULT_GOALS: SellerGoals = { monthly: 15, firstHalf: 6, capture: 60, margin: 8 };

const HierarchyPanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [goals, setGoals] = useState<SellerGoals>(DEFAULT_GOALS);

  const load = async () => setUsers(await userService.getAll());
  useEffect(() => { if (open) load(); }, [open]);

  const changeRole = async (user: User, role: UserRole) => {
    if (user.id === currentUser.id && role !== 'admin') return;
    setSaving(user.id);
    try { await userService.save({ ...user, role }); await load(); }
    finally { setSaving(null); }
  };

  const editGoals = (user: User) => {
    setEditing(user);
    setGoals({ ...DEFAULT_GOALS, ...(user.goals || {}) });
  };

  const saveGoals = async () => {
    if (!editing) return;
    setSaving(editing.id);
    try {
      await userService.save({ ...editing, goals });
      await load();
      setEditing(null);
    } finally { setSaving(null); }
  };

  return <>
    <button onClick={()=>setOpen(true)} className="fixed bottom-20 left-5 z-[145] flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl"><Users size={17}/> Hierarquia</button>
    {open && <div className="fixed inset-0 z-[220] overflow-y-auto bg-black/70 p-3 backdrop-blur-md" onClick={()=>setOpen(false)}><div className="mx-auto mt-8 max-w-4xl rounded-[30px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between border-b border-white/10 p-5"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black"><ShieldCheck size={19}/></div><div><p className="text-xs uppercase tracking-[.14em] text-zinc-500">Acessos e objetivos</p><h3 className="text-xl font-semibold text-white">Equipe comercial</h3></div></div><button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button></div><div className="p-5"><p className="mb-4 text-sm leading-6 text-zinc-500">Defina o papel de cada pessoa e, para vendedores, configure metas individuais. Se nenhuma meta for definida, o sistema usa 15 carros, 6 na quinzena, 60% de captura e 8% de margem.</p><div className="space-y-2">{users.map(user=>{const seller=user.role==='seller'||user.role==='user'; const g={...DEFAULT_GOALS,...(user.goals||{})}; return <div key={user.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-white">{user.name}</p><p className="mt-1 text-xs text-zinc-500">{user.email} · {roleLabel(user.role)}</p>{seller&&<p className="mt-2 text-xs text-zinc-400">Meta {g.monthly} · Quinzena {g.firstHalf} · Captura {g.capture}% · Margem {g.margin}%</p>}</div><div className="flex gap-2"><select disabled={saving===user.id || user.id===currentUser.id} value={user.role==='user'?'seller':user.role} onChange={e=>changeRole(user,e.target.value as UserRole)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none disabled:opacity-50"><option value="seller">Vendedor</option><option value="manager">Gestor</option><option value="admin">Administrador</option></select>{seller&&<button onClick={()=>editGoals(user)} className="flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-black"><SlidersHorizontal size={15}/> Metas</button>}</div></div></div>})}</div></div></div></div>}

    {editing && <div className="fixed inset-0 z-[260] grid place-items-center bg-black/75 p-4 backdrop-blur-md"><div className="w-full max-w-lg rounded-[30px] border border-white/10 bg-zinc-950 p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-[.14em] text-zinc-500">Metas individuais</p><h3 className="mt-1 text-2xl font-semibold text-white">{editing.name}</h3></div><button onClick={()=>setEditing(null)} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={17}/></button></div><div className="mt-6 grid grid-cols-2 gap-3"><GoalField label="Meta mensal" value={goals.monthly} onChange={v=>setGoals({...goals,monthly:v})}/><GoalField label="Meta quinzena" value={goals.firstHalf} onChange={v=>setGoals({...goals,firstHalf:v})}/><GoalField label="Captura %" value={goals.capture} onChange={v=>setGoals({...goals,capture:v})}/><GoalField label="Margem %" value={goals.margin} step="0.1" onChange={v=>setGoals({...goals,margin:v})}/></div><button disabled={saving===editing.id} onClick={saveGoals} className="mt-6 h-12 w-full rounded-2xl bg-white font-semibold text-black disabled:opacity-50">{saving===editing.id?'Salvando...':'Salvar metas'}</button></div></div>}
  </>;
};

const GoalField=({label,value,onChange,step='1'}:{label:string;value:number;onChange:(v:number)=>void;step?:string})=><label className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><span className="text-xs text-zinc-500">{label}</span><input type="number" min="0" step={step} value={value} onChange={e=>onChange(Math.max(0,Number(e.target.value)||0))} className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black px-3 text-lg font-semibold text-white outline-none"/></label>;

export default HierarchyPanel;
