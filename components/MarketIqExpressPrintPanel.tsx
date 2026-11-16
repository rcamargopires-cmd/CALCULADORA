import React,{useEffect,useMemo,useRef,useState} from 'react';
import {readExpressPrintLocally} from '../services/marketIqExpressBrowserOcr';
import {assessExpressCommercial,cleanExpressVehicle,type ExpressVehicleExtract,
 type ExpressAssessment,type ExpressCommercialClass} from '../services/marketIqExpress';

type Props={onClose:()=>void;onApply:(vehicle:ExpressVehicleExtract,assessment:ExpressAssessment)=>void;demoOnly?:boolean};
const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});

const initialVehicle=():ExpressVehicleExtract=>({
 brand:'',model:'',yearManufacture:'',yearModel:'',km:null,plate:'',
 fipeReference:null,conditionScore:null,repairTotal:null,repairDetails:[],warnings:[]
});
const input='mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950';
export default function MarketIqExpressPrintPanel({onClose,onApply,demoOnly=false}:Props){
 const fileRef=useRef<HTMLInputElement>(null);
 const [vehicle,setVehicle]=useState<ExpressVehicleExtract|null>(null);
 const [reading,setReading]=useState(false);
 const [readStatus,setReadStatus]=useState('');
 const [method,setMethod]=useState<'local'|'ai'|'sample'|null>(null);
 // Temporary local-only crop for visual confirmation. Never saved to history or the cloud.
 const [plateZoom,setPlateZoom]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [sample,setSample]=useState(false);
 const [demand,setDemand]=useState(false);
 const [zeroStock,setZeroStock]=useState(false);
 const [override,setOverride]=useState<'auto'|ExpressCommercialClass>('auto');
 const [reason,setReason]=useState('');
 const assessment=useMemo(()=>vehicle?assessExpressCommercial(vehicle,{
  demandConfirmed:demand,stockZeroConfirmed:zeroStock,
  manualClass:override==='auto'?null:override,manualReason:reason
 }):null,[vehicle,demand,zeroStock,override,reason]);
 const read=async(file?:File)=>{
  if(!file||reading)return;
  setError('');setVehicle(null);setReading(true);setSample(false);setDemand(false);setZeroStock(false);setOverride('auto');
  setReadStatus('Preparando print…');setMethod(null);setPlateZoom(null);
  try{
   // Free local OCR is the default both in Preview and inside the Mesa.
   // No image upload and no paid Gemini call during routine screenshot reading.
   const extracted=await readExpressPrintLocally(file,setReadStatus,setPlateZoom);
   setVehicle(extracted);setMethod('local');
  }catch(err){setError(err instanceof Error?err.message:'Falha ao ler a captura.');}
  finally{setReading(false);setReadStatus('');}
 };
 useEffect(()=>{
  const handler=(event:ClipboardEvent)=>{
   const file=[...(event.clipboardData?.files||[])].find(x=>x.type.startsWith('image/'));
   if(file){event.preventDefault();void read(file);}
  };
  window.addEventListener('paste',handler);
  return ()=>window.removeEventListener('paste',handler);
 },[reading,demoOnly]);
 const loadExample=()=>{
  setVehicle({brand:'CHEVROLET',model:'PRISMA LTZ 1.4 FLEX AUTOMÁTICO',yearManufacture:'2017',
   yearModel:'2018',km:95800,plate:'',fipeReference:62291,conditionScore:5.8,
   repairTotal:2000,repairDetails:['Lataria R$ 1.500','Motor R$ 500'],warnings:[]});
  setDemand(true);setZeroStock(true);setOverride('auto');setReason('');setError('');setSample(true);setMethod('sample');setPlateZoom(null);
 };
 const edit=(key:keyof ExpressVehicleExtract,value:any)=>setVehicle(previous=>previous?{...previous,[key]:value}:previous);
 return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/80 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Motyq IQ Express por print">
  <section className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white text-slate-950">
   <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
    <div><p className="text-xs font-black tracking-wider text-cyan-800">MOTYQ IQ EXPRESS · LABORATÓRIO</p>
     <h2 className="text-xl font-black">Prévia rápida por print</h2>
     <p className="mt-1 text-xs text-slate-600">{demoOnly?'Cole prints reais para testar a leitura local, sem login nem envio da imagem ao servidor.':'Cole um recorte da avaliação e revise os dados antes de aproveitar na Mesa.'}</p></div>
    <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">Fechar</button>
   </header>
   <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
    <section className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
     <h3 className="text-sm font-black text-cyan-950">1. {demoOnly?'Carregar exemplo':'Capturar dados'}</h3>
     {demoOnly?<p className="rounded-lg border border-cyan-300 bg-white p-3 text-xs font-semibold text-cyan-950">
      Novo: neste laboratório, o print é lido por OCR no próprio navegador. Não precisa de chave de IA nem de login, e a imagem não é enviada ao Motyq. Como a leitura é experimental, todos os campos precisam ser conferidos.
     </p>:<p className="text-xs leading-5 text-cyan-950">
      No AutoAvaliar, use <strong>Win + Shift + S</strong> e selecione a ficha do carro, incluindo marca, modelo, ano, KM e referências. Evite dados pessoais do cliente. O OCR roda localmente no navegador, sem enviar a imagem à IA ou gerar custo por chamada.
     </p>}
     <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
      aria-label="Selecionar print do AutoAvaliar" onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value='';void read(file);}}/>
     <div className="flex flex-wrap gap-2">
      <button type="button" disabled={reading} onClick={()=>fileRef.current?.click()}
       className="rounded-xl bg-cyan-800 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
       {reading?'Lendo print...':'Escolher print ou colar Ctrl+V'}</button>
      <button type="button" disabled={reading} onClick={loadExample}
       className="rounded-xl border border-cyan-700 bg-white px-4 py-3 text-xs font-bold text-cyan-950">Exemplo do Prisma</button>
     </div>
     {reading&&<p role="status" className="rounded-lg bg-white p-3 text-xs font-bold text-cyan-900">{readStatus||'Reconhecendo os campos…'}</p>}
     {sample&&<p className="text-xs font-bold text-cyan-950">Demonstração preenchida com os dados do print enviado e as informações de procura/estoque confirmadas por você. Não é uma consulta atualizada.</p>}
     {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-900">{error}</p>}
    </section>
    {vehicle&&<>
     <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-black">2. Conferir informações extraídas</h3>
      <div className="grid gap-3 sm:grid-cols-2">
       <label className="text-xs font-bold">Marca<input className={input} value={vehicle.brand} onChange={e=>edit('brand',e.target.value)}/></label>
       <label className="text-xs font-bold">Modelo e versão<input className={input} value={vehicle.model} onChange={e=>edit('model',e.target.value)}/></label>
       <label className="text-xs font-bold">Ano fabricação<input className={input} value={vehicle.yearManufacture} onChange={e=>edit('yearManufacture',e.target.value)}/></label>
       <label className="text-xs font-bold">Ano modelo<input className={input} value={vehicle.yearModel} onChange={e=>edit('yearModel',e.target.value)}/></label>
       <label className="text-xs font-bold">KM<input className={input} type="number" min={0} max={999999} value={vehicle.km??''}
        onChange={e=>edit('km',e.target.value===''?null:Number(e.target.value))}/></label>
       <label className="text-xs font-bold">Placa (conferir)<input className={input} maxLength={7} value={vehicle.plate}
        placeholder="ABC1D23" autoComplete="off" onChange={e=>edit('plate',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7))}/></label>
      </div>
      {plateZoom&&<div className="flex flex-col gap-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3 sm:flex-row sm:items-center">
       <div className="flex-1">
        <p className="text-xs font-black text-cyan-950">Placa ampliada diretamente do seu print</p>
        <p className="mt-1 text-xs text-cyan-900">Confira os 7 caracteres antes de consultar o histórico. Se o OCR não preencher, basta digitar a placa acima.</p>
       </div>
       <img src={plateZoom} alt="Trecho ampliado da placa na avaliação original" className="h-auto max-h-20 w-full max-w-xs rounded-lg border border-cyan-200 bg-white object-contain p-1 sm:w-52" />
      </div>}
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
       <div><p className="text-xs text-slate-600">FIPE exibida no print</p>
        <strong className="text-lg">{vehicle.fipeReference!==null?money(vehicle.fipeReference):'Não identificada'}</strong></div>
       <div><p className="text-xs text-slate-600">Reparos listados</p>
        <strong className="text-lg">{vehicle.repairTotal!==null?money(vehicle.repairTotal):'A conferir'}</strong></div>
       <div><p className="text-xs text-slate-600">Nota visual da avaliação</p>
        <strong>{vehicle.conditionScore===null?'Não identificada':vehicle.conditionScore.toLocaleString('pt-BR')+'/10'}</strong></div>
       <div><p className="text-xs text-slate-600">Origem</p><strong>{method==='sample'?'Exemplo do Prisma':method==='local'?'OCR local (experimental)':'IA para conferência'}</strong></div>
      </div>
      {vehicle.repairDetails.length>0&&<p className="text-xs text-slate-600">Itens: {vehicle.repairDetails.join(' · ')}</p>}
      {vehicle.warnings.length>0&&<p className="text-xs text-amber-800">Conferir: {vehicle.warnings.join('; ')}</p>}
      <p className="text-xs font-semibold text-amber-900">A FIPE do print não substitui a consulta do mês vigente. O valor de compra ainda depende do mercado, custos e histórico pago.</p>
     </section>
     <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-black">3. Prioridade comercial</h3>
      <p className="text-xs text-slate-600">A imagem não comprova procura nem estoque. Confirme essas informações da sua operação.</p>
      <label className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold">
       <input type="checkbox" checked={demand} onChange={e=>setDemand(e.target.checked)}/> Existe alta procura por este carro</label>
      <label className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold">
       <input type="checkbox" checked={zeroStock} onChange={e=>setZeroStock(e.target.checked)}/> Minha loja está sem esse modelo no estoque</label>
      <label className="block text-xs font-bold">Classificação (pode alterar manualmente)
       <select className={input} value={override} onChange={e=>setOverride(e.target.value as typeof override)}>
        <option value="auto">Sugerir conforme os sinais confirmados</option>
        <option value="SHOWROOM">SHOWROOM · prioridade de captação</option>
        <option value="NORMAL">COMPRA NORMAL · avaliar margem e giro</option>
        <option value="REPASSE">REPASSE · cotar com lojistas</option>
       </select></label>
      {override!=='auto'&&<label className="block text-xs font-bold">Motivo da alteração
       <input className={input} maxLength={280} value={reason} onChange={e=>setReason(e.target.value)}
        placeholder="Ex.: demanda especial, estoque, condição ou decisão da Mesa"/></label>}
      {assessment&&<div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
       <p className="text-xs font-bold text-emerald-900">Prioridade comercial {assessment.source==='operator_override'?'definida manualmente':'sugerida'}</p>
       <p className="text-xl font-black text-emerald-950">{assessment.priority}</p>
       <p className="text-xs text-emerald-900">{assessment.reason}</p>
       <p className="text-xs font-semibold text-slate-700">Diretriz técnica por KM: {assessment.fleetClass?'Classe '+assessment.fleetClass+' → '+assessment.fleetGuideline:'KM não confirmada'}</p>
       {assessment.policyConflict&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs font-bold text-amber-950">
        Atenção: a prioridade SHOWROOM por procura/estoque conflita com a diretriz de KM, que aponta REPASSE. Requer análise e autorização do gestor antes de alterar o destino operacional.
       </p>}
       {assessment.needsReview&&!assessment.policyConflict&&<p className="text-xs font-bold text-amber-900">Confira condição, custos e FIPE antes da aprovação.</p>}
      </div>}
     </section>
     <button type="button" disabled={!vehicle.brand.trim()||!vehicle.model.trim()||!vehicle.yearModel||vehicle.km===null||vehicle.km<0||vehicle.km>999999||(override!=='auto'&&!reason.trim())}
      onClick={()=>assessment&&onApply(vehicle,assessment)}
      className="w-full rounded-xl bg-[#153f51] p-4 text-sm font-black text-white disabled:opacity-50">
      {demoOnly?'Concluir teste deste print':'Usar dados conferidos na Mesa'}</button>
     <p className="text-center text-xs text-slate-600">{demoOnly?'Sem gravação ou envio da imagem. Confira a leitura e teste outros prints.':'Não salva avaliação, não aprova valor e não muda a classificação técnica automaticamente.'}</p>
    </>}
   </main>
  </section>
 </div>;
}
