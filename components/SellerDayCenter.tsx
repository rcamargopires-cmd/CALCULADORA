import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, CarFront, ChartNoAxesCombined, ChevronRight, ClipboardList, Clock3, FileText, MessageCircle, UsersRound, WalletCards } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ShowroomPassage, User } from '../types';
import type { GroupStockItem } from '../services/groupStockService';
import { showroomFlowService } from '../services/showroomFlowService';
import { groupStockService } from '../services/groupStockService';
import { isGroupStockAvailable, matchGroupStock } from '../services/crmStockMatchService';
import { companyScopeService } from '../services/companyScopeService';
import { storeScopeService } from '../services/storeScopeService';
import { sellerPerformanceService } from '../services/sellerPerformanceService';

type Props = { user: User; onStartNewCalculation: () => void };
type Navigation = { action?: 'lead' | 'contact'; leadId?: string; tab?: 'agenda' | 'stock' };
type Priority = { lead: ShowroomPassage; label: string; tone: 'red' | 'amber' | 'blue' };

const openCrm = (detail: Navigation = {}) =>
  window.dispatchEvent(new CustomEvent('motyq:open-crm', { detail }));
const isActive = (lead: ShowroomPassage) => lead.status !== 'sale' && lead.status !== 'no_deal';
const firstName = (name: string) => String(name || 'Vendedor').trim().split(/\s+/)[0] || 'Vendedor';
const localDateTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
};
const waLink = (phone: string) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const number = digits.length === 10 || digits.length === 11 ? '55' + digits : digits;
  return number.length >= 12 ? 'https://wa.me/' + number : '';
};

const SellerDayCenter: React.FC<Props> = ({user, onStartNewCalculation}) => {
  const [leads, setLeads] = useState<ShowroomPassage[]>([]);
  const [stock, setStock] = useState<GroupStockItem[]>([]);
  const [leadsReady, setLeadsReady] = useState(false);
  const [stockReady, setStockReady] = useState(false);
  const [leadsError, setLeadsError] = useState(false);
  const [stockError, setStockError] = useState(false);
  const [sales, setSales] = useState<number | null>(null);
  const [referenceDate, setReferenceDate] = useState('');
  const [goal, setGoal] = useState(user.goals?.monthly ?? 15);
  const [now, setNow] = useState(() => Date.now());

  const companyId = companyScopeService.get(user);
  const storeId = storeScopeService.get(user);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLeadsReady(false); setLeadsError(false); setLeads([]);
    return showroomFlowService.subscribeSellerPassages(companyId, storeId, user.email,
      rows => {setLeads(rows); setLeadsReady(true); setLeadsError(false);},
      error => {console.warn('Central do Dia: CRM indisponível', error);setLeadsError(true);setLeadsReady(true);}
    );
  }, [companyId, storeId, user.email]);

  useEffect(() => {
    setStockReady(false); setStockError(false); setStock([]);
    return groupStockService.subscribe(companyId,
      snapshot => {setStock(snapshot?.items || []);setStockReady(true);setStockError(false);},
      error => {console.warn('Central do Dia: estoque indisponível', error);setStockError(true);setStockReady(true);}
    );
  }, [companyId]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [recordResult, configResult] = await Promise.allSettled([
        sellerPerformanceService.getMine(user.email),
        getDoc(doc(db, 'config/performance')),
      ]);
      if (!alive) return;
      if (recordResult.status === 'fulfilled') {
        const record = recordResult.value;
        const month = new Date().toLocaleDateString('en-CA').slice(0,7);
        const recordMonth = String(record?.referenceDate || '').slice(0,7);
        const sameScope = (!record?.companyId || record.companyId === companyId)
          && (!record?.storeId || record.storeId === storeId);
        setSales(record && recordMonth === month && sameScope ? Number(record.metrics.closing || 0) : null);
        setReferenceDate(record && sameScope ? record.referenceDate : '');
      } else {setSales(null);setReferenceDate('');}
      if (configResult.status === 'fulfilled' && configResult.value.exists()) {
        const value = Number(configResult.value.data()?.sellerMonthlyGoal);
        setGoal(user.goals?.monthly ?? (value > 0 ? value : 15));
      } else setGoal(user.goals?.monthly ?? 15);
    };
    void load();
    const refresh = () => {void load();};
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => {alive = false;window.removeEventListener('dealmaster:operational-data-updated', refresh);};
  }, [user.email, user.goals?.monthly, companyId, storeId]);

  const active = useMemo(() => leads.filter(isActive), [leads]);
  const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
  const endOfDay = new Date(startOfDay);endOfDay.setDate(endOfDay.getDate()+1);

  const {priorities, overdue, proposals} = useMemo(() => {
    const late: Priority[] = [], today: Priority[] = [], idle: Priority[] = [], negotiation: Priority[] = [];
    active.forEach(lead => {
      const due = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() : NaN;
      const last = new Date(lead.lastContactAttemptAt || lead.lastContactAt || lead.createdAt).getTime();
      if (Number.isFinite(due) && due < now) late.push({lead,label:'Retorno atrasado · ' + localDateTime(lead.nextFollowUpAt),tone:'red'});
      else if (Number.isFinite(due) && due < endOfDay.getTime()) today.push({lead,label:'Retorno hoje · ' + localDateTime(lead.nextFollowUpAt),tone:'blue'});
      else if (!Number.isFinite(due) && Number.isFinite(last) && last <= now - 3 * 86_400_000) {
        idle.push({lead,label:'Sem contato há 3 dias ou mais',tone:'amber'});
      } else if (lead.status === 'proposal' && !Number.isFinite(due)) {
        negotiation.push({lead,label:'Proposta sem retorno agendado',tone:'amber'});
      }
    });
    late.sort((a,b) => String(a.lead.nextFollowUpAt).localeCompare(String(b.lead.nextFollowUpAt)));
    today.sort((a,b) => String(a.lead.nextFollowUpAt).localeCompare(String(b.lead.nextFollowUpAt)));
    idle.sort((a,b) => String(a.lead.lastContactAt || a.lead.createdAt).localeCompare(String(b.lead.lastContactAt || b.lead.createdAt)));
    return {
      priorities:[...late,...today,...idle,...negotiation],
      overdue:late.length,
      proposals:active.filter(lead => lead.status === 'proposal').length,
    };
  }, [active, now, endOfDay.getTime()]);

  const opportunities = useMemo(() => {
    const available = stock.filter(isGroupStockAvailable);
    return active.flatMap(lead => {
      const interest = String(lead.desiredVehicle || lead.interestModel || '').trim();
      if (!interest) return [];
      return matchGroupStock(available,interest,3)
        .filter(match => match.kind === 'exact')
        .map(match => ({lead,car:match.item}));
    }).sort((a,b)=>Number(b.car.days || 0)-Number(a.car.days || 0));
  },[active,stock]);
  const opportunityCars = new Set(opportunities.map(item => item.car.plate)).size;

  const tiles = [
    {label:'Clientes para atender',number:leadsReady&&!leadsError?priorities.length:'—',hint:leadsError?'CRM indisponível':overdue+' retorno(s) vencido(s)',color:'bg-blue-50 text-blue-900',icon:<UsersRound size={18}/>},
    {label:'Oportunidades no estoque',number:leadsReady&&stockReady&&!leadsError&&!stockError?opportunityCars:'—',hint:stockError?'Estoque indisponível':'Sugestões para meus clientes',color:'bg-emerald-50 text-emerald-900',icon:<CarFront size={18}/>},
    {label:'Leads em proposta',number:leadsReady&&!leadsError?proposals:'—',hint:'Negociações no CRM',color:'bg-amber-50 text-amber-900',icon:<ClipboardList size={18}/>},
    {label:'Minhas vendas no mês',number:sales ?? '—',hint:sales===null?'Sem mapa do mês': 'Meta: '+goal+' · Mapa '+referenceDate.split('-').reverse().join('/'),color:'bg-slate-100 text-slate-900',icon:<ChartNoAxesCombined size={18}/>},
  ];

  return <section aria-label="Central do Dia do vendedor" className="mb-6 overflow-hidden rounded-[30px] border border-slate-200 bg-[#f7f9fc] p-4 text-slate-900 shadow-sm md:p-7">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.17em] text-emerald-700">MOTYQ · CENTRAL DO DIA</p>
        <h2 className="mt-1 text-2xl font-semibold md:text-3xl">Bom {new Date(now).getHours()<12?'dia':new Date(now).getHours()<18?'tarde':'noite'}, {firstName(user.name)}!</h2>
        <p className="mt-1 text-sm text-slate-500">O que precisa da sua atenção agora.</p>
      </div>
      <button type="button" onClick={() => openCrm({tab:'agenda'})}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">
        ABRIR CRM <ArrowRight size={15}/>
      </button>
    </div>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {tiles.map(tile => <div key={tile.label} className={'min-w-0 rounded-2xl p-3 md:p-4 '+tile.color}>
        <div className="mb-2 opacity-70">{tile.icon}</div>
        <p className="text-[11px] font-semibold">{tile.label}</p>
        <strong className="mt-1 block text-3xl font-semibold">{tile.number}</strong>
        <p className="mt-1 text-[11px] opacity-75">{tile.hint}</p>
      </div>)}
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><CalendarClock size={17} className="text-amber-700"/><h3 className="font-bold">Prioridades de hoje</h3></div>
          <button type="button" onClick={() => openCrm({tab:'agenda'})} className="flex items-center gap-1 text-xs font-bold text-emerald-700">Ver agenda <ChevronRight size={14}/></button>
        </div>
        {!leadsReady && <p className="text-sm text-slate-500">Carregando sua carteira...</p>}
        {leadsError && <p className="text-sm text-amber-700">Não foi possível consultar sua carteira. Abra o CRM para tentar novamente.</p>}
        {leadsReady&&!leadsError&&!priorities.length && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Sem retornos vencidos ou clientes parados na sua carteira. Consulte o CRM para novas oportunidades.</p>}
        {leadsReady&&!leadsError&&priorities.slice(0,4).map(({lead,label,tone}) => <article key={lead.id} className="mb-2 rounded-xl border border-slate-200 p-3 last:mb-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <button type="button" onClick={() => openCrm({action:'lead',leadId:lead.id})} className="text-left text-sm font-bold text-slate-900 hover:text-emerald-700 hover:underline">{lead.customerName || 'Cliente'}</button>
              <p className="mt-0.5 text-xs text-slate-500">{lead.desiredVehicle || lead.interestModel || 'Veículo não informado'}</p>
            </div>
            <span className={'rounded-full px-2 py-1 text-[10px] font-semibold '+(tone==='red'?'bg-red-50 text-red-700':tone==='amber'?'bg-amber-50 text-amber-800':'bg-blue-50 text-blue-700')}>{label}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => openCrm({action:'contact',leadId:lead.id,tab:'agenda'})} className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white">Registrar contato</button>
            <button type="button" onClick={() => openCrm({action:'lead',leadId:lead.id})} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700">Abrir ficha</button>
            {waLink(lead.phone)&&<a href={waLink(lead.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-2 text-[11px] font-bold text-emerald-700"><MessageCircle size={13}/> WhatsApp</a>}
          </div>
        </article>)}
        {priorities.length>4 && <button type="button" onClick={() => openCrm({tab:'agenda'})} className="mt-2 text-xs font-bold text-emerald-700">Ver mais {priorities.length-4} prioridade(s) no CRM</button>}
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <div className="mb-3 flex items-center gap-2"><CarFront size={17} className="text-emerald-700"/><h3 className="font-bold">Carros para seus clientes</h3></div>
          {(!leadsReady||!stockReady)&&<p className="text-sm text-slate-500">Consultando estoque e CRM...</p>}
          {(leadsError||stockError)&&<p className="text-sm text-amber-700">Cruzamento indisponível no momento.</p>}
          {leadsReady&&stockReady&&!leadsError&&!stockError&&!opportunities.length&&<p className="text-sm text-slate-500">Nenhum cruzamento de modelo encontrado agora.</p>}
          {leadsReady&&stockReady&&!leadsError&&!stockError&&opportunities.slice(0,3).map(({car,lead})=><button type="button" key={lead.id+'_'+car.plate} onClick={() => openCrm({action:'lead',leadId:lead.id})}
            className="mb-2 block w-full rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-left last:mb-0">
            <span className="block text-xs font-bold text-emerald-900">{car.model}</span>
            <span className="mt-0.5 block text-[11px] text-emerald-800">{car.year} · {car.days} dias · {car.location || car.stockOwner}</span>
            <span className="mt-1 block text-xs text-emerald-900">Possível opção para {lead.customerName || 'cliente'} <ArrowRight size={12} className="inline"/></span>
          </button>)}
          <button type="button" onClick={() => openCrm({tab:'stock'})} className="mt-3 flex items-center gap-1 text-xs font-bold text-emerald-700">Abrir radar de estoque <ChevronRight size={14}/></button>
          <p className="mt-2 text-[10px] text-slate-400">Sugestões por modelo. Confirme versão, preço e disponibilidade.</p>
        </div>
        <div className="rounded-2xl bg-slate-900 p-4 text-white md:p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-300">Acesso rápido</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => openCrm({tab:'agenda'})} className="flex min-h-20 flex-col items-start justify-between rounded-xl bg-white p-3 text-left text-xs font-bold text-slate-900"><UsersRound size={20}/> Clientes</button>
            <button type="button" onClick={() => openCrm({tab:'stock'})} className="flex min-h-20 flex-col items-start justify-between rounded-xl bg-white p-3 text-left text-xs font-bold text-slate-900"><CarFront size={20}/> Buscar carros</button>
            <button type="button" onClick={onStartNewCalculation} className="flex min-h-20 flex-col items-start justify-between rounded-xl bg-white p-3 text-left text-xs font-bold text-slate-900"><WalletCards size={20}/> Nova negociação</button>
            <button type="button" onClick={() => document.getElementById('seller-performance')?.scrollIntoView({behavior:'smooth'})} className="flex min-h-20 flex-col items-start justify-between rounded-xl bg-white p-3 text-left text-xs font-bold text-slate-900"><FileText size={20}/> Meu desempenho</button>
          </div>
          <p className="mt-3 flex items-center gap-1 text-[11px] text-slate-400"><Clock3 size={12}/> Dados do CRM e estoque atualizados automaticamente.</p>
        </div>
      </div>
    </div>
  </section>;
};
export default SellerDayCenter;
