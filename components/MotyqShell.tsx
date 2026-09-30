import React, { useEffect } from 'react';
import {
  Archive, BellRing, BarChart3, Building2, Calculator, CarFront, CheckCircle2, Gauge, KeyRound, LayoutDashboard, Store,
  ListTodo, LogOut, MessageSquareText, RefreshCw, Save, Search, Sparkles, UsersRound,
  ClipboardCheck, Coins,
} from 'lucide-react';
import type { User } from '../types';
import { companyScopeService } from '../services/companyScopeService';

type View='dashboard'|'calculator';
type Props={
  user:User;
  activeView:View;
  children:React.ReactNode;
  onDashboard:()=>void;
  onCalculator:()=>void;
  onLogout:()=>void;
  onAdmin:()=>void;
  onReset:()=>void;
  onSaveOpen:()=>void;
  onSaveClosed:()=>void;
  onAnalyze:()=>void;
  isAnalyzing:boolean;
  commissionsEnabled:boolean;
  onCommissions:()=>void;
};

const launcher=(title:string)=>{
  const button=document.querySelector(`button[title="${title}"]`) as HTMLButtonElement|null;
  button?.click();
};
const launcherStarts=(title:string)=>{
  const button=document.querySelector(`button[title^="${title}"]`) as HTMLButtonElement|null;
  button?.click();
};
const launcherText=(text:string)=>{
  const normalized=text.toLowerCase();
  const button=Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find(item=>!item.closest('.mq-sidebar') && String(item.textContent||'').replace(/\s+/g,' ').trim().toLowerCase().includes(normalized));
  button?.click();
};

const integratedSellerLauncher=(button:HTMLButtonElement)=>{
  const title=String(button.getAttribute('title')||'');
  const text=String(button.textContent||'').replace(/\s+/g,' ').trim();
  return title==='Minha Agenda Motyq'
    || title==='Histórico de Fechamentos'
    || title==='AssetGuard'
    || text.includes('Smart Alerts')
    || text==='TradeCheck';
};

const roleLabel=(role:string)=>role==='admin'?'Administrador':role==='manager'?'Gestor':role==='seller'||role==='user'?'Vendedor':role;

const MotyqShell:React.FC<Props>=({
  user,activeView,children,onDashboard,onCalculator,onLogout,onAdmin,onReset,onSaveOpen,onSaveClosed,
  onAnalyze,isAnalyzing,commissionsEnabled,onCommissions,
})=>{
  const role=String(user.role||'');
  const seller=role==='seller'||role==='user';
  const manager=role==='manager'||role==='admin';
  const crm=()=>window.dispatchEvent(new CustomEvent('motyq:open-crm',{detail:{}}));

  useEffect(()=>{
    if(!seller)return;
    const sync=()=>{
      document.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{
        if(button.closest('.mq-sidebar')) return;
        if(integratedSellerLauncher(button)) button.setAttribute('data-motyq-sidebar-integrated','true');
      });
    };
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{
      observer.disconnect();
      document.querySelectorAll<HTMLButtonElement>('[data-motyq-sidebar-integrated="true"]')
        .forEach(button=>button.removeAttribute('data-motyq-sidebar-integrated'));
    };
  },[seller]);

  return <div className="mq-shell">
    <aside className="mq-sidebar">
      <div className="mq-sidebar-brand"><img src="/motyq-brand.svg" alt="MOTYQ"/></div>
      <nav className="mq-sidebar-nav">
        {role==='admin'&&<button className="mq-nav-item" onClick={()=>launcher('Unidades da empresa')}><Store size={18}/><span>Unidades</span></button>}
        {role==='admin'&&<button className="mq-nav-item" onClick={()=>companyScopeService.enterAdminHome()}><Building2 size={18}/><span>Central Master</span></button>}
        <button className={'mq-nav-item '+(activeView==='dashboard'?'is-active':'')} onClick={onDashboard}>
          <LayoutDashboard size={18}/><span>{seller?'Meu dia':'Visão geral'}</span>
        </button>
        {seller&&<button className="mq-nav-item" onClick={crm}><MessageSquareText size={18}/><span>CRM</span></button>}
        <button className={'mq-nav-item '+(activeView==='calculator'?'is-active':'')} onClick={onCalculator}>
          <Calculator size={18}/><span>Negociação</span>
        </button>
        {seller&&<>
          <div className="mq-nav-section">Operação</div>
          <button className="mq-nav-item" onClick={()=>launcher('Minha Agenda Motyq')}><ListTodo size={18}/><span>Ações do dia</span></button>
          <button className="mq-nav-item" onClick={()=>launcher('Histórico de Fechamentos')}><Archive size={18}/><span>Resultados</span></button>
          <button className="mq-nav-item" onClick={()=>launcherText('TradeCheck')}><Search size={18}/><span>TradeCheck</span></button>
          <button className="mq-nav-item" onClick={()=>launcherText('Smart Alerts')}><BellRing size={18}/><span>Alertas</span></button>
          <button className="mq-nav-item" onClick={()=>launcher('AssetGuard')}><KeyRound size={18}/><span>AssetGuard</span></button>
        </>}
        {manager&&<button className="mq-nav-item" onClick={()=>launcher('Avaliações Motyq')}><ClipboardCheck size={18}/><span>Avaliações</span></button>}
        {manager&&<button className="mq-nav-item" onClick={()=>launcher('Estoque Motyq')}><CarFront size={18}/><span>Estoque</span></button>}
        {manager&&<button className="mq-nav-item" onClick={()=>launcherStarts('MarketIQ')}><Gauge size={18}/><span>MarketIQ</span></button>}
        {manager&&<button className="mq-nav-item" onClick={()=>launcher('Operação Motyq')}><UsersRound size={18}/><span>Gestão</span></button>}
        {manager&&<button className="mq-nav-item" onClick={()=>launcher('Operação Motyq')}><BarChart3 size={18}/><span>Relatórios</span></button>}

      </nav>
      <div className="mq-sidebar-foot"><span>MOTYQ Intelligence</span><strong>Veja. Decida. Aja.</strong></div>
    </aside>

    <section className="mq-main">
      <header className="mq-topbar">
        <div className="mq-mobile-brand"><img src="/motyq-brand.svg" alt="MOTYQ"/></div>
        <div id="motyq-environment-header-slot" className="mq-environment-slot"/>
        <div className="mq-topbar-spacer"/>
        {manager&&<button className="mq-top-icon" title="Avaliações" onClick={()=>launcher('Avaliações Motyq')}><BellRing size={18}/></button>}
        <div className="mq-user">
          <span className={'mq-avatar '+(role==='admin'?'is-admin':'')}>{String(user.name||'U').charAt(0).toUpperCase()}</span>
          <span className="mq-user-copy"><strong>{user.name}</strong><small>{roleLabel(role)}</small></span>
        </div>
        <button className="mq-top-icon" title="Sair" onClick={onLogout}><LogOut size={17}/></button>
      </header>

      <div className="mq-contextbar">
        <div>
          <span className="mq-context-eyebrow">{activeView==='dashboard'?'CENTRAL OPERACIONAL':'NEGOCIAÇÃO'}</span>
          <h1>{activeView==='dashboard'?(seller?'Meu dia':'Visão geral'):'Nova negociação'}</h1>
        </div>
        <div className="mq-context-actions">
          {activeView==='calculator'&&<>
            {commissionsEnabled&&manager&&<button className="mq-action secondary" onClick={onCommissions}><Coins size={16}/> Comissões</button>}
            <button className="mq-action secondary" onClick={onReset}><RefreshCw size={16}/> Limpar</button>
            <button className="mq-action secondary" onClick={onSaveOpen}><Save size={16}/> Salvar</button>
            <button className="mq-action success" onClick={onSaveClosed}><CheckCircle2 size={16}/> Fechar venda</button>
            <button className="mq-action ai" onClick={onAnalyze} disabled={isAnalyzing}><Sparkles size={16}/> {isAnalyzing?'Analisando...':'Análise IA'}</button>
          </>}
        </div>
      </div>

      <main className={'mq-workspace '+(activeView==='dashboard'?'is-dashboard':'is-calculator')}>{children}</main>
    </section>

    <nav className="mq-mobile-nav">
      <button className={activeView==='dashboard'?'is-active':''} onClick={onDashboard}><LayoutDashboard size={19}/><span>Hoje</span></button>
      {seller&&<button onClick={crm}><MessageSquareText size={19}/><span>CRM</span></button>}
      <button className={activeView==='calculator'?'is-active':''} onClick={onCalculator}><Calculator size={19}/><span>Negócio</span></button>
      {manager&&<button onClick={()=>launcherStarts('MarketIQ')}><Gauge size={19}/><span>MarketIQ</span></button>}
      {role==='admin'
        ? <button onClick={()=>companyScopeService.enterAdminHome()}><Building2 size={19}/><span>Master</span></button>
        : manager&&<button onClick={()=>launcher('Operação Motyq')}><UsersRound size={19}/><span>Mais</span></button>}
    </nav>
  </div>;
};
export default MotyqShell;
