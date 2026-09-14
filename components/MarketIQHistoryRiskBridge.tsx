import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const ADJUSTMENT_FACTOR = 0.5;

type OriginalValues = {
  market: string;
  low: string;
  high: string;
  marketNum: number;
  lowNum: number;
  highNum: number;
};

const marketRoot = () => Array.from(document.querySelectorAll('div.fixed.inset-0')).find(el => String(el.textContent || '').includes('MOTYQ MARKETIQ · V2')) as HTMLElement | undefined;

const field = (label: string) => {
  const root = marketRoot();
  if (!root) return null;
  const wanted = label.toLowerCase();
  const labels = Array.from(root.querySelectorAll('label'));
  const found = labels.find(el => String(el.textContent || '').toLowerCase().includes(wanted));
  return found?.querySelector('input') as HTMLInputElement | null;
};

const toNumber = (value: string) => Number(String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const moneyInput = (value: number) => value ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

const setInput = (input: HTMLInputElement | null, value: string) => {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const MarketIQHistoryRiskBridge: React.FC = () => {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState(0);
  const originalRef = useRef<OriginalValues | null>(null);
  const activeRef = useRef(false);
  const referenceRef = useRef(0);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { referenceRef.current = reference; }, [reference]);

  useEffect(() => {
    const locate = () => {
      const root = marketRoot();
      if (!root) {
        setPortalHost(null);
        return;
      }
      const title = Array.from(root.querySelectorAll('h3')).find(el => String(el.textContent || '').trim() === 'Estado do veículo') as HTMLElement | undefined;
      const section = title?.closest('section') as HTMLElement | null;
      if (!section) {
        setPortalHost(null);
        return;
      }
      let host = section.querySelector('[data-marketiq-history-risk-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-marketiq-history-risk-host', 'true');
        host.className = 'mt-4';
        section.appendChild(host);
      }
      setPortalHost(host);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const persist = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const id = String(detail.id || '').trim();
      if (!id) return;
      const original = originalRef.current;
      void updateDoc(doc(db, 'operational_meta', id), {
        auctionOrClaim: activeRef.current,
        auctionOrClaimAdjustmentPct: activeRef.current ? 50 : 0,
        auctionOrClaimReference: activeRef.current ? referenceRef.current : 0,
        auctionOrClaimOriginalMarket: activeRef.current ? Number(original?.marketNum || 0) : 0,
        auctionOrClaimUpdatedAt: new Date().toISOString(),
      }).catch(error => console.warn('MarketIQ: não foi possível persistir o indicador de sinistro/leilão.', error));
    };

    window.addEventListener('motyq:marketiq-persisted', persist as EventListener);
    return () => window.removeEventListener('motyq:marketiq-persisted', persist as EventListener);
  }, []);

  const enable = () => {
    const fipeInput = field('FIPE');
    const marketInput = field('Mercado observado');
    const lowInput = field('Faixa mínima');
    const highInput = field('Faixa máxima');

    const fipe = toNumber(fipeInput?.value || '');
    const market = toNumber(marketInput?.value || '');
    const low = toNumber(lowInput?.value || '');
    const high = toNumber(highInput?.value || '');

    if (!fipe && !market) {
      setMessage('Informe a FIPE ou carregue o mercado antes de marcar sinistro/leilão.');
      return;
    }

    originalRef.current = {
      market: marketInput?.value || '',
      low: lowInput?.value || '',
      high: highInput?.value || '',
      marketNum: market,
      lowNum: low,
      highNum: high,
    };

    const adjustedReference = fipe ? fipe * ADJUSTMENT_FACTOR : market * ADJUSTMENT_FACTOR;
    const factor = market > 0 ? adjustedReference / market : ADJUSTMENT_FACTOR;

    setInput(marketInput, moneyInput(adjustedReference));
    setInput(lowInput, moneyInput(low > 0 ? low * factor : adjustedReference * 0.92));
    setInput(highInput, moneyInput(high > 0 ? high * factor : adjustedReference * 1.08));

    setReference(adjustedReference);
    setActive(true);
    setMessage(fipe
      ? `Regra especial aplicada: base de avaliação reduzida para 50% da FIPE (${money(adjustedReference)}).`
      : `FIPE não informada: base de mercado reduzida em 50% (${money(adjustedReference)}).`);

    window.dispatchEvent(new CustomEvent('motyq:marketiq-history-risk-changed', {
      detail: { active: true, adjustmentPct: 50, reference: adjustedReference },
    }));
  };

  const disable = () => {
    const original = originalRef.current;
    if (original) {
      setInput(field('Mercado observado'), original.market);
      setInput(field('Faixa mínima'), original.low);
      setInput(field('Faixa máxima'), original.high);
    }
    originalRef.current = null;
    setReference(0);
    setActive(false);
    setMessage('Ajuste removido. Os valores de mercado anteriores foram restaurados.');
    window.dispatchEvent(new CustomEvent('motyq:marketiq-history-risk-changed', {
      detail: { active: false, adjustmentPct: 0, reference: 0 },
    }));
  };

  const control = <div className={`rounded-2xl border p-4 transition ${active ? 'border-red-300/30 bg-red-300/[.07]' : 'border-amber-300/20 bg-amber-300/[.035]'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${active ? 'border-red-300/25 bg-red-300/[.08] text-red-300' : 'border-amber-300/20 bg-amber-300/[.05] text-amber-200'}`}>
          {active ? <ShieldAlert size={18}/> : <AlertTriangle size={18}/>} 
        </span>
        <div>
          <p className={`text-xs font-black uppercase tracking-[.1em] ${active ? 'text-red-300' : 'text-amber-200'}`}>HISTÓRICO ESPECIAL · SINISTRO / LEILÃO</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">Marque quando houver histórico relevante de sinistro ou passagem por leilão. O MOTYQ aplica uma referência conservadora de 50% da FIPE e recalcula automaticamente compra segura, recomendada, agressiva e limite.</p>
        </div>
      </div>

      <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[.08em] ${active ? 'border-red-300/30 bg-red-300/[.08] text-red-200' : 'border-white/10 bg-black/20 text-zinc-300'}`}>
        <input type="checkbox" checked={active} onChange={event => event.target.checked ? enable() : disable()} className="h-4 w-4 accent-red-500"/>
        Sinistro / leilão
      </label>
    </div>

    {!!message && <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${active ? 'border-red-300/15 bg-black/20 text-red-100' : 'border-white/10 bg-black/20 text-zinc-400'}`}>{message}</div>}

    {active && originalRef.current && <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-zinc-500">Mercado antes do ajuste</p><p className="mt-1 text-sm font-semibold text-zinc-200">{money(originalRef.current.marketNum)}</p></div>
      <div className="rounded-xl border border-red-300/15 bg-black/20 p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-red-300/70">Base histórica aplicada</p><p className="mt-1 text-sm font-semibold text-red-200">{money(reference)}</p></div>
      <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-zinc-500">Redução de referência</p><p className="mt-1 text-sm font-semibold text-amber-200">50% FIPE</p></div>
    </div>}
  </div>;

  return <>{portalHost && createPortal(control, portalHost)}</>;
};

export default MarketIQHistoryRiskBridge;
