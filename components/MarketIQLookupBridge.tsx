import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { companyScopeService, COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { groupStockService, GroupStockItem, GroupStockSnapshot } from '../services/groupStockService';

const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const cleanRenavam=(value:string)=>String(value||'').replace(/\D/g,'').slice(0,11);
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

const lookupFipe=async(input:{brand:string;model:string;year:string;fuel?:string})=>{
  const params=new URLSearchParams({brand:input.brand,model:input.model,year:input.year});
  if(input.fuel)params.set('fuel',input.fuel);
  params.set('_ts',String(Date.now()));
  const response=await fetch(`/api/marketiq-fipe?${params.toString()}`,{method:'GET',cache:'no-store'});
  if(!response.ok)return null;
  return response.json();
};

type Notice={kind:'ok'|'warn'|'loading';text:string}|null;
type ExternalVehicle={plate:string;renavam:string};

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
    setExternal({plate,renavam:''});
    setNotice({kind:'warn',text:'Veículo fora do estoque do grupo. Informe o RENAVAM para identificar o veículo automaticamente.'});
  };

  const resolveExternal=async()=>{
    if(!external)return;
    const renavam=cleanRenavam(external.renavam);
    if(renavam.length<9){
      setNotice({kind:'warn',text:'Informe um RENAVAM válido para consultar o veículo.'});
      return;
    }
    setResolvingExternal(true);
    setNotice({kind:'loading',text:`Identificando ${external.plate} pela placa + RENAVAM...`});
    try{
      const response=await fetch('/api/marketiq-identify',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({plate:external.plate,renavam}),
      });
      const data=await response.json().catch(()=>null);
      if(response.ok&&data){
        fill({model:data.model||data.registryModel,year:String(data.year||''),fipe:Number(data.fipeValue)||0});
        setNotice({kind:'ok',text:`${data.model||data.registryModel||'Veículo'} identificado. FIPE ${data.referenceMonth||'atual'} preenchida automaticamente.`});
        setExternal(null);
      }else if(response.status===503){
        setNotice({kind:'warn',text:'A identificação por placa + RENAVAM está pronta no Motyq, mas a fonte veicular externa ainda precisa ser habilitada.'});
      }else{
        setNotice({kind:'warn',text:'Não consegui identificar esse veículo com placa + RENAVAM. Confira os números informados.'});
      }
    }catch{
      setNotice({kind:'warn',text:'Não foi possível consultar o veículo agora. Tente novamente em instantes.'});
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
        void lookupFipe({brand:stockItem.brand,model:stockItem.model,year:stockItem.year,fuel:stockItem.fuel}).then(result=>{
          if(currentRequest!==requestId.current)return;
          if(result?.value){
            fill({model:stockItem.model||result.model,year:stockItem.year||String(result.year),km:stockItem.km,fipe:Number(result.value)||0});
            setNotice({kind:'ok',text:`FIPE ${result.referenceMonth||'atual'} preenchida automaticamente.`});
          }else setNotice({kind:'warn',text:'Veículo localizado, mas a versão FIPE precisa ser confirmada.'});
        });
        return;
      }

      showExternal(plate);
    };
    document.addEventListener('input',onInput,true);
    return()=>document.removeEventListener('input',onInput,true);
  },[snapshot]);

  if((!notice&&!external)||!marketRoot())return null;
  return <div className="fixed right-5 top-24 z-[615] w-[min(92vw,390px)] space-y-3">
    {notice&&<div className={`rounded-2xl border px-4 py-3 text-xs shadow-2xl backdrop-blur-xl ${notice.kind==='ok'?'border-emerald-300/25 bg-emerald-950/90 text-emerald-100':notice.kind==='warn'?'border-amber-300/25 bg-amber-950/90 text-amber-100':'border-cyan-300/20 bg-cyan-950/90 text-cyan-100'}`}>{notice.text}</div>}
    {external&&<div className="rounded-2xl border border-white/10 bg-[#11191b]/95 p-4 text-white shadow-2xl backdrop-blur-xl">
      <div className="mb-3"><p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-300">VEÍCULO FORA DO ESTOQUE</p><p className="mt-1 text-sm font-semibold">{external.plate} · identificar veículo</p><p className="mt-1 text-[11px] leading-4 text-zinc-500">Informe somente o RENAVAM. Marca, modelo, versão, ano, combustível e FIPE serão preenchidos pelo Motyq.</p></div>
      <label className="block"><span className="mb-1 block text-[9px] uppercase text-zinc-500">RENAVAM</span><input value={external.renavam} onChange={e=>setExternal(v=>v?{...v,renavam:cleanRenavam(e.target.value)}:v)} inputMode="numeric" placeholder="Digite o RENAVAM" className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm tracking-[.08em] outline-none focus:border-cyan-300/40"/></label>
      <button onClick={()=>void resolveExternal()} disabled={resolvingExternal} className="mt-3 h-10 w-full rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] text-xs font-black uppercase tracking-[.12em] text-cyan-200 transition hover:bg-cyan-300/[.13] disabled:opacity-50">{resolvingExternal?'CONSULTANDO VEÍCULO...':'CONSULTAR VEÍCULO'}</button>
    </div>}
  </div>;
};

export default MarketIQLookupBridge;
