import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CarFront, Clock3, History, Phone, Search, UserRound, UsersRound, X } from 'lucide-react';
import { ShowroomPassage, ShowroomPassageOrigin, ShowroomPassageStatus, User } from '../types';
import { showroomFlowService } from '../services/showroomFlowService';
import { companyScopeService } from '../services/companyScopeService';
import { storeScopeService } from '../services/storeScopeService';

const SLOT_ID = 'motyq-manager-showroom-history-slot';

const STATUS: Record<ShowroomPassageStatus, string> = {
  waiting: 'Aguardando',
  in_service: 'Em atendimento',
  evaluation: 'Avaliação',
  proposal: 'Proposta',
  follow_up: 'Retorno',
  sale: 'Venda',
  no_deal: 'Sem negócio',
};

const ORIGIN: Record<ShowroomPassageOrigin, string> = {
  walk_in: 'Passagem',
  requested: 'Pedido',
};

type Period = 'month' | '7d' | '30d' | '90d' | 'all';

type Props = { user: User };

const cleanEmail = (value: string) => String(value || '').trim().toLowerCase();
const originOf = (item: ShowroomPassage): ShowroomPassageOrigin => item.origin === 'requested' ? 'requested' : 'walk_in';

const formatDate = (iso?: string) => iso
  ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—';

const formatTime = (iso?: string) => iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  : '—';

const phoneMask = (raw: string) => {
  const value = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (value.length <= 2) return value;
  if (value.length <= 6) return `(${value.slice(0, 2)}) ${value.slice(2)}`;
  if (value.length <= 10) return `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
  return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
};

const inPeriod = (item: ShowroomPassage, period: Period) => {
  if (period === 'all') return true;
  const createdDate = new Date(item.createdAt);
  const created = createdDate.getTime();
  if (!Number.isFinite(created)) return false;

  if (period === 'month') {
    const current = new Date();
    return created <= current.getTime()
      && createdDate.getFullYear() === current.getFullYear()
      && createdDate.getMonth() === current.getMonth();
  }

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  return created >= Date.now() - days * 24 * 60 * 60 * 1000;
};

const findNav = () => document.querySelector('#root nav') as HTMLElement | null;

const ensureSlot = () => {
  const current = document.getElementById(SLOT_ID);
  if (current) return current;
  const nav = findNav();
  if (!nav) return null;
  const slot = document.createElement('span');
  slot.id = SLOT_ID;
  slot.className = 'contents';
  nav.appendChild(slot);
  return slot;
};

const statusClass = (status: ShowroomPassageStatus) => {
  if (status === 'sale') return 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700';
  if (status === 'no_deal') return 'border-slate-300 bg-slate-100 text-slate-600';
  if (status === 'waiting') return 'border-amber-400/25 bg-amber-50 text-amber-700';
  if (status === 'in_service') return 'border-sky-400/25 bg-sky-50 text-sky-700';
  return 'border-violet-400/25 bg-violet-50 text-violet-700';
};

const Summary = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
  </div>
);

const ManagerShowroomHistory: React.FC<Props> = ({ user }) => {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ShowroomPassage[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [origin, setOrigin] = useState<'all' | ShowroomPassageOrigin>('all');
  const [sellerEmail, setSellerEmail] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const companyId = companyScopeService.get(user);
  const storeId = storeScopeService.get(user);

  useEffect(() => {
    const sync = () => {
      const next = ensureSlot();
      if (next) setSlot(next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!companyId || !storeId) return;
    return showroomFlowService.subscribeStorePassages(
      companyId,
      storeId,
      rows => { setItems(rows); setError(''); },
      err => {
        console.error('Manager showroom history error', err);
        setError('Não foi possível carregar o fluxo de atendimentos agora.');
      },
    );
  }, [companyId, storeId]);

  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach(item => {
      const email = cleanEmail(item.assignedSellerEmail);
      if (email) map.set(email, item.assignedSellerName || email);
    });
    return Array.from(map.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('pt-BR');
    return items.filter(item => {
      const periodOk = inPeriod(item, period);
      const originOk = origin === 'all' || originOf(item) === origin;
      const sellerOk = sellerEmail === 'all' || cleanEmail(item.assignedSellerEmail) === sellerEmail;
      const searchOk = !needle || [
        item.customerName,
        item.phone,
        item.interestModel,
        item.notes,
        item.assignedSellerName,
        item.assignedSellerEmail,
        STATUS[item.status],
      ].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(needle));
      return periodOk && originOk && sellerOk && searchOk;
    });
  }, [items, period, origin, sellerEmail, search]);

  const passages = filtered.filter(item => originOf(item) === 'walk_in').length;
  const requests = filtered.filter(item => originOf(item) === 'requested').length;
  const sales = filtered.filter(item => item.status === 'sale').length;
  const active = filtered.filter(item => !['sale', 'no_deal'].includes(item.status)).length;

  const button = slot ? createPortal(
    <button
      type="button"
      onClick={() => setOpen(true)}
      title="Abrir fluxo de atendimentos dos vendedores"
      className="flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-bold text-zinc-500 transition-all hover:text-zinc-300"
    >
      <History size={14}/>
      ATENDIMENTOS
    </button>,
    slot,
  ) : null;

  return <>
    {button}
    {open && <div className="fixed inset-0 z-[590] overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[30px] border border-slate-200 bg-[#f7f9fc] shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5 md:p-7">
          <div className="flex gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700"><UsersRound size={20}/></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">SHOWROOMFLOW · GESTÃO</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">Fluxo de atendimentos</h2>
              <p className="mt-1 text-sm text-slate-500">Acompanhe passagens, pedidos, clientes, interesses e resultados de todos os vendedores da unidade.</p>
            </div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-900"><X size={18}/></button>
        </header>

        <div className="space-y-5 p-5 md:p-7">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400"><CalendarDays size={13}/> Período</span>
              <select value={period} onChange={event => setPeriod(event.target.value as Period)} className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-400">
                <option value="month">Mês atual</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
                <option value="90d">Últimos 90 dias</option>
                <option value="all">Todo o histórico</option>
              </select>
            </label>

            <label className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400"><UsersRound size={13}/> Vendedor</span>
              <select value={sellerEmail} onChange={event => setSellerEmail(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-400">
                <option value="all">Todos os vendedores</option>
                {sellers.map(seller => <option key={seller.email} value={seller.email}>{seller.name}</option>)}
              </select>
            </label>

            <label className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400"><UserRound size={13}/> Tipo</span>
              <select value={origin} onChange={event => setOrigin(event.target.value as 'all' | ShowroomPassageOrigin)} className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-400">
                <option value="all">Passagens e pedidos</option>
                <option value="walk_in">Somente passagens</option>
                <option value="requested">Somente pedidos</option>
              </select>
            </label>

            <label className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400"><Search size={13}/> Buscar</span>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cliente, telefone, carro, vendedor..." className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-400"/>
            </label>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Summary label="Atendimentos" value={filtered.length}/>
            <Summary label="Em fluxo" value={active}/>
            <Summary label="Passagens" value={passages}/>
            <Summary label="Pedidos" value={requests}/>
            <Summary label="Vendas" value={sales}/>
          </section>

          {error && <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

          <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[115px_1fr_1fr_1fr_105px_1.2fr_120px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 xl:grid">
              <span>Data / hora</span><span>Vendedor</span><span>Cliente</span><span>Telefone</span><span>Origem</span><span>Procurava</span><span>Status</span>
            </div>

            <div className="max-h-[62vh] overflow-y-auto">
              {!filtered.length ? (
                <div className="p-12 text-center">
                  <History size={28} className="mx-auto text-slate-300"/>
                  <p className="mt-3 text-sm font-medium text-slate-600">Nenhum atendimento encontrado.</p>
                  <p className="mt-1 text-xs text-slate-400">Altere os filtros para consultar outros registros.</p>
                </div>
              ) : filtered.map(item => (
                <article key={item.id} className="border-b border-slate-100 px-4 py-4 last:border-0">
                  <div className="grid gap-4 xl:grid-cols-[115px_1fr_1fr_1fr_105px_1.2fr_120px] xl:items-center">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{formatDate(item.createdAt)}</p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Clock3 size={11}/>{formatTime(item.createdAt)}</p>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-900">{item.assignedSellerName || 'Vendedor não informado'}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{item.assignedSellerEmail || '—'}</p>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-900">{item.customerName || 'Cliente não informado'}</p>
                      {item.assumedAt && <p className="mt-1 text-[11px] text-slate-400">Assumido às {formatTime(item.assumedAt)}</p>}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-slate-600"><Phone size={14} className="text-slate-400"/>{phoneMask(item.phone) || 'Não informado'}</div>

                    <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black ${originOf(item) === 'requested' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>{ORIGIN[originOf(item)]}</span>

                    <div className="flex items-start gap-2 text-sm text-slate-700"><CarFront size={15} className="mt-0.5 shrink-0 text-slate-400"/><span>{item.interestModel || 'Não informado'}</span></div>

                    <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(item.status)}`}>{STATUS[item.status]}</span>
                  </div>

                  {(item.notes || item.closedAt) && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    {item.notes && <span><strong className="font-semibold text-slate-700">Observação:</strong> {item.notes}</span>}
                    {item.closedAt && <span><strong className="font-semibold text-slate-700">Encerrado:</strong> {formatDate(item.closedAt)} às {formatTime(item.closedAt)}</span>}
                  </div>}
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>}
  </>;
};

export default ManagerShowroomHistory;
