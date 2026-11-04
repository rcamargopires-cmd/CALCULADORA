import React,{useEffect,useState} from 'react';
import {auth} from '../firebase';
import type {User} from '../types';

type ArchiveMonth={
 month:string;count:number;withWebReference?:number;
 classDifference?:number;sourceName?:string;importedAt?:string;
};
type State='checking'|'missing'|'matched'|'difference'|'unavailable';

const referenceCount=2666;
const num=(n:number)=>n.toLocaleString('pt-BR');

export default function MarketIqOctoberAudit({
 user,refreshKey,onOpenArchive
}:{user:User;refreshKey:number;onOpenArchive:()=>void}){
 const [status,setStatus]=useState<State>('checking');
 const [months,setMonths]=useState(0);
 const [october,setOctober]=useState<ArchiveMonth|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const check=async()=>{
   setStatus('checking');setError('');
   try{
    if(!auth.currentUser)throw Error('Entre novamente para consultar o arquivo mensal.');
    const token=await auth.currentUser.getIdToken();
    const response=await fetch('/api/marketiq-market-scan?action=monthly_archive_months',{
     method:'GET',headers:{authorization:'Bearer '+token},cache:'no-store',
     signal:AbortSignal.timeout(25000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(String(data.error||'Consulta não disponível.'));
    if(!active)return;
    const list:ArchiveMonth[]=Array.isArray(data.months)?data.months:[];
    const entry=list.find(m=>m.month==='2026-10')||null;
    setOctober(entry);setMonths(list.length);
    setStatus(!entry?'missing':entry.count===referenceCount?'matched':'difference');
   }catch(e:any){
    if(!active)return;
    setStatus('unavailable');
    setError(String(e?.message||'Não foi possível verificar o arquivo de outubro.'));
   }
  };
  void check();
  return ()=>{active=false;};
 },[user.email,refreshKey]);
 return <section className="rounded-xl border border-slate-200 bg-white p-4 text-slate-950 sm:p-5"
 aria-label="Conferência da base mensal de outubro">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h3 className="text-lg font-black">Conferência da base de outubro</h3>
    <p className="mt-1 text-sm text-slate-700">
     Consulta à importação na nuvem, não às planilhas abertas somente neste computador.
    </p>
   </div>
   <button type="button" onClick={onOpenArchive}
    className="rounded-lg border border-cyan-700 bg-white px-4 py-2.5 text-sm font-bold text-cyan-900 hover:bg-cyan-50">
    Abrir Arquivo mensal
   </button>
  </div>
  <div className="mt-3 grid gap-3 sm:grid-cols-3">
   <div className="rounded-lg bg-slate-50 p-3">
    <p className="text-xs font-bold text-slate-600">Referência informada para outubro</p>
    <p className="mt-1 text-xl font-black">{num(referenceCount)}</p>
   </div>
   <div className="rounded-lg bg-slate-50 p-3">
    <p className="text-xs font-bold text-slate-600">Avaliações arquivadas em outubro</p>
    <p className="mt-1 text-xl font-black">{october?num(october.count):
     status==='checking'?'Consultando...':status==='unavailable'?'Não verificado':'0'}</p>
   </div>
   <div className="rounded-lg bg-slate-50 p-3">
    <p className="text-xs font-bold text-slate-600">Meses importados na nuvem</p>
    <p className="mt-1 text-xl font-black">{status==='unavailable'?'—':status==='checking'?'...':num(months)}</p>
   </div>
  </div>
  {status==='matched'&&<p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">
   A contagem de outubro coincide com as {num(referenceCount)} avaliações da planilha de referência.
   A correspondência de quantidade não substitui a conferência de campos, IDs e eventuais revisões.
  </p>}
  {status==='difference'&&<p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
   Outubro tem {num(october?.count||0)} registros na nuvem, diferente dos {num(referenceCount)}
   da planilha de referência. Confira a versão do relatório, possíveis IDs duplicados e registros descartados.
   Isso não comprova perda de dados.
  </p>}
  {status==='missing'&&<p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
   Outubro de 2026 ainda não aparece entre os meses importados desta empresa.
   Abra o Arquivo mensal e importe o Excel original para iniciar a conferência.
  </p>}
  {status==='unavailable'&&<p role="alert" className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
   Não foi possível verificar os arquivos na nuvem: {error}
   {' '}Isso não significa que outubro esteja vazio.
  </p>}
  {status==='checking'&&<p role="status" className="mt-3 text-xs text-slate-600">Verificando o índice mensal autorizado...</p>}
  {october&&<p className="mt-3 text-xs text-slate-700">
   Fonte arquivada: {october.sourceName||'não identificada'}.
   {' '}Com referência Web: {num(october.withWebReference||0)}.
   {' '}Classes históricas diferentes da faixa atual de KM: {num(october.classDifference||0)}.
  </p>}
  <p className="mt-3 text-xs leading-5 text-slate-600">
   O arquivo mensal é uma fonte de consultas históricas.
   Ele não é automaticamente incluído nas métricas de acerto, porque não contém as estimativas
   originais do Motyq usadas na data da avaliação.
  </p>
 </section>;
}
