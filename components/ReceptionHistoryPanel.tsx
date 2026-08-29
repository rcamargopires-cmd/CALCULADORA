import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, History, Search, UserRound, X } from 'lucide-react';
import { ShowroomPassage, ShowroomPassageOrigin, ShowroomPassageStatus } from '../types';
import { showroomFlowService } from '../services/showroomFlowService';

type Props = {
  companyId: string;
  storeId: string;
  storeName: string;
};

const STATUS: Record<ShowroomPassageStatus, string> = {
  waiting: 'Aguardando vendedor',
  in_service: 'Em atendimento',
  evaluation: 'Avaliação',
  proposal: 'Proposta',
  follow_up: 'Retorno',
  sale: 'Venda',
  no_deal: 'Sem negócio',
};

const ORIGIN: Record<ShowroomPassageOrigin, string> = {
  walk_in: 'Passagem',
  requested: 'Pedido de vendedor',
};

const localDateKey = (iso?: string) => {
  const date = iso ? new Date(iso) : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDate = (value: string) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

const timeLabel = (iso?: string) => iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  : '—';

const phoneMask = (raw: string) => {
  const value = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (value.length <= 2) return value;
  if (value.length <= 6) return `(${value.slice(0, 2)}) ${value.slice(2)}`;
  if (value.length <= 10) return `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
  return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
};

const originOf = (item: ShowroomPassage): ShowroomPassageOrigin => item.origin === 'requested' ? 'requested' : 'walk_in';

const ReceptionHistoryPanel: React.FC<Props> = ({ companyId, storeId, storeName }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ShowroomPassage[]>([]);
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [selectedSeller, setSelectedSeller] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId) return;
    return showroomFlowService.subscribeStorePassages(
      companyId,
      storeId,
      rows => { setItems(rows); setError(''); },
      err => { console.error('Reception history error', err); setError('Não foi possível carregar o histórico agora.'); },
    );
  }, [companyId, storeId]);

  const dates = useMemo(() => {
    const unique = Array.from(new Set(items.map(item => localDateKey(item.createdAt))));
    return unique.sort((a, b) => b.localeCompare(a));
  }, [items]);

  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach(item => {
      const email = String(item.assignedSellerEmail || '').trim().toLowerCase();
      if (email) map.set(email, item.assignedSellerName || item.assignedSellerEmail);
    });
    return Array.from(map.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('pt-BR');
    return items.filter(item => {
      const dateOk = selectedDate === 'all' || localDateKey(item.createdAt) === selectedDate;
      const sellerOk = selectedSeller === 'all' || String(item.assignedSellerEmail || '').trim().toLowerCase() === selectedSeller;
      const searchOk = !needle || [item.customerName, item.phone, item.interestModel, item.assignedSellerName]
        .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(needle));
      return dateOk && sellerOk && searchOk;
    });
  }, [items, selectedDate, selectedSeller, search]);

  const sales = filtered.filter(item => item.status === 'sale').length;
  const noDeal = filtered.filter(item => item.status === 'no_deal').length;
  const active = filtered.filter(item => ['waiting', 'in_service', 'evaluation', 'proposal'].includes(item.status)).length;

  return <>
    <button
      onClick={() => setOpen(true)}
      className="fixed right-32 top-[17px] z-[525] flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-[#20242c] px-4 text-xs font-bold text-zinc-200 shadow-xl transition hover:border-sky-300/30 hover:text-white max-[700px]:right-[100px] max-[700px]:px-3"
      title="Histórico de atendimentos"
    >
      <History size={15} className="text-sky-300"/>
      <span className="max-[700px]:hidden">HISTÓRICO</span>
    </button>

    {open && <div className="fixed inset-0 z-[560] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-[#171a20] shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-6">
          <div className="flex gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-sky-300/15 bg-sky-300/[0.07] text-sky-300"><History size={20}/></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-300">SHOWROOMFLOW · RECEPÇÃO</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">Histórico de atendimentos</h2>
              <p className="mt-1 text-sm text-zinc-500">{storeName} · filtre por dia ou vendedor.</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"><X size={18}/></button>
        </header>

        <div className="space-y-5 p-5 md:p-6">
          <section className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
            <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500"><CalendarDays size={13}/> Dia</span>
              <select value={selectedDate} onChange={event => setSelectedDate(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none">
                <option value="all">Todos os dias</option>
                {!dates.includes(localDateKey()) && <option value={localDateKey()}>Hoje · {formatDate(localDateKey())}</option>}
                {dates.map(date => <option key={date} value={date}>{date === localDateKey() ? 'Hoje · ' : ''}{formatDate(date)}</option>)}
              </select>
            </label>

            <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500"><UserRound size={13}/> Vendedor</span>
              <select value={selectedSeller} onChange={event => setSelectedSeller(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none">
                <option value="all">Todos os vendedores</option>
                {sellers.map(seller => <option key={seller.email} value={seller.email}>{seller.name}</option>)}
              </select>
            </label>

            <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500"><Search size={13}/> Buscar</span>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cliente, telefone, modelo..." className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"/>
            </label>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Summary label="Atendimentos" value={filtered.length}/>
            <Summary label="Em andamento" value={active}/>
            <Summary label="Vendas" value={sales}/>
            <Summary label="Sem negócio" value={noDeal}/>
          </section>

          {error && <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-sm text-amber-200">{error}</div>}

          <section className="overflow-hidden rounded-[24px] border border-white/10">
            <div className="hidden grid-cols-[110px_1.3fr_1fr_1fr_140px] gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500 md:grid">
              <span>Data / hora</span><span>Cliente</span><span>Vendedor</span><span>Interesse</span><span>Status</span>
            </div>
            <div className="max-h-[58vh] overflow-y-auto">
              {!filtered.length ? <div className="p-10 text-center text-sm text-zinc-500">Nenhum atendimento encontrado com esses filtros.</div> : filtered.map(item => <article key={item.id} className="grid gap-3 border-b border-white/[0.07] px-4 py-4 last:border-0 md:grid-cols-[110px_1.3fr_1fr_1fr_140px] md:items-center">
                <div><p className="text-xs font-semibold text-white">{formatDate(localDateKey(item.createdAt))}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500"><Clock3 size={11}/>{timeLabel(item.createdAt)}</p></div>
                <div><p className="font-semibold text-white">{item.customerName}</p><p className="mt-1 text-xs text-zinc-500">{phoneMask(item.phone)}</p></div>
                <div><p className="text-sm font-medium text-zinc-200">{item.assignedSellerName || '—'}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-600">{ORIGIN[originOf(item)]}</p></div>
                <p className="text-sm text-zinc-400">{item.interestModel || 'Não informado'}</p>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(item.status)}`}>{STATUS[item.status]}</span>
              </article>)}
            </div>
          </section>
        </div>
      </div>
    </div>}
  </>;
};

const Summary = ({ label, value }: { label: string; value: number }) => <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase tracking-[0.11em] text-zinc-600">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>;

const statusClass = (status: ShowroomPassageStatus) => {
  if (status === 'sale') return 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300';
  if (status === 'no_deal') return 'border-zinc-500/20 bg-zinc-500/[0.08] text-zinc-400';
  if (status === 'waiting') return 'border-amber-400/20 bg-amber-400/[0.08] text-amber-300';
  if (status === 'in_service') return 'border-sky-400/20 bg-sky-400/[0.08] text-sky-300';
  return 'border-violet-400/20 bg-violet-400/[0.08] text-violet-300';
};

export default ReceptionHistoryPanel;
