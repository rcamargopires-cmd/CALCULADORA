import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, CarFront, CheckCircle2, Clock3, Flame, MessageCircle,
  Radar, UserRound, X
} from 'lucide-react';
import type { GroupStockItem } from '../services/groupStockService';
import { isGroupStockAvailable, matchGroupStock } from '../services/crmStockMatchService';
import { showroomFlowService } from '../services/showroomFlowService';
import type { ShowroomPassage, User } from '../types';

type ContactResult = 'talked' | 'no_answer' | 'visit' | 'proposal' | 'advanced';
type Props = {
  user: User;
  items: ShowroomPassage[];
  stock: GroupStockItem[];
  onOpenLead: (lead: ShowroomPassage) => void;
  initialTab?: 'agenda' | 'stock';
  startExpanded?: boolean;
  initialContactLead?: ShowroomPassage | null;
};
type VehicleOpportunity = { vehicle: GroupStockItem; leads: ShowroomPassage[] };

const CONTACT_RESULTS: { value: ContactResult; label: string }[] = [
  { value: 'talked', label: 'Conversei com o cliente' },
  { value: 'no_answer', label: 'Não respondeu' },
  { value: 'visit', label: 'Agendou visita' },
  { value: 'proposal', label: 'Enviei proposta' },
  { value: 'advanced', label: 'Negociação avançou' },
];
const activeLead = (lead: ShowroomPassage) =>
  lead.status !== 'sale' && lead.status !== 'no_deal';

const formatDate = (iso?: string) => {
  if (!iso) return 'Sem data';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Data inválida';
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
};
const formatMoney = (value: number) =>
  value ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Preço não informado';
const cleanPhone = (value: string) => {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
  return phone.length >= 10 ? phone : '';
};
const normalize = (text: string) => String(text || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\bt[\s-]+cross\b/g, 'tcross')
  .replace(/\bhr[\s-]+v\b/g, 'hrv')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const MODEL_STOP = new Set([
  'volkswagen', 'chevrolet', 'hyundai', 'toyota', 'renault', 'peugeot',
  'citroen', 'nissan', 'fiat', 'honda', 'ford', 'jeep', 'audi', 'bmw',
  'mercedes', 'benz', 'kia', 'chery', 'caoa', 'suv', 'sedan', 'hatch',
  'automatico', 'manual', 'flex', 'turbo', 'comfortline', 'highline',
  'platinum', 'limited', 'premier', 'advance', 'exclusive', 'at',
]);

const modelToken = (vehicle: GroupStockItem) =>
  normalize(vehicle.model).split(' ')
    .find(token => token.length >= 4 && !MODEL_STOP.has(token) && !/^\d{4}$/.test(token)) || '';

const likelyMatch = (vehicle: GroupStockItem, lead: ShowroomPassage) => {
  const interest = String(lead.desiredVehicle || lead.interestModel || '');
  const token = modelToken(vehicle);
  if (!token || !normalize(interest).split(' ').includes(token)) return false;
  // O cruzamento é uma sugestão de contato, nunca uma reserva nem confirmação comercial.
  return matchGroupStock([vehicle], interest, 1).length > 0;
};

const dateBucket = (lead: ShowroomPassage, start: number, end: number) => {
  const due = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() : NaN;
  if (Number.isFinite(due)) return due < start ? 'late' : due < end ? 'today' : 'future';
  const last = new Date(lead.lastContactAttemptAt || lead.lastContactAt || lead.createdAt).getTime();
  return Number.isFinite(last) && last <= Date.now() - 3 * 24 * 60 * 60 * 1000
    ? 'idle' : 'no_due';
};

const QuickContact: React.FC<{
  lead: ShowroomPassage;
  user: User;
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ lead, user, onClose, onSaved }) => {
  const [result, setResult] = useState<ContactResult | ''>('');
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState(() => {
    if (!lead.nextFollowUpAt) return '';
    const date = new Date(lead.nextFollowUpAt);
    return Number.isFinite(date.getTime())
      ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : '';
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!result || saving) return;
    setSaving(true);
    setError('');
    try {
      await showroomFlowService.recordCrmContact({
        id: lead.id, result, note,
        nextFollowUpAt: followUp ? new Date(followUp).toISOString() : '',
        actor: { email: user.email, name: user.name },
      });
      onSaved('Contato de ' + (lead.customerName || 'cliente') + ' registrado na ficha.');
    } catch (e: any) {
      setError(e?.message || 'Não foi possível registrar o contato.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[660] grid place-items-center overflow-y-auto bg-slate-950/65 p-3" onClick={onClose}>
    <div className="w-full max-w-lg rounded-[26px] border border-slate-200 bg-white p-5 shadow-2xl md:p-6" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.15em] text-emerald-700">MOTYQ · ATENDIMENTO RÁPIDO</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">{lead.customerName || 'Cliente'}</h3>
          <p className="mt-1 text-xs text-slate-500">{lead.desiredVehicle || lead.interestModel || 'Interesse não informado'}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={18}/></button>
      </div>

      <p className="mb-2 mt-5 text-xs font-bold text-slate-700">Qual foi o resultado?</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {CONTACT_RESULTS.map(option => <button
          key={option.value} type="button" disabled={saving}
          onClick={() => setResult(option.value)}
          className={'rounded-xl border px-3 py-3 text-left text-xs font-semibold transition ' +
            (result === option.value
              ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
        >{option.label}</button>)}
      </div>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-bold text-slate-700">Observação do contato</span>
        <textarea rows={3} maxLength={1200} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Ex.: cliente pediu retorno após receber a simulação."
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-400"/>
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-bold text-slate-700">Próximo contato</span>
        <input type="datetime-local" value={followUp} onChange={e => setFollowUp(e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-emerald-400"/>
      </label>
      <p className="mt-2 text-[11px] text-slate-500">O contato entra na linha do tempo, com data e vendedor. A data é atualizada na agenda.</p>
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      <button type="button" onClick={submit} disabled={!result || saving}
        className="mt-5 w-full rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white disabled:opacity-50">
        {saving ? 'SALVANDO...' : 'REGISTRAR ATENDIMENTO'}
      </button>
    </div>
  </div>;
};

const CustomerRow: React.FC<{
  lead: ShowroomPassage;
  onOpen: () => void;
  onContact: () => void;
  context?: string;
}> = ({ lead, onOpen, onContact, context }) => {
  const wa = cleanPhone(lead.phone);
  return <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <button type="button" onClick={onOpen} className="text-left text-sm font-semibold text-slate-900 hover:text-emerald-700 hover:underline">
          {lead.customerName || 'Cliente'}
        </button>
        <p className="mt-1 text-xs text-slate-500">{lead.desiredVehicle || lead.interestModel || 'Interesse não informado'}</p>
      </div>
      {lead.leadTemperature === 'hot' && <span title="Cliente marcado como quente" className="shrink-0 text-orange-600"><Flame size={16}/></span>}
    </div>
    {context && <p className="mt-2 text-[11px] text-slate-500">{context}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={onContact} className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white">Registrar contato</button>
      <button type="button" onClick={onOpen} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700">Abrir ficha</button>
      {wa && <a href={'https://wa.me/' + wa} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700"><MessageCircle size={13}/> WhatsApp</a>}
    </div>
  </div>;
};

const CrmOpportunityCenter: React.FC<Props> = ({ user, items, stock, onOpenLead, initialTab = 'agenda', startExpanded = false, initialContactLead = null }) => {
  const [tab, setTab] = useState<'agenda' | 'stock'>(initialTab);
  const [minimumDays, setMinimumDays] = useState(30);
  const [expanded, setExpanded] = useState(startExpanded);
  const [showMore, setShowMore] = useState(false);
  const [contact, setContact] = useState<ShowroomPassage | null>(null);
  const [feedback, setFeedback] = useState('');

  useEffect(()=>{
    if(initialContactLead) setContact(initialContactLead);
  },[initialContactLead?.id]);

  const active = useMemo(() => items.filter(activeLead), [items]);
  const agenda = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const groups: Record<string, ShowroomPassage[]> = {
      late: [], today: [], idle: [], no_due: [], future: []
    };
    active.forEach(lead => groups[dateBucket(lead, Date.now(), end.getTime())].push(lead));
    groups.late.sort((a, b) => String(a.nextFollowUpAt).localeCompare(String(b.nextFollowUpAt)));
    groups.today.sort((a, b) => String(a.nextFollowUpAt).localeCompare(String(b.nextFollowUpAt)));
    groups.idle.sort((a, b) => String(a.lastContactAttemptAt || a.lastContactAt || a.createdAt)
      .localeCompare(String(b.lastContactAttemptAt || b.lastContactAt || b.createdAt)));
    groups.future.sort((a, b) => String(a.nextFollowUpAt).localeCompare(String(b.nextFollowUpAt)));
    groups.no_due.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return groups;
  }, [active]);

  const opportunities = useMemo(() => {
    const vehicles = stock.filter(item => isGroupStockAvailable(item) && Number(item.days || 0) >= minimumDays);
    return vehicles.map(vehicle => ({
      vehicle,
      leads: active.filter(lead => likelyMatch(vehicle, lead)),
    })).filter(row => row.leads.length > 0)
      .sort((a, b) => Number(b.vehicle.days || 0) - Number(a.vehicle.days || 0));
  }, [stock, active, minimumDays]);

  const agedCount = stock.filter(item => isGroupStockAvailable(item) && Number(item.days || 0) >= minimumDays).length;

  const agendaGroups = [
    { key: 'late', title: 'Retornos atrasados', hint: 'Promessas de contato vencidas', tone: 'text-red-700' },
    { key: 'today', title: 'Para hoje', hint: 'Retornos marcados para hoje', tone: 'text-emerald-700' },
    { key: 'idle', title: 'Sem contato há 3 dias', hint: 'Clientes ativos sem próximo retorno', tone: 'text-amber-700' },
    { key: 'no_due', title: 'Sem retorno programado', hint: 'Leads ativos que ainda precisam de agenda', tone: 'text-slate-700' },
    { key: 'future', title: 'Próximos retornos', hint: 'Compromissos agendados', tone: 'text-sky-700' },
  ];

  return <section className="overflow-hidden rounded-[26px] border border-emerald-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-emerald-50 to-white p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><Radar size={20}/></div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.15em] text-emerald-700">MOTYQ · CENTRAL DE OPORTUNIDADES</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Seu próximo negócio pode estar aqui</h3>
          <p className="mt-1 text-xs text-slate-500">
            {agenda.late.length} atrasados · {agenda.today.length} para hoje · {opportunities.length} carros com clientes possíveis
          </p>
        </div>
      </div>
      <button type="button" onClick={() => setExpanded(value => !value)}
        className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">
        {expanded ? 'RECOLHER CENTRAL' : 'ABRIR CENTRAL'}
      </button>
    </div>

    {expanded && <div className="space-y-4 border-t border-emerald-100 p-4 md:p-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setTab('agenda'); setShowMore(false); }}
          className={'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold ' +
            (tab === 'agenda' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700')}>
          <CalendarClock size={15}/> Agenda comercial
        </button>
        <button type="button" onClick={() => { setTab('stock'); setShowMore(false); }}
          className={'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold ' +
            (tab === 'stock' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700')}>
          <CarFront size={15}/> Clientes para carros parados
        </button>
      </div>
      {feedback && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
        <CheckCircle2 size={15} className="mr-2 inline"/>{feedback}
      </div>}

      {tab === 'agenda' ? <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {agendaGroups.map(group => {
          const rows = agenda[group.key];
          return <section key={group.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h4 className={'flex items-center gap-1.5 text-sm font-bold ' + group.tone}><Clock3 size={15}/>{group.title}</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">{group.hint}</p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-700">{rows.length}</span>
            </div>
            <div className="space-y-2">
              {(showMore ? rows : rows.slice(0, 5)).map(lead =>
                <CustomerRow key={lead.id} lead={lead}
                  context={lead.nextFollowUpAt ? 'Retorno: ' + formatDate(lead.nextFollowUpAt) : 'Último contato/tentativa: ' + formatDate(lead.lastContactAttemptAt || lead.lastContactAt || lead.createdAt)}
                  onOpen={() => onOpenLead(lead)} onContact={() => setContact(lead)}/>)}
              {!rows.length && <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">Tudo em dia nesta categoria.</p>}
            </div>
            {rows.length > 5 && <button type="button" onClick={() => setShowMore(value => !value)} className="mt-3 text-xs font-bold text-emerald-700">
              {showMore ? 'Mostrar menos' : 'Ver todos (' + rows.length + ')'}
            </button>}
          </section>;
        })}
      </div> : <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">{agedCount} veículo(s) disponíveis com pelo menos {minimumDays} dias</h4>
            <p className="mt-1 text-xs text-slate-500">Só aparecem sugestões quando o modelo está escrito no interesse de um cliente ativo. Confirme versão, preço e disponibilidade antes de oferecer.</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            Dias no estoque
            <select value={minimumDays} onChange={e => setMinimumDays(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <option value={30}>30+</option>
              <option value={45}>45+</option>
              <option value={60}>60+</option>
              <option value={90}>90+</option>
            </select>
          </label>
        </div>
        {!opportunities.length ? <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
          <CarFront size={26} className="mx-auto text-slate-300"/>
          <p className="mt-2 text-sm font-semibold text-slate-700">Nenhum cruzamento de modelo nesta faixa.</p>
          <p className="mt-1 text-xs text-slate-500">Cadastre modelos na ficha do cliente ou reduza o filtro de dias. Busca genérica por “SUV” não vira compatibilidade confirmada.</p>
        </div> : <div className="grid gap-3 lg:grid-cols-2">
          {(showMore ? opportunities : opportunities.slice(0, 8)).map(({ vehicle, leads }) =>
            <article key={vehicle.plate} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{vehicle.model}</p>
                  <p className="mt-1 text-xs text-slate-500">{vehicle.plate} · {vehicle.year || 'Ano não informado'} · {vehicle.location || vehicle.stockOwner || 'Local não informado'}</p>
                  <p className="mt-1 text-xs text-slate-500">{vehicle.km ? Number(vehicle.km).toLocaleString('pt-BR') + ' km · ' : ''}{formatMoney(Number(vehicle.suggestedPrice || 0))}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800">{vehicle.days} dias</span>
              </div>
              <p className="mt-4 flex items-center gap-1 text-xs font-bold text-emerald-700"><UserRound size={13}/>{leads.length} cliente(s) para avaliar</p>
              <div className="mt-2 space-y-2">
                {leads.slice(0, showMore ? 30 : 3).map(lead =>
                  <CustomerRow key={lead.id} lead={lead} onOpen={() => onOpenLead(lead)}
                    onContact={() => setContact(lead)} context={lead.assignedSellerName ? 'Vendedor: ' + lead.assignedSellerName : undefined}/>)}
              </div>
              {leads.length > (showMore ? 30 : 3) && <p className="mt-2 text-xs text-slate-500">Mais {leads.length - (showMore ? 30 : 3)} clientes. Use “Mostrar todos”.</p>}
            </article>)}
        </div>}
        {opportunities.length > 8 && <button type="button" onClick={() => setShowMore(value => !value)}
          className="mt-4 rounded-xl border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-700">
          {showMore ? 'Mostrar menos' : 'Mostrar todos os ' + opportunities.length + ' veículos'}
        </button>}
      </div>}
    </div>}
    {contact && <QuickContact key={contact.id} lead={contact} user={user}
      onClose={() => setContact(null)}
      onSaved={message => { setContact(null); setFeedback(message); }}/>}
  </section>;
};

export default CrmOpportunityCenter;
