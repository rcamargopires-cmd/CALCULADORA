import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { companyScopeService, COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { groupStockService, GroupStockItem, GroupStockSnapshot } from '../services/groupStockService';
import { marketIqFipeResolver } from '../services/marketIqFipeResolver';

const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const moneyInput=(value:number)=>value?value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
const marketRoot=()=>Array.from(document.querySelectorAll('div.fixed.inset-0')).find(el=>String(el.textContent||'').includes('MOTYQ MARKETIQ')) as HTMLElement|undefined;
const field=(label:string)=>{
  const root=marketRoot(); if(!root)return null;
  const wanted=label.toLowerCase();
  const labels=Array.from(root.querySelectorAll('label'));
  const found=labels.find(el=>String(el.textContent||'').toLowerCase().includes(wanted));
  return found?.querySelector('input') as HTMLInputElement|null;
};
const setInput=(input:HTMLInputElement|null,value:string)=>{
  if(!input)return;
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  setter?.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
};
const fill=(data:{model?:string;year?:string;km?:number;fipe?:number})=>{
  if(data.model)setInput(field('Modelo / versão'),data.model);
  if(data.year)setInput(field('Ano/modelo'),String(data.year));
  if(data.km)setInput(field('KM atual'),String(data.km));
  if(data.fipe)setInput(field('FIPE'),moneyInput(data.fipe));
};

type Notice={kind:'ok'|'warn'|'loading';text:string}|null;
type ExternalVehicle={plate:string;brand:string;model:string;year:string;fuel:string};

const MarketIQLookupBridge:React.FC=()=>{
  const[user,setUser]=useState<User|null>(null);
  const[snapshot,setSnapshot]=useState<GroupStockSnapshot|null>(null);
  const[notice,setNotice]=useState<Notice>(null);
  const[external,setExternal]=useState<ExternalVehicle|null>(null);
  const[resolvingExternal,setResolvingExternal]=useState(false);
  const lastPlate=useRef('');
  const requestId=useRef(0);

  useEffect(()=>onAuthStateChanged(auth,async firebaseUser=>{
    if(!firebaseUser?.email){setUser(null);return;}
    try{const profile=await userService.getUser(firebaseUser.email);setUser(profile?.status==='active'?profile:null);}catch{setUser(null);}
  }),[]);

  useEffect(()=>{
    if(!user)return;
    let unsub=()=>{};
    const subscribe=()=>{
      unsub();
      const companyId=companyScopeService.get(user);
      unsub=groupStockService.subscribe(companyId,setSnapshot,()=>setSnapshot(null));
    };
    subscribe();
    window.addEventListener(COMPANY_SCOPE_EVENT,subscribe);
    return()=>{unsub();window.removeEventListener(COMPANY_SCOPE_EVENT,subscribe);};
  },[user]);

  const showExternal=(plate:string)=>{
    const currentModel=field('Modelo / versão')?.value||'';
    const currentYear=field('Ano/modelo')?.value||'';
    setExternal({plate,brand:'',model:currentModel,year:currentYear,fuel:''});
    setNotice({kind:'warn',text:'Veículo fora do estoque do grupo. Complete os dados abaixo para eu localizar a FIPE.'});
  };

  const resolveExternal=async()=>{
    if(!external)return;
    const brand=external.brand.trim(), model=external.model.trim(), year=external.year.trim();
    if(!brand||!model||!year){
      setNotice({kind:'warn',text:'Informe marca, modelo/versão e ano/modelo para buscar a FIPE.'});
      return;
    }
    setResolvingExternal(true);
    setNotice({kind:'loading',text:`Localizando a FIPE do ${model}...`});
    try{
      const result=await marketIqFipeResolver.resolve({brand,model,year,fuel:external.fuel});
      if(result?.value){
        fill({model:result.model||model,year:String(result.year||year),fipe:result.value});
        setNotice({kind:'ok',text:`FIPE ${result.referenceMonth||'atual'} localizada e preenchida automaticamente.`});
        setExternal(null);
      }else{
        setNotice({kind:'warn',text:'Não consegui confirmar essa versão na FIPE. Confira marca, versão e ano/modelo.'});
      }
    }catch{
      setNotice({kind:'warn',text:'Não foi possível consultar a FIPE agora. Tente novamente em instantes.'});
    }finally{
      setResolvingExternal(false);
    }
  };

  useEffect(()=>{
    const onInput=(event:Event)=>{
      const target=event.target as HTMLInputElement|null;
      if(!target||target!==field('Placa'))return;
      const plate=cleanPlate(target.value);
      if(plate.length!==7){lastPlate.current='';setNotice(null);setExternal(null);return;}
      if(plate===lastPlate.current)return;
      lastPlate.current=plate;
      setExternal(null);
      const currentRequest=++requestId.current;
      setNotice({kind:'loading',text:`Consultando ${plate}...`});

      const stockItem:GroupStockItem|undefined=snapshot?.items.find(item=>cleanPlate(item.plate)===plate);
      if(stockItem){
        fill({model:stockItem.model,year:stockItem.year,km:stockItem.km});
        setNotice({kind:'loading',text:`${stockItem.model} localizado. Buscando FIPE...`});
        void marketIqFipeResolver.resolve({brand:stockItem.brand,model:stockItem.model,year:stockItem.year,fuel:stockItem.fuel}).then(result=>{
          if(currentRequest!==requestId.current)return;
          if(result?.value){
            fill({model:stockItem.model||result.model,year:stockItem.year||String(result.year),km:stockItem.km,fipe:result.value});
            setNotice({kind:'ok',text:`FIPE ${result.referenceMonth||'atual'} preenchida automaticamente.`});
          }else setNotice({kind:'warn',text:'Veículo localizado, mas a versão FIPE precisa ser confirmada.'});
        });
      }

      void fetch('/api/marketiq-plate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plate})}).then(async response=>{
        if(currentRequest!==requestId.current)return null;
        if(response.status===503)return null;
        if(!response.ok)throw new Error('lookup_failed');
        return response.json();
      }).then(data=>{
        if(!data||currentRequest!==requestId.current)return;
        fill({model:data.model||data.registryModel,year:data.year,fipe:Number(data.fipeValue)||0});
        const suffix=data.referenceMonth?` · ${data.referenceMonth}`:'';
        setExternal(null);
        setNotice({kind:'ok',text:`Placa identificada${suffix}. FIPE preenchida automaticamente.`});
      }).catch(()=>{
        if(currentRequest!==requestId.current)return;
        if(!stockItem)showExternal(plate);
      });

      if(!stockItem){
        window.setTimeout(()=>{
          if(currentRequest===requestId.current&&lastPlate.current===plate){
            setNotice(prev=>{
              if(prev?.kind==='loading')showExternal(plate);
              return prev;
            });
          }
        },1800);
      }
    };
    document.addEventListener('input',onInput,true);
    return()=>document.removeEventListener('input',onInput,true);
  },[snapshot]);

  if((!notice&&!external)||!marketRoot())return null;
  return <div className="fixed right-5 top-24 z-[615] w-[min(92vw,390px)] space-y-3">
    {notice&&<div className={`rounded-2xl border px-4 py-3 text-xs shadow-2xl backdrop-blur-xl ${notice.kind==='ok'?'border-emerald-300/25 bg-emerald-950/90 text-emerald-100':notice.kind==='warn'?'border-amber-300/25 bg-amber-950/90 text-amber-100':'border-cyan-300/20 bg-cyan-950/90 text-cyan-100'}`}>{notice.text}</div>}
    {external&&<div className="rounded-2xl border border-white/10 bg-[#11191b]/95 p-4 text-white shadow-2xl backdrop-blur-xl">
      <div className="mb-3"><p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-300">VEÍCULO FORA DO ESTOQUE</p><p className="mt-1 text-sm font-semibold">{external.plate} · identificar FIPE</p><p className="mt-1 text-[11px] leading-4 text-zinc-500">Informe apenas o necessário. O MarketIQ cruza a versão na base FIPE pública e preenche o valor automaticamente.</p></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-[9px] uppercase text-zinc-500">Marca</span><input value={external.brand} onChange={e=>setExternal(v=>v?{...v,brand:e.target.value}:v)} placeholder="Ex.: Volkswagen" className="h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 text-xs outline-none focus:border-cyan-300/40"/></label>
        <label className="block"><span className="mb-1 block text-[9px] uppercase text-zinc-500">Ano/modelo</span><input value={external.year} onChange={e=>setExternal(v=>v?{...v,year:e.target.value}:v)} placeholder="Ex.: 2024" className="h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 text-xs outline-none focus:border-cyan-300/40"/></label>
        <label className="block sm:col-span-2"><span className="mb-1 block text-[9px] uppercase text-zinc-500">Modelo / versão</span><input value={external.model} onChange={e=>setExternal(v=>v?{...v,model:e.target.value}:v)} placeholder="Ex.: T-Cross Comfortline 1.0 TSI" className="h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 text-xs outline-none focus:border-cyan-300/40"/></label>
        <label className="block sm:col-span-2"><span className="mb-1 block text-[9px] uppercase text-zinc-500">Combustível (opcional)</span><input value={external.fuel} onChange={e=>setExternal(v=>v?{...v,fuel:e.target.value}:v)} placeholder="Flex, gasolina, diesel, híbrido..." className="h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 text-xs outline-none focus:border-cyan-300/40"/></label>
      </div>
      <button onClick={()=>void resolveExternal()} disabled={resolvingExternal} className="mt-3 h-10 w-full rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] text-xs font-black uppercase tracking-[.12em] text-cyan-200 transition hover:bg-cyan-300/[.13] disabled:opacity-50">{resolvingExternal?'BUSCANDO FIPE...':'LOCALIZAR FIPE'}</button>
    </div>}
  </div>;
};

export default MarketIQLookupBridge;
