import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,CarFront,CheckCircle2,LoaderCircle,LogOut,PenLine,Plus,Search,X} from 'lucide-react';
import type {OperationalStockItem,User} from '../types';
import {manualStockService} from '../services/manualStockService';
import {auth} from '../firebase';
import {marketIqVehicleCacheService} from '../services/marketIqVehicleCacheService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
type CatalogItem={code:string;name:string};
type FormState={
  plate:string;brand:string;brandCode:string;vehicle:string;modelCode:string;year:string;yearCode:string;km:string;entryDate:string;cost:string;fipe:string;askingPrice:string;location:string;status:string;
};

const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const numberValue=(value:string)=>Number(String(value||'').replace(/\./g,'').replace(',','.'))||0;
const BRL=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value||0);
const emptyForm=():FormState=>({plate:'',brand:'',brandCode:'',vehicle:'',modelCode:'',year:'',yearCode:'',km:'',entryDate:localDate(),cost:'',fipe:'',askingPrice:'',location:'',status:'Disponível'});

const ManualStockPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const[open,setOpen]=useState(false);
  const[rows,setRows]=useState<OperationalStockItem[]>([]);
  const[form,setForm]=useState<FormState>(emptyForm());
  const[originalPlate,setOriginalPlate]=useState('');
  const[search,setSearch]=useState('');
  const[busy,setBusy]=useState(false);
  const[loading,setLoading]=useState(false);
  const[message,setMessage]=useState<{kind:'ok'|'error';text:string}|null>(null);
  const[plateLookup,setPlateLookup]=useState<{kind:'idle'|'loading'|'ok'|'warn';text:string}>({kind:'idle',text:''});
  const[brands,setBrands]=useState<CatalogItem[]>([]);
  const[models,setModels]=useState<CatalogItem[]>([]);
  const[years,setYears]=useState<CatalogItem[]>([]);
  const[catalogBusy,setCatalogBusy]=useState(false);
  const[fipeBusy,setFipeBusy]=useState(false);
  const lookupSeq=useRef(0);
  const lastLookupPlate=useRef('');

  const load=async()=>{
    setLoading(true);
    try{setRows(await manualStockService.getCurrent(storeId,companyId));}
    catch(error:any){setMessage({kind:'error',text:error?.message||'Não foi possível carregar o estoque atual.'});}
    finally{setLoading(false);}
  };

  const loadBrands=async()=>{
    if(brands.length)return;
    setCatalogBusy(true);
    try{
      const response=await fetch('/api/marketiq-fipe?action=brands',{cache:'no-store'});
      const payload:any=await response.json().catch(()=>null);
      if(!response.ok||!Array.isArray(payload?.items))throw new Error('brands_failed');
      setBrands(payload.items);
    }catch{
      setMessage({kind:'error',text:'Não foi possível carregar a lista de fabricantes da FIPE.'});
    }finally{setCatalogBusy(false);}
  };

  useEffect(()=>{if(open){void load();void loadBrands();}},[open,companyId,storeId]);

  useEffect(()=>{
    if(!open||!form.brandCode){setModels([]);return;}
    let active=true;
    setCatalogBusy(true);
    fetch(`/api/marketiq-fipe?action=models&brandCode=${encodeURIComponent(form.brandCode)}`,{cache:'no-store'})
      .then(async response=>({ok:response.ok,payload:await response.json().catch(()=>null)}))
      .then(({ok,payload})=>{
        if(!active)return;
        if(!ok||!Array.isArray(payload?.items))throw new Error('models_failed');
        setModels(payload.items);
      })
      .catch(()=>{if(active)setMessage({kind:'error',text:'Não foi possível carregar os modelos desse fabricante.'});})
      .finally(()=>{if(active)setCatalogBusy(false);});
    return()=>{active=false;};
  },[open,form.brandCode]);

  useEffect(()=>{
    if(!open||!form.brandCode||!form.modelCode){setYears([]);return;}
    let active=true;
    setCatalogBusy(true);
    fetch(`/api/marketiq-fipe?action=years&brandCode=${encodeURIComponent(form.brandCode)}&modelCode=${encodeURIComponent(form.modelCode)}`,{cache:'no-store'})
      .then(async response=>({ok:response.ok,payload:await response.json().catch(()=>null)}))
      .then(({ok,payload})=>{
        if(!active)return;
        if(!ok||!Array.isArray(payload?.items))throw new Error('years_failed');
        setYears(payload.items);
      })
      .catch(()=>{if(active)setMessage({kind:'error',text:'Não foi possível carregar os anos desse modelo.'});})
      .finally(()=>{if(active)setCatalogBusy(false);});
    return()=>{active=false;};
  },[open,form.brandCode,form.modelCode]);

  useEffect(()=>{
    if(!open||!form.brandCode||!form.modelCode||!form.yearCode)return;
    let active=true;
    setFipeBusy(true);
    fetch(`/api/marketiq-fipe?action=detail&brandCode=${encodeURIComponent(form.brandCode)}&modelCode=${encodeURIComponent(form.modelCode)}&yearCode=${encodeURIComponent(form.yearCode)}`,{cache:'no-store'})
      .then(async response=>({ok:response.ok,payload:await response.json().catch(()=>null)}))
      .then(({ok,payload})=>{
        if(!active)return;
        if(!ok||!payload)throw new Error('detail_failed');
        const selectedYear=years.find(item=>item.code===form.yearCode)?.name||String(payload.year||'');
        setForm(prev=>({
          ...prev,
          brand:String(payload.brand||prev.brand),
          vehicle:String(payload.model||prev.vehicle),
          year:selectedYear||String(payload.year||prev.year),
          fipe:Number(payload.value)>0?String(Math.round(Number(payload.value))):prev.fipe,
        }));
      })
      .catch(()=>{if(active)setMessage({kind:'error',text:'Não foi possível consultar a FIPE desse ano.'});})
      .finally(()=>{if(active)setFipeBusy(false);});
    return()=>{active=false;};
  },[open,form.brandCode,form.modelCode,form.yearCode,years]);

  useEffect(()=>{
    if(!open||!form.brand||form.brandCode||!brands.length)return;
    const wanted=String(form.brand).toLowerCase().trim();
    const match=brands.find(item=>item.name.toLowerCase().trim()===wanted);
    if(match)setForm(prev=>({...prev,brandCode:match.code}));
  },[open,brands,form.brand,form.brandCode]);

  useEffect(()=>{
    if(!open||!form.vehicle||form.modelCode||!models.length)return;
    const wanted=String(form.vehicle).toLowerCase().trim();
    const exact=models.find(item=>item.name.toLowerCase().trim()===wanted);
    const loose=exact||models.find(item=>item.name.toLowerCase().includes(wanted)||wanted.includes(item.name.toLowerCase()));
    if(loose)setForm(prev=>({...prev,modelCode:loose.code,vehicle:loose.name}));
  },[open,models,form.vehicle,form.modelCode]);

  useEffect(()=>{
    if(!open||!form.year||form.yearCode||!years.length)return;
    const wantedYears=(String(form.year).match(/(?:19|20)\d{2}/g)||[]);
    const target=wantedYears[wantedYears.length-1]||'';
    const match=years.find(item=>item.name.includes(target));
    if(match)setForm(prev=>({...prev,yearCode:match.code,year:match.name}));
  },[open,years,form.year,form.yearCode]);

  useEffect(()=>{
    if(!open)return;
    const plate=cleanPlate(form.plate);
    if(plate.length!==7){
      lastLookupPlate.current='';
      setPlateLookup({kind:'idle',text:''});
      return;
    }
    if(originalPlate&&plate===cleanPlate(originalPlate))return;
    if(plate===lastLookupPlate.current)return;
    const seq=++lookupSeq.current;
    const timer=window.setTimeout(async()=>{
      lastLookupPlate.current=plate;
      setPlateLookup({kind:'loading',text:`Consultando ${plate}...`});
      try{
        const cached=await marketIqVehicleCacheService.get(companyId,storeId,plate).catch(()=>null);
        if(seq!==lookupSeq.current)return;
        if(cached?.model&&cached?.year){
          setForm(prev=>cleanPlate(prev.plate)===plate?{
            ...prev,
            brand:cached.brand||prev.brand,
            brandCode:'',
            vehicle:cached.model||prev.vehicle,
            modelCode:'',
            year:cached.year||prev.year,
            yearCode:'',
            fipe:cached.lastFipeValue?String(cached.lastFipeValue):prev.fipe,
          }:prev);
          setPlateLookup({kind:'ok',text:`${cached.model} · ${cached.year} identificado pelo Motyq.`});
          return;
        }

        const firebaseUser=auth.currentUser;
        if(!firebaseUser)throw new Error('no_session');
        const token=await firebaseUser.getIdToken();
        const response=await fetch('/api/marketiq-plate',{
          method:'POST',
          cache:'no-store',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
          body:JSON.stringify({plate}),
        });
        const payload:any=await response.json().catch(()=>null);
        if(seq!==lookupSeq.current)return;
        if(!response.ok||!payload?.model||!payload?.year)throw new Error(String(payload?.error||'lookup_failed'));

        const model=String(payload.model||'').trim();
        const year=String(payload.year||'').trim();
        const fipeValue=Number(payload.fipeValue)||0;
        setForm(prev=>cleanPlate(prev.plate)===plate?{
          ...prev,
          brand:String(payload.brand||'').trim()||prev.brand,
          brandCode:'',
          vehicle:model||prev.vehicle,
          modelCode:'',
          year:year||prev.year,
          yearCode:'',
          fipe:fipeValue?String(fipeValue):prev.fipe,
        }:prev);
        setPlateLookup({kind:'ok',text:`${model} · ${year} identificado automaticamente.`});

        void marketIqVehicleCacheService.save({
          plate,
          brand:String(payload.brand||''),
          model,
          year,
          fuel:String(payload.fuel||''),
          renavam:String(payload.renavam||''),
          fipeCode:String(payload.fipeCode||''),
          lastFipeValue:fipeValue,
          lastFipeReference:String(payload.referenceMonth||''),
          source:'dadosapi',
          companyId,
          storeId,
          identifiedAt:new Date().toISOString(),
          identifiedBy:firebaseUser.email||firebaseUser.uid,
        }).catch(()=>undefined);
      }catch(error){
        if(seq!==lookupSeq.current)return;
        setPlateLookup({kind:'warn',text:'Não consegui identificar pela placa. Selecione fabricante, modelo e ano/modelo abaixo.'});
      }
    },450);
    return()=>window.clearTimeout(timer);
  },[open,form.plate,originalPlate,companyId,storeId]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return rows;
    return rows.filter(item=>[item.plate,item.vehicle,item.year,item.location,item.status].some(value=>String(value||'').toLowerCase().includes(q)));
  },[rows,search]);

  const reset=()=>{
    setForm(emptyForm());
    setOriginalPlate('');
    setMessage(null);
    setPlateLookup({kind:'idle',text:''});
    lastLookupPlate.current='';
  };

  const edit=(item:OperationalStockItem)=>{
    setOriginalPlate(item.plate);
    setForm({
      plate:item.plate||'',
      brand:item.brand||'',
      brandCode:'',
      vehicle:item.vehicle||'',
      modelCode:'',
      year:item.year||'',
      yearCode:'',
      km:item.km?String(item.km):'',
      entryDate:item.entryDate||'',
      cost:item.cost?String(item.cost):'',
      fipe:item.fipe?String(item.fipe):'',
      askingPrice:item.askingPrice?String(item.askingPrice):'',
      location:item.location||'',
      status:item.status||'Disponível',
    });
    setMessage(null);
    setPlateLookup({kind:'idle',text:''});
    lastLookupPlate.current=cleanPlate(item.plate);
    document.getElementById('motyq-manual-stock-form')?.scrollIntoView({behavior:'smooth',block:'start'});
  };

  const save=async()=>{
    const plate=cleanPlate(form.plate);
    if(!/^[A-Z0-9]{7}$/.test(plate)){setMessage({kind:'error',text:'Informe uma placa válida com 7 caracteres.'});return;}
    if(!form.brand.trim()){setMessage({kind:'error',text:'Selecione o fabricante do veículo.'});return;}
    if(!form.vehicle.trim()){setMessage({kind:'error',text:'Selecione o modelo do veículo.'});return;}
    if(!form.year.trim()){setMessage({kind:'error',text:'Selecione o ano/modelo do veículo.'});return;}
    if(form.entryDate&&form.entryDate>localDate()){setMessage({kind:'error',text:'A data de entrada não pode estar no futuro.'});return;}
    setBusy(true);setMessage(null);
    try{
      const item:OperationalStockItem={
        id:plate,
        snapshotDate:localDate(),
        plate,
        vehicle:form.vehicle.trim(),
        brand:form.brand.trim(),
        stockDays:0,
        cost:numberValue(form.cost),
        fipe:numberValue(form.fipe),
        askingPrice:numberValue(form.askingPrice),
        year:form.year.trim(),
        km:numberValue(form.km),
        entryDate:form.entryDate||undefined,
        source:'manual',
        location:form.location.trim()||storeName,
        status:form.status.trim()||'Disponível',
        companyId,
        storeId,
      };
      await manualStockService.save(item,currentUser,storeId,companyId,originalPlate||undefined);
      setMessage({kind:'ok',text:originalPlate?'Veículo atualizado no estoque.':'Veículo incluído no estoque.'});
      setForm(emptyForm());setOriginalPlate('');
      await load();
      window.dispatchEvent(new Event('dealmaster:operational-data-updated'));
    }catch(error:any){setMessage({kind:'error',text:error?.message||'Não foi possível salvar o veículo.'});}
    finally{setBusy(false);}
  };

  const remove=async(item:OperationalStockItem)=>{
    if(!window.confirm(`Dar saída do estoque para ${item.plate} · ${item.vehicle}? O histórico anterior será preservado.`))return;
    setBusy(true);setMessage(null);
    try{
      await manualStockService.remove(item.plate,currentUser,storeId,companyId);
      if(originalPlate===item.plate)reset();
      setMessage({kind:'ok',text:`${item.plate}: saída registrada. O veículo não aparece mais no estoque atual.`});
      await load();
      window.dispatchEvent(new Event('dealmaster:operational-data-updated'));
    }catch(error:any){setMessage({kind:'error',text:error?.message||'Não foi possível dar saída no veículo.'});}
    finally{setBusy(false);}
  };

  if(!['admin','manager'].includes(String(currentUser.role)))return null;

  return <>
    <button title="Cadastro Manual de Estoque" className="hidden" onClick={()=>{setOpen(true);setMessage(null);}}>Cadastro Manual de Estoque</button>

    {open&&<div className="fixed inset-0 z-[610] overflow-y-auto bg-black/75 p-3 backdrop-blur-md" onClick={()=>setOpen(false)}>
      <div className="mx-auto my-5 max-w-6xl overflow-hidden rounded-[30px] border border-slate-700 bg-[#0f1722] text-white shadow-2xl" onClick={e=>e.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-slate-700 bg-[#111b29] p-5 md:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-amber-300">ESTOQUE MANUAL · SEM DMS</p>
            <h2 className="mt-2 text-2xl font-semibold !text-white">Cadastro direto de veículos</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 !text-slate-300">{storeName}. Cadastre, edite e dê saída sem planilha. A data de entrada atualiza o aging automaticamente e cada alteração preserva a fotografia anterior do estoque.</p>
          </div>
          <button onClick={()=>setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-600 bg-slate-800 !text-white hover:bg-slate-700"><X size={18}/></button>
        </header>

        <div className="grid gap-5 bg-[#e9eef5] p-5 lg:grid-cols-[390px_1fr] md:p-6">
          <section id="motyq-manual-stock-form" className="rounded-[24px] border border-slate-200 bg-white p-4 text-slate-900 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[9px] font-black uppercase tracking-[.14em] text-amber-300">{originalPlate?'EDIÇÃO':'NOVO VEÍCULO'}</p><h3 className="mt-1 font-semibold !text-slate-900">{originalPlate?`Editar ${originalPlate}`:'Adicionar ao estoque'}</h3></div>
              {originalPlate&&<button onClick={reset} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-bold text-slate-600">CANCELAR</button>}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              <Field label="Placa *" value={form.plate} onChange={value=>setForm({...form,plate:cleanPlate(value).slice(0,7)})} placeholder="ABC1D23"/>
              <SelectField
                label="Fabricante *"
                value={form.brandCode}
                onChange={code=>{
                  const selected=brands.find(item=>item.code===code);
                  setForm({...form,brandCode:code,brand:selected?.name||'',vehicle:'',modelCode:'',year:'',yearCode:'',fipe:''});
                }}
                options={brands}
                placeholder={catalogBusy&&!brands.length?'Carregando fabricantes...':'Selecione o fabricante'}
                wide
              />
              <SelectField
                label="Modelo *"
                value={form.modelCode}
                onChange={code=>{
                  const selected=models.find(item=>item.code===code);
                  setForm({...form,modelCode:code,vehicle:selected?.name||'',year:'',yearCode:'',fipe:''});
                }}
                options={models}
                placeholder={!form.brandCode?'Escolha primeiro o fabricante':catalogBusy&&!models.length?'Carregando modelos...':'Selecione o modelo'}
                disabled={!form.brandCode}
                wide
              />
              <SelectField
                label="Ano / modelo *"
                value={form.yearCode}
                onChange={code=>{
                  const selected=years.find(item=>item.code===code);
                  setForm({...form,yearCode:code,year:selected?.name||'',fipe:''});
                }}
                options={years}
                placeholder={!form.modelCode?'Escolha primeiro o modelo':catalogBusy&&!years.length?'Carregando anos...':'Selecione o ano/modelo'}
                disabled={!form.modelCode}
              />
              <Field label="KM" value={form.km} onChange={value=>setForm({...form,km:value})} type="number" placeholder="32000"/>
              <Field label="Data de entrada" value={form.entryDate} onChange={value=>setForm({...form,entryDate:value})} type="date"/>
              <Field label="Localização" value={form.location} onChange={value=>setForm({...form,location:value})} placeholder={storeName}/>
              <Field label="Custo atual" value={form.cost} onChange={value=>setForm({...form,cost:value})} type="number" placeholder="85000"/>
              <label className="text-xs font-semibold !text-slate-600"><span>FIPE {fipeBusy&&<span className="ml-1 text-[10px] font-medium text-blue-600">consultando...</span>}</span><input type="number" value={form.fipe} onChange={e=>setForm({...form,fipe:e.target.value})} placeholder="Preenchida automaticamente" className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 !bg-white px-3 text-sm font-medium !text-slate-900 outline-none placeholder:!text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/></label>
              <Field label="Preço de venda" value={form.askingPrice} onChange={value=>setForm({...form,askingPrice:value})} type="number" placeholder="96900"/>
              <label className="text-xs font-semibold text-slate-600"><span>Status</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option>Disponível</option><option>Em preparação</option><option>Reservado</option><option>Em proposta</option><option>Bloqueado</option></select></label>
            </div>

            {plateLookup.kind!=='idle'&&<div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium ${plateLookup.kind==='ok'?'border-emerald-200 bg-emerald-50 text-emerald-800':plateLookup.kind==='warn'?'border-amber-200 bg-amber-50 text-amber-800':'border-blue-200 bg-blue-50 text-blue-700'}`}>{plateLookup.kind==='loading'?<LoaderCircle size={15} className="animate-spin"/>:plateLookup.kind==='ok'?<CheckCircle2 size={15}/>:<AlertTriangle size={15}/>}<span>{plateLookup.text}</span></div>}

            <button disabled={busy} onClick={()=>void save()} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f2b705] text-sm font-black text-slate-950 shadow-sm transition hover:bg-[#dca700] disabled:opacity-40"><Plus size={17}/>{busy?'SALVANDO...':originalPlate?'SALVAR ALTERAÇÕES':'ADICIONAR VEÍCULO'}</button>

            {message&&<div className={`mt-4 flex gap-2 rounded-xl border px-3 py-3 text-xs ${message.kind==='ok'?'border-emerald-300/20 bg-emerald-300/[.05] text-emerald-300':'border-red-300/20 bg-red-300/[.05] text-red-200'}`}>{message.kind==='ok'?<CheckCircle2 size={16}/>:<AlertTriangle size={16}/>}<span>{message.text}</span></div>}
          </section>

          <section className="min-w-0 text-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-[9px] font-black uppercase tracking-[.14em] text-slate-500">ESTOQUE ATUAL</p><h3 className="mt-1 text-lg font-semibold !text-slate-900">{rows.length} veículo(s)</h3></div>
              <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-500 shadow-sm"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Placa ou modelo" className="w-44 bg-transparent !text-slate-900 outline-none placeholder:!text-slate-400"/></label>
            </div>

            {loading?<div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Carregando estoque...</div>:
            !filtered.length?<div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><CarFront size={26} className="mx-auto text-slate-400"/><p className="mt-3 text-sm font-semibold !text-slate-700">{rows.length?'Nenhum veículo encontrado.':'Estoque vazio'}</p><p className="mt-1 text-xs !text-slate-500">{rows.length?'Tente outra busca.':'Cadastre o primeiro veículo ao lado.'}</p></div>:
            <div className="mt-4 space-y-2">{filtered.map(item=><article key={item.plate} className="rounded-2xl border border-slate-200 bg-white p-3.5 text-slate-900 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-sm !text-slate-900">{item.plate}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{item.stockDays} DIAS</span>{item.source==='manual'&&<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">MANUAL</span>}</div><p className="mt-1 truncate text-sm font-semibold !text-slate-900">{item.brand?item.brand+' · ':''}{item.vehicle}{item.year?` · ${item.year}`:''}</p><p className="mt-1 text-[11px] !text-slate-500">{item.km?item.km.toLocaleString('pt-BR')+' km · ':''}{item.location||storeName}{item.status?` · ${item.status}`:''}</p></div>
                <div className="flex shrink-0 gap-1.5"><button onClick={()=>edit(item)} title="Editar veículo" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"><PenLine size={15}/></button><button disabled={busy} onClick={()=>void remove(item)} title="Dar saída" className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"><LogOut size={15}/></button></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-xs"><Mini label="Custo atual" value={BRL(item.cost)}/><Mini label="FIPE" value={item.fipe?BRL(item.fipe):'—'}/><Mini label="Venda" value={item.askingPrice?BRL(item.askingPrice):'—'}/></div>
            </article>)}</div>}
          </section>
        </div>
      </div>
    </div>}
  </>;
};

const Field=({label,value,onChange,placeholder='',type='text',wide=false}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string;type?:string;wide?:boolean})=><label className={`text-xs font-semibold !text-slate-600 ${wide?'sm:col-span-2 lg:col-span-2':''}`}><span>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 !bg-white px-3 text-sm font-medium !text-slate-900 outline-none placeholder:!text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/></label>;
const SelectField=({label,value,onChange,options,placeholder,disabled=false,wide=false}:{label:string;value:string;onChange:(value:string)=>void;options:CatalogItem[];placeholder:string;disabled?:boolean;wide?:boolean})=>{
  const hasCurrent=value&&options.some(item=>item.code===value);
  return <label className={`text-xs font-semibold !text-slate-600 ${wide?'sm:col-span-2 lg:col-span-2':''}`}><span>{label}</span><select value={value} disabled={disabled} onChange={e=>onChange(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 !bg-white px-3 text-sm font-medium !text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"><option value="">{placeholder}</option>{value&&!hasCurrent&&<option value={value}>{value}</option>}{options.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></label>;
};
const Mini=({label,value}:{label:string;value:string})=><div><p className="text-[9px] font-bold uppercase tracking-[.08em] !text-slate-500">{label}</p><p className="mt-1 font-semibold !text-slate-800">{value}</p></div>;

export default ManualStockPanel;
