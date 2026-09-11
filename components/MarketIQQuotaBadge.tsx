import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GaugeCircle, Settings2, X } from 'lucide-react';
import { User } from '../types';
import { MarketIqQuotaLimit, MarketIqQuotaStatus, marketIqQuotaService } from '../services/marketIqQuotaService';

type Props = { currentUser: User; companyId: string; storeId: string };

const marketRoot = () => Array.from(document.querySelectorAll('div.fixed.inset-0')).find(el => String(el.textContent || '').includes('MOTYQ MARKETIQ')) as HTMLElement | undefined;
const marketVisible = () => {
  const root = marketRoot();
  if (!root) return false;
  const rect = root.getBoundingClientRect();
  const style = window.getComputedStyle(root);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') !== 0;
};

const tone = (status: MarketIqQuotaStatus | null) => {
  if (!status) return 'border-white/10 bg-white/[.04] text-zinc-400';
  if (status.blocked) return 'border-rose-300/25 bg-rose-300/[.08] text-rose-200';
  if (status.warning) return 'border-amber-300/25 bg-amber-300/[.08] text-amber-200';
  return 'border-emerald-300/20 bg-emerald-300/[.06] text-emerald-200';
};

const MarketIQQuotaBadge: React.FC<Props> = ({ currentUser, companyId }) => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [status, setStatus] = useState<MarketIqQuotaStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const wasVisible = useRef(false);

  const refresh = async () => {
    try { setStatus(await marketIqQuotaService.getStatus(companyId)); } catch { setStatus(null); }
  };

  useEffect(() => { void refresh(); }, [companyId]);

  useEffect(() => {
    const sync = () => {
      const root = marketRoot();
      const visible = marketVisible();
      if (visible && !wasVisible.current) {
        marketIqQuotaService.beginEvaluationSession();
        void refresh();
      }
      wasVisible.current = visible;
      if (!root || !visible) { setHost(null); return; }
      const header = root.querySelector('header') as HTMLElement | null;
      if (!header) { setHost(null); return; }
      let next = header.querySelector('[data-marketiq-quota-host]') as HTMLElement | null;
      if (!next) {
        next = document.createElement('div');
        next.setAttribute('data-marketiq-quota-host', 'true');
        next.className = 'ml-auto mr-2 shrink-0';
        const close = header.querySelector('button');
        if (close) header.insertBefore(next, close);
        else header.appendChild(next);
      }
      setHost(next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(sync, 250);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, [companyId]);

  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener('motyq:marketiq-quota-updated', handler);
    return () => window.removeEventListener('motyq:marketiq-quota-updated', handler);
  }, [companyId]);

  const setPlan = async (limit: MarketIqQuotaLimit) => {
    if (currentUser.role !== 'admin' || saving) return;
    setSaving(true);
    try {
      await marketIqQuotaService.setPlan(companyId, limit);
      await refresh();
      setOpen(false);
    } finally { setSaving(false); }
  };

  const badge = <button
    type="button"
    onClick={() => currentUser.role === 'admin' && setOpen(true)}
    title={currentUser.role === 'admin' ? 'Configurar limite mensal do MarketIQ' : 'Consumo mensal do MarketIQ'}
    className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-[10px] font-black uppercase tracking-[.08em] ${tone(status)} ${currentUser.role === 'admin' ? 'cursor-pointer' : 'cursor-default'}`}
  >
    <GaugeCircle size={14}/>
    {status ? `${status.used}/${status.limit}` : 'CONSULTAS'}
    {currentUser.role === 'admin' && <Settings2 size={12} className="opacity-70"/>}
  </button>;

  return <>
    {host && createPortal(badge, host)}
    {open && currentUser.role === 'admin' && <div className="fixed inset-0 z-[790] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => !saving && setOpen(false)}>
      <div className="w-full max-w-md rounded-[26px] border border-white/10 bg-[#111517] p-5 text-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.15em] text-cyan-300">MOTYQ MARKETIQ</p><h3 className="mt-1 text-xl font-semibold">Plano de avaliações</h3><p className="mt-1 text-sm text-zinc-500">O contador é mensal por empresa e reinicia automaticamente no novo mês.</p></div>
          <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-zinc-400"><X size={16}/></button>
        </div>
        <div className="mt-5 grid gap-3">
          {([500, 1000, 2000] as MarketIqQuotaLimit[]).map(limit => {
            const selected = status?.limit === limit;
            return <button key={limit} disabled={saving} onClick={() => void setPlan(limit)} className={`rounded-2xl border p-4 text-left transition disabled:opacity-50 ${selected ? 'border-cyan-300/30 bg-cyan-300/[.08]' : 'border-white/10 bg-white/[.025] hover:bg-white/[.05]'}`}>
              <div className="flex items-center justify-between gap-3"><span className="text-lg font-semibold">Plano {limit.toLocaleString('pt-BR')}</span>{selected && <span className="rounded-full bg-cyan-300 px-2 py-1 text-[9px] font-black text-cyan-950">ATUAL</span>}</div>
              <p className="mt-1 text-xs text-zinc-500">Até {limit.toLocaleString('pt-BR')} avaliações/consultas por mês.</p>
            </button>;
          })}
        </div>
        {status && <div className={`mt-4 rounded-2xl border p-4 text-sm ${tone(status)}`}>
          <p className="font-semibold">Consumo atual: {status.used.toLocaleString('pt-BR')} de {status.limit.toLocaleString('pt-BR')}</p>
          <p className="mt-1 text-xs opacity-75">Restam {status.remaining.toLocaleString('pt-BR')} consultas neste mês · {status.percent}% utilizado.</p>
        </div>}
      </div>
    </div>}
  </>;
};

export default MarketIQQuotaBadge;
