import React, { useEffect, useState } from 'react';
import { ChevronUp, ClipboardCheck, ListTodo, Search, X } from 'lucide-react';

type Shortcut = {key:string;label:string; icon:React.ReactNode};
const shortcuts:Shortcut[]=[
  {key:'evaluation',label:'Solicitar avaliação',icon:<ClipboardCheck size={17}/>},
  {key:'agenda',label:'Minha Agenda',icon:<ListTodo size={17}/>},
  {key:'tradecheck',label:'TradeCheck',icon:<Search size={17}/>},
  {key:'results',label:'Resultados',icon:<ListTodo size={17}/>},
];

const findLauncher=(key:string):HTMLButtonElement|null=>{
  if(key==='evaluation') return document.querySelector('button[title="Solicitar avaliação"]');
  if(key==='agenda') return document.querySelector('button[title="Minha Agenda Motyq"]');
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  if(key==='tradecheck') return buttons.find(button=>button.classList.contains('fixed') && button.textContent?.trim()==='TradeCheck')||null;
  if(key==='results') return buttons.find(button=>button.classList.contains('fixed') && button.textContent?.trim()==='Resultados')||null;
  return null;
};

const MobileSellerQuickActions:React.FC=()=>{
  const [open,setOpen]=useState(false);
  const [available,setAvailable]=useState<string[]>([]);
  useEffect(()=>{
    let queued=false;
    const sync=()=>{
      if(queued)return;
      queued=true;
      window.requestAnimationFrame(()=>{
        queued=false;
        const found:string[]=[];
        shortcuts.forEach(item=>{
          const target=findLauncher(item.key);
          if(target){
            target.setAttribute('data-motyq-mobile-docked','true');
            found.push(item.key);
          }
        });
        setAvailable(old=>old.join('|')===found.join('|')?old:found);
      });
    };
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);
  const launch=(key:string)=>{
    setOpen(false);
    findLauncher(key)?.click();
  };
  if(!available.length)return null;
  return <div className="motyq-mobile-actions">
    {open&&<div className="mb-2 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
      <div className="flex items-center justify-between px-2 py-2 text-xs font-bold text-slate-700">
        Acesso rápido <button type="button" onClick={()=>setOpen(false)} aria-label="Fechar ações"><X size={16}/></button>
      </div>
      {shortcuts.filter(item=>available.includes(item.key)).map(item=><button key={item.key} type="button"
        onClick={()=>launch(item.key)} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100">
        {item.icon}{item.label}
      </button>)}
    </div>}
    <button type="button" aria-expanded={open} aria-label="Ações rápidas"
      onClick={()=>setOpen(value=>!value)}
      className="ml-auto flex min-h-12 items-center gap-2 rounded-full border border-emerald-200 bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-xl">
      {open?<X size={17}/>:<ChevronUp size={17}/>} AÇÕES
    </button>
  </div>;
};
export default MobileSellerQuickActions;
