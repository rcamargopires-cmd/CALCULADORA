import React from 'react';
import type { DmsAccessProfile, DmsPermissionKey, User } from '../types';
import { DMS_PERMISSION_OPTIONS, dmsPermissionOverridesFor, dmsPermissions } from '../services/dmsPermissions';

type Props={
  profile:DmsAccessProfile;
  overrides:Partial<Record<DmsPermissionKey,boolean>>;
  onProfileChange:(profile:DmsAccessProfile)=>void;
  onOverridesChange:(overrides:Partial<Record<DmsPermissionKey,boolean>>)=>void;
};

const DmsPermissionEditor:React.FC<Props>=({profile,overrides,onProfileChange,onOverridesChange})=>{
  const baseUser:Partial<User>={role:'manager',dmsAccessProfile:profile,dmsPermissionOverrides:overrides};
  const effective=dmsPermissions(baseUser);
  const groups=Array.from(new Set(DMS_PERMISSION_OPTIONS.map(item=>item.group)));

  const toggle=(key:DmsPermissionKey,value:boolean)=>{
    const values:Partial<Record<DmsPermissionKey,boolean>>={};
    for(const option of DMS_PERMISSION_OPTIONS)values[option.key]=Boolean((effective as any)[option.key]);
    values[key]=value;

    // Dependências naturais: quem altera precisa enxergar o módulo.
    if(key==='stockWrite'&&value)values.stockView=true;
    if((key==='prepRequest'||key==='prepApprove')&&value)values.prepView=true;
    if((key==='financeCreate'||key==='financeSettle')&&value)values.financeView=true;

    onOverridesChange(dmsPermissionOverridesFor(
      {role:'manager',dmsAccessProfile:profile},
      values,
    ));
  };

  const changeProfile=(next:DmsAccessProfile)=>{
    onProfileChange(next);
    onOverridesChange({});
  };

  return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <label className="block flex-1">
        <span className="text-xs font-semibold text-slate-600">Padrão de acesso</span>
        <select value={profile} onChange={event=>changeProfile(event.target.value as DmsAccessProfile)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
          <option value="management">Gestor</option>
          <option value="preparation">Preparação</option>
          <option value="finance">Financeiro / Caixa</option>
        </select>
      </label>
      <button type="button" onClick={()=>onOverridesChange({})} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Restaurar padrão</button>
    </div>

    <div className="mt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-800">Permissões deste usuário</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">O padrão pré-marca o necessário. Você pode liberar ou retirar funções individualmente.</p>
        </div>
        {Object.keys(overrides).length>0&&<span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-bold text-blue-700">PERSONALIZADO</span>}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {groups.map(group=><section key={group} className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{group}</p>
          <div className="mt-2 space-y-2">
            {DMS_PERMISSION_OPTIONS.filter(item=>item.group===group).map(option=>{
              const checked=Boolean((effective as any)[option.key]);
              return <label key={option.key} className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-slate-50">
                <input type="checkbox" checked={checked} onChange={event=>toggle(option.key,event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"/>
                <span>
                  <span className="block text-xs font-semibold text-slate-700">{option.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{option.description}</span>
                </span>
              </label>;
            })}
          </div>
        </section>)}
      </div>
    </div>
  </div>;
};

export default DmsPermissionEditor;
