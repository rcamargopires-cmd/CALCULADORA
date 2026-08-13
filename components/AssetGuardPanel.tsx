import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpenCheck, ExternalLink, KeyRound, Loader2, MapPin, PackageCheck, Search, ShieldCheck, Truck, X } from 'lucide-react';
import { User } from '../types';
import { operationalDataService } from '../services/operationalDataService';

const MANUAL_TRACK_URL = 'https://controle-manuais-chaves.vercel.app/sistema';
const RADAR_URL = 'https://controle-manuais-chaves.vercel.app/api/radar';

type Props = { currentUser: User; companyName: string; storeName: string; };
type RadarSummary = { registered: number; complete: number; requestsOpen: number; inTransit: number; outsideStore: number; attention: number; overdueRequests: number; };
const EMPTY: RadarSummary = { registered: 0, complete: 0, requestsOpen: 0, inTransit: 0, outsideStore: 0, attention: 0, overdueRequests: 0 };

const AssetGuardPanel: React.FC<Props> = ({ currentUser, companyName, storeName }) => {
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState('');
  const [radar, setRadar] = useState<RadarSummary>(EMPTY);
  const [stockCount, setStockCount] = useState(0);
  const [loadingRadar, setLoadingRadar] = useState(false);
  const [radarError, setRadarError] = useState('');
  const cleanPlate = useMemo(() => plate.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7), [plate]);
  const isManager = currentUser.role === 'admin' || currentUser.role === 'manager';

  const loadRadar = async () => {
    if (!isManager) return;
    setLoadingRadar(true); setRadarError('');
    try {
      const stock = await operationalDataService.getLatestStock();
      const plates = stock.map(item => String(item.plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean);
      setStockCount(plates.length);
      if (!plates.length) { setRadar(EMPTY); return; }
      const response = await fetch(`${RADAR_URL}?plates=${encodeURIComponent(plates.join(','))}`, { credentials: 'include' });
      if (!response.ok) throw new Error('AssetGuard precisa de uma sessão ativa para carregar o radar.');
      const data = await response.json();
      setRadar(data.summary || EMPTY);
    } catch (error) {
      setRadarError(error instanceof Error ? error.message : 'Não foi possível carregar o radar.');
    } finally { setLoadingRadar(false); }
  };

  useEffect(() => { if (open) loadRadar(); }, [open, storeName]);

  const openManualTrack = () => {
    const params = new URLSearchParams();
    if (cleanPlate) params.set('plate', cleanPlate);
    params.set('source', 'dealmaster'); params.set('vehicleStore', storeName || 'Unidade atual'); params.set('company', companyName || 'Empresa');
    window.open(`${MANUAL_TRACK_URL}?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  return <>
    <div className="fixed bottom-56 right-3 z-[139] md:right-5"><button onClick={() => setOpen(true)} title="AssetGuard" className="group flex h-12 w-12 items-center overflow-hidden rounded-full border border-emerald-400/25 bg-zinc-950/95 text-emerald-300 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:w-40 hover:border-emerald-400/50 hover:bg-zinc-900"><span className="grid h-12 w-12 shrink-0 place-items-center"><KeyRound size={18}/></span><span className="hidden whitespace-nowrap pr-4 text-sm font-semibold opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:block">AssetGuard</span></button></div>

    {open && <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.currentTarget === e.target) setOpen(false); }}><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl">
      <div className="flex items-start justify-between border-b border-white/10 p-6 md:p-8"><div><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400"><ShieldCheck size={15}/> AssetGuard · Radar V1</div><h2 className="text-3xl font-semibold tracking-tight text-white">Radar de manuais e chaves.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{companyName} · {storeName}. Cruzamento do estoque atual com a custódia física dos itens.</p></div><button onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"><X size={18}/></button></div>

      {isManager && <div className="border-b border-white/10 p-6 md:p-8"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Radar operacional</p><p className="mt-1 text-sm text-zinc-400">{stockCount} veículo(s) no estoque atual</p></div><button onClick={loadRadar} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300">{loadingRadar ? <Loader2 size={15} className="animate-spin"/> : 'Atualizar'}</button></div>{radarError ? <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-200">{radarError} Abra o AssetGuard uma vez e volte para atualizar o radar.</div> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><RadarCard label="Cadastrados" value={radar.registered} hint={`${Math.max(stockCount-radar.registered,0)} sem cadastro`}/><RadarCard label="Completos" value={radar.complete} hint="manual + chave" good/><RadarCard label="Solicitações" value={radar.requestsOpen} hint={radar.overdueRequests ? `${radar.overdueRequests} há +24h` : 'abertas'} warn={radar.requestsOpen>0}/><RadarCard label="Em transporte" value={radar.inTransit} hint="malote / deslocamento" warn={radar.inTransit>0}/></div>}</div>}

      <div className="grid gap-3 p-6 md:grid-cols-3 md:p-8"><Info icon={<MapPin size={18}/>} title="Veículo" text={`Local atual informado pelo DealMaster: ${storeName}.`}/><Info icon={<BookOpenCheck size={18}/>} title="Manual" text="Continua guardado na unidade de origem até ser realmente enviado."/><Info icon={<KeyRound size={18}/>} title="Chave reserva" text="Localização independente do carro, com transferência e recebimento próprios."/></div>

      <div className="border-t border-white/10 p-6 md:p-8"><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Localizar por placa</label><div className="flex flex-col gap-3 sm:flex-row"><div className="flex h-12 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4"><Search size={17} className="text-zinc-500"/><input value={cleanPlate} onChange={e => setPlate(e.target.value)} placeholder="ABC1D23" className="w-full bg-transparent font-mono text-sm uppercase text-white outline-none placeholder:text-zinc-600"/></div><button onClick={openManualTrack} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black hover:bg-zinc-200">{cleanPlate ? 'Abrir veículo' : 'Abrir AssetGuard'} <ExternalLink size={16}/></button></div><div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3 text-xs leading-5 text-zinc-400"><PackageCheck size={16} className="mt-0.5 shrink-0 text-emerald-400"/><span>O carro pode estar em <strong className="text-zinc-200">{storeName}</strong> e o manual continuar corretamente em outra unidade. A movimentação só começa quando houver solicitação.</span></div></div>
    </div></div>}
  </>;
};

const RadarCard = ({ label, value, hint, good, warn }: { label:string; value:number; hint:string; good?:boolean; warn?:boolean }) => <div className={`rounded-2xl border p-4 ${warn?'border-amber-400/20 bg-amber-400/[0.055]':good?'border-emerald-400/20 bg-emerald-400/[0.05]':'border-white/10 bg-white/[0.035]'}`}><div className="flex items-center justify-between"><p className="text-xs text-zinc-500">{label}</p>{warn ? <AlertTriangle size={14} className="text-amber-400"/> : good ? <ShieldCheck size={14} className="text-emerald-400"/> : <Truck size={14} className="text-zinc-600"/>}</div><p className="mt-2 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;
const Info = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5"><div className="mb-4 grid h-10 w-10 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-400">{icon}</div><div className="font-semibold text-white">{title}</div><p className="mt-1 text-sm leading-5 text-zinc-500">{text}</p></div>;
export default AssetGuardPanel;