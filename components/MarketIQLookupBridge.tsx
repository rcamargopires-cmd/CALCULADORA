import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { companyScopeService, COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { groupStockService, GroupStockItem, GroupStockSnapshot } from '../services/groupStockService';

const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const moneyInput=(value:number)=>value?value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
const marketRoot=()=>Array.from(document.querySelectorAll('div.fixed.inset-0')).find(el=>String(el.textContent||'').includes('MOTYQ MARKETIQ')) as HTMLElement|undefined;
const marketVisible=()=>{
  const root=marketRoot();
  if(!root)return false;
  const style=window.getComputedStyle(root);
  const rect=root.getBoundingClientRect();
  return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||'1')!==0&&rect.width>0&&rect.height>0;
};
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
const fileToBase64=(file:File)=>new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
  reader.onerror=()=>reject(reader.error);
  reader.readAsDataURL(file);
});

const lookupFipe=async(input:{brand:string;model:string;year:string;fuel?:string})=>{
  const params=new URLSearchParams({brand:input.brand,model:input.model,year:input.year});
  if(input.fuel)params.set('fuel',input.fuel);
  params.set('_ts',String(Date.now()));
  const response=await fetch(`/api/marketiq-fipe?${params.toString()}`,{method:'GET',cache:'no-store'});
  if(!response.ok)return null;
  return response.json();
};

type Notice={kind:'ok'|'warn'|'loading';text:string}|null;
type ExternalVehicle={plate:string};

const MarketIQLookupBridge:React.FC=()=>{
  const[user,setUser]=useState<User|null>(null);
  const[snapshot,setSnapshot]=useState<GroupStockSnapshot|null>(null);
  const[notice,setNotice]=useState<Notice>(null);
  const[external,setExternal]=useState<ExternalVehicle|null>(null);
  const[readingCrlv,setReadingCrlv]=useState(false);
  const lastPlate=useRef('');
  const requestId=useRef(0);
  const wasMarketVisible=useRef(false);

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
    const timer=window.setInterval(()=>{
      const visible=marketVisible();
      if(wasMarketVisible.current&&!visible){
        requestId.current+=1;
        lastPlate.current='';
        setNotice(null);
        setExternal(null);
        setReadingCrlv(false);
      }
      wasMarketVisible.current=visible;
    },150);
    return()=>window.clearInterval(timer);
  },[]);

  const showExternal=(plate:string)=>{
    setExternal({plate});
    setNotice({kind:'warn',text:'Veículo fora do estoque. Envie o CRLV-e para o Motyq identificar o carro sem consulta veicular paga.'});
  };

  const readCrlv=async(file:File)=>{
    if(!external)return;
    if(file.size>12*1024*1024){setNotice({kind:'warn',text:'O CRLV-e deve ter no máximo 12 MB.'});return;}
    setReadingCrlv(true);
    setNotice({kind:'loading',text:`Lendo o CRLV-e de ${external.plate}...`});
    try{
      const currentUser=auth.currentUser;
      if(!currentUser)throw new Error('no_session');
      const token=await currentUser.getIdToken();
      const data64=await fileToBase64(file);
      const response=await fetch('/api/marketiq-crlv',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body:JSON.stringify({file:{name:file.name,mimeType:file.type||'application/octet-stream',data:data64}}),
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.data)throw new Error(payload?.error||'crlv_failed');
      const vehicle=payload.data;
      const readPlate=cleanPlate(vehicle.plate||'');
      if(readPlate&&readPlate!==external.plate){
        setNotice({kind:'warn',text:`O CRLV-e enviado é da placa ${readPlate}, diferente de ${external.plate}.`});
        return;
      }
      const brand=String(vehicle.brand||String(vehicle.model||'').split('/')[0]||'').trim();
      const model=String(vehicle.model||'').trim();
      const year=String(vehicle.yearModel||vehicle.yearFab||'').trim();
      fill({model,year});
      setNotice({kind:'loading',text:`${model} identificado. Buscando FIPE...`});
      const fipe=await lookupFipe({brand,model,year,fuel:String(vehicle.fuel||'')});
      if(fipe?.value){
        fill({model:fipe.model||model,year:String(fipe.year||year),fipe:Number(fipe.value)||0});
        setNotice({kind:'ok',text:`${fipe.model||model} identificado pelo CRLV-e. FIPE ${fipe.referenceMonth||'atual'} preenchida automaticamente.`});
        setExternal(null);
      }else{
        setNotice({kind:'warn',text:`${model} foi identificado pelo CRLV-e, mas não consegui vincular a versão à FIPE automaticamente.`});
      }
    }catch(error:any){
      setNotice({kind:'warn',text:String(error?.message||'').includes('Sessão')?'Sua sessão expirou. Entre novamente no Motyq.':'Não consegui ler esse CRLV-e. Tente uma foto/PDF mais nítido.'});
    }finally{
      setReadingCrlv(false);
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

  if((!notice&&!external)||!marketVisible())return null;
  return <div className="fixed right-5 top-24 z-[615] w-[min(92vw,390px)] space-y-3">
    {notice&&<div className={`rounded-2xl border px-4 py-3 text-xs shadow-2xl backdrop-blur-xl ${notice.kind==='ok'?'border-emerald-300/25 bg-emerald-950/90 text-emerald-100':notice.kind==='warn'?'border-amber-300/25 bg-amber-950/90 text-amber-100':'border-cyan-300/20 bg-cyan-950/90 text-cyan-100'}`}>{notice.text}</div>}
    {external&&<div className="rounded-2xl border border-white/10 bg-[#11191b]/95 p-4 text-white shadow-2xl backdrop-blur-xl">
      <div className="mb-3">
        <p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-300">VEÍCULO FORA DO ESTOQUE</p>
        <p className="mt-1 text-sm font-semibold">{external.plate} · identificação pelo CRLV-e</p>
        <p className="mt-1 text-[11px] leading-4 text-zinc-500">Sem API veicular paga. Envie uma foto ou PDF do CRLV-e e o Motyq lê marca, modelo, versão e ano; depois cruza automaticamente com a FIPE.</p>
      </div>
      <label className={`flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] text-xs font-black uppercase tracking-[.12em] text-cyan-200 transition hover:bg-cyan-300/[.13] ${readingCrlv?'pointer-events-none opacity-50':''}`}>
        {readingCrlv?'LENDO CRLV-E...':'ENVIAR CRLV-E'}
        <input type="file" accept="image/*,application/pdf" className="hidden" disabled={readingCrlv} onChange={e=>{const file=e.target.files?.[0];if(file)void readCrlv(file);e.currentTarget.value='';}}/>
      </label>
      <p className="mt-2 text-center text-[10px] text-zinc-600">Foto, print ou PDF · até 12 MB</p>
    </div>}
  </div>;
};

export default MarketIQLookupBridge;
