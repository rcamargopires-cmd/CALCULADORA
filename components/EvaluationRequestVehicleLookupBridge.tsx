import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Search, TriangleAlert } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser } from '../services/companyService';
import { storeIdForUser } from '../services/storeService';
import { groupStockService, GroupStockItem, GroupStockSnapshot } from '../services/groupStockService';
import { marketIqVehicleCacheService } from '../services/marketIqVehicleCacheService';

const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const cleanRenavam = (value: string) => String(value || '').replace(/\D/g, '').slice(0, 11);

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

type Notice = { kind: 'loading' | 'ok' | 'warn'; text: string } | null;

const EvaluationRequestVehicleLookupBridge: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [snapshot, setSnapshot] = useState<GroupStockSnapshot | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
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
        return;
      }

      const lookupKey = `${plate}:${renavam}`;
      if (lookupKey === lastLookupRef.current) return;
      lastLookupRef.current = lookupKey;
      const currentRequest = ++requestRef.current;

      const companyId = companyIdForUser(user);
      const storeId = storeIdForUser(user);
      const stockItem: GroupStockItem | undefined = snapshot?.items.find(item => cleanPlate(item.plate) === plate);

      setNotice({ kind: 'loading', text: renavam.length === 11 ? `Validando ${plate} + RENAVAM...` : `Localizando ${plate}...` });

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
          setNotice({ kind: 'ok', text: `${stockItem.model} · ${stockItem.year} localizado no estoque da empresa.` });
          return;
        }

        if (cached?.model && cached?.year) {
          setInput(field('Modelo / versão'), cached.model);
          setInput(field('Ano/modelo'), cached.year);
          if (!renavam && cachedRenavam) setInput(renavamInput, cachedRenavam);
          setNotice({ kind: 'ok', text: `${cached.model} · ${cached.year} reconhecido pelo histórico do MOTYQ.` });
          return;
        }

        setNotice({
          kind: 'warn',
          text: renavam.length === 11
            ? 'Não consegui localizar este veículo automaticamente. Confira placa/RENAVAM ou preencha os dados manualmente.'
            : 'Placa não encontrada no MOTYQ. Informe também o RENAVAM para tentar a identificação automática.',
        });
      } catch {
        if (currentRequest !== requestRef.current) return;
        setNotice({ kind: 'warn', text: 'Não foi possível consultar o veículo agora. Você ainda pode preencher os dados manualmente.' });
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

  if (!user || !notice || !requestRoot()) return null;

  const tone = notice.kind === 'ok'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : notice.kind === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-sky-200 bg-sky-50 text-sky-800';

  return <div className={`fixed right-6 top-24 z-[790] flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg ${tone}`}>
    {notice.kind === 'loading' ? <Loader2 size={18} className="animate-spin"/> : notice.kind === 'ok' ? <CheckCircle2 size={18}/> : notice.kind === 'warn' ? <TriangleAlert size={18}/> : <Search size={18}/>}
    <span>{notice.text}</span>
  </div>;
};

export default EvaluationRequestVehicleLookupBridge;
