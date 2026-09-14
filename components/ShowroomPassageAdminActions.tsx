import React, { useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Save, Trash2, X } from 'lucide-react';
import { ShowroomPassage, ShowroomPassageOrigin, ShowroomPassageStatus, ShowroomQueueSeller, User } from '../types';
import { showroomFlowService } from '../services/showroomFlowService';

type Props = {
  item: ShowroomPassage;
  currentUser: User;
  sellers: ShowroomQueueSeller[];
  theme?: 'light' | 'dark';
};

type Mode = 'edit' | 'delete' | null;

type FormState = {
  customerName: string;
  phone: string;
  interestModel: string;
  origin: ShowroomPassageOrigin;
  sellerEmail: string;
  status: ShowroomPassageStatus;
  notes: string;
  reason: string;
};

const cleanEmail = (value: string) => String(value || '').trim().toLowerCase();
const cleanPhone = (value: string) => String(value || '').replace(/\D/g, '').slice(0, 15);
const phoneMask = (raw: string) => {
  const value = cleanPhone(raw).slice(0, 11);
  if (value.length <= 2) return value;
  if (value.length <= 6) return `(${value.slice(0, 2)}) ${value.slice(2)}`;
  if (value.length <= 10) return `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
  return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
};

const STATUS: Array<{ value: ShowroomPassageStatus; label: string }> = [
  { value: 'waiting', label: 'Aguardando' },
  { value: 'in_service', label: 'Em atendimento' },
  { value: 'evaluation', label: 'Avaliação' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'follow_up', label: 'Retorno' },
  { value: 'sale', label: 'Venda' },
  { value: 'no_deal', label: 'Sem negócio' },
];

const initialForm = (item: ShowroomPassage): FormState => ({
  customerName: item.customerName || '',
  phone: item.phone || '',
  interestModel: item.interestModel || '',
  origin: item.origin === 'requested' ? 'requested' : 'walk_in',
  sellerEmail: cleanEmail(item.assignedSellerEmail),
  status: item.status,
  notes: item.notes || '',
  reason: '',
});

const ShowroomPassageAdminActions: React.FC<Props> = ({ item, currentUser, sellers, theme = 'dark' }) => {
  const [mode, setMode] = useState<Mode>(null);
  const [form, setForm] = useState<FormState>(() => initialForm(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allowed = currentUser.role === 'admin' || currentUser.role === 'manager';

  const options = useMemo(() => {
    const map = new Map<string, ShowroomQueueSeller>();
    sellers.forEach(seller => {
      const email = cleanEmail(seller.email);
      if (email) map.set(email, seller);
    });
    const currentEmail = cleanEmail(item.assignedSellerEmail);
    if (currentEmail && !map.has(currentEmail)) {
      map.set(currentEmail, {
        id: item.assignedSellerId || currentEmail,
        email: item.assignedSellerEmail,
        name: item.assignedSellerName || item.assignedSellerEmail,
        available: true,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [sellers, item.assignedSellerEmail, item.assignedSellerId, item.assignedSellerName]);

  if (!allowed) return null;

  const openEdit = () => {
    setForm(initialForm(item));
    setError('');
    setMode('edit');
  };

  const openDelete = () => {
    setForm(current => ({ ...initialForm(item), reason: current.reason || '' }));
    setError('');
    setMode('delete');
  };

  const save = async () => {
    if (!form.customerName.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }
    if (!form.reason.trim()) {
      setError('Informe o motivo da correção.');
      return;
    }
    const seller = options.find(option => cleanEmail(option.email) === cleanEmail(form.sellerEmail));
    if (!seller) {
      setError('Selecione o vendedor correto.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await showroomFlowService.correctPassage({
        id: item.id,
        customerName: form.customerName,
        phone: cleanPhone(form.phone),
        interestModel: form.interestModel,
        origin: form.origin,
        assignedSellerId: seller.id,
        assignedSellerEmail: seller.email,
        assignedSellerName: seller.name,
        status: form.status,
        notes: form.notes,
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        reason: form.reason,
      });
      setMode(null);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível corrigir este atendimento.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form.reason.trim()) {
      setError('Informe o motivo da exclusão.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await showroomFlowService.softDeletePassage({
        id: item.id,
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        reason: form.reason,
      });
      setMode(null);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível excluir este atendimento.');
    } finally {
      setSaving(false);
    }
  };

  const editButton = theme === 'light'
    ? 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300'
    : 'border-white/10 bg-white/[.03] text-zinc-300 hover:border-violet-300/30 hover:text-violet-200';
  const deleteButton = theme === 'light'
    ? 'border-red-200 bg-red-50 text-red-700 hover:border-red-300'
    : 'border-red-300/15 bg-red-300/[.04] text-red-300 hover:border-red-300/35';

  return <>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={openEdit} className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold transition ${editButton}`}><Pencil size={12}/>EDITAR</button>
      <button type="button" onClick={openDelete} className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold transition ${deleteButton}`}><Trash2 size={12}/>EXCLUIR</button>
    </div>

    {mode && <div className="fixed inset-0 z-[710] overflow-y-auto bg-black/75 p-3 backdrop-blur-sm md:p-6" onClick={() => !saving && setMode(null)}>
      <div className="mx-auto my-5 max-w-2xl rounded-[26px] border border-white/10 bg-[#111416] text-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-6">
          <div>
            <p className={`text-[10px] font-black uppercase tracking-[.16em] ${mode === 'delete' ? 'text-red-300' : 'text-violet-300'}`}>{mode === 'delete' ? 'EXCLUSÃO DE ATENDIMENTO' : 'CORREÇÃO DE ATENDIMENTO'}</p>
            <h3 className="mt-1 text-xl font-semibold">{item.customerName || 'Cliente'} · {item.assignedSellerName || 'Vendedor'}</h3>
            <p className="mt-1 text-xs text-zinc-500">Ação disponível somente para gestor e administrador.</p>
          </div>
          <button type="button" disabled={saving} onClick={() => setMode(null)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-zinc-400 hover:text-white disabled:opacity-40"><X size={16}/></button>
        </header>

        {mode === 'edit' ? <div className="space-y-4 p-5 md:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-500">Cliente</span><input value={form.customerName} onChange={event => setForm(value => ({ ...value, customerName: event.target.value }))} className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-violet-300/40"/></label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-500">Telefone</span><input value={phoneMask(form.phone)} onChange={event => setForm(value => ({ ...value, phone: cleanPhone(event.target.value) }))} className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-violet-300/40"/></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-500">Modelo de interesse</span><input value={form.interestModel} onChange={event => setForm(value => ({ ...value, interestModel: event.target.value }))} className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-violet-300/40"/></label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-500">Vendedor responsável</span><select value={form.sellerEmail} onChange={event => setForm(value => ({ ...value, sellerEmail: event.target.value }))} className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"><option value="">Selecione</option>{options.map(seller => <option key={seller.email} value={cleanEmail(seller.email)}>{seller.name}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-500">Origem</span><select value={form.origin} onChange={event => setForm(value => ({ ...value, origin: event.target.value as ShowroomPassageOrigin }))} className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"><option value="walk_in">Passagem</option><option value="requested">Pedido de vendedor</option></select></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-500">Status</span><select value={form.status} onChange={event => setForm(value => ({ ...value, status: event.target.value as ShowroomPassageStatus }))} className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white">{STATUS.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          </div>

          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-500">Observações</span><textarea value={form.notes} onChange={event => setForm(value => ({ ...value, notes: event.target.value }))} rows={3} className="w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white outline-none focus:border-violet-300/40"/></label>
          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-amber-300">Motivo da correção *</span><textarea value={form.reason} onChange={event => setForm(value => ({ ...value, reason: event.target.value }))} rows={2} placeholder="Ex.: atendimento foi lançado em nome do vendedor errado." className="w-full rounded-xl border border-amber-300/20 bg-amber-300/[.04] p-3 text-sm text-white outline-none focus:border-amber-300/40"/></label>
          <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[10px] leading-4 text-zinc-500">A correção altera o registro do atendimento, mas não reorganiza retroativamente a fila de vendedores. A alteração fica registrada para auditoria.</p>
          {error && <div className="rounded-xl border border-red-300/20 bg-red-300/[.05] px-3 py-2 text-sm text-red-200">{error}</div>}
          <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setMode(null)} className="h-10 rounded-xl border border-white/10 px-4 text-sm text-zinc-400 disabled:opacity-40">Cancelar</button><button type="button" disabled={saving} onClick={() => void save()} className="flex h-10 items-center gap-2 rounded-xl bg-violet-300 px-4 text-sm font-bold text-black disabled:opacity-40"><Save size={14}/>{saving ? 'Salvando...' : 'SALVAR CORREÇÃO'}</button></div>
        </div> : <div className="space-y-4 p-5 md:p-6">
          <div className="flex gap-3 rounded-2xl border border-red-300/20 bg-red-300/[.05] p-4"><AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-300"/><div><p className="font-semibold text-red-200">Excluir este atendimento das telas operacionais?</p><p className="mt-1 text-sm leading-5 text-zinc-400">O registro será removido do fluxo, histórico dos vendedores e relatórios operacionais. Os dados de exclusão ficam preservados no banco para auditoria.</p></div></div>
          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-red-300">Motivo da exclusão *</span><textarea value={form.reason} onChange={event => setForm(value => ({ ...value, reason: event.target.value }))} rows={3} placeholder="Ex.: lançamento duplicado ou atendimento registrado por engano." className="w-full rounded-xl border border-red-300/20 bg-red-300/[.04] p-3 text-sm text-white outline-none focus:border-red-300/40"/></label>
          {error && <div className="rounded-xl border border-red-300/20 bg-red-300/[.05] px-3 py-2 text-sm text-red-200">{error}</div>}
          <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setMode(null)} className="h-10 rounded-xl border border-white/10 px-4 text-sm text-zinc-400 disabled:opacity-40">Cancelar</button><button type="button" disabled={saving} onClick={() => void remove()} className="flex h-10 items-center gap-2 rounded-xl bg-red-400 px-4 text-sm font-bold text-black disabled:opacity-40"><Trash2 size={14}/>{saving ? 'Excluindo...' : 'CONFIRMAR EXCLUSÃO'}</button></div>
        </div>}
      </div>
    </div>}
  </>;
};

export default ShowroomPassageAdminActions;
