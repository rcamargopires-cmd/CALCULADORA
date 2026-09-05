import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Calculator, CarFront, CheckCircle2, ClipboardList, FileText, Gauge, Save, ShieldCheck, X, XCircle } from 'lucide-react';
import { User } from '../types';

type Props = { currentUser: User; companyId: string; storeId: string; storeName: string };
type Level = 1 | 2 | 3 | 4 | 5;
type Liquidity = 'high' | 'medium' | 'low';
type Trend = 'up' | 'stable' | 'down';

const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num=(value:string)=>Number(String(value||'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0;
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
const conditionLabel=(score:number)=>score>=90?'A · Excelente':score>=78?'B · Bom':score>=64?'C · Regular':score>=48?'D · Alto investimento':'E · Repasse / alto risco';
const riskLabel=(score:number)=>score>=80?'COMPRA FORTE':score>=65?'COMPRA RECOMENDADA':score>=50?'ATENÇÃO':'RISCO ELEVADO';

const MarketIQ:React.FC<Props>=({currentUser,storeName})=>{
 const[open,setOpen]=useState(false);
 const[plate,setPlate]=useState('');const[vehicle,setVehicle]=useState('');const[year,setYear]=useState('');
 const[km,setKm]=useState('');const[expectedKm,setExpectedKm]=useState('60000');
 const[fipe,setFipe]=useState('');const[market,setMarket]=useState('');const[marketLow,setMarketLow]=useState('');const[marketHigh,setMarketHigh]=useState('');
 const[targetMargin,setTargetMargin]=useState('8');const[expectedDays,setExpectedDays]=useState('30');const[capitalRate,setCapitalRate]=useState('18');
 const[liquidity,setLiquidity]=useState<Liquidity>('medium');const[trend,setTrend]=useState<Trend>('stable');
 const[body,setBody]=useState<Level>(4);const[interior,setInterior]=useState<Level>(4);const[tires,setTires]=useState<Level>(4);const[mechanical,setMechanical]=useState<Level>(4);const[history,setHistory]=useState<Level>(4);
 const[notes,setNotes]=useState('');
 const[costs,setCosts]=useState({hygiene:'350',bodywork:'0',dent:'0',tires:'0',review:'0',mechanical:'0',aesthetics:'0',transfer:'650',purchaseTaxes:'0',documents:'0',other:'0'});

 const calc=useMemo(()=>{
   const m=num(market),f=num(fipe),low=num(marketLow),high=num(marketHigh),actualKm=num(km),expKm=Math.max(1,num(expectedKm));
   const prep=Object.values(costs).reduce((s,v)=>s+num(v),0);
   const weighted=((body*.23)+(interior*.14)+(tires*.16)+(mechanical*.27)+(history*.20))/5*100;
   const kmRatio=actualKm?actualKm/expKm:1;
   const kmScore=clamp(100-(Math.max(0,kmRatio-1)*48)+(Math.max(0,1-kmRatio)*18),35,100);
   const conditionAdjustment=(weighted-78)/100*.055;
   const kmAdjustment=kmRatio>1?-Math.min(.09,(kmRatio-1)*.07):Math.min(.025,(1-kmRatio)*.025);
   const trendAdjustment=trend==='up'?.01:trend==='down'?-.025:0;
   const base=m||f||0;
   let sell=base*(1+conditionAdjustment+kmAdjustment+trendAdjustment);
   if(low&&high)sell=clamp(sell,low*.97,high*1.01);
   const days=Math.max(0,num(expectedDays));const capRate=Math.max(0,num(capitalRate))/100;
   const capitalCost=sell*capRate*(days/365);
   const liquidityRisk=liquidity==='high'?.008:liquidity==='low'?.035:.018;
   const trendRisk=trend==='down'?.025:trend==='up'?.005:.012;
   const conditionRisk=weighted<65?.025:weighted<78?.015:.007;
   const riskReserve=sell*(liquidityRisk+trendRisk+conditionRisk);
   const marginPct=Math.max(0,num(targetMargin))/100;
   const recommendedBuy=Math.max(0,sell*(1-marginPct)-prep-capitalCost-riskReserve);
   const safeBuy=Math.max(0,recommendedBuy-sell*.018);
   const aggressiveBuy=Math.max(0,recommendedBuy+sell*.015);
   const limitBuy=Math.max(0,recommendedBuy+sell*.03);
   const marginAtRecommended=sell-recommendedBuy-prep-capitalCost;
   const marginPctReal=sell?marginAtRecommended/sell*100:0;
   const liquidityScore=liquidity==='high'?92:liquidity==='medium'?72:48;
   const trendScore=trend==='up'?88:trend==='stable'?72:45;
   const economicsScore=clamp((marginPct*100)*7+35,35,96);
   const score=Math.round(clamp(weighted*.27+kmScore*.18+liquidityScore*.22+trendScore*.13+economicsScore*.20,0,100));
   return{prep,weighted,kmRatio,kmScore,sell,capitalCost,riskReserve,recommendedBuy,safeBuy,aggressiveBuy,limitBuy,marginAtRecommended,marginPctReal,score,base};
 },[market,fipe,marketLow,marketHigh,km,expectedKm,targetMargin,expectedDays,capitalRate,liquidity,trend,body,interior,tires,mechanical,history,costs]);

 const diagnosis=useMemo(()=>{
   if(!calc.base)return 'Informe FIPE ou mercado observado para gerar a recomendação financeira.';
   if(calc.score>=80)return `Boa oportunidade. Estado ${conditionLabel(calc.weighted)}, KM score ${Math.round(calc.kmScore)}/100 e preparação estimada em ${money(calc.prep)}. A compra recomendada preserva margem e risco dentro dos parâmetros informados.`;
   if(calc.score>=65)return `Compra viável com disciplina. O ponto de equilíbrio está próximo de ${money(calc.recommendedBuy)}. Evite ultrapassar o limite de ${money(calc.limitBuy)} sem justificativa comercial.`;
   if(calc.score>=50)return `Atenção. Há fatores que pressionam margem, giro ou preparação. Negocie abaixo de ${money(calc.recommendedBuy)} para recuperar proteção.`;
   return 'Risco elevado. O conjunto de condição, giro e custos sugere compra defensiva ou direcionamento para repasse.';
 },[calc]);

 const inputCls='h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-300/40';
 const labelCls='mb-1 block text-[10px] font-bold uppercase tracking-[.11em] text-zinc-500';
 const costField=(key:keyof typeof costs,label:string)=><label className="block"><span className={labelCls}>{label}</span><input value={costs[key]} onChange={e=>setCosts(v=>({...v,[key]:e.target.value}))} inputMode="decimal" className={inputCls}/></label>;
 const level=(label:string,value:Level,set:(v:Level)=>void)=><label className="block"><span className={labelCls}>{label}</span><select value={value} onChange={e=>set(Number(e.target.value) as Level)} className="h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"><option value={5}>Excelente</option><option value={4}>Bom</option><option value={3}>Regular</option><option value={2}>Ruim</option><option value={1}>Crítico</option></select></label>;
 const metric=(label:string,value:string,tone='text-white')=><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-bold uppercase tracking-[.13em] text-zinc-500">{label}</p><p className={`mt-1 text-lg font-semibold ${tone}`}>{value}</p></div>;

 return <>
  <button title="MarketIQ · avaliação e precificação" onClick={()=>setOpen(true)} className="fixed bottom-[154px] right-4 z-[153] flex items-center gap-3 rounded-2xl border border-cyan-300/20 bg-[#11191b]/95 px-4 py-3 text-left text-white shadow-2xl shadow-black/45 backdrop-blur-xl transition hover:border-cyan-300/40 hover:bg-[#142025] active:scale-[.98]">
   <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.07] text-cyan-300"><Gauge size={20}/></span>
   <span className="hidden sm:block"><span className="block text-[9px] font-black uppercase tracking-[.17em] text-cyan-300">MERCADO</span><span className="mt-0.5 block text-sm font-semibold">MarketIQ</span></span>
  </button>

  {open&&<div className="fixed inset-0 z-[590] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-5" onClick={()=>setOpen(false)}>
   <div className="mx-auto max-w-[1500px] rounded-[28px] border border-white/10 bg-[#101315] text-white shadow-2xl" onClick={e=>e.stopPropagation()}>
    <header className="sticky top-0 z-20 flex items-start justify-between rounded-t-[28px] border-b border-white/10 bg-[#101315]/95 p-5 backdrop-blur md:px-6 md:py-5">
     <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">MOTYQ MARKETIQ · V2</p><h2 className="mt-1 text-2xl font-semibold">Avaliação & Precificação Inteligente</h2><p className="mt-1 text-sm text-zinc-500">{storeName} · veículo + mercado + condição + preparação + decisão</p></div>
     <button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-zinc-400 hover:text-white"><X size={18}/></button>
    </header>

    <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[1.25fr_.8fr_.72fr]">
     <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
       <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CarFront size={16} className="text-cyan-300"/><h3 className="font-semibold">Identificação do veículo</h3></div><span className="rounded-full border border-cyan-300/15 bg-cyan-300/[.05] px-2.5 py-1 text-[9px] font-bold uppercase text-cyan-300">Automação preservada</span></div>
       <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label><span className={labelCls}>Placa</span><input value={plate} onChange={e=>setPlate(e.target.value.toUpperCase())} className={inputCls}/></label>
        <label className="lg:col-span-2"><span className={labelCls}>Modelo / versão</span><input value={vehicle} onChange={e=>setVehicle(e.target.value)} className={inputCls}/></label>
        <label><span className={labelCls}>Ano/modelo</span><input value={year} onChange={e=>setYear(e.target.value)} className={inputCls}/></label>
        <label><span className={labelCls}>KM atual</span><input value={km} onChange={e=>setKm(e.target.value)} inputMode="numeric" className={inputCls}/></label>
        <label><span className={labelCls}>FIPE</span><input value={fipe} onChange={e=>setFipe(e.target.value)} inputMode="decimal" className={inputCls}/></label>
       </div>
       <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{metric('Origem',plate?'Motyq / CRLV':'Aguardando','text-cyan-200')}{metric('Estado geral',`${Math.round(calc.weighted)}/100`,'text-emerald-300')}{metric('KM score',`${Math.round(calc.kmScore)}/100`)}{metric('Preparação',money(calc.prep),'text-amber-200')}</div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
       <div className="mb-4 flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-300"/><h3 className="font-semibold">Estado do veículo</h3></div>
       <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{level('Lataria/pintura',body,setBody)}{level('Interior',interior,setInterior)}{level('Pneus',tires,setTires)}{level('Mecânica',mechanical,setMechanical)}{level('Histórico/manutenção',history,setHistory)}</div>
       <div className="mt-4 grid gap-3 sm:grid-cols-2">{metric('Estado geral',`${Math.round(calc.weighted)}/100 · ${conditionLabel(calc.weighted)}`,'text-emerald-300')}{metric('KM Score',`${Math.round(calc.kmScore)}/100${num(km)?` · ${Math.round((calc.kmRatio-1)*100)}% vs típico`:''}`)}</div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
       <div className="mb-4 flex items-center gap-2"><Calculator size={16} className="text-amber-300"/><h3 className="font-semibold">Preparação necessária</h3></div>
       <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{costField('hygiene','Higienização')}{costField('bodywork','Funilaria / pintura')}{costField('dent','Martelinho')}{costField('tires','Pneus')}{costField('review','Revisão')}{costField('mechanical','Mecânica')}{costField('aesthetics','Estética / polimento')}{costField('transfer','Transferência')}{costField('purchaseTaxes','Impostos da compra')}{costField('documents','Documentação / taxas')}{costField('other','Outros')}</div>
       <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-3"><span className="text-xs text-zinc-500">Custo operacional total estimado</span><strong className="float-right text-lg text-amber-200">{money(calc.prep)}</strong></div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
       <div className="mb-3 flex items-center gap-2"><FileText size={16} className="text-violet-300"/><h3 className="font-semibold">Observações do avaliador</h3></div>
       <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4} placeholder="Ex.: veículo bem conservado, retoque leve no para-choque, pneus meia vida..." className="w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white outline-none focus:border-violet-300/35"/>
      </section>
     </div>

     <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
       <div className="mb-4 flex items-center gap-2"><Activity size={16} className="text-cyan-300"/><h3 className="font-semibold">Mercado & referências</h3></div>
       <div className="space-y-3">
        <label><span className={labelCls}>Mercado observado</span><input value={market} onChange={e=>setMarket(e.target.value)} inputMode="decimal" className={inputCls}/></label>
        <div className="grid grid-cols-2 gap-3"><label><span className={labelCls}>Faixa mínima</span><input value={marketLow} onChange={e=>setMarketLow(e.target.value)} inputMode="decimal" className={inputCls}/></label><label><span className={labelCls}>Faixa máxima</span><input value={marketHigh} onChange={e=>setMarketHigh(e.target.value)} inputMode="decimal" className={inputCls}/></label></div>
        <label><span className={labelCls}>KM típico comparável</span><input value={expectedKm} onChange={e=>setExpectedKm(e.target.value)} inputMode="numeric" className={inputCls}/></label>
       </div>
       <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm"><div className="flex justify-between"><span className="text-zinc-500">FIPE</span><strong>{money(num(fipe))}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Mercado base</span><strong>{money(calc.base)}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Venda recomendada</span><strong className="text-cyan-200">{money(calc.sell)}</strong></div></div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
       <div className="mb-4 flex items-center gap-2"><ClipboardList size={16} className="text-blue-300"/><h3 className="font-semibold">Estratégia financeira</h3></div>
       <div className="grid gap-3 sm:grid-cols-2"><label><span className={labelCls}>Margem alvo %</span><input value={targetMargin} onChange={e=>setTargetMargin(e.target.value)} className={inputCls}/></label><label><span className={labelCls}>Giro esperado (dias)</span><input value={expectedDays} onChange={e=>setExpectedDays(e.target.value)} className={inputCls}/></label><label><span className={labelCls}>Custo capital a.a. %</span><input value={capitalRate} onChange={e=>setCapitalRate(e.target.value)} className={inputCls}/></label><label><span className={labelCls}>Liquidez</span><select value={liquidity} onChange={e=>setLiquidity(e.target.value as Liquidity)} className="h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm"><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label><label className="sm:col-span-2"><span className={labelCls}>Tendência</span><select value={trend} onChange={e=>setTrend(e.target.value as Trend)} className="h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm"><option value="up">Subindo</option><option value="stable">Estável</option><option value="down">Caindo</option></select></label></div>
       <div className="mt-4 grid grid-cols-2 gap-3">{metric('Custo de capital',money(calc.capitalCost))}{metric('Reserva de risco',money(calc.riskReserve))}{metric('Margem projetada',`${calc.marginPctReal.toFixed(1)}%`,'text-emerald-300')}{metric('Lucro estimado',money(calc.marginAtRecommended),'text-emerald-300')}</div>
      </section>

      <section className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.035] p-4">
       <div className="mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-cyan-300"/><h3 className="font-semibold">Diagnóstico Motyq</h3></div>
       <p className="text-sm leading-6 text-zinc-300">{diagnosis}</p>
      </section>
     </div>

     <aside className="space-y-4 xl:sticky xl:top-[110px] xl:self-start">
      <section className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[.045] p-5"><p className="text-[10px] font-black uppercase tracking-[.16em] text-zinc-400">MOTYQ BUY SCORE</p><div className="mt-2 flex items-end justify-between"><strong className="text-5xl font-semibold">{calc.score}</strong><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] font-black text-emerald-300">{riskLabel(calc.score)}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-emerald-300" style={{width:`${calc.score}%`}}/></div></section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[.025] p-4">
       <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[.035] p-3"><p className="text-[9px] uppercase text-zinc-500">Compra segura</p><p className="mt-1 text-2xl font-semibold text-emerald-300">{money(calc.safeBuy)}</p></div>
       <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/[.05] p-3"><p className="text-[9px] uppercase text-zinc-500">Compra recomendada</p><p className="mt-1 text-2xl font-semibold text-cyan-200">{money(calc.recommendedBuy)}</p></div>
       <div className="rounded-xl border border-amber-300/20 bg-amber-300/[.04] p-3"><p className="text-[9px] uppercase text-zinc-500">Compra agressiva</p><p className="mt-1 text-2xl font-semibold text-amber-200">{money(calc.aggressiveBuy)}</p></div>
       <div className="rounded-xl border border-red-300/20 bg-red-300/[.035] p-3"><p className="text-[9px] uppercase text-zinc-500">Limite de compra</p><p className="mt-1 text-2xl font-semibold text-red-200">{money(calc.limitBuy)}</p></div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] font-bold uppercase tracking-[.13em] text-zinc-500">Resumo decisório</p><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span className="text-zinc-500">Venda recomendada</span><strong>{money(calc.sell)}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Preparação</span><strong>{money(calc.prep)}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Giro esperado</span><strong>{Math.round(num(expectedDays))} dias</strong></div><div className="flex justify-between"><span className="text-zinc-500">Margem estimada</span><strong className="text-emerald-300">{calc.marginPctReal.toFixed(1)}%</strong></div></div></section>

      <section className="grid gap-2">
       <button onClick={()=>window.dispatchEvent(new CustomEvent('motyq:marketiq-save-requested',{detail:{plate,vehicle,year,km,fipe,notes}}))} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-500 font-semibold text-black hover:bg-cyan-400"><Save size={16}/>SALVAR AVALIAÇÃO</button>
       <div className="grid grid-cols-2 gap-2"><button onClick={()=>window.dispatchEvent(new CustomEvent('motyq:marketiq-approved',{detail:{plate,value:calc.recommendedBuy}}))} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[.05] text-sm font-semibold text-emerald-300"><CheckCircle2 size={15}/>APROVAR</button><button onClick={()=>window.dispatchEvent(new CustomEvent('motyq:marketiq-rejected',{detail:{plate}}))} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300/20 bg-red-300/[.04] text-sm font-semibold text-red-300"><XCircle size={15}/>RECUSAR</button></div>
       <p className="px-1 text-[10px] leading-4 text-zinc-600">V2 visual pronta para integração com histórico e fluxo de aprovação. Os eventos já ficam separados para essa próxima etapa.</p>
      </section>
     </aside>
    </div>
   </div>
  </div>}
 </>;
};

export default MarketIQ;
