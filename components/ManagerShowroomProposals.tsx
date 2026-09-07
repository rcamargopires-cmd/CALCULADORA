import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, ChevronRight, FileText, Gauge, Search, UserRound, X } from 'lucide-react';
import { SavedCalculation, ShowroomPassage, User } from '../types';
import { showroomFlowService } from '../services/showroomFlowService';
import { dealTenantService } from '../services/dealTenantService';
import { MarketIQEvaluation, marketIqEvaluationService } from '../services/marketIqEvaluationService';
import { formatCurrency } from '../utils/currency';

type Props = { currentUser: User; companyId: string; storeId: string; storeName: string };

const statusLabel: Record<string, string> = {
  waiting: 'AGUARDANDO', in_service: 'EM ATENDIMENTO', evaluation: 'AVALIAÇÃO', proposal: 'PROPOSTA', follow_up: 'RETORNO', sale: 'VENDA', no_deal: 'SEM NEGÓCIO',
};
const evaluationStatusLabel: Record<string, string> = { draft: 'RASCUNHO', approved: 'APROVADA', rejected: 'RECUSADA' };
const time = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const evaluationTime = (value: any) => {
  const date = value?.seconds ? new Date(Number(value.seconds) * 1000) : value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
};
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
  const [evaluations, setEvaluations] = useState<MarketIQEvaluation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [queryText, setQueryText] = useState('');
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useEffect(() => showroomFlowService.subscribeStorePassages(companyId, storeId, setPassages, console.error), [companyId, storeId]);
  useEffect(() => dealTenantService.subscribeDeals(currentUser, setDeals, console.error), [currentUser, companyId, storeId]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const items = await marketIqEvaluationService.listByStore(companyId, storeId);
        if (active) setEvaluations(items);
      } catch (error) {
        console.warn('Motyq: não foi possível carregar avaliações MarketIQ no ShowroomFlow.', error);
      }
    };
    void load();
    const refresh = () => void load();
    window.addEventListener('motyq:marketiq-history-updated', refresh);
    return () => { active = false; window.removeEventListener('motyq:marketiq-history-updated', refresh); };
  }, [companyId, storeId]);

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

  const rows = useMemo(() => passages.map(passage => {
    const linked = linkedDealsFor(passage, deals);
    const dealIds = new Set(linked.map(item => item.id));
    const linkedEvaluations = evaluations.filter(item => item.showroomPassageId === passage.id || (!!item.dealId && dealIds.has(item.dealId)));
    return { passage, deals: linked, evaluations: linkedEvaluations };
  })
    .filter(row => row.deals.length > 0 || row.evaluations.length > 0 || ['proposal', 'sale'].includes(row.passage.status))
    .sort((a, b) => String(b.passage.updatedAt || b.passage.createdAt).localeCompare(String(a.passage.updatedAt || a.passage.createdAt))), [passages, deals, evaluations]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ passage, deals: linked, evaluations: linkedEvaluations }) => [
      passage.customerName,
      passage.phone,
      passage.interestModel,
      passage.assignedSellerName,
      ...linked.map(d => d.data?.licensePlate),
      ...linkedEvaluations.map(item => item.plate),
    ].some(value => String(value || '').toLowerCase().includes(q)));
  }, [rows, queryText]);

  const selected = rows.find(row => row.passage.id === selectedId) || null;
  const trigger = <button onClick={() => setOpen(true)} className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] px-4 py-2 text-xs font-bold text-emerald-200 transition hover:border-emerald-300/40 hover:bg-emerald-400/[.10]"><span className="inline-flex items-center gap-2"><FileText size={14}/> PROPOSTAS</span></button>;

  return <>
    {portalHost && createPortal(trigger, portalHost)}
    {open && <div className="fixed inset-0 z-[575] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => { setOpen(false); setSelectedId(''); }}>
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-[#15181e] text-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-6">
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-300">SHOWROOMFLOW · GESTÃO</p><h2 className="mt-1 text-2xl font-semibold">Atendimentos & propostas</h2><p className="mt-1 text-sm text-zinc-500">{storeName} · negociações e avaliações MarketIQ vinculadas.</p></div>
          <button onClick={() => { setOpen(false); setSelectedId(''); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-zinc-400"><X size={18}/></button>
        </header>

        <div className="grid min-h-[64vh] lg:grid-cols-[.92fr_1.08fr]">
          <section className="border-b border-white/10 p-4 lg:border-b-0 lg:border-r lg:p-5">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Search size={15} className="text-zinc-600"/><input value={queryText} onChange={e => setQueryText(e.target.value)} placeholder="Cliente, vendedor, placa..." className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-700"/></label>
            <div className="mt-4 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
              {filtered.map(({ passage, deals: linked, evaluations: linkedEvaluations }) => <button key={passage.id} onClick={() => setSelectedId(passage.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === passage.id ? 'border-emerald-300/35 bg-emerald-300/[.06]' : 'border-white/10 bg-white/[.025] hover:border-white/20'}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-white">{passage.customerName}</p><p className="mt-1 truncate text-xs text-zinc-500">{passage.assignedSellerName} · {passage.interestModel || 'sem modelo'}</p></div><ChevronRight size={16} className="mt-1 shrink-0 text-zinc-600"/></div>
                <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full border border-violet-400/20 bg-violet-400/[.06] px-2 py-1 text-[9px] font-black text-violet-300">{statusLabel[passage.status] || passage.status}</span><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-zinc-400">{linked.length} negociação(ões)</span>{linkedEvaluations.length > 0 && <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.05] px-2 py-1 text-[9px] font-black text-cyan-200">{linkedEvaluations.length} MARKETIQ</span>}<span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-zinc-500">{time(passage.createdAt)}</span></div>
              </button>)}
              {!filtered.length && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">Nenhuma proposta vinculada encontrada.</div>}
            </div>
          </section>

          <section className="p-4 lg:p-6">
            {!selected ? <div className="grid min-h-[45vh] place-items-center text-center"><div><Calculator size={34} className="mx-auto text-zinc-700"/><p className="mt-3 font-semibold text-zinc-400">Selecione um atendimento</p><p className="mt-1 text-sm text-zinc-600">Negociações e avaliações vinculadas aparecem aqui em conjunto.</p></div></div> : <div>
              <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-zinc-600"><UserRound size={12}/> Cliente</p><h3 className="mt-1 text-xl font-semibold">{selected.passage.customerName}</h3><p className="mt-1 text-sm text-zinc-500">{selected.passage.phone} · {selected.passage.interestModel || 'Interesse não informado'}</p></div><div className="text-right"><p className="text-xs font-semibold text-zinc-300">{selected.passage.assignedSellerName}</p><p className="mt-1 text-[10px] text-zinc-600">{statusLabel[selected.passage.status] || selected.passage.status}</p></div></div></div>

              {selected.evaluations.length > 0 && <section className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.035] p-4">
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Gauge size={15} className="text-cyan-300"/><p className="text-[10px] font-black uppercase tracking-[.13em] text-cyan-200">AVALIAÇÃO MARKETIQ</p></div><span className="text-[10px] text-zinc-500">{selected.evaluations.length} registro(s)</span></div>
                <div className="mt-3 space-y-2">
                  {selected.evaluations.map((evaluation, index) => <article key={evaluation.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-base">{evaluation.plate || 'SEM PLACA'}</strong>{index === 0 && <span className="rounded-full border border-cyan-300/20 px-2 py-0.5 text-[8px] font-black text-cyan-200">MAIS RECENTE</span>}<span className={`rounded-full border px-2 py-0.5 text-[8px] font-black ${evaluation.status === 'approved' ? 'border-emerald-300/20 text-emerald-300' : evaluation.status === 'rejected' ? 'border-red-300/20 text-red-300' : 'border-amber-300/20 text-amber-200'}`}>{evaluationStatusLabel[evaluation.status] || evaluation.status}</span></div><p className="mt-1 text-xs text-zinc-500">{evaluation.vehicle || 'Modelo não informado'} · {evaluation.year || 'ano não informado'}</p></div><div className="text-right"><p className="text-[9px] uppercase text-zinc-600">Compra recomendada</p><p className="mt-1 font-semibold text-cyan-200">{evaluation.recommendedBuy ? money(evaluation.recommendedBuy) : '—'}</p></div></div>
                    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="FIPE" value={evaluation.fipe || '—'}/><Metric label="KM" value={evaluation.km || '—'}/><Metric label="Avaliador" value={evaluation.createdByName || '—'}/><Metric label="Data" value={evaluationTime(evaluation.createdAt)}/></div>
                    {evaluation.notes && <p className="mt-3 rounded-lg border border-white/5 bg-white/[.02] p-2 text-xs leading-5 text-zinc-400">{evaluation.notes}</p>}
                  </article>)}
                </div>
              </section>}

              <div className="mt-4 space-y-3">
                {selected.deals.map((deal, index) => {
                  const d = deal.data; const payment = d?.payments || { entry: 0, financing: 0, tradeIn: 0 }; const costs = d?.costs || { documentation: 0, accessories: 0, payoff: 0, debts: 0, others: 0 };
                  return <article key={deal.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.12em] text-emerald-300">PROPOSTA {selected.deals.length - index}</p><p className="mt-1 font-mono text-lg font-semibold text-white">{d?.licensePlate || 'SEM PLACA'}</p><p className="mt-1 text-xs text-zinc-600">Salva em {time(deal.timestamp)}</p></div><div className="text-right"><p className="text-xs text-zinc-500">Margem</p><p className={`mt-1 text-xl font-semibold ${Number(deal.summary?.profit || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{money(deal.summary?.profit)}</p><p className="text-xs text-zinc-500">{pct(deal.summary?.marginPercent)}</p></div></div>
                    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Valor nota" value={money(d?.invoiceValue)}/><Metric label="Valor custo" value={money(d?.vehicleCost)}/><Metric label="Dias estoque" value={`${num(d?.stockDays)} dias`}/><Metric label="FIPE" value={money(d?.fipeValue)}/><Metric label="Entrada" value={money(payment.entry)}/><Metric label="Financiamento" value={money(payment.financing)}/><Metric label="Troca" value={money(payment.tradeIn)}/><Metric label="Custos adicionais" value={money(Number(costs.documentation||0)+Number(costs.accessories||0)+Number(costs.payoff||0)+Number(costs.debts||0)+Number(costs.others||0))}/></div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span className={`rounded-full border px-2 py-1 ${d?.dealStatus === 'closed' ? 'border-emerald-400/20 text-emerald-300' : 'border-violet-400/20 text-violet-300'}`}>{d?.dealStatus === 'closed' ? 'VENDA FECHADA' : 'NEGOCIAÇÃO ABERTA'}</span>{d?.isWebLead && <span className="rounded-full border border-sky-400/20 px-2 py-1 text-sky-300">VENDA WEB / DIVISÃO</span>}</div>
                  </article>;
                })}
                {!selected.deals.length && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">Ainda não há negociação salva para este atendimento. A avaliação MarketIQ pode existir mesmo antes da proposta.</div>}
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
