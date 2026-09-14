import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BadgeCheck, Building2, CarFront, ShieldCheck } from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';

const SLOT_ID = 'motyq-marketiq-commercial-classification-slot';

type CommercialClass = 'A' | 'B' | 'C' | 'D' | 'E';
type Props = { currentUser: User };

const classMeta: Record<CommercialClass, { destination: 'SHOWROOM' | 'OUTLET' | 'REPASSE'; range: string; description: string }> = {
  A: { destination: 'SHOWROOM', range: 'até 10.000 km', description: 'Garantia de fábrica e sem nada para fazer, somente higienização.' },
  B: { destination: 'SHOWROOM', range: '10.001 a 30.000 km', description: 'Garantia de fábrica e poucos detalhes.' },
  C: { destination: 'OUTLET', range: '30.001 a 90.000 km', description: 'Faixa padrão para operação Outlet.' },
  D: { destination: 'REPASSE', range: '90.001 a 120.000 km', description: 'Direcionamento sugerido para repasse.' },
  E: { destination: 'REPASSE', range: 'acima de 120.000 km', description: 'Direcionamento sugerido para repasse.' },
};

const parseKm = (value: string) => Number(String(value || '').replace(/\D/g, '')) || 0;
const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

const suggestedClassForKm = (km: number): CommercialClass | null => {
  if (!km) return null;
  if (km <= 10000) return 'A';
  if (km <= 30000) return 'B';
  if (km <= 90000) return 'C';
  if (km <= 120000) return 'D';
  return 'E';
};

const findInputByLabel = (labelStart: string): HTMLInputElement | null => {
  const target = labelStart.trim().toUpperCase();
  const labels = Array.from(document.querySelectorAll('label'));
  for (const label of labels) {
    const text = String(label.textContent || '').trim().toUpperCase();
    if (!text.startsWith(target)) continue;
    const input = label.querySelector('input');
    if (input instanceof HTMLInputElement) return input;
  }
  return null;
};

const ensureSlot = (): HTMLElement | null => {
  const existing = document.getElementById(SLOT_ID);
  if (existing) return existing;
  const headings = Array.from(document.querySelectorAll('h3'));
  const heading = headings.find(node => String(node.textContent || '').trim() === 'Estado do veículo');
  const section = heading?.closest('section');
  if (!section) return null;
  const slot = document.createElement('div');
  slot.id = SLOT_ID;
  slot.className = 'mt-4';
  section.appendChild(slot);
  return slot;
};

const MarketIQCommercialClassification: React.FC<Props> = ({ currentUser }) => {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [km, setKm] = useState(0);
  const [plate, setPlate] = useState('');
  const [factoryWarranty, setFactoryWarranty] = useState(false);
  const [onlyHygiene, setOnlyHygiene] = useState(false);
  const [minorDetails, setMinorDetails] = useState(false);
  const [overrideClass, setOverrideClass] = useState<CommercialClass | ''>('');
  const [overrideReason, setOverrideReason] = useState('');
  const [lastPlate, setLastPlate] = useState('');

  useEffect(() => {
    const sync = () => {
      const nextSlot = ensureSlot();
      if (nextSlot) setSlot(nextSlot);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(() => {
      const kmInput = findInputByLabel('KM ATUAL');
      const plateInput = findInputByLabel('PLACA');
      setKm(parseKm(kmInput?.value || ''));
      setPlate(cleanPlate(plateInput?.value || ''));
    }, 500);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!plate || plate === lastPlate) return;
    setLastPlate(plate);
    setFactoryWarranty(false);
    setOnlyHygiene(false);
    setMinorDetails(false);
    setOverrideClass('');
    setOverrideReason('');
  }, [plate, lastPlate]);

  const suggestedClass = useMemo(() => suggestedClassForKm(km), [km]);
  const finalClass = (overrideClass || suggestedClass) as CommercialClass | null;
  const destination = finalClass ? classMeta[finalClass].destination : '';
  const isOverride = Boolean(overrideClass && suggestedClass && overrideClass !== suggestedClass);

  const validation = useMemo(() => {
    if (!finalClass) return { valid: false, message: 'Informe a quilometragem para gerar a classificação.' };
    if (finalClass === 'A') {
      if (!factoryWarranty && !onlyHygiene) return { valid: false, message: 'Classe A exige garantia de fábrica e somente higienização, sem reparos.' };
      if (!factoryWarranty) return { valid: false, message: 'Classe A exige garantia de fábrica vigente.' };
      if (!onlyHygiene) return { valid: false, message: 'Classe A exige veículo sem reparos, apenas higienização.' };
    }
    if (finalClass === 'B') {
      if (!factoryWarranty && !minorDetails) return { valid: false, message: 'Classe B exige garantia de fábrica e poucos detalhes.' };
      if (!factoryWarranty) return { valid: false, message: 'Classe B exige garantia de fábrica vigente.' };
      if (!minorDetails) return { valid: false, message: 'Confirme que o veículo tem apenas poucos detalhes.' };
    }
    if (isOverride && !overrideReason.trim()) return { valid: false, message: 'Informe o motivo para alterar a classificação sugerida.' };
    return { valid: true, message: 'Classificação compatível com os critérios informados.' };
  }, [finalClass, factoryWarranty, onlyHygiene, minorDetails, isOverride, overrideReason]);

  useEffect(() => {
    const persist = async (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const id = String(detail.id || '').trim();
      if (!id || !finalClass) return;
      try {
        await updateDoc(doc(db, 'operational_meta', id), {
          commercialClass: finalClass,
          suggestedCommercialClass: suggestedClass || '',
          commercialDestination: destination,
          commercialClassOverride: isOverride,
          commercialClassReason: isOverride ? overrideReason.trim() : '',
          factoryWarranty,
          onlyHygiene,
          minorDetails,
          classificationValid: validation.valid,
          classificationKm: km,
          classificationByEmail: String(currentUser.email || '').toLowerCase(),
          classificationByName: currentUser.name || currentUser.email || '',
          classificationUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        window.dispatchEvent(new CustomEvent('motyq:marketiq-history-updated', { detail: { plate: detail.plate || plate } }));
      } catch (error) {
        console.warn('MarketIQ classification persistence failed', error);
      }
    };
    window.addEventListener('motyq:marketiq-persisted', persist as EventListener);
    return () => window.removeEventListener('motyq:marketiq-persisted', persist as EventListener);
  }, [currentUser, finalClass, suggestedClass, destination, isOverride, overrideReason, factoryWarranty, onlyHygiene, minorDetails, validation.valid, km, plate]);

  if (!slot) return null;

  const classTone = finalClass === 'A' || finalClass === 'B'
    ? 'border-emerald-300/20 bg-emerald-300/[.05] text-emerald-200'
    : finalClass === 'C'
      ? 'border-cyan-300/20 bg-cyan-300/[.05] text-cyan-200'
      : 'border-amber-300/20 bg-amber-300/[.05] text-amber-200';

  return createPortal(
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Building2 size={15} className="text-cyan-300"/><p className="text-xs font-bold uppercase tracking-[.13em] text-zinc-400">Classificação comercial</p></div>
          <p className="mt-1 text-xs text-zinc-500">Destino operacional sugerido a partir da quilometragem e das condições do veículo.</p>
        </div>
        <div className={`rounded-xl border px-4 py-2 ${classTone}`}>
          <div className="flex items-center gap-3">
            <strong className="text-3xl leading-none">{finalClass || '—'}</strong>
            <div><p className="text-[9px] font-black uppercase tracking-[.14em] opacity-70">{destination || 'AGUARDANDO KM'}</p><p className="mt-0.5 text-[10px] opacity-80">{finalClass ? classMeta[finalClass].range : 'Informe a quilometragem'}</p></div>
          </div>
        </div>
      </div>

      {suggestedClass && <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-white/10 bg-white/[.02] p-3">
          <p className="text-[9px] font-black uppercase tracking-[.12em] text-zinc-500">Sugestão automática</p>
          <div className="mt-2 flex items-center gap-2"><CarFront size={14} className="text-cyan-300"/><strong>Classe {suggestedClass} · {classMeta[suggestedClass].destination}</strong></div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{classMeta[suggestedClass].description}</p>
        </div>
        <label className="rounded-xl border border-white/10 bg-white/[.02] p-3">
          <span className="text-[9px] font-black uppercase tracking-[.12em] text-zinc-500">Classificação final do avaliador</span>
          <select value={overrideClass || suggestedClass} onChange={event => {
            const value = event.target.value as CommercialClass;
            setOverrideClass(value === suggestedClass ? '' : value);
            if (value === suggestedClass) setOverrideReason('');
          }} className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white">
            {(['A','B','C','D','E'] as CommercialClass[]).map(value => <option key={value} value={value}>Classe {value} · {classMeta[value].destination}</option>)}
          </select>
        </label>
      </div>}

      {(finalClass === 'A' || finalClass === 'B') && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[.02] px-3 py-2.5 text-xs text-zinc-300"><input type="checkbox" checked={factoryWarranty} onChange={event => setFactoryWarranty(event.target.checked)} className="h-4 w-4"/><ShieldCheck size={14} className="text-emerald-300"/>Garantia de fábrica vigente</label>
        {finalClass === 'A' && <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[.02] px-3 py-2.5 text-xs text-zinc-300"><input type="checkbox" checked={onlyHygiene} onChange={event => setOnlyHygiene(event.target.checked)} className="h-4 w-4"/><BadgeCheck size={14} className="text-emerald-300"/>Somente higienização, sem reparos</label>}
        {finalClass === 'B' && <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[.02] px-3 py-2.5 text-xs text-zinc-300"><input type="checkbox" checked={minorDetails} onChange={event => setMinorDetails(event.target.checked)} className="h-4 w-4"/><BadgeCheck size={14} className="text-cyan-300"/>Poucos detalhes / reparos leves</label>}
      </div>}

      {isOverride && <label className="mt-3 block"><span className="text-[9px] font-black uppercase tracking-[.12em] text-amber-300">Motivo da alteração *</span><textarea value={overrideReason} onChange={event => setOverrideReason(event.target.value)} rows={2} placeholder={`Explique por que a Classe ${suggestedClass} foi alterada para ${finalClass}.`} className="mt-1 w-full rounded-xl border border-amber-300/20 bg-amber-300/[.04] p-3 text-sm text-white outline-none focus:border-amber-300/40"/></label>}

      <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${validation.valid ? 'border-emerald-300/20 bg-emerald-300/[.04] text-emerald-200' : 'border-amber-300/20 bg-amber-300/[.04] text-amber-200'}`}>
        {validation.valid ? <BadgeCheck size={15} className="mt-0.5 shrink-0"/> : <AlertTriangle size={15} className="mt-0.5 shrink-0"/>}
        <span>{validation.message}</span>
      </div>
    </div>,
    slot,
  );
};

export default MarketIQCommercialClassification;
