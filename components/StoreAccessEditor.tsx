import React from 'react';
import type { Store } from '../types';

type Props={
  stores:Store[];
  primaryStoreId:string;
  storeIds:string[];
  onChange:(primaryStoreId:string,storeIds:string[])=>void;
};

const StoreAccessEditor:React.FC<Props>=({stores,primaryStoreId,storeIds,onChange})=>{
  const selected=new Set((storeIds.length?storeIds:[primaryStoreId]).filter(Boolean));
  const toggle=(id:string,checked:boolean)=>{
    const next=new Set(selected);
    if(checked)next.add(id);else next.delete(id);
    const values=[...next];
    const primary=values.includes(primaryStoreId)?primaryStoreId:(values[0]||'');
    onChange(primary,values);
  };
  const changePrimary=(id:string)=>{
    const next=new Set(selected);if(id)next.add(id);
    onChange(id,[...next]);
  };
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label><span className="text-xs font-semibold text-slate-600">Unidade principal</span><select value={primaryStoreId} onChange={e=>changePrimary(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Selecione...</option>{stores.filter(store=>selected.has(store.id)||!selected.size).map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <div><p className="text-xs font-semibold text-slate-600">Unidades autorizadas</p><p className="mt-1.5 text-[11px] leading-5 text-slate-500">Marque todas as lojas que este usuário poderá acessar. A unidade principal será a tela inicial.</p></div>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {stores.map(store=><label key={store.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700"><input type="checkbox" checked={selected.has(store.id)} onChange={e=>toggle(store.id,e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600"/><span>{store.name}</span></label>)}
    </div>
  </div>;
};

export default StoreAccessEditor;
