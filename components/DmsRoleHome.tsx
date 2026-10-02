import React from 'react';
import { Banknote, LogOut, Wrench } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import type { User } from '../types';
import { dmsAccessLabel, dmsPermissions } from '../services/dmsPermissions';

const clickLauncher=(title:string)=>{
  const button=document.querySelector(`button[title="${title}"]`) as HTMLButtonElement|null;
  button?.click();
};

const DmsRoleHome:React.FC<{user:User}>=({user})=>{
  const permissions=dmsPermissions(user);
  return <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-600">MOTYQ · DMS</p>
          <h1 className="mt-1 text-xl font-semibold">{dmsAccessLabel(user)}</h1>
        </div>
        <nav className="flex items-center gap-1"/>
        <button onClick={()=>signOut(auth)} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"><LogOut size={15}/> Sair</button>
      </div>
    </header>

    <main className="mx-auto max-w-6xl p-5 md:p-8">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6 md:p-8">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-600">ÁREA OPERACIONAL</p>
          <h2 className="mt-2 text-3xl font-semibold">Olá, {user.name?.split(' ')[0]||'usuário'}.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Seu acesso foi separado por responsabilidade. Você enxerga e altera somente o fluxo necessário para sua função.</p>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2 md:p-8">
          {permissions.prepView&&<button onClick={()=>clickLauncher('PrepTrack · preparação')} className="group rounded-3xl border border-amber-200 bg-amber-50/60 p-6 text-left transition hover:border-amber-300 hover:bg-amber-50">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Wrench size={22}/></div>
            <h3 className="mt-5 text-xl font-semibold">PrepTrack</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{permissions.prepApprove?'Acompanhe serviços e aprove solicitações de preparação.':'Lance serviços, prestadores, orçamento e prazo. A aprovação segue para o gestor.'}</p>
            <p className="mt-4 text-xs font-bold text-amber-700">ABRIR PREPARAÇÃO →</p>
          </button>}

          {permissions.financeView&&<button onClick={()=>clickLauncher('Financeiro Motyq')} className="group rounded-3xl border border-sky-200 bg-sky-50/60 p-6 text-left transition hover:border-sky-300 hover:bg-sky-50">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-100 text-sky-700"><Banknote size={22}/></div>
            <h3 className="mt-5 text-xl font-semibold">Financeiro</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{permissions.financeSettle?'Contas a pagar, contas a receber, baixas e fluxo de caixa.':'Visão financeira para acompanhamento gerencial.'}</p>
            <p className="mt-4 text-xs font-bold text-sky-700">ABRIR FINANCEIRO →</p>
          </button>}
        </div>
      </section>
    </main>
  </div>;
};

export default DmsRoleHome;
