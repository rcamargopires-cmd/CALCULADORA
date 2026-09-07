import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { BellRing, CarFront, CheckCircle2, ClipboardCheck, Clock3, Play, Send, X } from 'lucide-react';
import { auth } from '../firebase';
import { User } from '../types';
import { companyIdForUser } from '../services/companyService';
import { storeIdForUser } from '../services/storeService';
import { companyScopeService, COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { storeScopeService, STORE_SCOPE_EVENT } from '../services/storeScopeService';
import { userService } from '../services/userService';
import {
  EvaluationRequest,
  EvaluationRequestType,
  evaluationRequestService,
} from '../services/evaluationRequestService';

const ACTIVE_REQUEST_KEY = 'motyq:active-evaluation-request';

const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const money = (value?: number) => typeof value === 'number'
  ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : '—';

const dateLabel = (value: any) => {
  try {
    const date = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : 'agora';
  } catch { return 'agora'; }
};

const statusLabel = (status: EvaluationRequest['status']) => {
  if (status === 'requested') return 'AGUARDANDO';
  if (status === 'in_progress') return 'EM AVALIAÇÃO';
  if (status === 'completed') return 'CONCLUÍDA';
  if (status === 'rejected') return 'RECUSADA';
  return 'CANCELADA';
};

const statusTone = (status: EvaluationRequest['status']) => {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'rejected' || status === 'cancelled') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'in_progress') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

type FormState = {
  evaluationType: EvaluationRequestType;
  evaluatorEmail: string;
  customerName: string;
  customerPhone: string;
  interestModel: string;
  plate: string;
  renavam: string;
  vehicle: string;
  year: string;
  km: string;
  hasSpareKey: string;
  hasManual: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  evaluationType: 'trade_in',
  evaluatorEmail: '',
  customerName: '',
  customerPhone: '',
  interestModel: '',
  plate: '',
  renavam: '',
  vehicle: '',
  year: '',
  km: '',
  hasSpareKey: '',
  hasManual: '',
  notes: '',
});

const inputCls = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
const labelCls = 'mb-1 block text-[10px] font-extrabold uppercase tracking-[.11em] text-slate-500';

const EvaluationRequestFlowShell: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [requests, setRequests] = useState<EvaluationRequest[]>([]);
  const [evaluators, setEvaluators] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [toast, setToast] = useState('');
  const statusesRef = useRef<Record<string, EvaluationRequest['status']>>({});
  const firstSnapshotRef = useRef(true);

  const isSeller = user?.role === 'seller' || user?.role === 'user';
  const isEvaluator = user?.role === 'manager' || user?.role === 'admin';

  const resolveScope = (profile: User) => {
    const company = profile.role === 'admin' ? companyScopeService.get(profile) : companyIdForUser(profile);
    const store = profile.role === 'admin' ? storeScopeService.get(profile) : storeIdForUser(profile);
    setCompanyId(company);
    setStoreId(store);
  };

  useEffect(() => onAuthStateChanged(auth, async fb => {
    if (!fb?.email) { setUser(null); return; }
    try {
      const profile = await userService.getUser(fb.email);
      if (!profile || profile.status !== 'active' || !['admin', 'manager', 'seller', 'user'].includes(profile.role)) {
        setUser(null);
        return;
      }
      setUser(profile);
      resolveScope(profile);
    } catch {
      setUser(null);
    }
  }), []);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const refresh = () => resolveScope(user);
    window.addEventListener(COMPANY_SCOPE_EVENT, refresh);
    window.addEventListener(STORE_SCOPE_EVENT, refresh);
    return () => {
      window.removeEventListener(COMPANY_SCOPE_EVENT, refresh);
      window.removeEventListener(STORE_SCOPE_EVENT, refresh);
    };
  }, [user]);

  useEffect(() => {
    if (!user || !companyId || !storeId) return;
    firstSnapshotRef.current = true;
    statusesRef.current = {};
    const unsubscribe = evaluationRequestService.subscribe(user, companyId, storeId, items => {
      if (isSeller && !firstSnapshotRef.current) {
        for (const item of items) {
          const previous = statusesRef.current[item.id];
          if (previous && previous !== item.status && item.status === 'completed') {
            setToast(`Avaliação concluída · ${item.plate}${typeof item.recommendedBuy === 'number' ? ` · ${money(item.recommendedBuy)}` : ''}`);
          }
          if (previous && previous !== item.status && item.status === 'rejected') {
            setToast(`Avaliação recusada · ${item.plate}`);
          }
        }
      }
      statusesRef.current = Object.fromEntries(items.map(item => [item.id, item.status]));
      firstSnapshotRef.current = false;
      setRequests(items);
    }, () => setError('Não foi possível acompanhar as solicitações de avaliação.'));
    return unsubscribe;
  }, [user, companyId, storeId, isSeller]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!user || !companyId || !storeId || !isSeller) return;
    let active = true;
    void userService.getAll(companyId, storeId).then(list => {
      if (!active) return;
      setEvaluators(list.filter(item => item.status === 'active' && (item.role === 'manager' || item.role === 'admin')));
    }).catch(() => setEvaluators([]));
    return () => { active = false; };
  }, [user, companyId, storeId, isSeller]);

  useEffect(() => {
    if (!user || !isEvaluator) return;
    const persisted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.action !== 'decision' || !['approved', 'rejected'].includes(detail.status)) return;
      try {
        const raw = window.sessionStorage.getItem(ACTIVE_REQUEST_KEY);
        if (!raw) return;
        const request = JSON.parse(raw) as EvaluationRequest;
        if (!request?.id || cleanPlate(request.plate) !== cleanPlate(detail.plate || '')) return;
        void evaluationRequestService.finish(
          request.id,
          detail.status === 'approved' ? 'completed' : 'rejected',
          typeof detail.recommendedBuy === 'number' ? detail.recommendedBuy : undefined,
          detail.id || undefined,
        ).then(() => {
          window.sessionStorage.removeItem(ACTIVE_REQUEST_KEY);
          setToast(detail.status === 'approved' ? 'Avaliação concluída e devolvida ao vendedor.' : 'Avaliação marcada como recusada.');
        });
      } catch {}
    };
    window.addEventListener('motyq:marketiq-persisted', persisted as EventListener);
    return () => window.removeEventListener('motyq:marketiq-persisted', persisted as EventListener);
  }, [user, isEvaluator]);

  const pending = useMemo(() => requests.filter(item => item.status === 'requested' || item.status === 'in_progress'), [requests]);
  const mine = useMemo(() => requests.slice(0, 12), [requests]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!user || !isSeller || saving) return;
    setError('');
    setSuccess('');
    const plate = cleanPlate(form.plate);
    if (!plate) { setError('Informe a placa do veículo que será avaliado.'); return; }
    if (!form.vehicle.trim()) { setError('Informe o veículo/modelo que será avaliado.'); return; }
    const evaluator = evaluators.find(item => item.email.toLowerCase() === form.evaluatorEmail.toLowerCase());
    setSaving(true);
    try {
      await evaluationRequestService.create({
        companyId,
        storeId,
        userId: user.email.toLowerCase(),
        requesterEmail: user.email.toLowerCase(),
        requesterName: user.name || user.email,
        evaluatorEmail: evaluator?.email || '',
        evaluatorName: evaluator?.name || '',
        evaluationType: form.evaluationType,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        interestModel: form.interestModel.trim(),
        plate,
        renavam: form.renavam.trim(),
        vehicle: form.vehicle.trim(),
        year: form.year.trim(),
        km: form.km.trim(),
        hasSpareKey: form.hasSpareKey,
        hasManual: form.hasManual,
        notes: form.notes.trim(),
      });
      setSuccess('Solicitação enviada. Ela já apareceu para o avaliador.');
      setForm(emptyForm());
    } catch (e) {
      console.error('Evaluation request create failed', e);
      setError('Não foi possível enviar a solicitação. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const startEvaluation = async (request: EvaluationRequest) => {
    if (!user || !isEvaluator) return;
    setError('');
    try {
      await evaluationRequestService.start(request.id, user);
      const active = { ...request, status: 'in_progress' as const, evaluatorEmail: user.email, evaluatorName: user.name || user.email };
      window.sessionStorage.setItem(ACTIVE_REQUEST_KEY, JSON.stringify(active));
      setOpen(false);
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('motyq:marketiq-open-request', { detail: active }));
      }, 120);
    } catch (e) {
      console.error('Evaluation request start failed', e);
      setError('Não foi possível iniciar esta avaliação.');
    }
  };

  if (!user || !companyId || !storeId || (!isSeller && !isEvaluator)) return null;

  return <>
    <button
      onClick={() => { setOpen(true); setError(''); setSuccess(''); }}
      title={isSeller ? 'Solicitar avaliação' : 'Avaliações pendentes'}
      className="fixed bottom-[218px] right-4 z-[158] flex h-12 items-center gap-2 rounded-2xl border border-sky-200 bg-white px-3 text-sky-700 shadow-lg shadow-slate-200/70 transition hover:border-sky-300 hover:bg-sky-50"
    >
      <ClipboardCheck size={18}/>
      <span className="hidden text-xs font-extrabold sm:block">{isSeller ? 'AVALIAÇÃO' : `AVALIAÇÕES${pending.length ? ` · ${pending.length}` : ''}`}</span>
      {isEvaluator && pending.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-white sm:hidden">{pending.length}</span>}
    </button>

    {toast && <div className="fixed right-5 top-24 z-[760] flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-lg">
      <BellRing size={18}/><span>{toast}</span>
    </div>}

    {open && <div className="fixed inset-0 z-[730] overflow-y-auto bg-slate-900/35 p-3 backdrop-blur-sm md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[26px] border border-slate-200 bg-white text-slate-800 shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-5 md:px-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-600">MOTYQ · AVALIAÇÃO DE TROCA</p>
            <h2 className="mt-1 text-2xl font-semibold">{isSeller ? 'Solicitar avaliação' : 'Avaliações pendentes'}</h2>
            <p className="mt-1 text-sm text-slate-500">{isSeller ? 'Envie o veículo para a fila do avaliador sem sair do MOTYQ.' : 'Receba a solicitação e abra o MarketIQ já preenchido.'}</p>
          </div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={18}/></button>
        </header>

        {error && <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:mx-7">{error}</div>}
        {success && <div className="mx-5 mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 md:mx-7"><CheckCircle2 size={17}/>{success}</div>}

        {isSeller ? <div className="grid gap-6 p-5 md:p-7 lg:grid-cols-[1.2fr_.8fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <h3 className="mb-4 font-semibold">Avaliação</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className={labelCls}>Tipo de avaliação</span><select value={form.evaluationType} onChange={e => setField('evaluationType', e.target.value as EvaluationRequestType)} className={inputCls}><option value="trade_in">Troca</option><option value="direct_purchase">Compra direta</option><option value="simple">Avaliação simples</option></select></label>
                <label><span className={labelCls}>Avaliador responsável</span><select value={form.evaluatorEmail} onChange={e => setField('evaluatorEmail', e.target.value)} className={inputCls}><option value="">Qualquer avaliador disponível</option>{evaluators.map(item => <option key={item.email} value={item.email}>{item.name || item.email}</option>)}</select></label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <h3 className="mb-4 font-semibold">Dados do cliente</h3>
              <div className="grid gap-3 sm:grid-cols-2"><label><span className={labelCls}>Nome</span><input value={form.customerName} onChange={e => setField('customerName', e.target.value)} className={inputCls}/></label><label><span className={labelCls}>Telefone / celular</span><input value={form.customerPhone} onChange={e => setField('customerPhone', e.target.value)} className={inputCls}/></label></div>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <h3 className="mb-4 font-semibold">Veículo de interesse</h3>
              <label><span className={labelCls}>Veículo que o cliente pretende comprar</span><input value={form.interestModel} onChange={e => setField('interestModel', e.target.value)} placeholder="Ex.: T-Cross Comfortline 2025" className={inputCls}/></label>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-4 flex items-center gap-2"><CarFront size={17} className="text-sky-600"/><h3 className="font-semibold">Veículo para avaliação</h3></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label><span className={labelCls}>Placa *</span><input value={form.plate} onChange={e => setField('plate', cleanPlate(e.target.value))} maxLength={7} className={inputCls}/></label>
                <label><span className={labelCls}>RENAVAM</span><input value={form.renavam} onChange={e => setField('renavam', e.target.value.replace(/\D/g, '').slice(0, 11))} inputMode="numeric" className={inputCls}/></label>
                <label><span className={labelCls}>Ano/modelo</span><input value={form.year} onChange={e => setField('year', e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className={inputCls}/></label>
                <label className="sm:col-span-2"><span className={labelCls}>Modelo / versão *</span><input value={form.vehicle} onChange={e => setField('vehicle', e.target.value)} placeholder="Ex.: Santa Fe GLS 3.5 V6 4x4" className={inputCls}/></label>
                <label><span className={labelCls}>KM atual</span><input value={form.km} onChange={e => setField('km', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls}/></label>
                <label><span className={labelCls}>Possui chave reserva?</span><select value={form.hasSpareKey} onChange={e => setField('hasSpareKey', e.target.value)} className={inputCls}><option value="">Escolha</option><option value="yes">Sim</option><option value="no">Não</option></select></label>
                <label><span className={labelCls}>Tem manual?</span><select value={form.hasManual} onChange={e => setField('hasManual', e.target.value)} className={inputCls}><option value="">Escolha</option><option value="yes">Sim</option><option value="no">Não</option></select></label>
                <label className="sm:col-span-2 lg:col-span-3"><span className={labelCls}>Observações</span><textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" placeholder="Ex.: cliente aguardando na loja, detalhe no para-choque traseiro..."/></label>
              </div>
              <button onClick={submit} disabled={saving} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-extrabold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"><Send size={16}/>{saving ? 'ENVIANDO...' : 'SOLICITAR AVALIAÇÃO'}</button>
            </section>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:sticky lg:top-5 lg:self-start">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Minhas solicitações</h3><span className="text-xs text-slate-500">{mine.length}</span></div>
            <div className="mt-4 space-y-3">{mine.length ? mine.map(item => <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2"><div><strong className="text-sm">{item.plate} · {item.vehicle}</strong><p className="mt-1 text-[11px] text-slate-500">{dateLabel(item.createdAt)}{item.evaluatorName ? ` · ${item.evaluatorName}` : ''}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black ${statusTone(item.status)}`}>{statusLabel(item.status)}</span></div>
              {item.status === 'completed' && <div className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800"><span className="block text-[9px] font-black uppercase tracking-[.1em] text-emerald-600">Compra recomendada</span><strong className="mt-0.5 block text-base">{money(item.recommendedBuy)}</strong></div>}
            </div>) : <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Você ainda não enviou nenhuma avaliação.</div>}</div>
          </aside>
        </div> : <div className="p-5 md:p-7">
          <div className="mb-4 grid grid-cols-3 gap-3"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[9px] font-black uppercase text-amber-600">Aguardando</p><strong className="mt-1 block text-2xl text-amber-800">{requests.filter(item => item.status === 'requested').length}</strong></div><div className="rounded-xl border border-sky-200 bg-sky-50 p-3"><p className="text-[9px] font-black uppercase text-sky-600">Em avaliação</p><strong className="mt-1 block text-2xl text-sky-800">{requests.filter(item => item.status === 'in_progress').length}</strong></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[9px] font-black uppercase text-emerald-600">Concluídas</p><strong className="mt-1 block text-2xl text-emerald-800">{requests.filter(item => item.status === 'completed').length}</strong></div></div>
          <div className="space-y-3">{requests.length ? requests.map(item => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex flex-wrap items-center gap-2"><strong>{item.plate} · {item.vehicle}</strong><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusTone(item.status)}`}>{statusLabel(item.status)}</span></div><p className="mt-1 text-xs text-slate-500">Solicitado por {item.requesterName || item.requesterEmail} · {dateLabel(item.createdAt)}</p></div>
              {(item.status === 'requested' || item.status === 'in_progress') && <button onClick={() => void startEvaluation(item)} className="flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-xs font-extrabold text-white hover:bg-sky-700"><Play size={15}/>{item.status === 'in_progress' ? 'CONTINUAR AVALIAÇÃO' : 'INICIAR AVALIAÇÃO'}</button>}
            </div>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><span className="block text-[9px] font-black uppercase text-slate-400">Cliente</span>{item.customerName || 'Não informado'}{item.customerPhone ? <span className="block text-xs text-slate-500">{item.customerPhone}</span> : null}</div><div className="rounded-xl bg-slate-50 p-3"><span className="block text-[9px] font-black uppercase text-slate-400">RENAVAM</span>{item.renavam || 'Não informado'}</div><div className="rounded-xl bg-slate-50 p-3"><span className="block text-[9px] font-black uppercase text-slate-400">Ano / KM</span>{item.year || '—'} · {item.km ? `${item.km} km` : '—'}</div><div className="rounded-xl bg-slate-50 p-3"><span className="block text-[9px] font-black uppercase text-slate-400">Chave / manual</span>{item.hasSpareKey === 'yes' ? 'Chave sim' : item.hasSpareKey === 'no' ? 'Chave não' : 'Chave —'} · {item.hasManual === 'yes' ? 'Manual sim' : item.hasManual === 'no' ? 'Manual não' : 'Manual —'}</div></div>
            {item.notes && <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{item.notes}</p>}
            {item.status === 'completed' && <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800"><CheckCircle2 size={18}/><div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-emerald-600">Resultado enviado ao vendedor</span><strong>{money(item.recommendedBuy)}</strong></div></div>}
          </article>) : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500"><Clock3 size={24} className="mx-auto mb-2 text-slate-400"/>Nenhuma solicitação de avaliação nesta unidade.</div>}</div>
        </div>}
      </div>
    </div>}
  </>;
};

export default EvaluationRequestFlowShell;
