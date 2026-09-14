import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Shield, ShieldAlert } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const AUCTION_OR_CLAIM_FACTOR = 0.5;
const ARMORED_FACTOR = 0.6;

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
  const [auctionOrClaim, setAuctionOrClaim] = useState(false);
  const [armored, setArmored] = useState(false);
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState(0);
  const [appliedReductionPct, setAppliedReductionPct] = useState(0);
  const originalRef = useRef<OriginalValues | null>(null);
  const auctionOrClaimRef = useRef(false);
  const armoredRef = useRef(false);
  const referenceRef = useRef(0);
  const appliedReductionRef = useRef(0);

  const resetState = () => {
    originalRef.current = null;
    auctionOrClaimRef.current = false;
    armoredRef.current = false;
    referenceRef.current = 0;
    appliedReductionRef.current = 0;
    setAuctionOrClaim(false);
    setArmored(false);
    setReference(0);
    setAppliedReductionPct(0);
    setMessage('');
  };

  useEffect(() => {
    const locate = () => {
      const root = marketRoot();
      if (!root) {
        setPortalHost(null);
        if (auctionOrClaimRef.current || armoredRef.current || originalRef.current) resetState();
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
      const active = auctionOrClaimRef.current || armoredRef.current;
      void updateDoc(doc(db, 'operational_meta', id), {
        auctionOrClaim: auctionOrClaimRef.current,
        auctionOrClaimAdjustmentPct: auctionOrClaimRef.current ? 50 : 0,
        armored: armoredRef.current,
        armoredAdjustmentPct: armoredRef.current ? 40 : 0,
        specialHistoryRiskActive: active,
        specialHistoryRiskAdjustmentPct: active ? appliedReductionRef.current : 0,
        specialHistoryRiskReference: active ? referenceRef.current : 0,
        specialHistoryRiskOriginalMarket: active ? Number(original?.marketNum || 0) : 0,
        specialHistoryRiskRule: auctionOrClaimRef.current && armoredRef.current
          ? 'sinistro_leilao+blindado'
          : auctionOrClaimRef.current
            ? 'sinistro_leilao'
            : armoredRef.current
              ? 'blindado'
              : '',
        specialHistoryRiskUpdatedAt: new Date().toISOString(),
      }).catch(error => console.warn('MarketIQ: não foi possível persistir as regras especiais de histórico.', error));
    };

    window.addEventListener('motyq:marketiq-persisted', persist as EventListener);
    return () => window.removeEventListener('motyq:marketiq-persisted', persist as EventListener);
  }, []);

  const applyRules = (nextAuctionOrClaim: boolean, nextArmored: boolean) => {
    const marketInput = field('Mercado observado');
    const lowInput = field('Faixa mínima');
    const highInput = field('Faixa máxima');
    const fipeInput = field('FIPE');

    if (!nextAuctionOrClaim && !nextArmored) {
      const original = originalRef.current;
      if (original) {
        setInput(marketInput, original.market);
        setInput(lowInput, original.low);
        setInput(highInput, original.high);
      }
      originalRef.current = null;
      auctionOrClaimRef.current = false;
      armoredRef.current = false;
      referenceRef.current = 0;
      appliedReductionRef.current = 0;
      setAuctionOrClaim(false);
      setArmored(false);
      setReference(0);
      setAppliedReductionPct(0);
      setMessage('Ajustes especiais removidos. Os valores de mercado anteriores foram restaurados.');
      window.dispatchEvent(new CustomEvent('motyq:marketiq-history-risk-changed', { detail: { active: false, reference: 0, adjustmentPct: 0 } }));
      return;
    }

    const fipe = toNumber(fipeInput?.value || '');
    const currentMarket = toNumber(marketInput?.value || '');
    if (!fipe && !currentMarket && !originalRef.current?.marketNum) {
      setMessage('Informe a FIPE ou carregue o mercado antes de aplicar uma regra especial.');
      return;
    }

    if (!originalRef.current) {
      originalRef.current = {
        market: marketInput?.value || '',
        low: lowInput?.value || '',
        high: highInput?.value || '',
        marketNum: currentMarket,
        lowNum: toNumber(lowInput?.value || ''),
        highNum: toNumber(highInput?.value || ''),
      };
    }

    const original = originalRef.current;
    const factor = nextAuctionOrClaim ? AUCTION_OR_CLAIM_FACTOR : ARMORED_FACTOR;
    const reductionPct = Math.round((1 - factor) * 100);
    const base = fipe || original.marketNum;
    const adjustedReference = base * factor;
    const scale = original.marketNum > 0 ? adjustedReference / original.marketNum : factor;

    setInput(marketInput, moneyInput(adjustedReference));
    setInput(lowInput, moneyInput(original.lowNum > 0 ? original.lowNum * scale : adjustedReference * 0.92));
    setInput(highInput, moneyInput(original.highNum > 0 ? original.highNum * scale : adjustedReference * 1.08));

    auctionOrClaimRef.current = nextAuctionOrClaim;
    armoredRef.current = nextArmored;
    referenceRef.current = adjustedReference;
    appliedReductionRef.current = reductionPct;
    setAuctionOrClaim(nextAuctionOrClaim);
    setArmored(nextArmored);
    setReference(adjustedReference);
    setAppliedReductionPct(reductionPct);

    if (nextAuctionOrClaim && nextArmored) {
      setMessage(`Duas restrições marcadas. O MOTYQ usa a regra mais conservadora, sem somar descontos: 50% abaixo da referência, base em ${money(adjustedReference)}.`);
    } else if (nextAuctionOrClaim) {
      setMessage(`${fipe ? 'FIPE' : 'Mercado'} com regra de sinistro/leilão: referência reduzida em 50%, para ${money(adjustedReference)}.`);
    } else {
      setMessage(`${fipe ? 'FIPE' : 'Mercado'} com regra de blindado: referência reduzida em 40%, para ${money(adjustedReference)}.`);
    }

    window.dispatchEvent(new CustomEvent('motyq:marketiq-history-risk-changed', {
      detail: {
        active: true,
        auctionOrClaim: nextAuctionOrClaim,
        armored: nextArmored,
        adjustmentPct: reductionPct,
        reference: adjustedReference,
      },
    }));
  };

  const active = auctionOrClaim || armored;

  const control = <div className={`rounded-2xl border p-4 transition ${active ? 'border-red-300/30 bg-red-300/[.06]' : 'border-amber-300/20 bg-amber-300/[.035]'}`}>
    <div className="flex min-w-0 items-start gap-3">
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${active ? 'border-red-300/25 bg-red-300/[.08] text-red-300' : 'border-amber-300/20 bg-amber-300/[.05] text-amber-200'}`}>
        {active ? <ShieldAlert size={18}/> : <AlertTriangle size={18}/>} 
      </span>
      <div>
        <p className={`text-xs font-black uppercase tracking-[.1em] ${active ? 'text-red-300' : 'text-amber-200'}`}>REGRAS ESPECIAIS DE HISTÓRICO</p>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">Marque restrições que derrubam o valor comercial. Sinistro/leilão usa referência de 50% da FIPE. Blindado usa referência de 60% da FIPE, ou seja, 40% abaixo. O MOTYQ recalcula automaticamente todos os limites de compra.</p>
      </div>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-3 text-xs ${auctionOrClaim ? 'border-red-300/30 bg-red-300/[.08] text-red-100' : 'border-white/10 bg-black/20 text-zinc-300'}`}>
        <span><strong className="block text-[10px] uppercase tracking-[.08em]">Sinistro / leilão</strong><span className="mt-0.5 block text-[10px] text-zinc-500">50% abaixo · base 50% FIPE</span></span>
        <input type="checkbox" checked={auctionOrClaim} onChange={event => applyRules(event.target.checked, armored)} className="h-4 w-4 accent-red-500"/>
      </label>

      <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-3 text-xs ${armored ? 'border-amber-300/30 bg-amber-300/[.07] text-amber-100' : 'border-white/10 bg-black/20 text-zinc-300'}`}>
        <span className="flex items-center gap-2"><Shield size={16} className="text-amber-300"/><span><strong className="block text-[10px] uppercase tracking-[.08em]">Blindado</strong><span className="mt-0.5 block text-[10px] text-zinc-500">40% abaixo · base 60% FIPE</span></span></span>
        <input type="checkbox" checked={armored} onChange={event => applyRules(auctionOrClaim, event.target.checked)} className="h-4 w-4 accent-amber-500"/>
      </label>
    </div>

    {!!message && <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${active ? 'border-red-300/15 bg-black/20 text-zinc-200' : 'border-white/10 bg-black/20 text-zinc-400'}`}>{message}</div>}

    {active && originalRef.current && <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-zinc-500">Mercado antes do ajuste</p><p className="mt-1 text-sm font-semibold text-zinc-200">{money(originalRef.current.marketNum)}</p></div>
      <div className="rounded-xl border border-red-300/15 bg-black/20 p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-red-300/70">Base especial aplicada</p><p className="mt-1 text-sm font-semibold text-red-200">{money(reference)}</p></div>
      <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-zinc-500">Redução de referência</p><p className="mt-1 text-sm font-semibold text-amber-200">{appliedReductionPct}% abaixo</p></div>
    </div>}
  </div>;

  return <>{portalHost && createPortal(control, portalHost)}</>;
};

export default MarketIQHistoryRiskBridge;
