import React from 'react';
import './marketIqQuickDecision.css';
import {AlertTriangle,ArrowRight,BarChart3,CheckCircle2,Clock3,
 ClipboardCheck,History,MessageSquareText,SearchCheck,ShieldAlert,Warehouse} from 'lucide-react';
import type {DealerStockSnapshot} from '../services/marketIqDealerRadar';
import type {ComparableCloud} from '../services/marketIqComparableHistory';
import type {PurchaseRadarTarget} from '../services/marketIqPurchaseRadar';
import {buildQuickPurchaseDecision} from '../services/marketIqQuickDecision';

type Props={
 target:PurchaseRadarTarget;stock:DealerStockSnapshot|null;
 history:ComparableCloud[];companyId:string;
 offer:string;onOffer:(value:string)=>void;
 costs:string;onCosts:(value:string)=>void;
 costConfirmed:boolean;onCostConfirmed:(confirmed:boolean)=>void;
 repasse:boolean;marketPrice:number|null;marketAds:number;
 historicalEstimate:number|null;historicalRange:[number,number]|null;
 onFullAnalysis:()=>void;onRadar:()=>void;onHistory:()=>void;onQuote:()=>void;
};
const brl=(n:number|null|undefined)=>n===null||n===undefined||!Number.isFinite(n)?
 'A confirmar':n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const parseBR=(raw:string)=>{
 const text=raw.trim().replace(/^R\$\s*/i,'');
 if(!/^\d+(?:,\d{1,2})?$/.test(text)&&!/^(?:\d{1,3}\.)+\d{3}(?:,\d{1,2})?$/.test(text))return null;
 const result=Number(text.replace(/\./g,'').replace(',','.'));
 return Number.isFinite(result)&&result>=0&&result<=2000000?result:null;
};
const tile='rounded-xl border border-slate-200 bg-white p-3.5';
export default function MarketIqQuickDecisionPanel(p:Props){
 const preparation=parseBR(p.costs);
 const offer=parseBR(p.offer);
 const decision=buildQuickPurchaseDecision({
  target:p.target,snapshot:p.stock,saved:p.history,companyId:p.companyId,
  offer:offer!==null&&offer>0?offer:null,
  preparation:preparation??0,
  preparationConfirmed:p.costConfirmed&&preparation!==null,
  repasse:p.repasse,verifiedMarketPrice:p.marketPrice,verifiedAds:p.marketAds,
  historicalEstimate:p.historicalEstimate,historicalRange:p.historicalRange
 });
 const outcome=decision.opinion;
 const concise=decision.ceiling!==null?'Teto comercial com anúncios conferidos':
  decision.historical!==null?'Referência histórica preliminar':'Ainda sem valor sugerido';
 const mainValue=decision.ceiling??decision.historical;
 const confidence=decision.ceiling!==null?'Anúncios conferidos · simulação':
  decision.historical!==null?(p.target.vehicleType==='motorcycle'?'Mediana de valores avaliados · não são compras confirmadas':'Modelo estatístico · não é compra comprovada'):
  'Dados insuficientes';
 return <section aria-label="Decisão de compra em uma tela" className="space-y-3" id="motyq-iq-decision-board">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div>
    <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#14627d]"><ClipboardCheck size={17}/>Resumo de decisão</div>
    <h2 className="mt-1 text-xl font-black text-slate-950">Quanto vale oferecer neste veículo?</h2>
    <p className="mt-1 text-xs text-slate-600">FIPE, compras efetivas, estoque e custos em uma visão. Dados não confirmados são identificados.</p>
   </div>
   <button type="button" onClick={p.onFullAnalysis} disabled={!decision.identityReady}
    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-600 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-950 disabled:opacity-40">
    <SearchCheck size={16}/>Conferir fontes completas</button>
  </div>
  <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
   <div className="motyq-quick-decision-summary rounded-2xl border border-cyan-200 bg-[#153f51] p-5 text-white">
    <p className="text-xs font-bold text-cyan-100">{concise}</p>
    <p className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{brl(mainValue)}</p>
    <p className="mt-2 text-xs font-semibold text-cyan-100">{confidence}</p>
    {decision.ceiling!==null&&<p className="mt-2 text-xs leading-5 text-[#e2edf3]">
     {brl(p.marketPrice)} × 0,86 {p.repasse?'× 0,95 ':''} − {brl(preparation)} de preparo confirmado.
    </p>}
    {decision.ceiling===null&&decision.historical!==null&&<p className="mt-2 text-xs leading-5 text-[#e2edf3]">
     O histórico fornece apenas uma faixa indicativa, não o valor realmente pago neste veículo.
     {p.historicalRange?' Faixa do modelo: '+brl(p.historicalRange[0])+' a '+brl(p.historicalRange[1])+'.':''}
    </p>}
    <p className="mt-4 border-t border-white/20 pt-3 text-xs leading-5 text-cyan-100">
     {outcome?.title||'Complete a identificação do veículo'}
     {outcome?' · Confiança: '+outcome.confidence:''}.
     A decisão final e a aprovação da compra são humanas.
    </p>
   </div>
   <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-black text-slate-900">Simular minha proposta</h3>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
     <label className="block text-xs font-semibold text-slate-700">Quanto pretendo oferecer (R$)
      <input value={p.offer} onChange={e=>p.onOffer(e.target.value)} inputMode="decimal" placeholder="Ex.: 78000"
       className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"/>
     </label>
     <label className="block text-xs font-semibold text-slate-700">Preparo previsto (R$)
      <input value={p.costs} onChange={e=>p.onCosts(e.target.value)} inputMode="decimal" placeholder="Ex.: 2500"
       className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"/>
     </label>
    </div>
    <label className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-slate-700">
     <input type="checkbox" className="mt-1" checked={p.costConfirmed&&preparation!==null}
      disabled={preparation===null} onChange={e=>p.onCostConfirmed(e.target.checked)}/>
     Conferi o custo previsto de preparo, inclusive quando é zero.
    </label>
    {preparation===null&&<p role="alert" className="mt-2 text-xs text-rose-700">Digite um valor válido em reais, por exemplo 0, 2500 ou 2.500,00.</p>}
    {p.offer.trim()&&offer===null&&<p role="alert" className="mt-2 text-xs text-rose-700">Informe a oferta usando valores em reais.</p>}
    {decision.ceiling!==null&&offer!==null&&offer>0&&<p className={'mt-3 rounded-lg px-3 py-2.5 text-xs font-bold '+(offer>decision.ceiling?'bg-amber-50 text-amber-950':'bg-emerald-50 text-emerald-900')}>
     {offer>decision.ceiling?'Sua oferta supera o teto simulado em ':'Sua oferta está abaixo do teto simulado em '}
     {brl(Math.abs(offer-decision.ceiling))}.
    </p>}
   </div>
  </div>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <div className={tile}>
    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><CheckCircle2 size={15}/>FIPE</div>
    <strong className="mt-2 block text-lg font-black text-slate-950">{brl(Number(p.target.fipe)>0?p.target.fipe:null)}</strong>
    <p className={'mt-1 text-[11px] font-semibold '+(decision.fipeCurrent?'text-emerald-800':'text-amber-800')}>
     {decision.fipeCurrent?'Versão e mês conferidos':'Versão ou mês a confirmar'}
    </p>
   </div>
   <div className={tile}>
    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><History size={15}/>Compras pagas comparáveis</div>
    <strong className="mt-2 block text-lg font-black text-slate-950">{decision.similar?.paidCount||0} <span className="text-xs">no histórico carregado</span></strong>
    <p className="mt-1 text-[11px] text-slate-600">{brl(decision.similar?.paidMedian)} · mediana, consulta parcial</p>
   </div>
   <div className={tile}>
    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><Warehouse size={15}/>Estoque do Dealer</div>
    <strong className="mt-2 block text-lg font-black text-slate-950">
     {decision.radar?.snapshotAvailable?decision.radar.familyCount:'A carregar'} <span className="text-xs">da família</span>
    </strong>
    <p className="mt-1 text-[11px] text-slate-600">
     {decision.radar?.snapshotAvailable?decision.radar.over90Count+' acima de 90 dias · '+(decision.stockAge===null?'data não conferida':decision.stockAge+' dia(s) da base'):'Importe o relatório Dealer V44'}
    </p>
   </div>
   <div className={tile}>
    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><BarChart3 size={15}/>Mercado verificado</div>
    <strong className="mt-2 block text-lg font-black text-slate-950">{decision.verifiedMarket?brl(p.marketPrice):'Sem média confirmada'}</strong>
    <p className="mt-1 text-[11px] text-slate-600">{decision.verifiedMarket?p.marketAds+' anúncios individuais conferidos':'Não usar anúncios indexados como cotação'}</p>
   </div>
  </div>
  {decision.warnings.length>0&&<details className="rounded-xl border border-amber-200 bg-amber-50 p-3">
   <summary className="flex cursor-pointer items-center gap-2 text-xs font-bold text-amber-950">
    <AlertTriangle size={16}/>{decision.warnings.length} informação(ões) a confirmar antes de aprovar</summary>
   <ul className="mt-3 list-inside list-disc space-y-1 text-xs leading-5 text-amber-950">
    {decision.warnings.map(w=><li key={w}>{w}</li>)}
   </ul>
  </details>}
  <div className="flex flex-wrap items-center gap-2">
   <button type="button" onClick={p.onQuote} disabled={!decision.identityReady}
    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#153f51] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">
    <MessageSquareText size={16}/>Cotar na Mesa <ArrowRight size={14}/></button>
   <button type="button" onClick={p.onHistory} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">
    <History size={15}/>Ver histórico</button>
   <button type="button" onClick={p.onRadar} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">
    <Warehouse size={15}/>Abrir estoque</button>
  </div>
  <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-600">
   <ShieldAlert size={15} className="mt-0.5 shrink-0"/>
   Parecer preliminar. Nenhum cálculo representa compra aprovada, lucro líquido, preço efetivamente vendido ou vistoria. Consulte as fontes completas antes da decisão.
  </p>
 </section>;
}
