import React,{useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CarFront,CheckCircle2,LogOut,PenLine,Plus,Search,Trash2,X} from 'lucide-react';
import type {OperationalStockItem,User} from '../types';
import {manualStockService} from '../services/manualStockService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
type FormState={
  plate:string;vehicle:string;year:string;km:string;entryDate:string;cost:string;fipe:string;askingPrice:string;location:string;status:string;
};

const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const numberValue=(value:string)=>Number(String(value||'').replace(/\./g,'').replace(',','.'))||0;
const BRL=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value||0);
const emptyForm=():FormState=>({plate:'',vehicle:'',year:'',km:'',entryDate:localDate(),cost:'',fipe:'',askingPrice:'',location:'',status:'Disponível'});

const ManualStockPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const[open,setOpen]=useState(false);
  const[rows,setRows]=useState<OperationalStockItem[]>([]);
  const[form,setForm]=useState<FormState>(emptyForm());
  const[originalPlate,setOriginalPlate]=useState('');
  const[search,setSearch]=useState('');
  const[busy,setBusy]=useState(false);
  const[loading,setLoading]=useState(false);
  const[message,setMessage]=useState<{kind:'ok'|'error';text:string}|null>(null);

  const load=async()=>{
    setLoading(true);
    try{setRows(await manualStockService.getCurrent(storeId,companyId));}
    catch(error:any){setMessage({kind:'error',text:error?.message||'Não foi possível carregar o estoque atual.'});}
    finally{setLoading(false);}
  };

  useEffect(()=>{if(open)void load();},[open,companyId,storeId]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return rows;
    return rows.filter(item=>[item.plate,item.vehicle,item.year,item.location,item.status].some(value=>String(value||'').toLowerCase().includes(q)));
  },[rows,search]);

  const reset=()=>{
    setForm(emptyForm());
    setOriginalPlate('');
    setMessage(null);
  };

  const edit=(item:OperationalStockItem)=>{
    setOriginalPlate(item.plate);
    setForm({
      plate:item.plate||'',
      vehicle:item.vehicle||'',
      year:item.year||'',
      km:item.km?String(item.km):'',
      entryDate:item.entryDate||'',
      cost:item.cost?String(item.cost):'',
      fipe:item.fipe?String(item.fipe):'',
      askingPrice:item.askingPrice?String(item.askingPrice):'',
      location:item.location||'',
      status:item.status||'Disponível',
    });
    setMessage(null);
    document.getElementById('motyq-manual-stock-form')?.scrollIntoView({behavior:'smooth',block:'start'});
  };

  const save=async()=>{
    const plate=cleanPlate(form.plate);
    if(!/^[A-Z0-9]{7}$/.test(plate)){setMessage({kind:'error',text:'Informe uma placa válida com 7 caracteres.'});return;}
    if(!form.vehicle.trim()){setMessage({kind:'error',text:'Informe o modelo do veículo.'});return;}
    if(form.entryDate&&form.entryDate>localDate()){setMessage({kind:'error',text:'A data de entrada não pode estar no futuro.'});return;}
    setBusy(true);setMessage(null);
    try{
      const item:OperationalStockItem={
        id:plate,
        snapshotDate:localDate(),
        plate,
        vehicle:form.vehicle.trim(),
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
      <div className="mx-auto my-5 max-w-6xl rounded-[30px] border border-white/10 bg-[#111318] text-white shadow-2xl" onClick={e=>e.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-white/10 p-5 md:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-amber-300">ESTOQUE MANUAL · SEM DMS</p>
            <h2 className="mt-2 text-2xl font-semibold">Cadastro direto de veículos</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">{storeName}. Cadastre, edite e dê saída sem planilha. A data de entrada atualiza o aging automaticamente e cada alteração preserva a fotografia anterior do estoque.</p>
          </div>
          <button onClick={()=>setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-zinc-400"><X size={18}/></button>
        </header>

        <div className="grid gap-5 p-5 lg:grid-cols-[390px_1fr] md:p-6">
          <section id="motyq-manual-stock-form" className="rounded-[24px] border border-white/10 bg-white/[.025] p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[9px] font-black uppercase tracking-[.14em] text-amber-300">{originalPlate?'EDIÇÃO':'NOVO VEÍCULO'}</p><h3 className="mt-1 font-semibold">{originalPlate?`Editar ${originalPlate}`:'Adicionar ao estoque'}</h3></div>
              {originalPlate&&<button onClick={reset} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold text-zinc-400">CANCELAR</button>}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              <Field label="Placa *" value={form.plate} onChange={value=>setForm({...form,plate:cleanPlate(value).slice(0,7)})} placeholder="ABC1D23"/>
              <Field label="Modelo *" value={form.vehicle} onChange={value=>setForm({...form,vehicle:value})} placeholder="T-Cross Sense 1.0" wide/>
              <Field label="Ano / modelo" value={form.year} onChange={value=>setForm({...form,year:value})} placeholder="2024/2025"/>
              <Field label="KM" value={form.km} onChange={value=>setForm({...form,km:value})} type="number" placeholder="32000"/>
              <Field label="Data de entrada" value={form.entryDate} onChange={value=>setForm({...form,entryDate:value})} type="date"/>
              <Field label="Localização" value={form.location} onChange={value=>setForm({...form,location:value})} placeholder={storeName}/>
              <Field label="Custo atual" value={form.cost} onChange={value=>setForm({...form,cost:value})} type="number" placeholder="85000"/>
              <Field label="FIPE" value={form.fipe} onChange={value=>setForm({...form,fipe:value})} type="number" placeholder="92000"/>
              <Field label="Preço de venda" value={form.askingPrice} onChange={value=>setForm({...form,askingPrice:value})} type="number" placeholder="96900"/>
              <label className="text-xs text-zinc-500"><span>Status</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"><option>Disponível</option><option>Em preparação</option><option>Reservado</option><option>Em proposta</option><option>Bloqueado</option></select></label>
            </div>

            <button disabled={busy} onClick={()=>void save()} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 text-sm font-black text-amber-950 disabled:opacity-40"><Plus size={17}/>{busy?'SALVANDO...':originalPlate?'SALVAR ALTERAÇÕES':'ADICIONAR VEÍCULO'}</button>

            {message&&<div className={`mt-4 flex gap-2 rounded-xl border px-3 py-3 text-xs ${message.kind==='ok'?'border-emerald-300/20 bg-emerald-300/[.05] text-emerald-300':'border-red-300/20 bg-red-300/[.05] text-red-200'}`}>{message.kind==='ok'?<CheckCircle2 size={16}/>:<AlertTriangle size={16}/>}<span>{message.text}</span></div>}
          </section>

          <section className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-[9px] font-black uppercase tracking-[.14em] text-zinc-500">ESTOQUE ATUAL</p><h3 className="mt-1 text-lg font-semibold">{rows.length} veículo(s)</h3></div>
              <label className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.035] px-3 text-xs text-zinc-400"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Placa ou modelo" className="w-44 bg-transparent text-white outline-none placeholder:text-zinc-600"/></label>
            </div>

            {loading?<div className="mt-4 rounded-2xl border border-white/10 p-8 text-center text-sm text-zinc-500">Carregando estoque...</div>:
            !filtered.length?<div className="mt-4 rounded-2xl border border-dashed border-white/10 p-8 text-center"><CarFront size={26} className="mx-auto text-zinc-700"/><p className="mt-3 text-sm font-semibold text-zinc-300">{rows.length?'Nenhum veículo encontrado.':'Estoque vazio'}</p><p className="mt-1 text-xs text-zinc-600">{rows.length?'Tente outra busca.':'Cadastre o primeiro veículo ao lado.'}</p></div>:
            <div className="mt-4 space-y-2">{filtered.map(item=><article key={item.plate} className="rounded-2xl border border-white/10 bg-white/[.025] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-sm">{item.plate}</strong><span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[9px] font-bold text-zinc-400">{item.stockDays} DIAS</span>{item.source==='manual'&&<span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-[9px] font-bold text-amber-300">MANUAL</span>}</div><p className="mt-1 truncate text-sm font-semibold text-white">{item.vehicle}{item.year?` · ${item.year}`:''}</p><p className="mt-1 text-[11px] text-zinc-500">{item.km?item.km.toLocaleString('pt-BR')+' km · ':''}{item.location||storeName}{item.status?` · ${item.status}`:''}</p></div>
                <div className="flex shrink-0 gap-1.5"><button onClick={()=>edit(item)} title="Editar veículo" className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:text-white"><PenLine size={15}/></button><button disabled={busy} onClick={()=>void remove(item)} title="Dar saída" className="grid h-9 w-9 place-items-center rounded-lg border border-red-300/15 text-red-300 hover:bg-red-300/[.06]"><LogOut size={15}/></button></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-xs"><Mini label="Custo atual" value={BRL(item.cost)}/><Mini label="FIPE" value={item.fipe?BRL(item.fipe):'—'}/><Mini label="Venda" value={item.askingPrice?BRL(item.askingPrice):'—'}/></div>
            </article>)}</div>}
          </section>
        </div>
      </div>
    </div>}
  </>;
};

const Field=({label,value,onChange,placeholder='',type='text',wide=false}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string;type?:string;wide?:boolean})=><label className={`text-xs text-zinc-500 ${wide?'sm:col-span-2 lg:col-span-2':''}`}><span>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/[.035] px-3 text-sm text-white outline-none placeholder:text-zinc-700"/></label>;
const Mini=({label,value}:{label:string;value:string})=><div><p className="text-[9px] font-bold uppercase tracking-[.08em] text-zinc-600">{label}</p><p className="mt-1 font-semibold text-zinc-300">{value}</p></div>;

export default ManualStockPanel;
