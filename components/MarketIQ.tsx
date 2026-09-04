import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Calculator, CarFront, Gauge, ShieldCheck, TrendingDown, TrendingUp, X } from 'lucide-react';
import { User } from '../types';

type Props = { currentUser: User; companyId: string; storeId: string; storeName: string };
type Level = 1 | 2 | 3 | 4 | 5;
type Liquidity = 'high' | 'medium' | 'low';
type Trend = 'up' | 'stable' | 'down';

const money = (value:number) => value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num = (value:string) => Number(String(value||'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'')) || 0;
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
const conditionLabel=(score:number)=>score>=90?'A · Excelente':score>=78?'B · Bom':score>=64?'C · Regular':score>=48?'D · Alto investimento':'E · Repasse / alto risco';
const riskLabel=(score:number)=>score>=80?'COMPRA FORTE':score>=65?'COMPRA RECOMENDADA':score>=50?'ATENÇÃO':'RISCO ELEVADO';

const MarketIQ:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
 const[open,setOpen]=useState(false);
 const[plate,setPlate]=useState('');const[vehicle,setVehicle]=useState('');const[year,setYear]=useState('');
 const[km,setKm]=useState('');const[expectedKm,setExpectedKm]=useState('60000');
 const[fipe,setFipe]=useState('');const[market,setMarket]=useState('');const[marketLow,setMarketLow]=useState('');const[marketHigh,setMarketHigh]=useState('');
 const[targetMargin,setTargetMargin]=useState('8');const[expectedDays,setExpectedDays]=useState('30');const[capitalRate,setCapitalRate]=useState('18');
 const[liquidity,setLiquidity]=useState<Liquidity>('medium');const[trend,setTrend]=useState<Trend>('stable');
 const[body,setBody]=useState<Level>(4);const[interior,setInterior]=useState<Level>(4);const[tires,setTires]=useState<Level>(4);const[mechanical,setMechanical]=useState<Level>(4);const[history,setHistory]=useState<Level>(4);
 const[costs,setCosts]=useState({hygiene:'350',bodywork:'0',dent:'0',tires:'0',review:'0',mechanical:'0',aesthetics:'0',transfer:'650',purchaseTaxes:'0',documents:'0',other:'0'});

 const calc=useMemo(()=>{
   const m=num(market), f=num(fipe), low=num(marketLow), high=num(marketHigh), actualKm=num(km), expKm=Math.max(1,num(expectedKm));
   const prep=Object.values(costs).reduce((s,v)=>s+num(v),0);
   const weighted=((body*0.23)+(interior*0.14)+(tires*0.16)+(mechanical*0.27)+(history*0.20))/5*100;
   const kmRatio=actualKm?actualKm/expKm:1;
   const kmScore=clamp(100-(Math.max(0,kmRatio-1)*48)+(Math.max(0,1-kmRatio)*18),35,100);
   const conditionAdjustment=(weighted-78)/100*0.055;
   const kmAdjustment=kmRatio>1?-Math.min(0.09,(kmRatio-1)*0.07):Math.min(0.025,(1-kmRatio)*0.025);
   const trendAdjustment=trend==='up'?0.01:trend==='down'?-0.025:0;
   const base=m||f||0;
   let sell=base*(1+conditionAdjustment+kmAdjustment+trendAdjustment);
   if(low&&high)sell=clamp(sell,low*0.97,high*1.01);
   const days=Math.max(0,num(expectedDays));const capRate=Math.max(0,num(capitalRate))/100;
   const capitalCost=sell*capRate*(days/365);
   const liquidityRisk=liquidity==='high'?0.008:liquidity==='low'?0.035:0.018;
   const trendRisk=trend==='down'?0.025:trend==='up'?0.005:0.012;
   const conditionRisk=weighted<65?0.025:weighted<78?0.015:0.007;
   const riskReserve=sell*(liquidityRisk+trendRisk+conditionRisk);
   const marginPct=Math.max(0,num(targetMargin))/100;
   const recommendedBuy=Math.max(0,sell*(1-marginPct)-prep-capitalCost-riskReserve);
   const safeBuy=Math.max(0,recommendedBuy-sell*0.018);
   const aggressiveBuy=Math.max(0,recommendedBuy+sell*0.015);
   const marginAtRecommended=sell-recommendedBuy-prep-capitalCost;
   const liquidityScore=liquidity==='high'?92:liquidity==='medium'?72:48;
   const trendScore=trend==='up'?88:trend==='stable'?72:45;
   const economicsScore=clamp((marginPct*100)*7+35,35,96);
   const score=Math.round(clamp(weighted*0.27+kmScore*0.18+liquidityScore*0.22+trendScore*0.13+economicsScore*0.20,0,100));
   return {prep,weighted,kmRatio,kmScore,sell,capitalCost,riskReserve,recommendedBuy,safeBuy,aggressiveBuy,marginAtRecommended,score,base};
 },[market,fipe,marketLow,marketHigh,km,expectedKm,targetMargin,expectedDays,capitalRate,liquidity,trend,body,interior,tires,mechanical,history,costs]);

 const costField=(key:keyof typeof costs,label:string)=><label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500">{label}</span><input value={costs[key]} onChange={e=>setCosts(v=>({...v,[key]:e.target.value}))} inputMode="decimal" className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-300/40"/></label>;
 const level=(label:string,value:Level,set:(v:Level)=>void)=><label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500">{label}</span><select value={value} onChange={e=>set(Number(e.target.value) as Level)} className="h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"><option value={5}>Excelente</option><option value={4}>Bom</option><option value={3}>Regular</option><option value={2}>Ruim</option><option value={1}>Crítico</option></select></label>;

 return <>
   <button title="MarketIQ · avaliação e precificação" onClick={()=>setOpen(true)} className="fixed bottom-[154px] right-4 z-[153] flex items-center gap-3 rounded-2xl border border-cyan-300/20 bg-[#11191b]/95 px-4 py-3 text-left text-white shadow-2xl shadow-black/45 backdrop-blur-xl transition hover:border-cyan-300/40 hover:bg-[#142025] active:scale-[.98]">
     <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.07] text-cyan-300"><Gauge size={20}/></span>
     <span className="hidden sm:block"><span className="block text-[9px] font-black uppercase tracking-[.17em] text-cyan-300">MERCADO</span><span className="mt-0.5 block text-sm font-semibold">MarketIQ</span></span>
   </button>
   {open&&<div className="fixed inset-0 z-[590] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={()=>setOpen(false)}>
    <div className="mx-auto max-w-7xl rounded-[30px] border border-white/10 bg-[#101315] text-white shadow-2xl" onClick={e=>e.stopPropagation()}>
      <header className="sticky top-0 z-10 flex items-start justify-between rounded-t-[30px] border-b border-white/10 bg-[#101315]/95 p-5 backdrop-blur md:p-7"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">MOTYQ MARKETIQ · V1</p><h2 className="mt-1 text-2xl font-semibold">Avaliação & Precificação Inteligente</h2><p className="mt-1 text-sm text-zinc-500">{storeName} · mercado + condição + KM + custos + risco</p></div><button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-zinc-400"><X size={18}/></button></header>
      <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[1.15fr_.85fr]">
       <div className="space-y-5">
        <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="mb-4 flex items-center gap-2"><CarFront size={16} className="text-cyan-300"/><h3 className="font-semibold">Veículo & mercado</h3></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label> <span className="mb-1 block text-[10px] uppercase text-zinc-500">Placa</span><input value={plate} onChange={e=>setPlate(e.target.value.toUpperCase())} className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">Modelo / versão</span><input value={vehicle} onChange={e=>setVehicle(e.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">Ano/modelo</span><input value={year} onChange={e=>setYear(e.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">KM atual</span><input value={km} onChange={e=>setKm(e.target.value)} inputMode="numeric" className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">KM típico comparável</span><input value={expectedKm} onChange={e=>setExpectedKm(e.target.value)} inputMode="numeric" className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">FIPE</span><input value={fipe} onChange={e=>setFipe(e.target.value)} inputMode="decimal" className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">Mercado observado</span><input value={market} onChange={e=>setMarket(e.target.value)} inputMode="decimal" className="h-10 w-full rounded-xl border border-cyan-300/20 bg-cyan-300/[.03] px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">Faixa mínima</span><input value={marketLow} onChange={e=>setMarketLow(e.target.value)} inputMode="decimal" className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">Faixa máxima</span><input value={marketHigh} onChange={e=>setMarketHigh(e.target.value)} inputMode="decimal" className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label></div><p className="mt-3 text-[11px] leading-5 text-zinc-600">Nesta V1, “Mercado observado” é informado manualmente. A arquitetura já separa esse dado para receber fontes externas na próxima etapa.</p></section>
        <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="mb-4 flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-300"/><h3 className="font-semibold">Classificação do estado</h3></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{level('Lataria/pintura',body,setBody)}{level('Interior',interior,setInterior)}{level('Pneus',tires,setTires)}{level('Mecânica',mechanical,setMechanical)}{level('Histórico/manutenção',history,setHistory)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase text-zinc-500">Estado geral</p><p className="mt-1 text-xl font-semibold text-emerald-300">{Math.round(calc.weighted)}/100 · {conditionLabel(calc.weighted)}</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase text-zinc-500">KM Score</p><p className="mt-1 text-xl font-semibold">{Math.round(calc.kmScore)}/100</p><p className="text-[10px] text-zinc-600">{num(km)?`${Math.round((calc.kmRatio-1)*100)}% vs. KM típico`: 'Informe o KM para comparar'}</p></div></div></section>
        <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="mb-4 flex items-center gap-2"><Calculator size={16} className="text-amber-300"/><h3 className="font-semibold">Custos para colocar no varejo</h3></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{costField('hygiene','Higienização')}{costField('bodywork','Funilaria / pintura')}{costField('dent','Martelinho')}{costField('tires','Pneus')}{costField('review','Revisão')}{costField('mechanical','Mecânica')}{costField('aesthetics','Estética / polimento')}{costField('transfer','Transferência')}{costField('purchaseTaxes','Impostos da compra')}{costField('documents','Documentação / taxas')}{costField('other','Outros')}</div><div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-3"><span className="text-xs text-zinc-500">Preparação + custos diretos</span><strong className="float-right text-amber-200">{money(calc.prep)}</strong></div></section>
        <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">Margem alvo %</span><input value={targetMargin} onChange={e=>setTargetMargin(e.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">Giro esperado (dias)</span><input value={expectedDays} onChange={e=>setExpectedDays(e.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">Custo capital a.a. %</span><input value={capitalRate} onChange={e=>setCapitalRate(e.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3"/></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">Liquidez</span><select value={liquidity} onChange={e=>setLiquidity(e.target.value as Liquidity)} className="h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3"><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label><label><span className="mb-1 block text-[10px] uppercase text-zinc-500">Tendência mercado</span><select value={trend} onChange={e=>setTrend(e.target.value as Trend)} className="h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3"><option value="up">Subindo</option><option value="stable">Estável</option><option value="down">Caindo</option></select></label></div></section>
       </div>
       <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
        <div className={`rounded-[26px] border p-5 ${calc.score>=65?'border-emerald-300/25 bg-emerald-300/[.05]':'border-amber-300/25 bg-amber-300/[.05]'}`}><p className="text-[10px] font-black uppercase tracking-[.16em] text-zinc-500">MOTYQ BUY SCORE</p><div className="mt-2 flex items-end justify-between gap-3"><span className="text-5xl font-semibold">{calc.score}</span><span className="mb-1 rounded-full border border-white/10 px-3 py-1 text-xs font-black">{riskLabel(calc.score)}</span></div><div className="mt-4 h-2 rounded-full bg-black/30"><div className="h-2 rounded-full bg-emerald-300" style={{width:`${calc.score}%`}}/></div></div>
        <div className="rounded-[26px] border border-cyan-300/20 bg-cyan-300/[.04] p-5"><p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-300">MARKET VALUE MOTYQ</p><p className="mt-2 text-3xl font-semibold">{money(calc.sell)}</p><p className="mt-1 text-xs text-zinc-500">Preço de varejo recomendado pela V1 após ajustes de estado, KM e tendência.</p>{num(fipe)>0&&<p className="mt-3 text-xs text-zinc-500">FIPE: <strong className="text-zinc-300">{money(num(fipe))}</strong></p>}</div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1"><div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.04] p-4"><p className="text-[10px] uppercase text-zinc-500">Compra segura</p><p className="mt-1 text-xl font-semibold text-emerald-300">{money(calc.safeBuy)}</p></div><div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.05] p-4"><p className="text-[10px] uppercase text-zinc-500">Compra recomendada</p><p className="mt-1 text-2xl font-semibold text-cyan-200">{money(calc.recommendedBuy)}</p></div><div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4"><p className="text-[10px] uppercase text-zinc-500">Compra agressiva</p><p className="mt-1 text-xl font-semibold text-amber-200">{money(calc.aggressiveBuy)}</p></div></div>
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-zinc-500">O que está pesando na conta</p><div className="mt-3 space-y-2 text-sm"><p className="flex justify-between"><span className="text-zinc-500">Preparação/custos</span><b>{money(calc.prep)}</b></p><p className="flex justify-between"><span className="text-zinc-500">Custo do capital</span><b>{money(calc.capitalCost)}</b></p><p className="flex justify-between"><span className="text-zinc-500">Reserva de risco</span><b>{money(calc.riskReserve)}</b></p><p className="flex justify-between border-t border-white/10 pt-2"><span className="text-zinc-500">Margem econômica no alvo</span><b>{money(calc.marginAtRecommended)}</b></p></div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-zinc-500"><div className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300"/><p><strong className="text-zinc-300">V1 de apoio à decisão.</strong> O Buy Score não substitui laudo técnico, histórico documental ou inspeção mecânica. Mercado externo ainda é entrada manual nesta versão.</p></div></div>
       </aside>
      </div>
    </div>
   </div>}
 </>;
};

export default MarketIQ;
