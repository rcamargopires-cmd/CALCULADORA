import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';

type Props = { currentUser: User };

type PendingDecision = {
  plate: string;
  approvedBuy: number;
  systemRecommendedBuy: number;
  purchaseLimit: number;
  approvalJustification: string;
};

const HOST_ID = 'motyq-marketiq-final-decision-host';

const cleanPlate = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const parseMoney = (value: unknown) => {
  const raw = String(value || '').replace(/R\$/gi, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!raw) return 0;
  return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
};
const moneyInput = (value: number) => value > 0 ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const marketRoot = () => Array.from(document.querySelectorAll('div.fixed.inset-0')).find(el => String(el.textContent || '').includes('MOTYQ MARKETIQ · V2')) as HTMLElement | undefined;

const readLabelValue = (root: HTMLElement, label: string) => {
  const target = Array.from(root.querySelectorAll('p')).find(node => String(node.textContent || '').trim().toLowerCase() === label.toLowerCase());
  const parent = target?.parentElement;
  if (!parent) return 0;
  const paragraphs = Array.from(parent.querySelectorAll('p'));
  const valueNode = paragraphs.find(node => node !== target && String(node.textContent || '').includes('R$'));
  return parseMoney(valueNode?.textContent || parent.textContent || '');
};

const readPlate = (root: HTMLElement) => {
  const labels = Array.from(root.querySelectorAll('label'));
  const plateLabel = labels.find(label => String(label.textContent || '').trim().toUpperCase().startsWith('PLACA'));
  return cleanPlate((plateLabel?.querySelector('input') as HTMLInputElement | null)?.value || '');
};

const MarketIQFinalDecisionBridge: React.FC<Props> = ({ currentUser }) => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [plate, setPlate] = useState('');
  const [recommendedBuy, setRecommendedBuy] = useState(0);
  const [limitBuy, setLimitBuy] = useState(0);
  const [finalBuy, setFinalBuy] = useState('');
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');
  const touchedRef = useRef(false);
  const pendingRef = useRef<PendingDecision | null>(null);
  const lastPlateRef = useRef('');

  useEffect(() => {
    const sync = () => {
      const root = marketRoot();
      if (!root) {
        setHost(null);
        return;
      }

      const approveButton = Array.from(root.querySelectorAll('button')).find(button => String(button.textContent || '').trim() === 'APROVAR') as HTMLButtonElement | undefined;
      const actionSection = approveButton?.closest('section') as HTMLElement | null;
      const aside = actionSection?.parentElement as HTMLElement | null;
      if (!approveButton || !actionSection || !aside) return;

      approveButton.style.display = 'none';
      if (approveButton.parentElement) approveButton.parentElement.style.gridTemplateColumns = '1fr';

      let nextHost = root.querySelector(`#${HOST_ID}`) as HTMLElement | null;
      if (!nextHost) {
        nextHost = document.createElement('div');
        nextHost.id = HOST_ID;
        aside.insertBefore(nextHost, actionSection);
      }
      setHost(nextHost);

      const nextPlate = readPlate(root);
      const nextRecommended = readLabelValue(root, 'Compra recomendada');
      const nextLimit = readLabelValue(root, 'Limite de compra');
      setPlate(nextPlate);
      setRecommendedBuy(nextRecommended);
      setLimitBuy(nextLimit);

      if (nextPlate !== lastPlateRef.current) {
        lastPlateRef.current = nextPlate;
        touchedRef.current = false;
        setJustification('');
        setError('');
        setFinalBuy(nextRecommended ? moneyInput(nextRecommended) : '');
      } else if (!touchedRef.current && nextRecommended > 0) {
        setFinalBuy(moneyInput(nextRecommended));
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const persisted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const pending = pendingRef.current;
      if (!pending || detail.action !== 'decision' || detail.status !== 'approved' || !detail.id) return;
      if (cleanPlate(detail.plate) !== pending.plate) return;

      void updateDoc(doc(db, 'operational_meta', String(detail.id)), {
        systemRecommendedBuy: pending.systemRecommendedBuy,
        approvedBuy: pending.approvedBuy,
        purchaseLimit: pending.purchaseLimit,
        approvalJustification: pending.approvalJustification,
        decidedByEmail: String(currentUser.email || '').toLowerCase(),
        decidedByName: currentUser.name || currentUser.email || '',
        approvedAt: serverTimestamp(),
      }).then(() => {
        window.dispatchEvent(new CustomEvent('motyq:marketiq-history-updated', { detail: { plate: pending.plate } }));
        pendingRef.current = null;
      }).catch(err => {
        console.error('MarketIQ final decision traceability update failed', err);
      });
    };

    window.addEventListener('motyq:marketiq-persisted', persisted as EventListener);
    return () => window.removeEventListener('motyq:marketiq-persisted', persisted as EventListener);
  }, [currentUser]);

  if (!host) return null;

  const approvedBuy = parseMoney(finalBuy);
  const overLimit = limitBuy > 0 && approvedBuy > limitBuy;
  const delta = approvedBuy && recommendedBuy ? approvedBuy - recommendedBuy : 0;

  const approve = () => {
    setError('');
    if (!plate) {
      setError('Informe a placa antes de aprovar a compra.');
      return;
    }
    if (!approvedBuy) {
      setError('Informe o valor final que será pago no veículo.');
      return;
    }
    if (overLimit && !justification.trim()) {
      setError('Valor acima do limite. Informe a justificativa para continuar.');
      return;
    }

    pendingRef.current = {
      plate,
      approvedBuy,
      systemRecommendedBuy: recommendedBuy,
      purchaseLimit: limitBuy,
      approvalJustification: justification.trim(),
    };

    window.dispatchEvent(new CustomEvent('motyq:marketiq-approved', {
      detail: {
        plate,
        value: approvedBuy,
        recommendedValue: recommendedBuy,
        limitValue: limitBuy,
        justification: justification.trim(),
        approvedByEmail: currentUser.email,
        approvedByName: currentUser.name,
        approvedAt: new Date().toISOString(),
      },
    }));
  };

  return createPortal(
    <section className={`mb-4 rounded-2xl border p-4 ${overLimit ? 'border-red-300/30 bg-red-300/[.045]' : 'border-cyan-300/25 bg-cyan-300/[.04]'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-300">DECISÃO DO AVALIADOR</p>
          <h3 className="mt-1 font-semibold text-white">Valor final da compra</h3>
        </div>
        {overLimit && <span className="rounded-full border border-red-300/25 bg-red-300/[.07] px-2 py-1 text-[9px] font-black text-red-200">ACIMA DO LIMITE</span>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5"><span className="text-zinc-500">MarketIQ recomenda</span><strong className="mt-1 block text-cyan-200">{money(recommendedBuy)}</strong></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5"><span className="text-zinc-500">Limite de compra</span><strong className="mt-1 block text-red-200">{money(limitBuy)}</strong></div>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-400">Valor que será pago</span>
        <div className="flex h-12 items-center rounded-xl border border-white/15 bg-black/30 px-3 focus-within:border-cyan-300/45">
          <span className="mr-2 text-sm font-bold text-zinc-400">R$</span>
          <input
            value={finalBuy}
            onChange={event => { touchedRef.current = true; setFinalBuy(event.target.value); setError(''); }}
            inputMode="decimal"
            className="h-full min-w-0 flex-1 bg-transparent text-xl font-semibold text-white outline-none"
            placeholder="0,00"
          />
        </div>
      </label>

      {delta !== 0 && <p className={`mt-2 text-[10px] font-semibold ${delta > 0 ? 'text-amber-200' : 'text-emerald-300'}`}>{delta > 0 ? '+' : ''}{money(delta)} em relação à recomendação do MarketIQ.</p>}

      {overLimit && <div className="mt-3 rounded-xl border border-red-300/20 bg-red-300/[.045] p-3">
        <div className="flex gap-2 text-red-200"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><div><p className="text-xs font-black">VALOR ACIMA DO LIMITE RECOMENDADO</p><p className="mt-1 text-[11px] leading-5 text-red-100/80">Esta compra reduz a margem de segurança. Registre a justificativa para aprovar.</p></div></div>
        <textarea value={justification} onChange={event => { setJustification(event.target.value); setError(''); }} rows={3} placeholder="Justificativa da compra acima do limite..." className="mt-3 w-full rounded-xl border border-red-300/20 bg-black/25 p-3 text-xs text-white outline-none focus:border-red-300/45"/>
      </div>}

      {!!error && <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[.05] px-3 py-2 text-xs font-semibold text-amber-100">{error}</p>}

      <button onClick={approve} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-black text-black transition hover:bg-emerald-400">
        <CheckCircle2 size={16}/>APROVAR COMPRA
      </button>
      <p className="mt-2 text-[10px] leading-4 text-zinc-600">A decisão registra o valor recomendado pelo MarketIQ, o valor aprovado, o avaliador e a data/hora.</p>
    </section>,
    host,
  );
};

export default MarketIQFinalDecisionBridge;
