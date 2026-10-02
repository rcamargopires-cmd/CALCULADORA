import React,{useEffect,useRef,useState} from 'react';
import { FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import type { DmsAttachment, DmsAttachmentCategory, User } from '../types';
import { dmsAttachmentService } from '../services/dmsAttachmentService';

type Props={
  currentUser:User;
  companyId:string;
  storeId:string;
  entityType:DmsAttachment['entityType'];
  entityId:string;
  vehicleId?:string;
  plate?:string;
  categories:Array<{value:DmsAttachmentCategory;label:string}>;
  title?:string;
  compact?:boolean;
};

const sizeLabel=(bytes:number)=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;

const DmsAttachmentManager:React.FC<Props>=({
  currentUser,companyId,storeId,entityType,entityId,vehicleId,plate,categories,title='Arquivos',compact=false,
})=>{
  const[items,setItems]=useState<DmsAttachment[]>([]);
  const[category,setCategory]=useState<DmsAttachmentCategory>(categories[0]?.value||'document');
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const fileRef=useRef<HTMLInputElement|null>(null);

  const load=async()=>{
    if(!entityId)return;
    try{setItems(await dmsAttachmentService.list(companyId,storeId,entityType,entityId));}
    catch(cause:any){setError(cause?.message||'Não foi possível carregar os anexos.');}
  };
  useEffect(()=>{void load();},[companyId,storeId,entityType,entityId]);

  const upload=async(files:FileList|null)=>{
    if(!files?.length)return;
    setBusy(true);setError('');
    try{
      for(const file of Array.from(files)){
        await dmsAttachmentService.upload({
          companyId,storeId,entityType,entityId,vehicleId,plate,category,file,actor:currentUser,
        });
      }
      await load();
    }catch(cause:any){setError(cause?.message||'Não foi possível enviar o arquivo.');}
    finally{setBusy(false);if(fileRef.current)fileRef.current.value='';}
  };

  const remove=async(item:DmsAttachment)=>{
    if(!window.confirm(`Remover o arquivo "${item.name}"?`))return;
    setBusy(true);setError('');
    try{await dmsAttachmentService.remove(item,currentUser);await load();}
    catch(cause:any){setError(cause?.message||'Não foi possível remover o arquivo.');}
    finally{setBusy(false);}
  };

  return <div className={`${compact?'mt-3':'mt-4'} rounded-2xl border border-white/10 bg-black/20 ${compact?'p-3':'p-4'}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Paperclip size={14} className="text-zinc-500"/><p className="text-xs font-semibold text-zinc-300">{title}</p><span className="text-[10px] text-zinc-600">{items.length}</span></div>
      <div className="flex flex-wrap gap-2">
        <select value={category} onChange={e=>setCategory(e.target.value as DmsAttachmentCategory)} className="h-9 rounded-xl border border-white/10 bg-zinc-900 px-2 text-[10px] text-white">{categories.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <button disabled={busy} onClick={()=>fileRef.current?.click()} className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 text-[10px] font-bold text-zinc-300 disabled:opacity-50"><Upload size={13}/>{busy?'ENVIANDO...':'ANEXAR'}</button>
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,.xml,text/xml,text/plain" className="hidden" onChange={e=>void upload(e.target.files)}/>
      </div>
    </div>
    {error&&<p className="mt-2 rounded-xl border border-red-400/15 bg-red-400/[.04] px-3 py-2 text-[10px] text-red-300">{error}</p>}
    {!!items.length&&<div className="mt-3 grid gap-2 sm:grid-cols-2">
      {items.map(item=><div key={item.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/50 p-2.5">
        <a href={item.url} target="_blank" rel="noreferrer" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[.04] text-zinc-500">{item.contentType.startsWith('image/')?<ImageIcon size={15}/>:<FileText size={15}/>}</a>
        <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-zinc-300">{item.name}</p><p className="mt-0.5 text-[9px] text-zinc-600">{categories.find(c=>c.value===item.category)?.label||item.category} · {sizeLabel(item.size)}</p></a>
        <button disabled={busy} onClick={()=>void remove(item)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-600 hover:bg-red-400/5 hover:text-red-300"><Trash2 size={13}/></button>
      </div>)}
    </div>}
    {!items.length&&!error&&<p className="mt-2 text-[10px] text-zinc-700">Nenhum arquivo anexado.</p>}
  </div>;
};

export default DmsAttachmentManager;
