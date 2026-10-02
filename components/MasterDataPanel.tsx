import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Search, UserRound, UsersRound, X } from 'lucide-react';
import type { CustomerMaster, SupplierMaster, User } from '../types';
import { dmsCustomerService } from '../services/dmsCustomerService';
import { dmsSupplierService } from '../services/dmsSupplierService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
type Tab='customers'|'suppliers';

const MasterDataPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const[open,setOpen]=useState(false);
  const[tab,setTab]=useState<Tab>('customers');
  const[customers,setCustomers]=useState<CustomerMaster[]>([]);
  const[suppliers,setSuppliers]=useState<SupplierMaster[]>([]);
  const[selectedCustomer,setSelectedCustomer]=useState<CustomerMaster|null>(null);
  const[selectedSupplier,setSelectedSupplier]=useState<SupplierMaster|null>(null);
  const[search,setSearch]=useState('');
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');

  const load=async()=>{
    setError('');
    try{
      const[c,s]=await Promise.all([dmsCustomerService.list(companyId,storeId),dmsSupplierService.list(companyId,storeId)]);
      setCustomers(c.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));
      setSuppliers(s.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));
    }catch(cause:any){setError(cause?.message||'Não foi possível carregar os cadastros mestres.');}
  };
  useEffect(()=>{if(open)void load();},[open,companyId,storeId]);

  const q=search.trim().toLocaleLowerCase('pt-BR');
  const filteredCustomers=useMemo(()=>customers.filter(item=>!q||[item.name,item.phone,item.email,item.document,item.city].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(q))),[customers,q]);
  const filteredSuppliers=useMemo(()=>suppliers.filter(item=>!q||[item.name,item.phone,item.email,item.document,item.pixKey].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(q))),[suppliers,q]);

  const saveCustomer=async()=>{
    if(!selectedCustomer)return;
    setBusy(true);setError('');setMessage('');
    try{
      const next=selectedCustomer.customerId
        ? await dmsCustomerService.save(selectedCustomer,currentUser)
        : await dmsCustomerService.ensure({...selectedCustomer,companyId,storeId,actor:currentUser});
      setSelectedCustomer(next);
      setMessage('Cliente atualizado.');
      await load();
    }catch(cause:any){setError(cause?.message||'Não foi possível salvar o cliente.');}
    finally{setBusy(false);}
  };
  const saveSupplier=async()=>{
    if(!selectedSupplier)return;
    setBusy(true);setError('');setMessage('');
    try{
      const next=selectedSupplier.supplierId
        ? await dmsSupplierService.save(selectedSupplier,currentUser)
        : await dmsSupplierService.ensure({...selectedSupplier,companyId,storeId,actor:currentUser});
      setSelectedSupplier(next);
      setMessage('Fornecedor atualizado.');
      await load();
    }catch(cause:any){setError(cause?.message||'Não foi possível salvar o fornecedor.');}
    finally{setBusy(false);}
  };

  const newCustomer=()=>setSelectedCustomer({
    id:'',kind:'customer_master',customerId:'',companyId,storeId,name:'',phone:'',email:'',document:'',
    address:'',city:'',state:'',zipCode:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  });
  const newSupplier=()=>setSelectedSupplier({
    id:'',kind:'supplier_master',supplierId:'',companyId,storeId,name:'',document:'',phone:'',email:'',pixKey:'',bankInfo:'',
    active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  });

  return <>
    <button title="Cadastros mestres" onClick={()=>setOpen(true)} className="hidden" type="button">Cadastros mestres</button>
    {open&&<div className="fixed inset-0 z-[282] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[30px] border border-slate-200 bg-white text-slate-900 shadow-2xl" onClick={event=>event.stopPropagation()}>
        <header className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between md:p-7">
          <div className="flex items-start gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700"><UsersRound size={22}/></div><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-sky-700">DMS · CADASTROS MESTRES</p><h2 className="mt-1 text-2xl font-semibold">Clientes e fornecedores sem duplicar informação.</h2><p className="mt-1 text-sm text-slate-500">{storeName}. Os demais módulos reutilizam estes cadastros.</p></div></div>
          <button onClick={()=>setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500"><X size={18}/></button>
        </header>

        <div className="p-5 md:p-7">
          <nav className="flex flex-wrap gap-2"><TabButton active={tab==='customers'} icon={<UserRound size={15}/>} label={`Clientes (${customers.length})`} onClick={()=>{setTab('customers');setSelectedSupplier(null);}}/><TabButton active={tab==='suppliers'} icon={<Building2 size={15}/>} label={`Fornecedores (${suppliers.length})`} onClick={()=>{setTab('suppliers');setSelectedCustomer(null);}}/></nav>
          {(message||error)&&<div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${error?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error||message}</div>}

          <section className="mt-5 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search size={14} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={tab==='customers'?'Nome, telefone, CPF/CNPJ ou cidade':'Nome, CNPJ/CPF, Pix ou telefone'} className="h-10 w-full bg-transparent text-sm outline-none"/></div>
              <button onClick={tab==='customers'?newCustomer:newSupplier} className="mt-3 h-10 w-full rounded-xl bg-slate-900 text-xs font-bold text-white">+ NOVO {tab==='customers'?'CLIENTE':'FORNECEDOR'}</button>
              <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {tab==='customers'?filteredCustomers.map(item=><button key={item.customerId} onClick={()=>setSelectedCustomer({...item})} className={`w-full rounded-2xl border p-3 text-left ${selectedCustomer?.customerId===item.customerId?'border-sky-300 bg-sky-50':'border-slate-200 bg-white'}`}><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.phone||'Sem telefone'}{item.document?` · ${item.document}`:''}</p></button>):filteredSuppliers.map(item=><button key={item.supplierId} onClick={()=>setSelectedSupplier({...item})} className={`w-full rounded-2xl border p-3 text-left ${selectedSupplier?.supplierId===item.supplierId?'border-sky-300 bg-sky-50':'border-slate-200 bg-white'}`}><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.document||'Sem documento'}{item.pixKey?` · Pix ${item.pixKey}`:''}</p></button>)}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              {tab==='customers'?<CustomerEditor value={selectedCustomer} setValue={setSelectedCustomer} busy={busy} onSave={saveCustomer}/>:<SupplierEditor value={selectedSupplier} setValue={setSelectedSupplier} busy={busy} onSave={saveSupplier}/>}
            </div>
          </section>
        </div>
      </div>
    </div>}
  </>;
};

const CustomerEditor=({value,setValue,busy,onSave}:{value:CustomerMaster|null;setValue:(value:CustomerMaster|null)=>void;busy:boolean;onSave:()=>void})=>{
  if(!value)return <Empty text="Selecione um cliente ou crie um novo cadastro."/>;
  const patch=(p:Partial<CustomerMaster>)=>setValue({...value,...p});
  return <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-sky-700">CLIENTE MESTRE</p><h3 className="mt-1 text-xl font-semibold">{value.name||'Novo cliente'}</h3><div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Nome *" value={value.name} onChange={v=>patch({name:v})}/><Field label="Telefone *" value={value.phone} onChange={v=>patch({phone:v.replace(/\D/g,'').slice(0,15)})}/><Field label="E-mail" value={value.email||''} onChange={v=>patch({email:v})}/><Field label="CPF / CNPJ" value={value.document||''} onChange={v=>patch({document:v.replace(/\D/g,'').slice(0,14)})}/><Field label="CEP" value={value.zipCode||''} onChange={v=>patch({zipCode:v.replace(/\D/g,'').slice(0,8)})}/><Field label="UF" value={value.state||''} onChange={v=>patch({state:v.toUpperCase().slice(0,2)})}/><Field label="Cidade" value={value.city||''} onChange={v=>patch({city:v})}/><Field label="Endereço" value={value.address||''} onChange={v=>patch({address:v})}/></div><button disabled={busy} onClick={onSave} className="mt-5 h-11 w-full rounded-xl bg-sky-600 text-sm font-bold text-white disabled:opacity-50">{busy?'SALVANDO...':'SALVAR CLIENTE'}</button>{value.customerId&&<p className="mt-3 font-mono text-[10px] text-slate-400">customerId: {value.customerId}</p>}</div>;
};
const SupplierEditor=({value,setValue,busy,onSave}:{value:SupplierMaster|null;setValue:(value:SupplierMaster|null)=>void;busy:boolean;onSave:()=>void})=>{
  if(!value)return <Empty text="Selecione um fornecedor ou crie um novo cadastro."/>;
  const patch=(p:Partial<SupplierMaster>)=>setValue({...value,...p});
  return <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-sky-700">FORNECEDOR MESTRE</p><h3 className="mt-1 text-xl font-semibold">{value.name||'Novo fornecedor'}</h3><div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Nome / razão social *" value={value.name} onChange={v=>patch({name:v})}/><Field label="CPF / CNPJ" value={value.document||''} onChange={v=>patch({document:v.replace(/\D/g,'').slice(0,14)})}/><Field label="Telefone" value={value.phone||''} onChange={v=>patch({phone:v.replace(/\D/g,'').slice(0,15)})}/><Field label="E-mail" value={value.email||''} onChange={v=>patch({email:v})}/><Field label="Chave Pix" value={value.pixKey||''} onChange={v=>patch({pixKey:v})}/><Field label="Banco / agência / conta" value={value.bankInfo||''} onChange={v=>patch({bankInfo:v})}/></div><label className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={value.active!==false} onChange={e=>patch({active:e.target.checked})}/> Fornecedor ativo</label><button disabled={busy} onClick={onSave} className="mt-5 h-11 w-full rounded-xl bg-sky-600 text-sm font-bold text-white disabled:opacity-50">{busy?'SALVANDO...':'SALVAR FORNECEDOR'}</button>{value.supplierId&&<p className="mt-3 font-mono text-[10px] text-slate-400">supplierId: {value.supplierId}</p>}</div>;
};
const Field=({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void})=><label className="text-xs font-semibold text-slate-500">{label}<input value={value} onChange={e=>onChange(e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400"/></label>;
const Empty=({text}:{text:string})=><div className="grid min-h-[360px] place-items-center text-center"><div><UsersRound size={34} className="mx-auto text-slate-300"/><p className="mt-3 text-sm text-slate-500">{text}</p></div></div>;
const TabButton=({active,icon,label,onClick}:{active:boolean;icon:React.ReactNode;label:string;onClick:()=>void})=><button onClick={onClick} className={`flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-semibold ${active?'border-sky-200 bg-sky-50 text-sky-700':'border-slate-200 bg-white text-slate-500'}`}>{icon}{label}</button>;

export default MasterDataPanel;
