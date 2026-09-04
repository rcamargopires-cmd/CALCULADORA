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

const MarketIQLookupBridge:React.FC=()=>{
  const[user,setUser]=useState<User|null>(null);
  const[snapshot,setSnapshot]=useState<GroupStockSnapshot|null>(null);
  const[notice,setNotice]=useState<Notice>(null);
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

  useEffect(()=>{
    const onInput=(event:Event)=>{
      const target=event.target as HTMLInputElement|null;
      if(!target||target!==field('Placa'))return;
      const plate=cleanPlate(target.value);
      if(plate.length!==7){lastPlate.current='';setNotice(null);return;}
      if(plate===lastPlate.current)return;
      lastPlate.current=plate;
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
        setNotice({kind:'ok',text:`Placa identificada${suffix}. FIPE preenchida automaticamente.`});
      }).catch(()=>{
        if(currentRequest!==requestId.current)return;
        if(!stockItem)setNotice({kind:'warn',text:'Placa fora do estoque compartilhado. Consulta externa ainda não está habilitada.'});
      });

      if(!stockItem){
        window.setTimeout(()=>{
          if(currentRequest===requestId.current&&lastPlate.current===plate)setNotice(prev=>prev?.kind==='loading'?{kind:'warn',text:'Placa fora do estoque compartilhado. Consulta externa ainda não está habilitada.'}:prev);
        },1800);
      }
    };
    document.addEventListener('input',onInput,true);
    return()=>document.removeEventListener('input',onInput,true);
  },[snapshot]);

  if(!notice||!marketRoot())return null;
  return <div className={`fixed right-5 top-24 z-[615] max-w-sm rounded-2xl border px-4 py-3 text-xs shadow-2xl backdrop-blur-xl ${notice.kind==='ok'?'border-emerald-300/25 bg-emerald-950/90 text-emerald-100':notice.kind==='warn'?'border-amber-300/25 bg-amber-950/90 text-amber-100':'border-cyan-300/20 bg-cyan-950/90 text-cyan-100'}`}>{notice.text}</div>;
};

export default MarketIQLookupBridge;
