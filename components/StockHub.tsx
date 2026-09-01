import React, { useState } from 'react';
import { Database, KeyRound, Megaphone, PackageSearch, Wrench, X } from 'lucide-react';

const findButton = (predicate: (button: HTMLButtonElement) => boolean) =>
  Array.from(document.querySelectorAll('button')).find(button => predicate(button as HTMLButtonElement)) as HTMLButtonElement | undefined;

const clickText = (text: string) => {
  const target = text.trim().toLowerCase();
  const button = findButton(item => String(item.textContent || '').trim().toLowerCase() === target)
    || findButton(item => String(item.textContent || '').trim().toLowerCase().includes(target));
  button?.click();
  return Boolean(button);
};

const clickTitle = (title: string) => {
  const button = document.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
  button?.click();
  return Boolean(button);
};

type Props = { canStockIntelligence: boolean; canAssetGuard: boolean; storeName: string };

const StockHub: React.FC<Props> = ({ canStockIntelligence, canAssetGuard, storeName }) => {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const launch = (key: 'data' | 'market' | 'prep' | 'assets') => {
    if ((key === 'market' || key === 'prep') && !canStockIntelligence) {
      setFeedback('Stock Intelligence não está liberado no plano atual.');
      return;
    }
    if (key === 'assets' && !canAssetGuard) {
      setFeedback('AssetGuard não está liberado no plano atual.');
      return;
    }
    let found = false;
    if (key === 'data') found = clickText('Dados da Loja');
    if (key === 'market') found = clickTitle('Market Presence');
    if (key === 'prep') found = clickTitle('PrepTrack · preparação');
    if (key === 'assets') found = clickTitle('AssetGuard');
    if (!found) {
      setFeedback('Este módulo ainda está carregando. Tente novamente em instantes.');
      return;
    }
    setFeedback('');
    setOpen(false);
  };

  const cards = [
    { key: 'data' as const, icon: <Database size={19}/>, eyebrow: 'Base Operacional', title: 'Dados da Loja', text: 'Importe estoque, performance e auditoria de presença digital.', available: true },
    { key: 'market' as const, icon: <Megaphone size={19}/>, eyebrow: 'Vitrine Digital', title: 'Market Presence', text: 'Cruza estoque físico com anúncio, fotos, preço, KM e capital sem exposição.', available: canStockIntelligence },
    { key: 'prep' as const, icon: <Wrench size={19}/>, eyebrow: 'Preparação', title: 'PrepTrack', text: 'Serviços, fornecedores, custos, prazos, atrasos e destino do veículo.', available: canStockIntelligence },
    { key: 'assets' as const, icon: <KeyRound size={19}/>, eyebrow: 'Ativos', title: 'AssetGuard', text: 'Manuais, chaves, localização, solicitações, transporte e SLA.', available: canAssetGuard },
  ];

  return <>
    <style>{`
      /* Stock tools now live behind Stock Intelligence. */
      body.motyq-graphite button[title="Market Presence"],
      body.motyq-graphite button[title="PrepTrack · preparação"],
      body.motyq-graphite button[title="AssetGuard"],
      body.motyq-graphite button.fixed.bottom-5.left-5 {
        display: none !important;
      }
    `}</style>

    <button
      onClick={() => setOpen(true)}
      title="Estoque Motyq"
      className="fixed bottom-[88px] right-4 z-[154] flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-[#1b1914]/95 px-4 py-3 text-left text-white shadow-2xl shadow-black/45 backdrop-blur-xl transition hover:border-amber-300/40 hover:bg-[#211e17] active:scale-[.98]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-300/15 bg-amber-300/[.07] text-amber-300"><PackageSearch size={20}/></span>
      <span className="hidden sm:block"><span className="block text-[9px] font-black uppercase tracking-[.17em] text-amber-300">ESTOQUE</span><span className="mt-0.5 block text-sm font-semibold">Stock Intelligence</span></span>
    </button>

    {open && <div className="fixed inset-0 z-[562] h-[100dvh] overflow-hidden bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <aside className="ml-auto flex h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-[470px] flex-col overflow-hidden border-l border-white/10 bg-[#151411] text-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="shrink-0 flex items-start justify-between border-b border-white/10 p-5 sm:p-6">
          <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">STOCK INTELLIGENCE</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">O veículo do pátio à venda.</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{storeName}. Quatro dores diferentes, uma única área de estoque.</p></div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-zinc-400"><X size={18}/></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-5">
          <div className="space-y-2.5">{cards.map(card => <button key={card.key} onClick={() => launch(card.key)} className={`w-full rounded-[22px] border p-4 text-left transition ${card.available ? 'border-white/10 bg-white/[.035] hover:border-amber-300/25 hover:bg-amber-300/[.04]' : 'border-white/5 bg-white/[.015] opacity-45'}`}><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.055] text-zinc-300">{card.icon}</div><div><div className="flex items-center gap-2"><p className="text-[9px] font-black uppercase tracking-[.14em] text-amber-300">{card.eyebrow}</p>{!card.available && <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[9px] font-bold text-zinc-500">PLANO</span>}</div><p className="mt-1 font-semibold text-white">{card.title}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{card.text}</p></div></div></button>)}</div>
          {feedback && <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[.05] px-4 py-3 text-xs text-amber-200">{feedback}</div>}
        </div>
      </aside>
    </div>}
  </>;
};

export default StockHub;
