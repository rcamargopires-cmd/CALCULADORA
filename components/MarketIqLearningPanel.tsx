import React,{useMemo,useState} from 'react';
import type {User} from '../types';
import type {DashboardRow} from '../services/marketIqManagementData';
import {buildMarketIqLearning,type LearningHistoryRecord} from '../services/marketIqLearning';

const fmt=(n:number)=>n.toLocaleString('pt-BR');
const money=(value:number|null)=>value===null?'Aguardando dados':value.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const percent=(value:number|null)=>value===null?'Aguardando amostra':(value*100).toFixed(1).replace('.',',')+'%';

const importRows=(email:string):DashboardRow[]=>{
 try{
   const key='motyq-iq-dashboard-local-v2-all-vehicles-'+email.toLowerCase();
   const rows=JSON.parse(localStorage.getItem(key)||'[]');
   return Array.isArray(rows)?rows.filter((r:any)=>r&&
     (r.vehicleType==='car'||r.vehicleType==='motorcycle')&&
     ['COMPRA','COTACAO','REPASSE PENDENTE','REVISAR','OUTROS'].includes(r.status)
   ).slice(0,15000):[];
 }catch{return [];}
};

export default function MarketIqLearningPanel({
 user,history,onRefresh
}:{user:User;history:LearningHistoryRecord[];onRefresh:()=>Promise<void>}){
 const [version,setVersion]=useState(0);
 const [busy,setBusy]=useState(false);
 const records=useMemo(()=>importRows(user.email),[user.email,version]);
 const report=useMemo(()=>buildMarketIqLearning(records,history),[records,history,version]);
 const refresh=async()=>{
   if(busy)return;
   setBusy(true);
   try{await onRefresh();}finally{setVersion(n=>n+1);setBusy(false);}
 };
 return <section className="space-y-5 rounded-xl bg-white p-5 text-slate-950">
   <div className="flex flex-wrap items-start justify-between gap-3">
     <div>
       <h2 className="text-xl font-black">Motyq IQ · Aprendizado contínuo</h2>
       <p className="mt-1 max-w-3xl text-sm text-slate-700">
         A cada avaliação salva, aprovação ou compra registrada, o histórico online oferece novos resultados
         para comparar com a estimativa. As importações locais ajudam a entender o volume, os modelos e o funil.
         Motos e automóveis são analisados separadamente.
       </p>
     </div>
     <button type="button" disabled={busy} onClick={()=>void refresh()}
       className="rounded-lg bg-cyan-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">
       {busy?'Atualizando...':'Atualizar aprendizado'}
     </button>
   </div>
   <div className="grid gap-3 sm:grid-cols-3">
     <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
       <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Avaliações importadas neste navegador</p>
       <p className="mt-2 text-2xl font-black">{fmt(report.importedTotal)}</p>
     </div>
     <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
       <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Avaliações salvas na unidade</p>
       <p className="mt-2 text-2xl font-black">{fmt(report.cloudTotal)}</p>
     </div>
     <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
       <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Compras com valor realmente pago</p>
       <p className="mt-2 text-2xl font-black">{fmt(report.categories.reduce((n,c)=>n+c.cloudPaidCount,0))}</p>
     </div>
   </div>
   {records.length===0&&<p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
     Ainda não existe importação histórica neste navegador para esta conta.
     Abra o <strong>Painel gerencial</strong> e importe o relatório original para analisar avaliações e compras registradas.
     Nenhum arquivo Excel é enviado automaticamente para o servidor.
   </p>}
   <div className="grid gap-4 lg:grid-cols-2">
     {report.categories.map(category=><article key={category.kind} className="rounded-xl border border-slate-200 p-4">
       <h3 className="text-lg font-black">{category.kind==='car'?'Automóveis':'Motocicletas'}</h3>
       <p className="mt-1 text-xs text-slate-700">Indicadores atualizados com os registros disponíveis</p>
       <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
         <div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-600">Avaliações no arquivo</dt><dd className="text-xl font-bold">{fmt(category.importedEvaluations)}</dd></div>
         <div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-600">Status COMPRA no arquivo</dt><dd className="text-xl font-bold">{fmt(category.importedPurchases)}</dd></div>
         <div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-600">Valor aprovado na Mesa</dt><dd className="text-xl font-bold">{fmt(category.cloudApprovedCount)}</dd></div>
         <div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-600">Valor pago confirmado</dt><dd className="text-xl font-bold">{fmt(category.cloudPaidCount)}</dd></div>
       </dl>
       <div className="mt-4 space-y-3 text-sm">
         <div className="flex flex-wrap justify-between gap-2 border-b border-slate-200 pb-2">
           <span>Mediana de Valor avaliado/FIPE, status COMPRA</span>
           <strong>{percent(category.purchaseProxy.median)} <span className="font-normal text-slate-600">({category.purchaseProxy.count} registros)</span></strong>
         </div>
         <div className="flex flex-wrap justify-between gap-2 border-b border-slate-200 pb-2">
           <span>Mediana do valor aprovado/FIPE</span>
           <strong>{percent(category.approved.median)} <span className="font-normal text-slate-600">({category.approved.count})</span></strong>
         </div>
         <div className="flex flex-wrap justify-between gap-2 border-b border-slate-200 pb-2">
           <span>Mediana do preço efetivamente pago/FIPE</span>
           <strong>{percent(category.paid.median)} <span className="font-normal text-slate-600">({category.paid.count})</span></strong>
         </div>
         <div className="flex flex-wrap justify-between gap-2 border-b border-slate-200 pb-2">
           <span>Erro médio absoluto da estimativa frente ao valor pago</span>
           <strong>{money(category.paidEstimateMae)}</strong>
         </div>
       </div>
       <div className="mt-4 rounded-lg bg-cyan-50 p-3">
         <p className="text-sm font-bold text-cyan-950">
           {category.readiness==='validation_ready'?'Amostra candidata a validação':
            category.readiness==='collecting'?'Aprendendo com resultados confirmados':'Aguardando resultados confirmados'}
         </p>
         {category.calibrationCandidate?
           <p className="mt-1 text-xs text-cyan-900">Correção estatística candidata: {category.calibrationCandidate.percent>0?'+':''}{category.calibrationCandidate.percent}% da FIPE, com {category.calibrationCandidate.count} comparações reais e {category.calibrationCandidate.models} modelos. <strong>Não aplicada automaticamente</strong>: requer validação independente.</p>:
           <p className="mt-1 text-xs text-cyan-900">Para propor uma atualização segura do modelo, precisamos de pelo menos 30 compras com valor final registrado, FIPE e estimativa válidos, distribuídas por 5 modelos. Enquanto isso, o cálculo atual não será alterado automaticamente.</p>}
       </div>
     </article>)}
   </div>
   <p className="rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-700">
     <strong>Como o aprendizado funciona:</strong> avaliações importadas contam como observações de mercado.
     O status COMPRA no Excel ainda usa o campo <em>Valor avaliado</em>, que pode não ser o pagamento final;
     por isso ele fica separado da base de preços realmente pagos.
     Aprovações registradas no Motyq ensinam o comportamento da Mesa.
     Compras com valor efetivamente pago confirmado permitem medir o erro da estimativa e testar futuras calibrações.
     Nenhum preço é automaticamente alterado apenas por volume de avaliações.
   </p>
 </section>;
}
