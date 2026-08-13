import React, { useMemo, useState } from 'react';
import { BookOpenCheck, ExternalLink, KeyRound, MapPin, PackageCheck, Search, ShieldCheck, X } from 'lucide-react';
import { User } from '../types';

const MANUAL_TRACK_URL = 'https://controle-manuais-chaves.vercel.app/sistema';

type Props = {
  currentUser: User;
  companyName: string;
  storeName: string;
};

const AssetGuardPanel: React.FC<Props> = ({ currentUser, companyName, storeName }) => {
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState('');
  const cleanPlate = useMemo(() => plate.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7), [plate]);
  const isManager = currentUser.role === 'admin' || currentUser.role === 'manager';

  const openManualTrack = () => {
    const params = new URLSearchParams();
    if (cleanPlate) params.set('plate', cleanPlate);
    params.set('source', 'dealmaster');
    params.set('vehicleStore', storeName || 'Unidade atual');
    params.set('company', companyName || 'Empresa');
    const target = `${MANUAL_TRACK_URL}?${params.toString()}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  return <>
    <div className="fixed bottom-56 right-3 z-[139] md:right-5">
      <button
        onClick={() => setOpen(true)}
        title="AssetGuard"
        className="group flex h-12 w-12 items-center overflow-hidden rounded-full border border-emerald-400/25 bg-zinc-950/95 text-emerald-300 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:w-40 hover:border-emerald-400/50 hover:bg-zinc-900"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center"><KeyRound size={18}/></span>
        <span className="hidden whitespace-nowrap pr-4 text-sm font-semibold opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:block">AssetGuard</span>
      </button>
    </div>

    {open && <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.currentTarget === e.target) setOpen(false); }}>
      <div className="w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/10 p-6 md:p-8">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400"><ShieldCheck size={15}/> AssetGuard · integração V2</div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">Veículo e itens podem estar em lojas diferentes.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{companyName} · {storeName}. A unidade atual do estoque agora acompanha a placa quando você abre o AssetGuard, sem mover manual ou chave automaticamente.</p>
          </div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"><X size={18}/></button>
        </div>

        <div className="grid gap-3 p-6 md:grid-cols-3 md:p-8">
          <Info icon={<MapPin size={18}/>} title="Veículo" text={`Local atual informado pelo DealMaster: ${storeName}.`}/>
          <Info icon={<BookOpenCheck size={18}/>} title="Manual" text="Continua guardado na unidade de origem até ser realmente enviado."/>
          <Info icon={<KeyRound size={18}/>} title="Chave reserva" text="Localização independente do carro, com transferência e recebimento próprios."/>
        </div>

        <div className="border-t border-white/10 p-6 md:p-8">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Localizar por placa</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex h-12 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4"><Search size={17} className="text-zinc-500"/><input value={cleanPlate} onChange={e => setPlate(e.target.value)} placeholder="ABC1D23" className="w-full bg-transparent font-mono text-sm uppercase text-white outline-none placeholder:text-zinc-600"/></div>
            <button onClick={openManualTrack} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black hover:bg-zinc-200">{cleanPlate ? 'Abrir veículo' : 'Abrir AssetGuard'} <ExternalLink size={16}/></button>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3 text-xs leading-5 text-zinc-400"><PackageCheck size={16} className="mt-0.5 shrink-0 text-emerald-400"/><span>Ao abrir uma placa, o AssetGuard recebe <strong className="text-zinc-200">{storeName}</strong> como localização atual do veículo. Manual e chave mantêm a localização física registrada no módulo.</span></div>
          {!isManager && <p className="mt-2 text-xs text-amber-400">Seu perfil mantém as permissões definidas no módulo de manuais.</p>}
        </div>
      </div>
    </div>}
  </>;
};

const Info = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5"><div className="mb-4 grid h-10 w-10 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-400">{icon}</div><div className="font-semibold text-white">{title}</div><p className="mt-1 text-sm leading-5 text-zinc-500">{text}</p></div>;

export default AssetGuardPanel;