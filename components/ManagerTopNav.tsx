import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, CarFront, CircleDollarSign, ClipboardCheck, FileClock, ListTodo, ShieldCheck, ShoppingCart, UsersRound, Wrench } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { dmsPermissions } from '../services/dmsPermissions';

const launcherClick = (title: string) => {
  const launcher = document.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
  launcher?.click();
};

const findMainNav = () => document.querySelector('#root > div header nav') as HTMLElement | null;

const ManagerTopNav: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) {
      setUser(null);
      setTarget(null);
      return;
    }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      setUser(profile?.status === 'active' ? profile : null);
      window.setTimeout(() => setTarget(findMainNav()), 0);
    } catch {
      setUser(null);
      setTarget(null);
    }
  }), []);

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => setTarget(findMainNav()), 30);
    return () => window.clearTimeout(id);
  }, [user]);

  const permissions = dmsPermissions(user);
  const isManager = permissions.management;

  return <>
    <style>{`
      body.motyq-graphite button[title="Centro de Ação Motyq"],
      body.motyq-graphite button[title="Impacto Motyq"] {
        display: none !important;
      }

      body.motyq-graphite header button[class*="border-amber-500/30"][class*="text-amber-400"] {
        display: none !important;
      }

      @media (max-width: 900px) {
        .motyq-manager-nav-label { display: none; }
      }
    `}</style>

    {target && createPortal(<>
      {isManager&&<button
        type="button"
        title="Gestão Hoje"
        onClick={() => launcherClick('Centro de Ação Motyq')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-sky-300 transition-all hover:bg-sky-400/10 hover:text-sky-200"
      >
        <ListTodo size={14}/>
        <span className="motyq-manager-nav-label">GESTÃO HOJE</span>
      </button>}
      {isManager&&<button
        type="button"
        title="Impacto Motyq"
        onClick={() => launcherClick('Impacto Motyq')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-400/10 hover:text-emerald-200"
      >
        <CircleDollarSign size={14}/>
        <span className="motyq-manager-nav-label">IMPACTO</span>
      </button>}
      {isManager&&<button
        type="button"
        title="Compras"
        onClick={() => launcherClick('Compras de veículos')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-400/10 hover:text-emerald-200"
      >
        <CarFront size={14}/>
        <span className="motyq-manager-nav-label">COMPRAS</span>
      </button>}
      {isManager&&<button
        type="button"
        title="Vendas"
        onClick={() => launcherClick('Pedidos de venda')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-violet-300 transition-all hover:bg-violet-400/10 hover:text-violet-200"
      >
        <ShoppingCart size={14}/>
        <span className="motyq-manager-nav-label">VENDAS</span>
      </button>}
      {isManager&&<button
        type="button"
        title="Cadastros"
        onClick={() => launcherClick('Cadastros mestres')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-cyan-300 transition-all hover:bg-cyan-400/10 hover:text-cyan-200"
      >
        <UsersRound size={14}/>
        <span className="motyq-manager-nav-label">CADASTROS</span>
      </button>}
      {isManager&&<button
        type="button"
        title="Dossiê"
        onClick={() => launcherClick('Dossiê do veículo')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-indigo-300 transition-all hover:bg-indigo-400/10 hover:text-indigo-200"
      >
        <FileClock size={14}/>
        <span className="motyq-manager-nav-label">DOSSIÊ</span>
      </button>}
      {permissions.prepView&&<button
        type="button"
        title="Preparação"
        onClick={() => launcherClick('PrepTrack · preparação')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-amber-300 transition-all hover:bg-amber-400/10 hover:text-amber-200"
      >
        <Wrench size={14}/>
        <span className="motyq-manager-nav-label">PREPARAÇÃO</span>
      </button>}
      {permissions.financeView&&<button
        type="button"
        title="Financeiro"
        onClick={() => launcherClick('Financeiro Motyq')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-sky-300 transition-all hover:bg-sky-400/10 hover:text-sky-200"
      >
        <Banknote size={14}/>
        <span className="motyq-manager-nav-label">FINANCEIRO</span>
      </button>}
      {permissions.diagnostics&&<button
        type="button"
        title="Diagnóstico DMS"
        onClick={() => launcherClick('Diagnóstico DMS')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-violet-300 transition-all hover:bg-violet-400/10 hover:text-violet-200"
      >
        <ShieldCheck size={14}/>
        <span className="motyq-manager-nav-label">DMS</span>
      </button>}
      {permissions.diagnostics&&<button
        type="button"
        title="Roadmap DMS"
        onClick={() => launcherClick('Roadmap DMS')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-fuchsia-300 transition-all hover:bg-fuchsia-400/10 hover:text-fuchsia-200"
      >
        <ClipboardCheck size={14}/>
        <span className="motyq-manager-nav-label">PLANO</span>
      </button>}
      {isManager&&<button
        type="button"
        title="Documentação"
        onClick={() => launcherClick('Documentos do veículo')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-violet-300 transition-all hover:bg-violet-400/10 hover:text-violet-200"
      >
        <FileCheck2 size={14}/>
        <span className="motyq-manager-nav-label">DOCUMENTOS</span>
      </button>}
      {isManager&&<button
        type="button"
        title="Pós-venda"
        onClick={() => launcherClick('Pós-venda e garantia')}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-pink-300 transition-all hover:bg-pink-400/10 hover:text-pink-200"
      >
        <HeartHandshake size={14}/>
        <span className="motyq-manager-nav-label">PÓS-VENDA</span>
      </button>}
    </>, target)}
  </>;
};

export default ManagerTopNav;
