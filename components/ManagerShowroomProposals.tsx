import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, ChevronRight, FileText, Search, UserRound, X } from 'lucide-react';
import { SavedCalculation, ShowroomPassage, User } from '../types';
import { showroomFlowService } from '../services/showroomFlowService';
import { dealTenantService } from '../services/dealTenantService';
import { formatCurrency } from '../utils/currency';

type Props = { currentUser: User; companyId: string; storeId: string; storeName: string };

const statusLabel: Record<string, string> = {
  waiting: 'AGUARDANDO', in_service: 'EM ATENDIMENTO', evaluation: 'AVALIAÇÃO', proposal: 'PROPOSTA', follow_up: 'RETORNO', sale: 'VENDA', no_deal: 'SEM NEGÓCIO',
};
const time = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const money = (value?: number) => formatCurrency(Number(value || 0));
const num = (value?: number) => Number(value || 0).toLocaleString('pt-BR');
const pct = (value?: number) => `${Number(value || 0).toFixed(2).replace('.', ',')}%`;
const asAny = (value: unknown) => value as any;

const linkedDealsFor = (passage: ShowroomPassage, deals: SavedCalculation[]) => {
  const ids = new Set<string>(Array.isArray(asAny(passage).linkedDealIds) ? asAny(passage).linkedDealIds : []);
  return deals
    .filter(deal => ids.has(deal.id) || asAny(deal).showroomPassageId === passage.id)
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
};

const ManagerShowroomProposals: React.FC<Props> = ({ currentUser, companyId, storeId, storeName }) => {
  const [open, setOpen] = useState(false);
  const [passages, setPassages] = useState<ShowroomPassage[]>([]);
  const [deals, setDeals] = useState<SavedCalculation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [queryText, setQueryText] = useState('');
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useEffect(() => showroomFlowService.subscribeStorePassages(companyId, storeId, setPassages, console.error), [companyId, storeId]);
  useEffect(() => dealTenantService.subscribeDeals(currentUser, setDeals, console.error), [currentUser, companyId, storeId]);

  useEffect(() => {
    const locate = () => {
      const title = Array.from(document.querySelectorAll('h2')).find(el => String(el.textContent || '').includes('ShowroomFlow · Passagens')) as HTMLElement | undefined;
      const header = title?.closest('header') as HTMLElement | null;
      if (!header) { setPortalHost(null); return; }
      let host = header.querySelector('[data-showroom-proposals-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-showroom-proposals-host', 'true');
        host.className = 'ml-2';
        const reports = header.querySelector('[data-showroom-reports-host]');
        if (reports) header.insertBefore(host, reports);
        else {
          const close = header.querySelector('button');
          if (close) header.insertBefore(host, close); else header.appendChild(host);
        }
      }
      setPortalHost(host);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => passages.map(passage => ({ passage, deals: linkedDealsFor(passage, deals) }))
    .filter(row => row.deals.length > 0 || ['proposal', 'sale'].includes(row.passage.status))
    .sort((a, b) => String(b.passage.updatedAt || b.passage.createdAt).localeCompare(String(a.passage.updatedAt || a.passage.createdAt))), [passages, deals]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ passage, deals }) => [passage.customerName, passage.phone, passage.interestModel, passage.assignedSellerName, ...deals.map(d => d.data?.licensePlate)]
      .some(value => String(value || '').toLowerCase().includes(q)));
  }, [rows, queryText]);

  const selected = rows.find(row => row.passage.id === selectedId) || null;
  const trigger = <button onClick={() => setOpen(true)} className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] px-4 py-2 text-xs font-bold text-emerald-200 transition hover:border-emerald-300/40 hover:bg-emerald-400/[.10]"><span className="inline-flex items-center gap-2"><FileText size={14}/> PROPOSTAS</span></button>;

  return <>
    {portalHost && createPortal(trigger, portalHost)}
    {open && <div className="fixed inset-0 z-[575] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => { setOpen(false); setSelectedId(''); }}>
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-[#15181e] text-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-6">
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-300">SHOWROOMFLOW · GESTÃO</p><h2 className="mt-1 text-2xl font-semibold">Atendimentos & propostas</h2><p className="mt-1 text-sm text-zinc-500">{storeName} · condições salvas pelos vendedores.</p></div>
          <button onClick={() => { setOpen(false); setSelectedId(''); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-zinc-400"><X size={18}/></button>
        </header>

        <div className="grid min-h-[64vh] lg:grid-cols-[.92fr_1.08fr]">
          <section className="border-b border-white/10 p-4 lg:border-b-0 lg:border-r lg:p-5">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Search size={15} className="text-zinc-600"/><input value={queryText} onChange={e => setQueryText(e.target.value)} placeholder="Cliente, vendedor, placa..." className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-700"/></label>
            <div className="mt-4 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
              {filtered.map(({ passage, deals: linked }) => <button key={passage.id} onClick={() => setSelectedId(passage.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === passage.id ? 'border-emerald-300/35 bg-emerald-300/[.06]' : 'border-white/10 bg-white/[.025] hover:border-white/20'}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-white">{passage.customerName}</p><p className="mt-1 truncate text-xs text-zinc-500">{passage.assignedSellerName} · {passage.interestModel || 'sem modelo'}</p></div><ChevronRight size={16} className="mt-1 shrink-0 text-zinc-600"/></div>
                <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full border border-violet-400/20 bg-violet-400/[.06] px-2 py-1 text-[9px] font-black text-violet-300">{statusLabel[passage.status] || passage.status}</span><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-zinc-400">{linked.length} negociação(ões)</span><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-zinc-500">{time(passage.createdAt)}</span></div>
              </button>)}
              {!filtered.length && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">Nenhuma proposta vinculada encontrada.</div>}
            </div>
          </section>

          <section className="p-4 lg:p-6">
            {!selected ? <div className="grid min-h-[45vh] place-items-center text-center"><div><Calculator size={34} className="mx-auto text-zinc-700"/><p className="mt-3 font-semibold text-zinc-400">Selecione um atendimento</p><p className="mt-1 text-sm text-zinc-600">As condições salvas aparecem aqui sem permitir edição.</p></div></div> : <div>
              <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-zinc-600"><UserRound size={12}/> Cliente</p><h3 className="mt-1 text-xl font-semibold">{selected.passage.customerName}</h3><p className="mt-1 text-sm text-zinc-500">{selected.passage.phone} · {selected.passage.interestModel || 'Interesse não informado'}</p></div><div className="text-right"><p className="text-xs font-semibold text-zinc-300">{selected.passage.assignedSellerName}</p><p className="mt-1 text-[10px] text-zinc-600">{statusLabel[selected.passage.status] || selected.passage.status}</p></div></div></div>

              <div className="mt-4 space-y-3">
                {selected.deals.map((deal, index) => {
                  const d = deal.data; const payment = d?.payments || { entry: 0, financing: 0, tradeIn: 0 }; const costs = d?.costs || { documentation: 0, accessories: 0, payoff: 0, debts: 0, others: 0 };
                  return <article key={deal.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.12em] text-emerald-300">PROPOSTA {selected.deals.length - index}</p><p className="mt-1 font-mono text-lg font-semibold text-white">{d?.licensePlate || 'SEM PLACA'}</p><p className="mt-1 text-xs text-zinc-600">Salva em {time(deal.timestamp)}</p></div><div className="text-right"><p className="text-xs text-zinc-500">Margem</p><p className={`mt-1 text-xl font-semibold ${Number(deal.summary?.profit || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{money(deal.summary?.profit)}</p><p className="text-xs text-zinc-500">{pct(deal.summary?.marginPercent)}</p></div></div>
                    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Valor nota" value={money(d?.invoiceValue)}/><Metric label="Valor custo" value={money(d?.vehicleCost)}/><Metric label="Dias estoque" value={`${num(d?.stockDays)} dias`}/><Metric label="FIPE" value={money(d?.fipeValue)}/><Metric label="Entrada" value={money(payment.entry)}/><Metric label="Financiamento" value={money(payment.financing)}/><Metric label="Troca" value={money(payment.tradeIn)}/><Metric label="Custos adicionais" value={money(Number(costs.documentation||0)+Number(costs.accessories||0)+Number(costs.payoff||0)+Number(costs.debts||0)+Number(costs.others||0))}/></div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span className={`rounded-full border px-2 py-1 ${d?.dealStatus === 'closed' ? 'border-emerald-400/20 text-emerald-300' : 'border-violet-400/20 text-violet-300'}`}>{d?.dealStatus === 'closed' ? 'VENDA FECHADA' : 'NEGOCIAÇÃO ABERTA'}</span>{d?.isWebLead && <span className="rounded-full border border-sky-400/20 px-2 py-1 text-sky-300">VENDA WEB / DIVISÃO</span>}</div>
                  </article>;
                })}
                {!selected.deals.length && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">O atendimento está marcado como proposta, mas ainda não encontrei uma negociação vinculada para exibir.</div>}
              </div>
            </div>}
          </section>
        </div>
      </div>
    </div>}
  </>;
};

const Metric = ({ label, value }: { label: string; value: string }) => <div className="rounded-xl border border-white/10 bg-white/[.025] p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-zinc-600">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-200">{value}</p></div>;

export default ManagerShowroomProposals;
