import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { Search } from 'lucide-react';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { companyScopeService, COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { storeScopeService } from '../services/storeScopeService';
import { groupStockService, GroupStockItem, GroupStockSnapshot } from '../services/groupStockService';
import { marketIqVehicleCacheService } from '../services/marketIqVehicleCacheService';
import { MarketIqQuotaExceededError, marketIqQuotaService } from '../services/marketIqQuotaService';

const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const cleanRenavam = (value: string) => String(value || '').replace(/\D/g, '').slice(0, 11);
const moneyInput = (value: number) => value ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const marketRoot = () => Array.from(document.querySelectorAll('div.fixed.inset-0')).find(el => String(el.textContent || '').includes('MOTYQ MARKETIQ')) as HTMLElement | undefined;
const marketVisible = () => {
  const root = marketRoot();
  if (!root) return false;
  const style = window.getComputedStyle(root);
  const rect = root.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') !== 0 && rect.width > 0 && rect.height > 0;
};
const field = (label: string) => {
  const root = marketRoot();
  if (!root) return null;
  const wanted = label.toLowerCase();
  const labels = Array.from(root.querySelectorAll('label'));
  const found = labels.find(el => String(el.textContent || '').toLowerCase().includes(wanted));
  return found?.querySelector('input') as HTMLInputElement | null;
};
const setInput = (input: HTMLInputElement | null, value: string) => {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
const fill = (data: { plate?: string; model?: string; year?: string; km?: number; fipe?: number }) => {
  if (data.plate) setInput(field('Placa'), data.plate);
  if (data.model) setInput(field('Modelo / versão'), data.model);
  if (data.year) setInput(field('Ano/modelo'), String(data.year));
  if (data.km) setInput(field('KM atual'), String(data.km));
  if (data.fipe) setInput(field('FIPE'), moneyInput(data.fipe));
};

const lookupFipe = async (input: { brand: string; model: string; year: string; fuel?: string }) => {
  if (!input.model || !input.year) return null;
  const params = new URLSearchParams({ brand: input.brand, model: input.model, year: input.year });
  if (input.fuel) params.set('fuel', input.fuel);
  params.set('_ts', String(Date.now()));
  const response = await fetch(`/api/marketiq-fipe?${params.toString()}`, { method: 'GET', cache: 'no-store' });
  if (!response.ok) return null;
  return response.json();
};

type Notice = { kind: 'ok' | 'warn' | 'loading'; text: string } | null;

const MarketIQLookupBridge: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [snapshot, setSnapshot] = useState<GroupStockSnapshot | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [renavam, setRenavam] = useState('');
  const [identifying, setIdentifying] = useState(false);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) { setUser(null); return; }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      setUser(profile?.status === 'active' ? profile : null);
    } catch {
      setUser(null);
    }
  }), []);

  useEffect(() => {
    if (!user) return;
    let unsub = () => {};
    const subscribe = () => {
      unsub();
      const companyId = companyScopeService.get(user);
      unsub = groupStockService.subscribe(companyId, setSnapshot, () => setSnapshot(null));
    };
    subscribe();
    window.addEventListener(COMPANY_SCOPE_EVENT, subscribe);
    return () => {
      unsub();
      window.removeEventListener(COMPANY_SCOPE_EVENT, subscribe);
    };
  }, [user]);

  useEffect(() => {
    const locate = () => {
      const root = marketRoot();
      if (!root) { setPortalHost(null); return; }
      const title = Array.from(root.querySelectorAll('h3')).find(el => String(el.textContent || '').includes('Identificação do veículo')) as HTMLElement | undefined;
      const section = title?.closest('section') as HTMLElement | null;
      const grid = section?.querySelector('.grid') as HTMLElement | null;
      if (!grid) { setPortalHost(null); return; }
      let host = grid.querySelector('[data-marketiq-direct-identify-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('span');
        host.setAttribute('data-marketiq-direct-identify-host', 'true');
        host.className = 'contents';
        grid.appendChild(host);
      }
      setPortalHost(host);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!marketVisible()) {
        setNotice(null);
        setRenavam('');
        setIdentifying(false);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const fallbackByPlate = async (plate: string) => {
    if (!user || !plate) return false;
    const companyId = companyScopeService.get(user);
    const storeId = storeScopeService.get(user);
    const stockItem: GroupStockItem | undefined = snapshot?.items.find(item => cleanPlate(item.plate) === plate);
    const cached = await marketIqVehicleCacheService.get(companyId, storeId, plate).catch(() => null);

    if (stockItem) {
      fill({ plate, model: stockItem.model, year: stockItem.year, km: stockItem.km });
      const fipe = await lookupFipe({ brand: stockItem.brand, model: stockItem.model, year: stockItem.year, fuel: stockItem.fuel });
      if (fipe?.value) fill({ fipe: Number(fipe.value) || 0 });
      setNotice({ kind: 'ok', text: `${stockItem.model} · ${stockItem.year} localizado no estoque do grupo${fipe?.value ? ` · FIPE ${fipe.referenceMonth || 'atual'} carregada` : ''}.` });
      return true;
    }

    if (cached?.model) {
      fill({ plate, model: cached.model, year: cached.year });
      const fipe = await lookupFipe({ brand: cached.brand, model: cached.model, year: cached.year, fuel: cached.fuel });
      if (fipe?.value) fill({ fipe: Number(fipe.value) || 0 });
      setNotice({ kind: 'ok', text: `${cached.model} · ${cached.year} reconhecido pelo histórico do MOTYQ${fipe?.value ? ` · FIPE ${fipe.referenceMonth || 'atual'} carregada` : ''}.` });
      return true;
    }
    return false;
  };

  const identify = async () => {
    if (!user || identifying) return;
    const plate = cleanPlate(field('Placa')?.value || '');
    const cleanId = cleanRenavam(renavam);

    if (!plate && cleanId.length < 9) {
      setNotice({ kind: 'warn', text: 'Informe a placa ou o RENAVAM. Você também pode informar os dois para aumentar a confiança da identificação.' });
      return;
    }
    if (plate && plate.length !== 7) {
      setNotice({ kind: 'warn', text: 'A placa precisa ter 7 caracteres.' });
      return;
    }

    setIdentifying(true);
    setNotice({ kind: 'loading', text: plate && cleanId ? 'Identificando por placa + RENAVAM...' : plate ? `Identificando ${plate} pela placa...` : 'Identificando pelo RENAVAM...' });

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Sua sessão expirou. Entre novamente no MOTYQ.');
      const companyId = companyScopeService.get(user);
      const storeId = storeScopeService.get(user);
      await marketIqQuotaService.assertAvailable(companyId);

      const token = await currentUser.getIdToken();
      const response = await fetch('/api/marketiq-identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plate, renavam: cleanId }),
      });
      const payload = await response.json().catch(() => null);

      if (response.ok) {
        const resolvedPlate = cleanPlate(payload?.plate || plate);
        const resolvedRenavam = cleanRenavam(payload?.renavam || cleanId);
        const brand = String(payload?.brand || '').trim();
        const model = String(payload?.model || payload?.registryModel || '').trim();
        const year = String(payload?.year || '').trim();
        const fuel = String(payload?.fuel || '').trim();
        let fipeValue = Number(payload?.fipeValue) || 0;
        let fipeReference = String(payload?.referenceMonth || '');
        let fipeCode = String(payload?.fipeCode || '');

        if (!model) throw new Error('A consulta retornou o veículo, mas não conseguiu definir modelo/versão.');
        await marketIqQuotaService.consumeEvaluation({
          companyId,
          storeId,
          userEmail: currentUser.email || user.email,
          sessionId: marketIqQuotaService.getEvaluationSessionId(),
        });

        fill({ plate: resolvedPlate || undefined, model, year, fipe: fipeValue || undefined });
        if (resolvedRenavam) setRenavam(resolvedRenavam);

        if (!fipeValue && year) {
          setNotice({ kind: 'loading', text: `${model} · ${year} identificado. Buscando FIPE...` });
          const fipe = await lookupFipe({ brand, model, year, fuel });
          if (fipe?.value) {
            fipeValue = Number(fipe.value) || 0;
            fipeReference = String(fipe.referenceMonth || '');
            fipeCode = String(fipe.fipeCode || '');
            fill({ model: String(fipe.model || model), year: String(fipe.year || year), fipe: fipeValue });
          }
        }

        if (resolvedPlate) {
          await marketIqVehicleCacheService.save({
            plate: resolvedPlate,
            brand,
            model,
            year,
            fuel,
            renavam: resolvedRenavam,
            fipeCode,
            lastFipeValue: fipeValue || undefined,
            lastFipeReference: fipeReference,
            source: String(payload?.source || 'consulta-veicular'),
            companyId,
            storeId,
            identifiedAt: new Date().toISOString(),
            identifiedBy: currentUser.email || currentUser.uid,
          }).catch(() => undefined);
        }

        const mode = payload?.lookupMode === 'renavam' ? 'RENAVAM' : payload?.lookupMode === 'plate+renavam' ? 'placa + RENAVAM' : 'placa';
        setNotice({ kind: 'ok', text: `${model}${year ? ` · ${year}` : ''} identificado por ${mode}${fipeValue ? ` · FIPE ${fipeReference || 'atual'} carregada` : ''}. Documento não necessário.` });
        return;
      }

      if (plate && await fallbackByPlate(plate)) return;

      if (payload?.error === 'vehicle_provider_not_configured') {
        setNotice({ kind: 'warn', text: 'A identificação direta ainda precisa da chave do provedor veicular no ambiente. Você pode preencher modelo, ano e FIPE manualmente e continuar a avaliação.' });
      } else {
        setNotice({ kind: 'warn', text: 'Não consegui identificar automaticamente com esses dados. Confira placa/RENAVAM ou preencha modelo, ano e FIPE manualmente. O CRLV não é obrigatório.' });
      }
    } catch (error: any) {
      if (error instanceof MarketIqQuotaExceededError) {
        setNotice({ kind: 'warn', text: `Limite mensal atingido: ${error.status.used}/${error.status.limit} avaliações. Novas consultas ficam bloqueadas até a renovação do mês ou alteração do plano.` });
      } else {
        setNotice({ kind: 'warn', text: error?.message || 'Não foi possível identificar o veículo agora. Você pode continuar preenchendo os dados manualmente.' });
      }
    } finally {
      setIdentifying(false);
    }
  };

  const controls = <>
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-500">RENAVAM · opcional</span>
      <input
        value={renavam}
        onChange={e => setRenavam(cleanRenavam(e.target.value))}
        inputMode="numeric"
        placeholder="Use se tiver"
        className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-300/40"
      />
    </label>
    <div className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-500">Identificação</span>
      <button
        type="button"
        onClick={() => void identify()}
        disabled={identifying}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] px-3 text-xs font-black uppercase tracking-[.08em] text-cyan-200 transition hover:bg-cyan-300/[.13] disabled:opacity-50"
      >
        <Search size={14}/>{identifying ? 'CONSULTANDO...' : 'IDENTIFICAR'}
      </button>
    </div>
  </>;

  return <>
    {portalHost && marketVisible() && createPortal(controls, portalHost)}
    {notice && marketVisible() && <div className={`fixed right-5 top-24 z-[615] w-[min(92vw,410px)] rounded-2xl border px-4 py-3 text-xs shadow-2xl backdrop-blur-xl ${notice.kind === 'ok' ? 'border-emerald-300/25 bg-emerald-950/90 text-emerald-100' : notice.kind === 'warn' ? 'border-amber-300/25 bg-amber-950/90 text-amber-100' : 'border-cyan-300/20 bg-cyan-950/90 text-cyan-100'}`}>{notice.text}</div>}
  </>;
};

export default MarketIQLookupBridge;
