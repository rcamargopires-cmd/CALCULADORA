import React, { useState } from 'react';
import { Building2, CarFront, Landmark, Settings2, ShieldCheck, Store, Users, X } from 'lucide-react';

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

const AdministrationHub: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const launch = (key: 'companies' | 'stores' | 'team' | 'groupStock' | 'executive' | 'security') => {
    let found = false;
    if (key === 'companies') found = clickText('Empresas');
    if (key === 'stores') found = clickText('Unidades');
    if (key === 'team') found = clickText('Hierarquia');
    if (key === 'groupStock') found = clickTitle('Estoque Compartilhado do Grupo');
    if (key === 'executive') found = clickTitle('Diretoria · Panorama do Grupo');
    if (key === 'security') found = clickText('Segurança');
    if (!found) {
      setFeedback('Este módulo ainda está carregando. Tente novamente em instantes.');
      return;
    }
    setFeedback('');
    setOpen(false);
  };

  const cards = [
    { key: 'companies' as const, icon: <Building2 size={19}/>, eyebrow: 'Clientes SaaS', title: 'Empresas & Planos', text: 'Clientes, trial, plano, módulos e ambiente demo.' },
    { key: 'stores' as const, icon: <Store size={19}/>, eyebrow: 'Estrutura', title: 'Unidades', text: 'Lojas, vínculo de usuários e unidade visualizada.' },
    { key: 'team' as const, icon: <Users size={19}/>, eyebrow: 'Pessoas', title: 'Usuários & Metas', text: 'Papéis, hierarquia e objetivos individuais da equipe.' },
    { key: 'groupStock' as const, icon: <CarFront size={19}/>, eyebrow: 'Comercial', title: 'Estoque Compartilhado', text: 'Base de consulta do grupo para localizar veículos e preencher custo e aging na calculadora.' },
    { key: 'executive' as const, icon: <Landmark size={19}/>, eyebrow: 'Grupo', title: 'Visão Executiva', text: 'Panorama consolidado das unidades. Substitui o antigo Grupo + Diretoria.' },
    { key: 'security' as const, icon: <ShieldCheck size={19}/>, eyebrow: 'Avançado', title: 'Segurança & Migração', text: 'Ferramentas técnicas de tenant e preparação de dados antigos.' },
  ];

  return <>
    <style>{`
      body.motyq-graphite button[title="Diretoria · Panorama do Grupo"],
      body.motyq-graphite button.fixed.bottom-56.left-5,
      body.motyq-graphite button.fixed.bottom-32.left-5,
      body.motyq-graphite button.fixed.bottom-20.left-5,
      body.motyq-graphite button.fixed.bottom-44.right-5 {
        display: none !important;
      }
    `}</style>

    <button
      onClick={() => setOpen(true)}
      title="Administração Motyq"
      className="fixed bottom-4 left-4 z-[156] flex items-center gap-3 rounded-2xl border border-violet-300/20 bg-[#17151d]/95 px-4 py-3 text-left text-white shadow-2xl shadow-black/45 backdrop-blur-xl transition hover:border-violet-300/40 hover:bg-[#1d1924] active:scale-[.98]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/15 bg-violet-300/[.07] text-violet-300"><Settings2 size={20}/></span>
      <span className="hidden sm:block"><span className="block text-[9px] font-black uppercase tracking-[.17em] text-violet-300">ADMINISTRAÇÃO</span><span className="mt-0.5 block text-sm font-semibold">Central SaaS</span></span>
    </button>

    {open && <div className="fixed inset-0 z-[565] h-[100dvh] overflow-hidden bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <aside className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-[470px] flex-col overflow-hidden border-r border-white/10 bg-[#121117] text-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="shrink-0 flex items-start justify-between border-b border-white/10 p-5 sm:p-6">
          <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-300">ADMINISTRAÇÃO MOTYQ</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Estrutura sem botões espalhados.</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Tudo que configura empresa, lojas, pessoas e segurança fica aqui.</p></div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-zinc-400"><X size={18}/></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-5">
          <div className="space-y-2.5">{cards.map(card => <button key={card.key} onClick={() => launch(card.key)} className="w-full rounded-[22px] border border-white/10 bg-white/[.035] p-4 text-left transition hover:border-violet-300/25 hover:bg-violet-300/[.04]"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.055] text-zinc-300">{card.icon}</div><div><p className="text-[9px] font-black uppercase tracking-[.14em] text-violet-300">{card.eyebrow}</p><p className="mt-1 font-semibold text-white">{card.title}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{card.text}</p></div></div></button>)}</div>
          {feedback && <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[.05] px-4 py-3 text-xs text-amber-200">{feedback}</div>}
        </div>
      </aside>
    </div>}
  </>;
};

export default AdministrationHub;
