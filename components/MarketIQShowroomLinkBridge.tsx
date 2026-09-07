import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Link2, Search, Unlink, UserRound, X } from 'lucide-react';
import { SavedCalculation, ShowroomPassage, User } from '../types';
import { showroomFlowService } from '../services/showroomFlowService';
import { dealTenantService } from '../services/dealTenantService';

export const MARKETIQ_SHOWROOM_LINK_KEY = 'motyq:marketiq-showroom-link';
const ACTIVE_STATUSES = new Set(['waiting', 'in_service', 'evaluation', 'proposal', 'follow_up']);

type Props = { currentUser: User; companyId: string; storeId: string; storeName: string };

export type MarketIQShowroomLink = {
  passageId: string;
  dealId: string;
  customerName: string;
  customerPhone: string;
  interestModel: string;
  sellerName: string;
  sellerEmail: string;
};

const readLink = (): MarketIQShowroomLink | null => {
  try {
    const raw = window.sessionStorage.getItem(MARKETIQ_SHOWROOM_LINK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketIQShowroomLink;
    return parsed?.passageId ? parsed : null;
  } catch { return null; }
};

const writeLink = (value: MarketIQShowroomLink | null) => {
  try {
    if (value) window.sessionStorage.setItem(MARKETIQ_SHOWROOM_LINK_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(MARKETIQ_SHOWROOM_LINK_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent('motyq:marketiq-showroom-link-changed', { detail: value }));
};

const linkedDealsFor = (passage: ShowroomPassage, deals: SavedCalculation[]) => {
  const raw = passage as any;
  const ids = new Set<string>(Array.isArray(raw.linkedDealIds) ? raw.linkedDealIds : []);
  return deals
    .filter(deal => ids.has(deal.id) || (deal as any).showroomPassageId === passage.id)
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
};

const MarketIQShowroomLinkBridge: React.FC<Props> = ({ currentUser, companyId, storeId, storeName }) => {
  const [passages, setPassages] = useState<ShowroomPassage[]>([]);
  const [deals, setDeals] = useState<SavedCalculation[]>([]);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [link, setLink] = useState<MarketIQShowroomLink | null>(() => readLink());
  const hadMarketIqOpen = useRef(false);

  useEffect(() => showroomFlowService.subscribeStorePassages(companyId, storeId, setPassages, console.error), [companyId, storeId]);
  useEffect(() => dealTenantService.subscribeDeals(currentUser, setDeals, console.error), [currentUser, companyId, storeId]);

  useEffect(() => {
    const locate = () => {
      const title = Array.from(document.querySelectorAll('h2')).find(el => String(el.textContent || '').includes('Avaliação & Precificação Inteligente')) as HTMLElement | undefined;
      const header = title?.closest('header') as HTMLElement | null;
      if (!header) {
        if (hadMarketIqOpen.current) {
          hadMarketIqOpen.current = false;
          setOpen(false);
          setQueryText('');
          setLink(null);
          writeLink(null);
        }
        setPortalHost(null);
        return;
      }
      hadMarketIqOpen.current = true;
      let host = header.querySelector('[data-marketiq-showroom-link-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-marketiq-showroom-link-host', 'true');
        host.className = 'ml-auto mr-2';
        const close = Array.from(header.querySelectorAll('button')).at(-1);
        if (close) header.insertBefore(host, close); else header.appendChild(host);
      }
      setPortalHost(host);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => passages
    .filter(passage => ACTIVE_STATUSES.has(String(passage.status || '')))
    .map(passage => ({ passage, deals: linkedDealsFor(passage, deals) }))
    .sort((a, b) => String(b.passage.updatedAt || b.passage.createdAt).localeCompare(String(a.passage.updatedAt || a.passage.createdAt))), [passages, deals]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ passage, deals: linked }) => [
      passage.customerName,
      passage.phone,
      passage.interestModel,
      passage.assignedSellerName,
      ...linked.map(deal => deal.data?.licensePlate),
    ].some(value => String(value || '').toLowerCase().includes(q)));
  }, [rows, queryText]);

  const choose = (passage: ShowroomPassage, linkedDeals: SavedCalculation[]) => {
    const latestDeal = linkedDeals[0];
    const next: MarketIQShowroomLink = {
      passageId: passage.id,
      dealId: latestDeal?.id || '',
      customerName: String(passage.customerName || ''),
      customerPhone: String(passage.phone || ''),
      interestModel: String(passage.interestModel || ''),
      sellerName: String(passage.assignedSellerName || ''),
      sellerEmail: String((passage as any).assignedSellerEmail || ''),
    };
    setLink(next);
    writeLink(next);
    setOpen(false);
  };

  const clear = () => {
    setLink(null);
    writeLink(null);
  };

  const trigger = <button onClick={() => setOpen(true)} className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${link ? 'border-violet-300/30 bg-violet-300/[.08] text-violet-200' : 'border-white/10 bg-white/[.04] text-zinc-300 hover:border-violet-300/25'}`}>
    <span className="inline-flex max-w-[260px] items-center gap-2"><Link2 size={14}/><span className="truncate">{link ? `${link.customerName} · ${link.sellerName || 'atendimento'}` : 'VINCULAR ATENDIMENTO'}</span></span>
  </button>;

  return <>
    {portalHost && createPortal(trigger, portalHost)}
    {open && <div className="fixed inset-0 z-[680] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#15181e] text-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-white/10 p-5">
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-violet-300">MARKETIQ · SHOWROOMFLOW</p><h3 className="mt-1 text-xl font-semibold">Vincular avaliação ao atendimento</h3><p className="mt-1 text-sm text-zinc-500">{storeName} · selecione o cliente/proposta desta avaliação.</p></div>
          <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-zinc-500"><X size={16}/></button>
        </header>
        <div className="p-4 md:p-5">
          {link && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-300/20 bg-violet-300/[.05] p-3"><div><p className="text-[9px] font-black uppercase tracking-[.12em] text-violet-300">VÍNCULO ATUAL</p><p className="mt-1 font-semibold">{link.customerName}</p><p className="text-xs text-zinc-500">{link.sellerName || 'Sem vendedor'} · {link.dealId ? 'negociação vinculada' : 'atendimento sem proposta salva'}</p></div><button onClick={clear} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300"><Unlink size={14}/> REMOVER</button></div>}
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Search size={15} className="text-zinc-600"/><input value={queryText} onChange={e => setQueryText(e.target.value)} placeholder="Cliente, vendedor ou placa da proposta..." className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-700"/></label>
          <div className="mt-4 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
            {filtered.map(({ passage, deals: linkedDeals }) => <button key={passage.id} onClick={() => choose(passage, linkedDeals)} className="w-full rounded-2xl border border-white/10 bg-white/[.025] p-4 text-left transition hover:border-violet-300/30 hover:bg-violet-300/[.04]">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><UserRound size={14} className="text-violet-300"/><p className="truncate font-semibold">{passage.customerName}</p></div><p className="mt-1 truncate text-xs text-zinc-500">{passage.assignedSellerName || 'Sem vendedor'} · {passage.interestModel || 'interesse não informado'}</p></div><Check size={16} className="mt-1 shrink-0 text-zinc-700"/></div>
              <div className="mt-3 flex flex-wrap gap-2 text-[9px]"><span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">{String(passage.status || '').toUpperCase()}</span><span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">{linkedDeals.length} negociação(ões)</span>{linkedDeals[0]?.data?.licensePlate && <span className="rounded-full border border-violet-300/20 px-2 py-1 font-mono text-violet-200">{linkedDeals[0].data?.licensePlate}</span>}</div>
            </button>)}
            {!filtered.length && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">Nenhum atendimento ativo encontrado para esta unidade.</div>}
          </div>
        </div>
      </div>
    </div>}
  </>;
};

export default MarketIQShowroomLinkBridge;
