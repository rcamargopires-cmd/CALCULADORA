import React,{useRef,useState} from 'react';
import './marketIqSimpleHome.css';
import {
 ArrowRight,ArrowUpRight,Bot,CarFront,ChartNoAxesCombined,ChevronDown,
 ClipboardList,FileSpreadsheet,History,Layers3,MessageSquareText,
 Search,ShieldCheck,Sparkles,UploadCloud,Warehouse
} from 'lucide-react';
import {parseSimpleIqIntent,type SimpleIqDestination} from '../services/marketIqSimpleNavigation';
import type {MarketIqWorkbookDetection,MarketIqWorkbookKind} from '../services/marketIqSmartImport';

type HomeProps={
 onNavigate:(section:SimpleIqDestination,plate?:string)=>void;
 onOpenAdvanced:()=>void;
 onSelectImport:(kind:'dealer'|'evaluations')=>void;
 onSmartImport:(file:File,kind:MarketIqWorkbookKind,sheet:string)=>void;
 stockCount:number|null;
 stockDate:string|null;
 historyCount:number;
 historyBusy:boolean;
};
const primary=[
 {id:'pricing' as const,label:'Avaliar veículo',subtitle:'FIPE, mercado e preço',help:'Nova avaliação',
  icon:CarFront,tone:'bg-[#e6f6fc] text-[#106081]',border:'hover:border-[#9cd9ee]'},
 {id:'consulted' as const,label:'Cotação Mesa',subtitle:'Lojistas e propostas',help:'Consultar compradores',
  icon:MessageSquareText,tone:'bg-[#fff1e5] text-[#ac570d]',border:'hover:border-[#f2c398]'},
 {id:'radar' as const,label:'Meu estoque',subtitle:'Custos, giro e Radar',help:'Visualizar Dealer',
  icon:Warehouse,tone:'bg-[#e8f5ed] text-[#257649]',border:'hover:border-[#9fd0b3]'},
 {id:'dashboard' as const,label:'Resultados',subtitle:'Histórico e relatórios',help:'Ver indicadores',
  icon:ChartNoAxesCombined,tone:'bg-[#f1edff] text-[#624ba4]',border:'hover:border-[#cfc3f3]'}
];
const formatDate=(raw:string|null)=>{
 if(!raw||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw))return 'Data não informada';
 const [year,month,day]=raw.split('-');
 return day+'/'+month+'/'+year;
};
export default function MarketIqSimpleHome({
 onNavigate,onOpenAdvanced,onSelectImport,onSmartImport,stockCount,stockDate,historyCount,historyBusy
}:HomeProps){
 const [command,setCommand]=useState('');
 const [hint,setHint]=useState('');
 const [importOpen,setImportOpen]=useState(false);
 const smartFileRef=useRef<HTMLInputElement|null>(null);
 const [detecting,setDetecting]=useState(false);
 const [detected,setDetected]=useState<{file:File;result:MarketIqWorkbookDetection}|null>(null);
 const [detectError,setDetectError]=useState('');
 const detectFile=async(file?:File)=>{
  if(!file||detecting)return;
  setDetecting(true);setDetected(null);setDetectError('');
  try{
   const {detectMarketIqWorkbook}=await import('../services/marketIqSmartImport');
   const result=await detectMarketIqWorkbook(file);
   setDetected({file,result});
  }catch(error:any){setDetectError(String(error?.message||'Não foi possível reconhecer a planilha.'));}
  finally{setDetecting(false);}
 };

 const route=()=>{
  const match=parseSimpleIqIntent(command);
  if(!match){
   setHint('Não identifiquei a tarefa. Escolha uma das opções acima ou tente “avaliar veículo”, “cotar carro” ou “estoque”.');
   return;
  }
  setHint('');
  onNavigate(match.destination,match.plate);
 };
 return <section aria-label="Início simplificado do Motyq IQ" className="motyq-iq-simple-home space-y-5">
  <header className="motyq-iq-simple-hero relative overflow-hidden rounded-3xl bg-[#153f51] px-5 py-7 text-white shadow-sm sm:px-8 sm:py-9">
   <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-28 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl"/>
   <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-28 h-24 w-36 rounded-full bg-indigo-400/10 blur-2xl"/>
   <div className="relative max-w-3xl">
    <div className="motyq-iq-simple-kicker mb-3 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-200">
     <Sparkles size={15}/>MOTYQ IQ · Início simplificado
    </div>
    <h1 className="motyq-iq-simple-title text-2xl font-black tracking-tight text-white sm:text-3xl">
     {new Date().getHours()<12?'Bom dia':new Date().getHours()<18?'Boa tarde':'Boa noite'}, Mesa!
    </h1>
    <p className="motyq-iq-simple-subtitle mt-2 max-w-xl text-sm leading-6 text-[#e0edf4] sm:text-base">O que vamos fazer agora?</p>
    <p className="motyq-iq-simple-note mt-3 text-xs leading-5 text-cyan-100">
     A inteligência continua a mesma. A tela mostra só o próximo passo.
    </p>
   </div>
  </header>

  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Quatro tarefas principais">
   {primary.map(item=>{
    const Icon=item.icon;
    return <button type="button" key={item.id} onClick={()=>onNavigate(item.id)}
     className={'group flex min-h-[165px] flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 '+item.border}>
     <span className={'mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl '+item.tone}><Icon size={23}/></span>
     <span className="text-base font-black text-slate-950">{item.label}</span>
     <span className="mt-1 text-xs text-slate-600">{item.subtitle}</span>
     <span className="mt-auto flex items-center gap-1.5 pt-4 text-[11px] font-bold text-[#14627d]">{item.help}<ArrowUpRight size={13} className="transition group-hover:translate-x-0.5"/></span>
    </button>;
   })}
  </div>

  <div className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(270px,1fr)]">
   <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-3">
     <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-[#153f51]"><Bot size={22}/></span>
     <div><h2 className="text-sm font-black text-slate-900">Assistente de navegação M.O.T.Y.Q.</h2>
      <p className="text-xs leading-5 text-slate-600">Diga o que precisa fazer. Eu abro a tela certa.</p></div>
    </div>
    <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={e=>{e.preventDefault();route();}}>
     <label htmlFor="motyq-quick-task" className="sr-only">O que você quer fazer?</label>
     <input id="motyq-quick-task" value={command} maxLength={220}
      onChange={e=>{setCommand(e.target.value);setHint('');}}
      placeholder="Ex.: Cotar um carro, consultar estoque, avaliar ABC1D23"
      className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100"/>
     <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#153f51] px-5 text-sm font-black text-white hover:bg-[#25607a]">
      Abrir<ArrowRight size={16}/></button>
    </form>
    {hint&&<p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900">{hint}</p>}
    <p className="mt-3 text-[11px] leading-5 text-slate-500">
     Este assistente localiza funções. Não envia mensagens nem toma decisões de compra.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
     {(['Avaliar veículo','Cotação Mesa','Histórico por placa'] as const).map(label=>
      <button key={label} type="button" onClick={()=>{setCommand(label);setHint('');}}
       className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-cyan-300 hover:bg-cyan-50">{label}</button>)}
    </div>
   </div>
   <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2"><Layers3 size={18} className="text-[#14627d]"/>
     <h2 className="text-sm font-black text-slate-900">Informações já carregadas</h2></div>
    <div className="mt-4 space-y-4">
     <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-bold text-slate-700">Estoque do Dealer</p>
       <p className="text-[11px] text-slate-500">{stockCount===null?'Ainda não carregado':formatDate(stockDate)}</p></div>
      <span className="text-lg font-black tabular-nums text-slate-950">{stockCount===null?'—':stockCount.toLocaleString('pt-BR')}</span>
     </div>
     <div className="h-px bg-slate-100"/>
     <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-bold text-slate-700">Avaliações nesta consulta</p>
       <p className="text-[11px] text-slate-500">{historyBusy?'Atualizando histórico...':'Registros carregados, não total geral'}</p></div>
      <span className="text-lg font-black tabular-nums text-slate-950">{historyBusy?'…':historyCount.toLocaleString('pt-BR')}</span>
     </div>
    </div>
    <button type="button" onClick={()=>onNavigate('history')} className="mt-4 flex items-center gap-2 text-xs font-black text-[#14627d] hover:underline">
     Abrir histórico de avaliações<ArrowRight size={14}/></button>
   </div>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-3">
     <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e6f6fc] text-[#14627d]"><FileSpreadsheet size={21}/></span>
     <div><h2 className="text-sm font-black text-slate-900">Atualizar meus dados</h2>
      <p className="text-xs leading-5 text-slate-600">Cada arquivo no lugar certo, sem confundir estoque e avaliações.</p></div>
    </div>
    <button type="button" aria-expanded={importOpen} aria-controls="motyq-iq-import-guide"
     onClick={()=>setImportOpen(s=>!s)}
     className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50">
     Importar planilha<ChevronDown size={16} className={importOpen?'rotate-180':''}/></button>
   </div>
   {importOpen&&<div id="motyq-iq-import-guide" className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 sm:col-span-2">
     <p className="text-sm font-black text-slate-950">Importação inteligente</p>
     <p className="mt-1 text-xs text-slate-700">Selecione a planilha uma vez. O Motyq verifica as colunas, mostra o tipo reconhecido e pede sua confirmação antes de importar. O arquivo é analisado neste navegador.</p>
     <input ref={smartFileRef} type="file" accept=".xlsx,.xlsm,.xls"
      aria-label="Selecionar planilha para identificar"
      className="sr-only" onChange={event=>{const file=event.target.files?.[0];event.currentTarget.value='';void detectFile(file);}}/>
     <button type="button" onClick={()=>smartFileRef.current?.click()} disabled={detecting}
      className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#153f51] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
      <UploadCloud size={18}/>{detecting?'Analisando a planilha...':'Selecionar planilha'}</button>
     {detectError&&<p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-white p-3 text-xs font-semibold text-amber-900">{detectError}</p>}
     {detected&&<div role="status" className="mt-3 rounded-xl border border-emerald-200 bg-white p-4">
      <p className="text-sm font-black text-emerald-900">{detected.result.headline}</p>
      <p className="mt-1 break-all text-xs font-semibold text-slate-800">{detected.file.name} · aba {detected.result.sheet}</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{detected.result.description}</p>
      <button type="button" onClick={()=>onSmartImport(detected.file,detected.result.kind,detected.result.sheet)}
       className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white hover:bg-emerald-800">
       Conferir e importar no local correto <ArrowRight size={16}/></button>
     </div>}
    </div>
    <p className="text-[11px] font-bold text-slate-600 sm:col-span-2">Ou acesse os importadores manualmente:</p>
    <button type="button" onClick={()=>onSelectImport('dealer')}
     className="flex items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 text-left hover:bg-cyan-50">
     <Warehouse size={19} className="shrink-0 text-[#14627d]"/>
     <span><strong className="block text-sm text-slate-900">Estoque Dealer V44</strong>
      <span className="mt-1 block text-xs text-slate-600">Atualizar veículos, custos e giro no Radar.</span></span>
     <ArrowRight size={15} className="ml-auto shrink-0 text-cyan-800"/></button>
    <button type="button" onClick={()=>onSelectImport('evaluations')}
     className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-left hover:bg-indigo-50">
     <ClipboardList size={19} className="shrink-0 text-indigo-700"/>
     <span><strong className="block text-sm text-slate-900">Avaliações AutoAvaliar</strong>
      <span className="mt-1 block text-xs text-slate-600">Histórico mensal de avaliações e valores.</span></span>
     <ArrowRight size={15} className="ml-auto shrink-0 text-indigo-700"/></button>
    <p className="text-[11px] leading-5 text-slate-500 sm:col-span-2">
     A identificação é automática, mas você confirma a importação. Caso o formato não seja reconhecido, use os importadores manuais. Meses já arquivados exigem confirmação adicional.
    </p>
   </div>}
  </div>

  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-1 pt-4">
   <div className="flex flex-wrap gap-3">
    <button type="button" onClick={()=>onNavigate('approvals')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#14627d]">
     <ShieldCheck size={15}/>Aprovações</button>
    <button type="button" onClick={()=>onNavigate('learning')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#14627d]">
     <Search size={15}/>Aprendizado IQ</button>
    <button type="button" onClick={()=>onNavigate('archive')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#14627d]">
     <History size={15}/>Arquivo mensal</button>
   </div>
   <button type="button" onClick={onOpenAdvanced} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14627d] hover:underline">
    <ClipboardList size={15}/>Ver todas as ferramentas<ArrowRight size={14}/></button>
  </div>
 </section>;
}
