import React, { useEffect, useMemo, useRef, useState } from 'react';
import { arrayUnion, doc, setDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { CarFront, ChevronRight, Link2, PlusCircle, Unlink, UsersRound } from 'lucide-react';
import { auth, db } from '../firebase';
import { SavedCalculation, ShowroomPassage, User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser } from '../services/companyService';
import { storeIdForUser } from '../services/storeService';
import { showroomFlowService } from '../services/showroomFlowService';
import { dealTenantService } from '../services/dealTenantService';

const STORAGE_KEY = 'motyq:active-showroom-deal-link';
const ACTIVE_STATUSES = new Set(['in_service', 'evaluation', 'proposal', 'follow_up']);

type LinkContext = {
  passageId: string;
  customerName: string;
  phone: string;
  interestModel: string;
  origin: 'walk_in' | 'requested';
  companyId: string;
  storeId: string;
  startedAt: string;
};

const sameDay = (iso?: string) => {
  if (!iso) return false;
  const value = new Date(iso);
  const now = new Date();
  return value.getFullYear() === now.getFullYear()
    && value.getMonth() === now.getMonth()
    && value.getDate() === now.getDate();
};

const readContext = (): LinkContext | null => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LinkContext;
    return parsed?.passageId ? parsed : null;
  } catch {
    return null;
  }
};

const writeContext = (value: LinkContext | null) => {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
};

const clickCalculator = () => {
  const button = Array.from(document.querySelectorAll('button')).find(item =>
    String(item.textContent || '').toUpperCase().includes('NOVA NEGOCIAÇÃO'),
  ) as HTMLButtonElement | undefined;
  button?.click();
  window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 80);
  return Boolean(button);
};

const timeOfDeal = (item: SavedCalculation) => {
  const raw = (item as any).updatedAt || (item as any).createdAt || item.timestamp;
  const value = new Date(raw || 0).getTime();
  return Number.isFinite(value) ? value : 0;
};

const ShowroomDealLinkBridge: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [passages, setPassages] = useState<ShowroomPassage[]>([]);
  const [deals, setDeals] = useState<SavedCalculation[]>([]);
  const [active, setActive] = useState<LinkContext | null>(() => readContext());
  const [selectedPassageId, setSelectedPassageId] = useState('');
  const processedRef = useRef(new Set<string>());

  useEffect(() => {
    let unsubscribePassages: (() => void) | null = null;
    let unsubscribeDeals: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async firebaseUser => {
      unsubscribePassages?.();
      unsubscribeDeals?.();
      unsubscribePassages = null;
      unsubscribeDeals = null;
      setPassages([]);
      setDeals([]);
      processedRef.current.clear();

      if (!firebaseUser?.email) {
        setUser(null);
        setActive(null);
        writeContext(null);
        return;
      }

      let profile: User | null = null;
      try {
        profile = await userService.getUser(firebaseUser.email);
      } catch {
        return;
      }

      if (!profile || profile.status !== 'active' || (profile.role !== 'seller' && profile.role !== 'user')) {
        setUser(null);
        return;
      }

      setUser(profile);
      const companyId = companyIdForUser(profile);
      const storeId = storeIdForUser(profile);

      unsubscribePassages = showroomFlowService.subscribeSellerPassages(
        companyId,
        storeId,
        profile.email,
        setPassages,
        error => console.warn('Motyq: não foi possível acompanhar os atendimentos vinculáveis.', error),
      );
      unsubscribeDeals = dealTenantService.subscribeDeals(
        profile,
        setDeals,
        error => console.warn('Motyq: não foi possível acompanhar as negociações vinculadas.', error),
      );
    });

    return () => {
      unsubscribePassages?.();
      unsubscribeDeals?.();
      unsubscribeAuth();
    };
  }, []);

  const activePassages = useMemo(() => passages
    .filter(item => sameDay(item.createdAt) && ACTIVE_STATUSES.has(item.status))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))), [passages]);

  useEffect(() => {
    if (!activePassages.length) {
      setSelectedPassageId('');
      return;
    }
    if (!activePassages.some(item => item.id === selectedPassageId)) setSelectedPassageId(activePassages[0].id);
  }, [activePassages, selectedPassageId]);

  useEffect(() => {
    if (!active) return;
    const passage = passages.find(item => item.id === active.passageId);
    if (!passage) return;
    if (passage.status === 'sale' || passage.status === 'no_deal') {
      setActive(null);
      writeContext(null);
      processedRef.current.clear();
    }
  }, [passages, active]);

  useEffect(() => {
    if (!active || !user || !deals.length) return;
    const linkedAfter = new Date(active.startedAt).getTime() - 1500;
    let cancelled = false;

    const sync = async () => {
      for (const deal of deals) {
        if (cancelled) return;
        const raw = deal as any;
        const dealTime = timeOfDeal(deal);
        const alreadyLinkedHere = raw.showroomPassageId === active.passageId;
        const unlinkedCandidate = !raw.showroomPassageId && dealTime >= linkedAfter;
        if (!alreadyLinkedHere && !unlinkedCandidate) continue;

        const dealStatus = deal.data?.dealStatus === 'closed' ? 'closed' : 'open';
        const fingerprint = `${deal.id}:${deal.timestamp}:${dealStatus}:${alreadyLinkedHere ? 'linked' : 'new'}`;
        if (processedRef.current.has(fingerprint)) continue;
        processedRef.current.add(fingerprint);

        try {
          const now = new Date().toISOString();
          if (!alreadyLinkedHere) {
            await setDoc(doc(db, 'deals', deal.id), {
              showroomPassageId: active.passageId,
              showroomCustomerName: active.customerName,
              showroomCustomerPhone: active.phone,
              showroomInterestModel: active.interestModel,
              showroomOrigin: active.origin,
              showroomLinkedAt: now,
            }, { merge: true });
          }

          const closed = dealStatus === 'closed';
          await updateDoc(doc(db, 'showroom_passages', active.passageId), {
            linkedDealIds: arrayUnion(deal.id),
            status: closed ? 'sale' : 'proposal',
            ...(closed ? { closedAt: now } : {}),
            updatedAt: now,
          });

          if (closed) {
            setActive(null);
            writeContext(null);
            processedRef.current.clear();
            return;
          }
        } catch (error) {
          processedRef.current.delete(fingerprint);
          console.warn('Motyq: não foi possível vincular a negociação ao atendimento.', error);
        }
      }
    };

    void sync();
    return () => { cancelled = true; };
  }, [active, deals, user]);

  if (!user) return null;

  const selected = activePassages.find(item => item.id === selectedPassageId) || activePassages[0];
  const linkedPassage = active ? passages.find(item => item.id === active.passageId) : null;
  const linkedCount = Number((linkedPassage as any)?.linkedDealIds?.length || 0);

  const begin = (item: ShowroomPassage) => {
    const context: LinkContext = {
      passageId: item.id,
      customerName: item.customerName,
      phone: item.phone,
      interestModel: item.interestModel,
      origin: item.origin === 'requested' ? 'requested' : 'walk_in',
      companyId: item.companyId,
      storeId: item.storeId,
      startedAt: new Date().toISOString(),
    };
    processedRef.current.clear();
    setActive(context);
    writeContext(context);
    clickCalculator();
  };

  const unlink = () => {
    setActive(null);
    writeContext(null);
    processedRef.current.clear();
  };

  if (active) {
    return <div className="fixed bottom-4 left-1/2 z-[355] w-[calc(100%-20px)] max-w-3xl -translate-x-1/2 rounded-[22px] border border-emerald-300/25 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur md:bottom-5 md:p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.15em] text-emerald-300"><Link2 size={13}/> Negociação vinculada ao atendimento</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1"><strong className="truncate text-base text-white md:text-lg">{active.customerName}</strong><span className="text-xs text-zinc-500">{active.interestModel || 'Interesse não informado'}</span>{linkedCount > 0 && <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[10px] text-zinc-400">{linkedCount} negociação(ões)</span>}</div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={clickCalculator} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-3 py-2 text-xs font-black text-emerald-950 md:flex-none"><PlusCircle size={15}/> NOVA SIMULAÇÃO</button>
          <button onClick={unlink} title="Desvincular próximas negociações" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-zinc-500 hover:text-white"><Unlink size={15}/></button>
        </div>
      </div>
    </div>;
  }

  if (!selected) return null;

  return <div className="fixed bottom-4 left-1/2 z-[350] w-[calc(100%-20px)] max-w-3xl -translate-x-1/2 rounded-[22px] border border-violet-300/25 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur md:bottom-5 md:p-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.15em] text-violet-300"><UsersRound size={13}/> Cliente em atendimento</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1"><strong className="truncate text-base text-white md:text-lg">{selected.customerName}</strong><span className="text-xs text-zinc-500">{selected.interestModel || 'Interesse não informado'}</span></div>
        {activePassages.length > 1 && <select value={selected.id} onChange={event => setSelectedPassageId(event.target.value)} className="mt-2 h-8 max-w-full rounded-lg border border-white/10 bg-zinc-900 px-2 text-xs text-zinc-300">{activePassages.map(item => <option key={item.id} value={item.id}>{item.customerName} · {item.interestModel || 'sem modelo'}</option>)}</select>}
      </div>
      <button onClick={() => begin(selected)} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-300 px-4 py-2.5 text-xs font-black text-violet-950"><CarFront size={16}/> INICIAR NEGOCIAÇÃO <ChevronRight size={14}/></button>
    </div>
  </div>;
};

export default ShowroomDealLinkBridge;
