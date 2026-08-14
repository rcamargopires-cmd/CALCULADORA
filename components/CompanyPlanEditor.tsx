import React, { useMemo, useState } from 'react';
import { Check, Crown, LockKeyhole, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { Company, CompanyPlan, DealMasterModule } from '../types';
import { defaultModuleEnabled, MODULES, PLAN_META } from '../services/planEntitlementService';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

type Props = {
  company: Company;
  locked?: boolean;
  saving?: boolean;
  onSave: (patch: Partial<Company>) => Promise<void> | void;
};

const CompanyPlanEditor: React.FC<Props> = ({ company, locked = false, saving = false, onSave }) => {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<CompanyPlan>(company.plan);
  const [overrides, setOverrides] = useState<Partial<Record<DealMasterModule, boolean>>>(company.moduleOverrides || {});

  const reset = () => { setPlan(company.plan); setOverrides(company.moduleOverrides || {}); };
  const openEditor = () => { reset(); setOpen(true); };
  const enabledCount = useMemo(() => MODULES.filter(module => {
    const override = overrides[module.id];
    return typeof override === 'boolean' ? override : defaultModuleEnabled(plan, module.id);
  }).length, [plan, overrides]);

  const setModule = (module: DealMasterModule, enabled: boolean) => {
    if (locked) return;
    const inherited = defaultModuleEnabled(plan, module);
    setOverrides(current => {
      const next = { ...current };
      if (enabled === inherited) delete next[module];
      else next[module] = enabled;
      return next;
    });
  };

  const save = async () => {
    await onSave({ plan, moduleOverrides: Object.keys(overrides).length ? overrides : undefined });
    setOpen(false);
  };

  return <>
    <button onClick={openEditor} className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:bg-white/[0.05]"><SlidersHorizontal size={13}/> Plano e módulos</button>
    {open && <div className="fixed inset-0 z-[310] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}><div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={event => event.stopPropagation()}>
      <header className="flex items-start justify-between border-b border-white/10 p-5 md:p-7"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-300"><Crown size={15}/> SaaS · Plano & módulos</div><h3 className="text-2xl font-semibold text-white">{company.name}</h3><p className="mt-2 text-sm text-zinc-500">O plano define o pacote padrão. Exceções permitem montar uma proposta comercial sem criar outro plano.</p></div><button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400"><X size={18}/></button></header>

      <div className="space-y-6 p-5 md:p-7">
        {locked && <div className="flex gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4"><LockKeyhole size={17} className="mt-0.5 shrink-0 text-emerald-300"/><div><p className="text-sm font-semibold text-emerald-200">Ambiente interno protegido</p><p className="mt-1 text-xs leading-5 text-emerald-200/60">A Abrão Reze permanece com Enterprise e todos os módulos liberados durante o desenvolvimento e validação.</p></div></div>}

        <section><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-zinc-600">Plano comercial</p><h4 className="mt-1 text-lg font-semibold text-white">Escolha a base da assinatura</h4></div><span className="text-xs text-zinc-600">{enabledCount}/{MODULES.length} módulos ativos</span></div><div className="grid gap-3 lg:grid-cols-3">{(['starter','pro','enterprise'] as CompanyPlan[]).map(item => {const meta=PLAN_META[item];const selected=plan===item;return <button key={item} disabled={locked} onClick={()=>{setPlan(item);setOverrides({});}} className={`rounded-[24px] border p-5 text-left transition disabled:cursor-not-allowed ${selected?'border-white/30 bg-white/[0.08]':'border-white/10 bg-white/[0.025]'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold text-white">{meta.label}</p><p className="mt-1 text-2xl font-semibold text-white">{money(meta.price)}<span className="text-xs font-normal text-zinc-600">/mês</span></p></div>{selected&&<div className="grid h-8 w-8 place-items-center rounded-full bg-white text-black"><Check size={15}/></div>}</div><p className="mt-3 text-sm leading-5 text-zinc-500">{meta.description}</p><p className="mt-4 text-xs font-semibold text-zinc-400">{MODULES.filter(module=>defaultModuleEnabled(item,module.id)).length} módulos incluídos</p></button>})}</div></section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.025] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-zinc-600">Entitlements</p><h4 className="mt-1 text-lg font-semibold text-white">Módulos liberados</h4><p className="mt-1 text-sm text-zinc-500">“Plano” usa a regra padrão. “Extra” ou “Bloqueado” é uma exceção desta empresa.</p></div>{!locked&&Object.keys(overrides).length>0&&<button onClick={()=>setOverrides({})} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-400"><RotateCcw size={13}/> Remover exceções</button>}</div><div className="mt-5 grid gap-3 md:grid-cols-2">{MODULES.map(module=>{const inherited=defaultModuleEnabled(plan,module.id);const override=overrides[module.id];const enabled=typeof override==='boolean'?override:inherited;const exceptional=typeof override==='boolean';return <div key={module.id} className={`rounded-[22px] border p-4 ${enabled?'border-emerald-400/15 bg-emerald-400/[0.035]':'border-white/10 bg-black/20'}`}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{module.label}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${exceptional?(enabled?'bg-violet-400/10 text-violet-300':'bg-red-400/10 text-red-300'):'bg-white/[0.06] text-zinc-500'}`}>{exceptional?(enabled?'EXTRA':'BLOQUEADO'):'PLANO'}</span></div><p className="mt-1.5 text-xs leading-5 text-zinc-500">{module.description}</p><p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-zinc-700">Base: {PLAN_META[module.minimumPlan].label}+</p></div><button disabled={locked} onClick={()=>setModule(module.id,!enabled)} className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${enabled?'bg-emerald-400':'bg-zinc-800'}`} aria-label={`${enabled?'Desativar':'Ativar'} ${module.label}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${enabled?'left-6':'left-1'}`}/></button></div></div>})}</div></section>

        <div className="flex flex-col gap-3 rounded-[24px] border border-violet-400/15 bg-violet-400/[0.045] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><Sparkles size={17} className="mt-0.5 shrink-0 text-violet-300"/><div><p className="text-sm font-semibold text-violet-200">Pacote resultante: {PLAN_META[plan].label}</p><p className="mt-1 text-xs text-violet-200/55">{enabledCount} módulos ativos. Alterações passam a valer para os usuários desta empresa após salvar.</p></div></div>{!locked&&<button disabled={saving} onClick={save} className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-black disabled:opacity-40">{saving?'Salvando...':'Salvar plano'}</button>}</div>
      </div>
    </div></div>}
  </>;
};

export default CompanyPlanEditor;