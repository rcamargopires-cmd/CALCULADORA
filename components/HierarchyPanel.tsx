import React, { useEffect, useState } from 'react';
import { ShieldCheck, Users, X } from 'lucide-react';
import { User, UserRole } from '../types';
import { userService } from '../services/userService';

const roleLabel = (role: UserRole) => role === 'admin' ? 'Administrador' : role === 'manager' ? 'Gestor' : 'Vendedor';

const HierarchyPanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => setUsers(await userService.getAll());
  useEffect(() => { if (open) load(); }, [open]);

  const changeRole = async (user: User, role: UserRole) => {
    if (user.id === currentUser.id && role !== 'admin') return;
    setSaving(user.id);
    try {
      await userService.save({ ...user, role });
      await load();
    } finally {
      setSaving(null);
    }
  };

  return <>
    <button onClick={()=>setOpen(true)} className="fixed bottom-20 left-5 z-[145] flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl"><Users size={17}/> Hierarquia</button>
    {open && <div className="fixed inset-0 z-[220] bg-black/70 p-3 backdrop-blur-md" onClick={()=>setOpen(false)}><div className="mx-auto mt-8 max-w-3xl rounded-[30px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between border-b border-white/10 p-5"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black"><ShieldCheck size={19}/></div><div><p className="text-xs uppercase tracking-[.14em] text-zinc-500">Acessos</p><h3 className="text-xl font-semibold text-white">Hierarquia comercial</h3></div></div><button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button></div><div className="p-5"><p className="mb-4 text-sm leading-6 text-zinc-500">Administrador configura a plataforma. Gestor enxerga a loja e toda a equipe. Vendedor enxerga apenas seus resultados e suas negociações.</p><div className="space-y-2">{users.map(user=><div key={user.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-white">{user.name}</p><p className="mt-1 text-xs text-zinc-500">{user.email} · {roleLabel(user.role)}</p></div><select disabled={saving===user.id || user.id===currentUser.id} value={user.role==='user'?'seller':user.role} onChange={e=>changeRole(user,e.target.value as UserRole)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none disabled:opacity-50"><option value="seller">Vendedor</option><option value="manager">Gestor</option><option value="admin">Administrador</option></select></div>)}</div></div></div></div>}
  </>;
};

export default HierarchyPanel;
