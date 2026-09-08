import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { BellRing, CarFront, CheckCircle2, ClipboardCheck, Clock3, Loader2, Play, Search, Send, TriangleAlert, X } from 'lucide-react';
import { auth } from '../firebase';
import { User } from '../types';
import { companyIdForUser } from '../services/companyService';
import { storeIdForUser } from '../services/storeService';
import { companyScopeService, COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { storeScopeService, STORE_SCOPE_EVENT } from '../services/storeScopeService';
import { userService } from '../services/userService';
import { groupStockService, GroupStockItem, GroupStockSnapshot } from '../services/groupStockService';
import { marketIqVehicleCacheService } from '../services/marketIqVehicleCacheService';
import { marketIqEvaluationService, MarketIQEvaluation } from '../services/marketIqEvaluationService';
import { EvaluationQueueRequest, evaluationQueueService } from '../services/evaluationQueueService';

export const ACTIVE_EVALUATION_REQUEST_KEY = 'motyq:active-evaluation-request-v2';

const cleanPlate = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const cleanRenavam = (value: unknown) => String(value || '').replace(/\D/g, '').slice(0, 11);
const money = (value?: number) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : '—';
const dateLabel = (value: any) => {
  try {
    const date = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : '—';
  } catch { return '—'; }
};

const statusLabel = (status: EvaluationQueueRequest['status']) => {
  if (status === 'requested') return 'AGUARDANDO';
  if (status === 'in_progress') return 'EM AVALIAÇÃO';
  if (status === 'completed') return 'CONCLUÍDA';
  if (status === 'rejected') return 'RECUSADA';
  return 'CANCELADA';
};

const statusTone = (status: EvaluationQueueRequest['status']) => {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'rejected' || status === 'cancelled') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'in_progress') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

type VehicleInfo = {
  brand: string;
  model: string;
  year: string;
  km: string;
  fuel: string;
  source: string;
  fipe?: number;
};

type LookupState = { kind: 'idle' | 'loading' | 'ok' | 'warn'; text: string };

type SellerForm = {
  plate: string;
  renavam: string;
  hasSpareKey: string;
  hasManual: string;
  notes: string;
};

const emptyForm = (): SellerForm => ({ plate: '', renavam: '', hasSpareKey: '', hasManual: '', notes: '' });
const inputCls = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
const labelCls = 'mb-1 block text-[10px] font-extrabold uppercase tracking-[.11em] text-slate-500';

const EvaluationCenter: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [requests, setRequests] = useState<EvaluationQueueRequest[]>([]);
  const [evaluators, setEvaluators] = useState<User[]>([]);
  const [snapshot, setSnapshot] = useState<GroupStockSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SellerForm>(emptyForm());
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [lastEvaluation, setLastEvaluation] = useState<MarketIQEvaluation | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ kind: 'idle', text: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const lookupSeq = useRef(0);
  const statusesRef = useRef<Record<string, EvaluationQueueRequest['status']>>({});
  const firstSnapshot = useRef(true);

  const isSeller = user?.role === 'seller' || user?.role === 'user';
  const isEvaluator = user?.role === 'manager' || user?.role === 'admin';

  const resolveScope = (profile: User) => {
    const company = profile.role === 'admin' ? companyScopeService.get(profile) : companyIdForUser(profile);
    const store = profile.role === 'admin' ? storeScopeService.get(profile) : storeIdForUser(profile);
    setCompanyId(company);
    setStoreId(store);
  };

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) { setUser(null); return; }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      if (!profile || profile.status !== 'active' || !['admin', 'manager', 'seller', 'user'].includes(profile.role)) {
        setUser(null);
        return;
      }
      setUser(profile);
      resolveScope(profile);
    } catch { setUser(null); }
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
    firstSnapshot.current = true;
    statusesRef.current = {};
    return evaluationQueueService.subscribe(user, companyId, storeId, items => {
      if (isSeller && !firstSnapshot.current) {
        for (const item of items) {
          const before = statusesRef.current[item.id];
          if (before && before !== item.status && item.status === 'completed') {
            setToast(`Avaliação concluída · ${item.plate}${typeof item.recommendedBuy === 'number' ? ` · ${money(item.recommendedBuy)}` : ''}`);
          }
          if (before && before !== item.status && item.status === 'rejected') setToast(`Avaliação recusada · ${item.plate}`);
        }
      }
      statusesRef.current = Object.fromEntries(items.map(item => [item.id, item.status]));
      firstSnapshot.current = false;
      setRequests(items);
    }, () => setError('Não foi possível carregar a fila de avaliações.'));
  }, [user, companyId, storeId, isSeller]);

  useEffect(() => {
    if (!user || !companyId || !isSeller) return;
    return groupStockService.subscribe(companyId, setSnapshot, () => setSnapshot(null));
  }, [user, companyId, isSeller]);

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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!user || !isSeller || !companyId || !storeId) return;
    const plate = cleanPlate(form.plate);
    const renavam = cleanRenavam(form.renavam);
    if (plate.length !== 7) {
      lookupSeq.current += 1;
      setVehicle(null);
      setLastEvaluation(null);
      setLookup({ kind: 'idle', text: '' });
      return;
    }

    const timer = window.setTimeout(() => {
      const seq = ++lookupSeq.current;
      const run = async () => {
        setLookup({ kind: 'loading', text: renavam.length >= 9 ? `Localizando ${plate} por placa + RENAVAM...` : `Procurando ${plate} no MOTYQ...` });
        setVehicle(null);

        const previousPromise = marketIqEvaluationService.getLatestByPlate(companyId, storeId, plate).catch(() => null);
        const cachedPromise = marketIqVehicleCacheService.get(companyId, storeId, plate).catch(() => null);
        const stockItem: GroupStockItem | undefined = snapshot?.items.find(item => cleanPlate(item.plate) === plate);
        const [previous, cached] = await Promise.all([previousPromise, cachedPromise]);
        if (seq !== lookupSeq.current) return;
        setLastEvaluation(previous);

        const cachedRenavam = cleanRenavam(cached?.renavam || '');
        if (renavam && cachedRenavam && renavam !== cachedRenavam) {
          setLookup({ kind: 'warn', text: `O RENAVAM informado não confere com o ${plate} já identificado no MOTYQ.` });
          return;
        }

        if (cached?.source === 'crlv' && Number(cached.parserVersion || 0) >= 3) {
          setVehicle({ brand: cached.brand, model: cached.model, year: cached.year, km: stockItem?.km ? String(stockItem.km) : previous?.km || '', fuel: cached.fuel, source: 'CRLV validado', fipe: cached.lastFipeValue || undefined });
          setLookup({ kind: 'ok', text: `${cached.model} · ${cached.year} localizado pelo CRLV validado do MOTYQ.` });
          return;
        }

        if (renavam.length >= 9) {
          try {
            const token = await auth.currentUser?.getIdToken();
            const response = await fetch('/api/marketiq-identify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              body: JSON.stringify({ plate, renavam }),
            });
            const payload = await response.json().catch(() => null);
            if (seq !== lookupSeq.current) return;
            const model = String(payload?.model || payload?.registryModel || '').trim();
            const year = String(payload?.year || '').trim();
            if (response.ok && model) {
              setVehicle({
                brand: String(payload?.brand || '').trim(),
                model,
                year,
                km: stockItem?.km ? String(stockItem.km) : previous?.km || '',
                fuel: String(payload?.fuel || '').trim(),
                source: String(payload?.source || 'placa + RENAVAM'),
                fipe: Number(payload?.fipeValue) || undefined,
              });
              setLookup({ kind: 'ok', text: `${model}${year ? ` · ${year}` : ''} localizado automaticamente.` });
              return;
            }
          } catch {}
        }

        if (stockItem) {
          setVehicle({ brand: stockItem.brand, model: stockItem.model, year: stockItem.year, km: stockItem.km ? String(stockItem.km) : '', fuel: stockItem.fuel, source: 'Estoque do grupo' });
          setLookup({ kind: 'ok', text: `${stockItem.model} · ${stockItem.year} localizado no estoque do grupo.` });
          return;
        }

        if (cached) {
          setVehicle({ brand: cached.brand, model: cached.model, year: cached.year, km: previous?.km || '', fuel: cached.fuel, source: 'Histórico de identificação', fipe: cached.lastFipeValue || undefined });
          setLookup({ kind: 'ok', text: `${cached.model} · ${cached.year} reconhecido pelo histórico do MOTYQ.` });
          return;
        }

        if (previous) {
          setVehicle({ brand: '', model: previous.vehicle, year: previous.year, km: previous.km, fuel: '', source: 'Última avaliação MarketIQ', fipe: Number(String(previous.fipe || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || undefined });
          setLookup({ kind: 'ok', text: `${previous.vehicle || plate} reconhecido pela última avaliação do MarketIQ.` });
          return;
        }

        setLookup({ kind: 'warn', text: 'Veículo ainda não identificado. A solicitação pode ser enviada e o avaliador conclui a identificação no MarketIQ.' });
      };
      void run();
    }, 420);

    return () => window.clearTimeout(timer);
  }, [form.plate, form.renavam, user, isSeller, companyId, storeId, snapshot]);

  const pending = useMemo(() => requests.filter(item => item.status === 'requested' || item.status === 'in_progress'), [requests]);
  const history = useMemo(() => requests.slice(0, 12), [requests]);

  const submit = async () => {
    if (!user || !isSeller || saving) return;
    const plate = cleanPlate(form.plate);
    const renavam = cleanRenavam(form.renavam);
    setError('');
    if (plate.length !== 7) { setError('Informe uma placa válida.'); return; }
    if (renavam.length < 9) { setError('Informe o RENAVAM do veículo.'); return; }

    setSaving(true);
    try {
      const defaultEvaluator = evaluators.length === 1 ? evaluators[0] : undefined;
      await evaluationQueueService.create({
        companyId,
        storeId,
        requesterEmail: user.email.toLowerCase(),
        requesterName: user.name || user.email,
        evaluatorEmail: defaultEvaluator?.email || '',
        evaluatorName: defaultEvaluator?.name || '',
        plate,
        renavam,
        vehicle: vehicle?.model || 'Veículo a identificar',
        brand: vehicle?.brand || '',
        year: vehicle?.year || '',
        km: vehicle?.km || '',
        fuel: vehicle?.fuel || '',
        hasSpareKey: form.hasSpareKey,
        hasManual: form.hasManual,
        notes: form.notes.trim(),
        identificationSource: vehicle?.source || 'pendente',
      });
      setOpen(false);
      setForm(emptyForm());
      setVehicle(null);
      setLastEvaluation(null);
      setLookup({ kind: 'idle', text: '' });
      setToast('Solicitação enviada para a fila de avaliação.');
    } catch (e) {
      console.error('Could not create evaluation request', e);
      setError('Não foi possível enviar a avaliação. Verifique a conexão e tente novamente.');
    } finally { setSaving(false); }
  };

  const startEvaluation = async (request: EvaluationQueueRequest) => {
    if (!user || !isEvaluator) return;
    setError('');
    try {
      await evaluationQueueService.start(request.id, user);
      const active = { ...request, status: 'in_progress' as const, evaluatorEmail: user.email, evaluatorName: user.name || user.email };
      window.sessionStorage.setItem(ACTIVE_EVALUATION_REQUEST_KEY, JSON.stringify(active));
      setOpen(false);
      window.dispatchEvent(new CustomEvent('motyq:marketiq-open-request-v2', { detail: active }));
    } catch (e) {
      console.error('Could not start evaluation', e);
      setError('Não foi possível iniciar esta avaliação.');
    }
  };

  if (!user || !companyId || !storeId || (!isSeller && !isEvaluator)) return null;

  return <>
    <button
      onClick={() => { setOpen(true); setError(''); }}
      title={isSeller ? 'Solicitar avaliação' : 'Avaliações Motyq'}
      className={`fixed right-4 z-[157] flex h-[60px] w-[136px] max-w-[calc(100vw-32px)] items-center gap-2 overflow-hidden rounded-2xl border border-sky-300/25 bg-[#11191b]/95 px-3 py-2 text-left text-white shadow-2xl shadow-black/35 backdrop-blur-xl transition hover:border-sky-300/45 hover:bg-[#142025] active:scale-[.98] ${isEvaluator ? 'bottom-[238px]' : 'bottom-[154px]'}`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-sky-300/20 bg-sky-300/[.08] text-sky-300"><ClipboardCheck size={17}/></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[8px] font-black uppercase tracking-[.11em] text-sky-300">AVALIAÇÕES</span>
        <span className="mt-0.5 block truncate text-[12px] font-semibold leading-4">{isSeller ? 'Solicitar' : pending.length ? `${pending.length} pendente${pending.length > 1 ? 's' : ''}` : 'Fila vazia'}</span>
      </span>
    </button>

    {toast && <div className="fixed right-5 top-24 z-[780] flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-lg"><BellRing size={18}/><span>{toast}</span></div>}

    {open && <div className="fixed inset-0 z-[730] overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-[26px] border border-slate-200 bg-white text-slate-800 shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-5 md:px-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-600">MOTYQ · AVALIAÇÕES</p>
            <h2 className="mt-1 text-2xl font-semibold">{isSeller ? 'Solicitar avaliação' : 'Fila de avaliações'}</h2>
            <p className="mt-1 text-sm text-slate-500">{isSeller ? 'Placa + RENAVAM. O restante o MOTYQ procura para você.' : 'Abra a solicitação e continue a avaliação no MarketIQ.'}</p>
          </div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={18}/></button>
        </header>

        {error && <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:mx-7">{error}</div>}

        {isSeller ? <div className="grid gap-6 p-5 md:p-7 lg:grid-cols-[1.2fr_.8fr]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-4 flex items-center gap-2"><CarFront size={17} className="text-sky-600"/><h3 className="font-semibold">Veículo para avaliação</h3></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className={labelCls}>Placa</span><input value={form.plate} onChange={e => setForm(current => ({ ...current, plate: cleanPlate(e.target.value) }))} placeholder="ABC1D23" className={inputCls}/></label>
                <label><span className={labelCls}>RENAVAM</span><input value={form.renavam} onChange={e => setForm(current => ({ ...current, renavam: cleanRenavam(e.target.value) }))} inputMode="numeric" placeholder="Somente números" className={inputCls}/></label>
                <label><span className={labelCls}>Possui chave reserva?</span><select value={form.hasSpareKey} onChange={e => setForm(current => ({ ...current, hasSpareKey: e.target.value }))} className={inputCls}><option value="">Não informado</option><option value="yes">Sim</option><option value="no">Não</option></select></label>
                <label><span className={labelCls}>Tem manual?</span><select value={form.hasManual} onChange={e => setForm(current => ({ ...current, hasManual: e.target.value }))} className={inputCls}><option value="">Não informado</option><option value="yes">Sim</option><option value="no">Não</option></select></label>
              </div>
              <label className="mt-3 block"><span className={labelCls}>Observações</span><textarea value={form.notes} onChange={e => setForm(current => ({ ...current, notes: e.target.value }))} rows={3} placeholder="Ex.: detalhe de funilaria, luz acesa no painel..." className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"/></label>
            </section>

            {lookup.kind !== 'idle' && <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${lookup.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : lookup.kind === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-sky-200 bg-sky-50 text-sky-800'}`}>
              {lookup.kind === 'loading' ? <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin"/> : lookup.kind === 'ok' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0"/> : <TriangleAlert size={18} className="mt-0.5 shrink-0"/>}<span>{lookup.text}</span>
            </div>}

            {vehicle && <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <p className="text-[10px] font-black uppercase tracking-[.15em] text-sky-700">DADOS DO VEÍCULO</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{vehicle.model}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><span className="block text-xs text-slate-500">Marca</span><strong>{vehicle.brand || '—'}</strong></div><div><span className="block text-xs text-slate-500">Ano/modelo</span><strong>{vehicle.year || '—'}</strong></div><div><span className="block text-xs text-slate-500">Combustível</span><strong>{vehicle.fuel || '—'}</strong></div><div><span className="block text-xs text-slate-500">Origem</span><strong>{vehicle.source}</strong></div></div>
            </section>}

            <section className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-500">ÚLTIMA AVALIAÇÃO MOTYQ</p>
              {lastEvaluation ? <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><span className="block text-xs text-slate-500">Data</span><strong>{dateLabel(lastEvaluation.createdAt)}</strong></div><div><span className="block text-xs text-slate-500">KM</span><strong>{lastEvaluation.km || '—'}</strong></div><div><span className="block text-xs text-slate-500">Status</span><strong>{String(lastEvaluation.status || '').toUpperCase()}</strong></div><div><span className="block text-xs text-slate-500">Compra recomendada</span><strong className="text-emerald-700">{money(lastEvaluation.recommendedBuy)}</strong></div></div> : <p className="mt-2 text-sm text-slate-500">Nenhuma avaliação anterior desta placa foi encontrada.</p>}
            </section>

            <button onClick={submit} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 font-bold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-50">{saving ? <Loader2 size={18} className="animate-spin"/> : <Send size={17}/>}SOLICITAR AVALIAÇÃO</button>
          </div>

          <aside>
            <h3 className="mb-3 font-semibold">Minhas solicitações</h3>
            <div className="space-y-2">{history.length ? history.map(item => <div key={item.id} className="rounded-2xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{item.plate}</p><p className="mt-0.5 text-xs text-slate-500">{item.vehicle || 'Veículo a identificar'} · {dateLabel(item.createdAt)}</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusTone(item.status)}`}>{statusLabel(item.status)}</span></div>{item.status === 'completed' && typeof item.recommendedBuy === 'number' && <p className="mt-2 text-sm font-semibold text-emerald-700">Compra recomendada: {money(item.recommendedBuy)}</p>}</div>) : <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">Nenhuma solicitação ainda.</div>}</div>
          </aside>
        </div> : <div className="p-5 md:p-7">
          <div className="mb-5 grid grid-cols-3 gap-3"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-700">Aguardando</p><strong className="text-2xl text-amber-800">{requests.filter(item => item.status === 'requested').length}</strong></div><div className="rounded-2xl border border-sky-200 bg-sky-50 p-3"><p className="text-xs text-sky-700">Em avaliação</p><strong className="text-2xl text-sky-800">{requests.filter(item => item.status === 'in_progress').length}</strong></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Concluídas</p><strong className="text-2xl text-emerald-800">{requests.filter(item => item.status === 'completed').length}</strong></div></div>
          <div className="space-y-3">{pending.length ? pending.map(item => <div key={item.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold">{item.plate}</p><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusTone(item.status)}`}>{statusLabel(item.status)}</span></div><p className="mt-1 text-sm text-slate-600">{item.vehicle || 'Veículo a identificar'}{item.year ? ` · ${item.year}` : ''}{item.km ? ` · ${item.km} km` : ''}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Vendedor: {item.requesterName}</span><span>RENAVAM: {item.renavam || '—'}</span><span>Chave reserva: {item.hasSpareKey === 'yes' ? 'Sim' : item.hasSpareKey === 'no' ? 'Não' : '—'}</span><span>Manual: {item.hasManual === 'yes' ? 'Sim' : item.hasManual === 'no' ? 'Não' : '—'}</span></div>{item.notes && <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{item.notes}</p>}</div><button onClick={() => startEvaluation(item)} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800"><Play size={16}/>{item.status === 'in_progress' ? 'CONTINUAR' : 'INICIAR AVALIAÇÃO'}</button></div></div>) : <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400"><Clock3 size={28} className="mx-auto mb-2"/><p>Nenhuma avaliação aguardando.</p></div>}</div>
        </div>}
      </div>
    </div>}
  </>;
};

export default EvaluationCenter;
