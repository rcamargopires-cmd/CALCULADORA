import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, CircleDollarSign, ListTodo, Wrench } from 'lucide-react';
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
    </>, target)}
  </>;
};

export default ManagerTopNav;
