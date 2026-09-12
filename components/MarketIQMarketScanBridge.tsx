import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import { auth } from '../firebase';

type Props = { storeName: string };

type Comparable = {
  source: string;
  title: string;
  price: number;
  year: number;
  km: number;
  location: string;
  url?: string;
};

type ScanResult = {
  comparables: Comparable[];
  stats: { count: number; low: number; median: number; high: number; observed: number };
  confidence: 'high' | 'medium' | 'low';
  marketSupply?: {
    level: 'high' | 'medium' | 'low';
    count: number;
    reported?: boolean;
    source?: string;
    warning?: string;
  };
  notes?: string;
  sources?: Array<{ title: string; url: string }>;
  searchQueries?: string[];
};

const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const moneyInput = (value: number) => value ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const numberFromInput = (value: string) => Number(String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
const yearFromInput = (value: string) => {
  const matches = String(value || '').match(/(?:19|20)\d{2}/g) || [];
  if (matches.length) return Number(matches[matches.length - 1]);
  const numeric = Math.round(numberFromInput(value));
  return numeric >= 1900 && numeric <= 2100 ? numeric : 0;
};

const marketRoot = () => Array.from(document.querySelectorAll('div.fixed.inset-0')).find(el => String(el.textContent || '').includes('MOTYQ MARKETIQ')) as HTMLElement | undefined;
const marketVisible = () => {
  const root = marketRoot();
  if (!root) return false;
  const rect = root.getBoundingClientRect();
  const style = window.getComputedStyle(root);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') !== 0;
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

const confidenceLabel = (value: ScanResult['confidence']) => value === 'high' ? 'ALTA' : value === 'medium' ? 'MÉDIA' : 'BAIXA';
const confidenceClass = (value: ScanResult['confidence']) => value === 'high'
  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
  : value === 'medium'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';

const MarketIQMarketScanBridge: React.FC<Props> = ({ storeName }) => {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    const locate = () => {
      const root = marketRoot();
      if (!root) { setPortalHost(null); return; }
      const title = Array.from(root.querySelectorAll('h3')).find(el => String(el.textContent || '').includes('Mercado & referências')) as HTMLElement | undefined;
      const header = title?.parentElement as HTMLElement | null;
      if (!header) { setPortalHost(null); return; }
      let host = header.querySelector('[data-marketiq-market-scan-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-marketiq-market-scan-host', 'true');
        host.className = 'ml-auto shrink-0';
        header.appendChild(host);
      }
      setPortalHost(host);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const knownKms = useMemo(() => (result?.comparables || []).map(item => Number(item.km || 0)).filter(value => value > 0).sort((a, b) => a - b), [result]);
  const typicalKm = useMemo(() => {
    if (!knownKms.length) return 0;
    const mid = Math.floor(knownKms.length / 2);
    return knownKms.length % 2 ? knownKms[mid] : Math.round((knownKms[mid - 1] + knownKms[mid]) / 2);
  }, [knownKms]);

  const scan = async () => {
    const model = String(field('Modelo / versão')?.value || '').trim();
    const year = String(field('Ano/modelo')?.value || '').trim();
    const km = String(field('KM atual')?.value || '').trim();
    const fipe = String(field('FIPE')?.value || '').trim();

    setVehicleLabel(`${model || 'Veículo'}${year ? ` · ${year}` : ''}`);
    setOpen(true);
    setApplied(false);
    setError('');
    setResult(null);

    const normalizedYear = yearFromInput(year);
    if (!model || !normalizedYear) {
      setError('Informe modelo/versão e ano/modelo antes de pesquisar o mercado.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('Sua sessão expirou. Entre novamente no Motyq.');
      return;
    }

    setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/marketiq-market-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          model,
          year: normalizedYear,
          yearLabel: year,
          km: numberFromInput(km),
          fipe: numberFromInput(fipe),
          storeName,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível pesquisar o mercado.');
      setResult(payload as ScanResult);
      if (!payload?.stats?.count) setError('Não encontrei anúncios comparáveis suficientes com preço verificável. Tente novamente mais tarde ou amplie manualmente a pesquisa.');
    } catch (e: any) {
      setError(e?.message || 'Não foi possível pesquisar o mercado agora.');
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!result?.stats?.observed) return;
    setInput(field('Mercado observado'), moneyInput(result.stats.observed));
    setInput(field('Faixa mínima'), moneyInput(result.stats.low));
    setInput(field('Faixa máxima'), moneyInput(result.stats.high));
    if (typicalKm) setInput(field('KM típico comparável'), String(typicalKm));
    setApplied(true);
  };

  const trigger = <button
    onClick={() => void scan()}
    disabled={loading}
    title="Pesquisar anúncios comparáveis na web"
    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-200 bg-white px-2.5 text-[10px] font-black uppercase tracking-[.08em] text-cyan-700 transition hover:bg-cyan-50 disabled:opacity-60"
  >
    {loading ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
    MARKETSCAN
  </button>;

  return <>
    {portalHost && marketVisible() && createPortal(trigger, portalHost)}

    {open && <div className="fixed inset-0 z-[720] overflow-y-auto bg-slate-950/35 p-3 backdrop-blur-sm md:p-6" onClick={() => !loading && setOpen(false)}>
      <div className="mx-auto my-3 w-full max-w-5xl overflow-hidden rounded-[26px] border border-slate-200 bg-white text-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700">MOTYQ MARKETIQ · MARKETSCAN</p>
            <h3 className="mt-1 text-xl font-semibold">Mercado real de comparáveis</h3>
            <p className="mt-1 text-sm text-slate-500">{vehicleLabel || 'Veículo'} · pesquisa web em tempo real</p>
          </div>
          <button disabled={loading} onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50"><X size={17} /></button>
        </header>

        <div className="p-4 md:p-6">
          {loading && <div className="grid min-h-[280px] place-items-center rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
            <div>
              <RefreshCw size={32} className="mx-auto animate-spin text-cyan-600" />
              <p className="mt-4 font-semibold">Pesquisando anúncios comparáveis...</p>
              <p className="mt-1 max-w-lg text-sm leading-6 text-slate-500">O MarketScan está pesquisando primeiro Webmotors e iCarros e, se necessário, complementando com outras fontes permitidas.</p>
            </div>
          </div>}

          {!loading && error && !result?.stats?.count && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">{error}</div>}

          {!loading && result?.stats?.count > 0 && <>
            {result.marketSupply?.level === 'high' && <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[.1em] text-amber-800">ALTA OFERTA · CAUTELA NA COMPRA</p>
                  <p className="mt-1 text-sm font-semibold leading-6">{result.marketSupply.warning || 'Há muitos veículos equivalentes anunciados. A concorrência tende a pressionar preço e aumentar o risco de giro.'}</p>
                  {result.marketSupply.source && <p className="mt-1 text-[11px] text-amber-700">{result.marketSupply.source}</p>}
                </div>
              </div>
            </div>}

            {result.marketSupply?.level === 'medium' && <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-3 text-yellow-900">
              <p className="text-[11px] font-black uppercase tracking-[.08em]">OFERTA RELEVANTE</p>
              <p className="mt-1 text-xs leading-5">{result.marketSupply.warning || 'Existe oferta relevante deste veículo. Avalie o preço de entrada e o giro com atenção.'}</p>
            </div>}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">AMOSTRA</p><p className="mt-1 text-2xl font-semibold">{result.stats.count}</p><p className="mt-1 text-[10px] text-slate-500">anúncios válidos</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">MENOR</p><p className="mt-1 text-lg font-semibold">{money(result.stats.low)}</p></div>
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-cyan-700">MERCADO OBSERVADO</p><p className="mt-1 text-lg font-semibold text-cyan-800">{money(result.stats.observed)}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">MEDIANA</p><p className="mt-1 text-lg font-semibold">{money(result.stats.median)}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">MAIOR</p><p className="mt-1 text-lg font-semibold">{money(result.stats.high)}</p></div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${confidenceClass(result.confidence)}`}>CONFIANÇA {confidenceLabel(result.confidence)}</span>
              {result.marketSupply?.count > 0 && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${result.marketSupply.level === 'high' ? 'border-amber-300 bg-amber-50 text-amber-800' : result.marketSupply.level === 'medium' ? 'border-yellow-200 bg-yellow-50 text-yellow-800' : 'border-slate-200 bg-white text-slate-600'}`}>OFERTA {result.marketSupply.count.toLocaleString('pt-BR')}</span>}
              {typicalKm > 0 && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">KM típico {typicalKm.toLocaleString('pt-BR')}</span>}
              {result.notes && <span className="text-xs text-slate-500">{result.notes}</span>}
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-[90px_1fr_90px_110px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[9px] font-black uppercase tracking-[.1em] text-slate-500 md:grid-cols-[110px_1fr_100px_120px_130px]">
                <span>Fonte</span><span>Comparável</span><span>Ano</span><span className="hidden md:block">KM</span><span className="text-right">Preço</span>
              </div>
              <div className="max-h-[380px] divide-y divide-slate-100 overflow-y-auto">
                {result.comparables.map((item, index) => <div key={`${item.source}-${item.price}-${index}`} className="grid grid-cols-[90px_1fr_90px_110px] gap-3 px-4 py-3 text-xs md:grid-cols-[110px_1fr_100px_120px_130px]">
                  <span className="font-bold text-slate-600">{item.source}</span>
                  <div className="min-w-0"><p className="truncate font-semibold text-slate-800">{item.title}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{item.location || 'Local não informado'}</p></div>
                  <span className="text-slate-600">{item.year || '—'}</span>
                  <span className="hidden text-slate-600 md:block">{item.km ? `${item.km.toLocaleString('pt-BR')} km` : '—'}</span>
                  <span className="text-right font-semibold text-slate-900">{money(item.price)}</span>
                </div>)}
              </div>
            </div>

            {!!result.sources?.length && <div className="mt-5">
              <p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">FONTES DA PESQUISA</p>
              <div className="mt-2 flex flex-wrap gap-2">{result.sources.slice(0, 10).map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="inline-flex max-w-[260px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:border-cyan-300 hover:text-cyan-700"><span className="truncate">{source.title}</span><ExternalLink size={11} className="shrink-0" /></a>)}</div>
            </div>}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="max-w-2xl text-[11px] leading-5 text-slate-500">O MarketScan usa preços anunciados, não preços efetivamente vendidos. O MarketIQ continua aplicando estado do carro, KM, preparação, giro, margem e risco antes de recomendar a compra.</p>
              <button onClick={apply} className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-black transition ${applied ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                <CheckCircle2 size={15} />
                {applied ? 'APLICADO AO MARKETIQ' : 'USAR DADOS NO MARKETIQ'}
              </button>
            </div>
          </>}
        </div>
      </div>
    </div>}
  </>;
};

export default MarketIQMarketScanBridge;
