import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CarFront, CheckCircle2, Fuel, History, Loader2, Search, TriangleAlert } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser } from '../services/companyService';
import { storeIdForUser } from '../services/storeService';
import { groupStockService, GroupStockItem, GroupStockSnapshot } from '../services/groupStockService';
import { marketIqVehicleCacheService } from '../services/marketIqVehicleCacheService';
import { MarketIQEvaluation, marketIqEvaluationService } from '../services/marketIqEvaluationService';

const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const cleanRenavam = (value: string) => String(value || '').replace(/\D/g, '').slice(0, 11);
const money = (value?: number) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : '—';

const dateLabel = (value: any) => {
  try {
    const date = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : '—';
  } catch { return '—'; }
};

const requestRoot = () => Array.from(document.querySelectorAll('div.fixed.inset-0')).find(el => {
  const text = String(el.textContent || '');
  return text.includes('MOTYQ · AVALIAÇÃO DE TROCA') && text.includes('Solicitar avaliação');
}) as HTMLElement | undefined;

const field = (label: string) => {
  const root = requestRoot();
  if (!root) return null;
  const wanted = label.toLowerCase();
  const labels = Array.from(root.querySelectorAll('label'));
  const found = labels.find(el => String(el.textContent || '').toLowerCase().includes(wanted));
  return found?.querySelector('input') as HTMLInputElement | null;
};

const setInput = (input: HTMLInputElement | null, value: string) => {
  if (!input || !value) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const simplifySellerVehicleFields = () => {
  const root = requestRoot();
  if (!root) return;
  const labels = Array.from(root.querySelectorAll('label')) as HTMLLabelElement[];
  const autoLabels = ['ano/modelo', 'modelo / versão', 'km atual'];
  labels.forEach(label => {
    const text = String(label.textContent || '').trim().toLowerCase();
    if (autoLabels.some(item => text.startsWith(item))) {
      label.style.display = 'none';
      label.setAttribute('data-motyq-auto-vehicle-field', 'true');
    }
  });

  const sections = Array.from(root.querySelectorAll('section')) as HTMLElement[];
  const vehicleSection = sections.find(section => String(section.textContent || '').includes('Veículo para avaliação'));
  if (!vehicleSection || vehicleSection.querySelector('[data-motyq-auto-vehicle-hint]')) return;
  const grid = vehicleSection.querySelector('.grid');
  if (!grid) return;
  const hint = document.createElement('div');
  hint.setAttribute('data-motyq-auto-vehicle-hint', 'true');
  hint.className = 'sm:col-span-2 lg:col-span-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700';
  hint.textContent = 'Ano, modelo/versão e KM são preenchidos automaticamente pelo MOTYQ quando o veículo é localizado.';
  grid.appendChild(hint);
};

const ensureVehicleDataHost = () => {
  const root = requestRoot();
  if (!root) return null;
  const existing = root.querySelector('[data-evaluation-vehicle-data-host]') as HTMLElement | null;
  if (existing) return existing;
  const sections = Array.from(root.querySelectorAll('section')) as HTMLElement[];
  const vehicleSection = sections.find(section => String(section.textContent || '').includes('Veículo para avaliação'));
  if (!vehicleSection) return null;
  const host = document.createElement('div');
  host.setAttribute('data-evaluation-vehicle-data-host', 'true');
  host.className = 'mt-4';
  const submit = Array.from(vehicleSection.querySelectorAll('button')).find(button => String(button.textContent || '').includes('SOLICITAR AVALIAÇÃO'));
  if (submit) vehicleSection.insertBefore(host, submit);
  else vehicleSection.appendChild(host);
  return host;
};

type Notice = { kind: 'loading' | 'ok' | 'warn'; text: string } | null;
type VehicleDetails = {
  plate: string;
  renavam?: string;
  brand?: string;
  model: string;
  year: string;
  manufactureYear?: string;
  color?: string;
  fuel?: string;
  chassis?: string;
  vehicleType?: string;
  fipeValue?: number;
  referenceMonth?: string;
  source: string;
};

const sourceLabel = (source: string) => {
  if (source === 'prodesp-detran-sp') return 'Detran-SP / PRODESP';
  if (source === 'dadosapi') return 'Consulta veicular';
  if (source === 'placafipe') return 'Placa + FIPE';
  if (source === 'crlv') return 'CRLV validado no MOTYQ';
  if (source === 'stock') return 'Estoque MOTYQ';
  if (source === 'history') return 'Histórico MOTYQ';
  return 'MOTYQ';
};

const evaluationStatus = (status?: string) => {
  if (status === 'approved') return 'APROVADA';
  if (status === 'rejected') return 'RECUSADA';
  return 'RASCUNHO';
};

const EvaluationRequestVehicleLookupBridge: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [snapshot, setSnapshot] = useState<GroupStockSnapshot | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [vehicleDetails, setVehicleDetails] = useState<VehicleDetails | null>(null);
  const [lastEvaluation, setLastEvaluation] = useState<MarketIQEvaluation | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const lastLookupRef = useRef('');

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) { setUser(null); return; }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      if (!profile || profile.status !== 'active' || !['seller', 'user'].includes(String(profile.role))) {
        setUser(null);
        return;
      }
      setUser(profile);
    } catch {
      setUser(null);
    }
  }), []);

  useEffect(() => {
    if (!user) return;
    const companyId = companyIdForUser(user);
    return groupStockService.subscribe(companyId, setSnapshot, () => setSnapshot(null));
  }, [user]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      simplifySellerVehicleFields();
      const next = ensureVehicleDataHost();
      setHost(current => current === next ? current : next);
      if (!requestRoot()) {
        setVehicleDetails(null);
        setLastEvaluation(null);
        setNotice(null);
        lastLookupRef.current = '';
      }
    }, 180);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notice || notice.kind === 'loading') return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!user) return;

    const runLookup = async () => {
      const plateInput = field('Placa');
      const renavamInput = field('RENAVAM');
      if (!plateInput) return;

      const plate = cleanPlate(plateInput.value);
      const renavam = cleanRenavam(renavamInput?.value || '');
      if (plate.length !== 7) {
        lastLookupRef.current = '';
        setNotice(null);
        setVehicleDetails(null);
        setLastEvaluation(null);
        return;
      }

      const lookupKey = `${plate}:${renavam}`;
      if (lookupKey === lastLookupRef.current) return;
      lastLookupRef.current = lookupKey;
      const currentRequest = ++requestRef.current;

      const companyId = companyIdForUser(user);
      const storeId = storeIdForUser(user);
      const stockItem: GroupStockItem | undefined = snapshot?.items.find(item => cleanPlate(item.plate) === plate);

      setVehicleDetails(null);
      setNotice({ kind: 'loading', text: renavam.length === 11 ? `Validando ${plate} + RENAVAM...` : `Localizando ${plate}...` });
      void marketIqEvaluationService.getLatestByPlate(companyId, storeId, plate).then(item => {
        if (currentRequest === requestRef.current) setLastEvaluation(item);
      }).catch(() => {
        if (currentRequest === requestRef.current) setLastEvaluation(null);
      });

      try {
        const cached = await marketIqVehicleCacheService.get(companyId, storeId, plate).catch(() => null);
        if (currentRequest !== requestRef.current) return;

        const cachedRenavam = cleanRenavam(cached?.renavam || '');
        const trustedCrlv = cached?.source === 'crlv' && Number(cached.parserVersion || 0) >= 3;
        const renavamMatchesCache = Boolean(renavam && cachedRenavam && renavam === cachedRenavam);

        if (trustedCrlv && (!renavam || !cachedRenavam || renavamMatchesCache)) {
          setInput(field('Modelo / versão'), cached!.model);
          setInput(field('Ano/modelo'), cached!.year);
          if (!renavam && cachedRenavam) setInput(renavamInput, cachedRenavam);
          if (stockItem?.km) setInput(field('KM atual'), String(stockItem.km));
          setVehicleDetails({
            plate,
            renavam: cachedRenavam,
            brand: cached!.brand,
            model: cached!.model,
            year: cached!.year,
            fuel: cached!.fuel,
            fipeValue: cached!.lastFipeValue,
            referenceMonth: cached!.lastFipeReference,
            source: 'crlv',
          });
          setNotice({ kind: 'ok', text: `${cached!.model} · ${cached!.year} localizado pelo CRLV validado no MOTYQ.` });
          return;
        }

        if (renavam.length === 11) {
          const token = await auth.currentUser?.getIdToken().catch(() => '');
          const response = await fetch('/api/marketiq-identify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ plate, renavam }),
          });
          const payload = await response.json().catch(() => null);
          if (currentRequest !== requestRef.current) return;

          if (response.ok && payload && (payload.model || payload.registryModel) && payload.year) {
            const model = String(payload.model || payload.registryModel || '').trim();
            const year = String(payload.year || '').trim();
            setInput(field('Modelo / versão'), model);
            setInput(field('Ano/modelo'), year);
            if (stockItem?.km) setInput(field('KM atual'), String(stockItem.km));

            setVehicleDetails({
              plate,
              renavam,
              brand: String(payload.brand || '').trim(),
              model,
              year,
              manufactureYear: String(payload.manufactureYear || '').trim(),
              color: String(payload.color || '').trim(),
              fuel: String(payload.fuel || '').trim(),
              chassis: String(payload.chassis || '').trim(),
              vehicleType: String(payload.vehicleType || '').trim(),
              fipeValue: Number(payload.fipeValue) || 0,
              referenceMonth: String(payload.referenceMonth || '').trim(),
              source: String(payload.source || 'manual'),
            });

            void marketIqVehicleCacheService.save({
              plate,
              brand: String(payload.brand || '').trim(),
              model,
              year,
              fuel: String(payload.fuel || '').trim(),
              renavam,
              fipeCode: String(payload.fipeCode || '').trim(),
              lastFipeValue: Number(payload.fipeValue) || 0,
              lastFipeReference: String(payload.referenceMonth || '').trim(),
              source: 'manual',
              companyId,
              storeId,
              identifiedAt: new Date().toISOString(),
              identifiedBy: auth.currentUser?.email || user.email,
            }).catch(() => undefined);

            setNotice({ kind: 'ok', text: `${model} · ${year} localizado automaticamente por placa + RENAVAM.` });
            return;
          }
        }

        if (cached && renavam && cachedRenavam && renavam !== cachedRenavam) {
          setNotice({ kind: 'warn', text: `O RENAVAM informado não confere com o veículo ${plate} já identificado no MOTYQ.` });
          return;
        }

        if (stockItem) {
          setInput(field('Modelo / versão'), stockItem.model);
          setInput(field('Ano/modelo'), stockItem.year);
          if (stockItem.km) setInput(field('KM atual'), String(stockItem.km));
          setVehicleDetails({
            plate,
            renavam,
            brand: stockItem.brand,
            model: stockItem.model,
            year: stockItem.year,
            color: stockItem.color,
            fuel: stockItem.fuel,
            source: 'stock',
          });
          setNotice({ kind: 'ok', text: `${stockItem.model} · ${stockItem.year} localizado no estoque da empresa.` });
          return;
        }

        if (cached?.model && cached?.year) {
          setInput(field('Modelo / versão'), cached.model);
          setInput(field('Ano/modelo'), cached.year);
          if (!renavam && cachedRenavam) setInput(renavamInput, cachedRenavam);
          setVehicleDetails({
            plate,
            renavam: cachedRenavam || renavam,
            brand: cached.brand,
            model: cached.model,
            year: cached.year,
            fuel: cached.fuel,
            fipeValue: cached.lastFipeValue,
            referenceMonth: cached.lastFipeReference,
            source: 'history',
          });
          setNotice({ kind: 'ok', text: `${cached.model} · ${cached.year} reconhecido pelo histórico do MOTYQ.` });
          return;
        }

        setNotice({
          kind: 'warn',
          text: renavam.length === 11
            ? 'Não consegui localizar este veículo automaticamente. Confira placa e RENAVAM antes de solicitar a avaliação.'
            : 'Placa não encontrada no MOTYQ. Informe também o RENAVAM para tentar a identificação automática.',
        });
      } catch {
        if (currentRequest !== requestRef.current) return;
        setNotice({ kind: 'warn', text: 'Não foi possível consultar o veículo agora. Confira placa e RENAVAM e tente novamente.' });
      }
    };

    const onInput = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const plateInput = field('Placa');
      const renavamInput = field('RENAVAM');
      if (!target || (target !== plateInput && target !== renavamInput)) return;

      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void runLookup(), 350);
    };

    document.addEventListener('input', onInput, true);
    return () => {
      document.removeEventListener('input', onInput, true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [user, snapshot]);

  if (!user || !requestRoot()) return null;

  const tone = notice?.kind === 'ok'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : notice?.kind === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-sky-200 bg-sky-50 text-sky-800';

  const panel = host && (vehicleDetails || lastEvaluation) ? createPortal(
    <div className="space-y-3">
      {vehicleDetails && <section className="overflow-hidden rounded-2xl border border-sky-200 bg-sky-50/40">
        <div className="flex items-center justify-between border-b border-sky-100 px-4 py-3">
          <div className="flex items-center gap-2"><CarFront size={17} className="text-sky-600"/><h4 className="font-semibold text-slate-800">Dados do veículo</h4></div>
          <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-[.09em] text-sky-700">{sourceLabel(vehicleDetails.source)}</span>
        </div>
        <div className="grid gap-x-5 gap-y-2 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Placa</span><strong>{vehicleDetails.plate}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Chassi</span><strong>{vehicleDetails.chassis || '—'}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Ano/modelo</span><strong>{vehicleDetails.year || '—'}{vehicleDetails.manufactureYear && vehicleDetails.manufactureYear !== vehicleDetails.year ? ` · fab. ${vehicleDetails.manufactureYear}` : ''}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Tipo</span><strong>{vehicleDetails.vehicleType || '—'}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Marca</span><strong>{vehicleDetails.brand || '—'}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Modelo / versão</span><strong>{vehicleDetails.model}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Combustível</span><strong className="inline-flex items-center gap-1"><Fuel size={13}/>{vehicleDetails.fuel || '—'}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Cor</span><strong>{vehicleDetails.color || '—'}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">FIPE identificada</span><strong>{vehicleDetails.fipeValue ? money(vehicleDetails.fipeValue) : '—'}{vehicleDetails.referenceMonth ? <span className="ml-1 text-[10px] font-medium text-slate-400">{vehicleDetails.referenceMonth}</span> : null}</strong></div>
        </div>
      </section>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3"><History size={17} className="text-violet-600"/><h4 className="font-semibold text-slate-800">Dados da última avaliação MOTYQ</h4></div>
        {lastEvaluation ? <div className="grid gap-x-5 gap-y-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Data</span><strong className="inline-flex items-center gap-1"><CalendarDays size={13}/>{dateLabel(lastEvaluation.createdAt)}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Loja</span><strong>{lastEvaluation.storeName || '—'}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">KM</span><strong>{lastEvaluation.km ? `${lastEvaluation.km} km` : '—'}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">FIPE</span><strong>{lastEvaluation.fipe || '—'}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Compra recomendada</span><strong className="text-emerald-700">{money(lastEvaluation.recommendedBuy)}</strong></div>
          <div><span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Status</span><strong>{evaluationStatus(lastEvaluation.status)}</strong></div>
        </div> : <div className="p-4 text-sm text-slate-500">Nenhuma avaliação anterior desta placa foi encontrada no histórico do MOTYQ.</div>}
      </section>
    </div>,
    host,
  ) : null;

  return <>
    {notice && <div className={`fixed right-6 top-24 z-[790] flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg ${tone}`}>
      {notice.kind === 'loading' ? <Loader2 size={18} className="animate-spin"/> : notice.kind === 'ok' ? <CheckCircle2 size={18}/> : notice.kind === 'warn' ? <TriangleAlert size={18}/> : <Search size={18}/>}
      <span>{notice.text}</span>
    </div>}
    {panel}
  </>;
};

export default EvaluationRequestVehicleLookupBridge;
