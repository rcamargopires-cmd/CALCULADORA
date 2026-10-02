import React,{useRef,useState} from 'react';
import { DatabaseZap, FileSpreadsheet, Upload, X } from 'lucide-react';
import type { User } from '../types';
import { dmsExternalImportService, type ExternalImportKind, type ExternalImportPreview } from '../services/dmsExternalImportService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
const LABEL:Record<ExternalImportKind,string>={stock:'Estoque',customers:'Clientes',suppliers:'Fornecedores',finance:'Financeiro'};

const DmsExternalImportPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const[open,setOpen]=useState(false);
  const[kind,setKind]=useState<'auto'|ExternalImportKind>('auto');
  const[preview,setPreview]=useState<ExternalImportPreview|null>(null);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const[message,setMessage]=useState('');
  const fileRef=useRef<HTMLInputElement|null>(null);

  const choose=async(file:File|null)=>{
    if(!file)return;
    setBusy(true);setError('');setMessage('');
    try{setPreview(await dmsExternalImportService.parse(file,kind==='auto'?undefined:kind));}
    catch(cause:any){setError(cause?.message||'Não foi possível ler a planilha.');setPreview(null);}
    finally{setBusy(false);}
  };
  const commit=async()=>{
    if(!preview)return;
    const text=preview.kind==='stock'
      ?'A importação de estoque passará a ser a nova base oficial desta unidade. Continuar?'
      :`Importar ${preview.normalized.length} linha(s) de ${LABEL[preview.kind]} para ${storeName}?`;
    if(!window.confirm(text))return;
    setBusy(true);setError('');setMessage('');
    try{
      const result=await dmsExternalImportService.commit({preview,companyId,storeId,actor:currentUser});
      setMessage(`Migração concluída: ${result.imported} importado(s), ${result.ignored} ignorado(s).`);
    }catch(cause:any){setError(cause?.message||'Não foi possível concluir a migração.');}
    finally{setBusy(false);}
  };

  return <>
    <button type="button" title="Migrar outro DMS" className="hidden" onClick={()=>setOpen(true)}>Migrar outro DMS</button>
    {open&&<div className="fixed inset-0 z-[299] overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-sm md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto max-w-5xl rounded-[30px] bg-white text-slate-900 shadow-2xl" onClick={event=>event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 md:p-7"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-teal-700">MOTYQ · MIGRAÇÃO</p><h2 className="mt-1 text-2xl font-semibold">Importar dados de outro DMS.</h2><p className="mt-2 text-sm text-slate-500">{storeName}. Aceita XLSX, XLS e CSV de estoque, clientes, fornecedores ou financeiro.</p></div><button onClick={()=>setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200"><X size={17}/></button></header>
        <div className="p-5 md:p-7">
          <section className="grid gap-3 md:grid-cols-[.65fr_1.35fr]">
            <label className="text-xs font-semibold text-slate-500">Tipo de dados<select value={kind} onChange={e=>{setKind(e.target.value as any);setPreview(null);}} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="auto">Detectar automaticamente</option><option value="stock">Estoque</option><option value="customers">Clientes</option><option value="suppliers">Fornecedores</option><option value="finance">Financeiro</option></select></label>
            <div><p className="text-xs font-semibold text-slate-500">Arquivo</p><button disabled={busy} onClick={()=>fileRef.current?.click()} className="mt-1.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-teal-300 bg-teal-50 text-sm font-bold text-teal-800 disabled:opacity-50"><Upload size={16}/>{busy?'LENDO...':'SELECIONAR PLANILHA'}</button><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>void choose(e.target.files?.[0]||null)}/></div>
          </section>
          {(error||message)&&<div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${error?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error||message}</div>}
          {preview&&<section className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><FileSpreadsheet size={17} className="text-teal-700"/><b>{preview.fileName}</b></div><p className="mt-1 text-xs text-slate-500">Aba: {preview.sheetName} · detectado: <b>{LABEL[preview.kind]}</b> · {preview.normalized.length} linhas</p></div><button disabled={busy} onClick={()=>void commit()} className="flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-bold text-white disabled:opacity-50"><DatabaseZap size={15}/> IMPORTAR PARA O MOTYQ</button></div>
            {!!preview.warnings.length&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{preview.warnings.map(item=><p key={item}>{item}</p>)}</div>}
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-[760px] w-full text-left text-[11px]"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr>{Object.keys(preview.normalized[0]||{}).map(key=><th key={key} className="p-2">{key}</th>)}</tr></thead><tbody>{preview.normalized.slice(0,10).map((row,index)=><tr key={index} className="border-b border-slate-100">{Object.keys(preview.normalized[0]||{}).map(key=><td key={key} className="max-w-[220px] truncate p-2 text-slate-600">{String(row[key]??'')}</td>)}</tr>)}</tbody></table></div><p className="mt-2 text-[10px] text-slate-400">Prévia das primeiras 10 linhas. O arquivo original não é alterado.</p>
          </section>}
        </div>
      </div>
    </div>}
  </>;
};
export default DmsExternalImportPanel;
