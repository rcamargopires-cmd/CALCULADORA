import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Clipboard, ExternalLink, FileCheck2, FileText,
  FolderCheck, History, Search, Sparkles, UploadCloud, UserRound, X
} from 'lucide-react';
import { User } from '../types';
import { extractTradeCheckDocuments, TradeCheckExtractedData } from '../services/tradeCheckAiService';

type Props = { currentUser: User };
type FormState = TradeCheckExtractedData;
type StepKey = 'tjsp' | 'pge' | 'detran' | 'sivei' | 'pedagio' | 'term';
type Mode = 'home' | 'new' | 'history';
type Stage = 'upload' | 'review' | 'research';
type UploadKey = 'cnh' | 'crlv' | 'cadastro';
type Uploads = Partial<Record<UploadKey, File>>;
type Persisted = { form: FormState; completed: Record<StepKey, boolean>; stage: Stage };
type HistoryItem = { id: string; ownerName: string; plate: string; vehicle: string; completedAt: string; sellerName: string };

const initialForm: FormState = {
  ownerName: '', cpf: '', rg: '', birthDate: '', address: '', cep: '', city: 'Sorocaba', phone: '',
  brand: '', model: '', yearFab: '', yearModel: '', color: '', plate: '', chassis: '', renavam: '',
};
const initialCompleted: Record<StepKey, boolean> = { tjsp:false, pge:false, detran:false, sivei:false, pedagio:false, term:false };

const researchSteps = [
  { key:'tjsp' as const, label:'TJSP / e-SAJ', url:'https://esaj.tjsp.jus.br/cpopg/open.do', hint:'Pesquisar pelo CPF do proprietário', copy:(f:FormState)=>f.cpf },
  { key:'pge' as const, label:'Dívida Ativa PGE', url:'https://www.dividaativa.pge.sp.gov.br/sc/pages/pagamento/gareLiquidacao.jsf', hint:'Usar CPF e RENAVAM', copy:(f:FormState)=>`CPF: ${f.cpf}\nRENAVAM: ${f.renavam}` },
  { key:'detran' as const, label:'Detran-SP', url:'https://www.detran.sp.gov.br/detransp/pb/servicos/veiculos/consultar_debitos_restricoes?id=consultar_debitos_restricoes', hint:'Usar placa e RENAVAM', copy:(f:FormState)=>`PLACA: ${f.plate}\nRENAVAM: ${f.renavam}` },
  { key:'sivei' as const, label:'SIVEI / Fazenda', url:'https://www3.fazenda.sp.gov.br/SIVEI/DebitosVinculados/Consulta', hint:'Consulta de débitos vinculados', copy:(f:FormState)=>`PLACA: ${f.plate}\nRENAVAM: ${f.renavam}` },
  { key:'pedagio' as const, label:'Pedágio Digital', url:'https://www.pedagiodigital.com/', hint:'Consultar pela placa', copy:(f:FormState)=>f.plate },
];

const safe = (v:string) => String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]||c));
const formatDate = (iso:string) => { try { return new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); } catch { return iso; } };

const TradeCheckPanel: React.FC<Props> = ({ currentUser }) => {
  const draftKey = `motyq:tradecheck:draft:${currentUser.email}`;
  const historyKey = `motyq:tradecheck:history:${currentUser.email}`;
  const [open,setOpen] = useState(false);
  const [mode,setMode] = useState<Mode>('home');
  const [stage,setStage] = useState<Stage>('upload');
  const [uploads,setUploads] = useState<Uploads>({});
  const [consent,setConsent] = useState(false);
  const [form,setForm] = useState<FormState>(initialForm);
  const [completed,setCompleted] = useState<Record<StepKey,boolean>>(initialCompleted);
  const [history,setHistory] = useState<HistoryItem[]>([]);
  const [copied,setCopied] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');

  useEffect(()=>{
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const saved = JSON.parse(raw) as Persisted;
        if (saved.form) setForm({...initialForm,...saved.form});
        if (saved.completed) setCompleted({...initialCompleted,...saved.completed});
        if (saved.stage && saved.stage !== 'upload') setStage(saved.stage);
      }
      const old = localStorage.getItem(historyKey);
      if (old) setHistory(JSON.parse(old) as HistoryItem[]);
    } catch {}
  },[draftKey,historyKey]);

  useEffect(()=>{
    if (stage === 'upload') return;
    try { localStorage.setItem(draftKey,JSON.stringify({form,completed,stage})); } catch {}
  },[draftKey,form,completed,stage]);

  const doneCount = useMemo(()=>Object.values(completed).filter(Boolean).length,[completed]);
  const ready = doneCount === 6;
  const criticalReady = Boolean(form.ownerName && form.cpf && form.plate && form.renavam);

  const update = (key:keyof FormState,value:string) => setForm(prev=>({...prev,[key]:value}));
  const toggle = (key:StepKey) => setCompleted(prev=>({...prev,[key]:!prev[key]}));

  const copyText = async (text:string,label:string) => {
    try { await navigator.clipboard.writeText(text||''); setCopied(label); window.setTimeout(()=>setCopied(''),1400); } catch {}
  };

  const chooseFile = (key:UploadKey,file?:File) => {
    setError('');
    if (!file) return;
    if (file.size > 8*1024*1024) { setError(`${file.name} excede 8 MB.`); return; }
    setUploads(prev=>({...prev,[key]:file}));
  };

  const startNew = () => {
    setMode('new'); setStage('upload'); setUploads({}); setConsent(false); setForm(initialForm); setCompleted(initialCompleted); setError('');
    try { localStorage.removeItem(draftKey); } catch {}
  };

  const readDocuments = async () => {
    if (!uploads.cnh || !uploads.crlv || !uploads.cadastro) { setError('Envie CNH, CRLV-e e o print do cadastro.'); return; }
    if (!consent) { setError('Confirme a autorização para leitura dos documentos.'); return; }
    setBusy(true); setError('');
    try {
      const extracted = await extractTradeCheckDocuments({cnh:uploads.cnh,crlv:uploads.crlv,cadastro:uploads.cadastro});
      setForm({...initialForm,...extracted});
      setStage('review');
    } catch (e:any) {
      setError(e?.message || 'Não foi possível fazer a leitura automática. Você pode preencher os dados manualmente.');
      setStage('review');
    } finally { setBusy(false); }
  };

  const generateTerm = () => {
    const required: Array<keyof FormState> = ['ownerName','cpf','rg','birthDate','address','cep','city','phone','brand','model','yearFab','yearModel','color','plate','chassis'];
    const missing = required.filter(key=>!String(form[key]||'').trim());
    if (missing.length) { setError('Complete os dados do cliente e do veículo antes de gerar o termo.'); return; }
    setError('');
    const w = window.open('','_blank'); if (!w) return;
    const d = new Date();
    const day = String(d.getDate()).padStart(2,'0');
    const month = d.toLocaleDateString('pt-BR',{month:'long'});
    const year = d.getFullYear();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Termo de Responsabilidade - ${safe(form.plate)}</title><style>
      body{font-family:Arial,sans-serif;color:#111;margin:22mm;line-height:1.4;font-size:11.5px}h1{text-align:center;font-size:17px;margin:0 0 22px}p{margin:9px 0}.f{font-weight:700}.sig{margin-top:42px;text-align:center}.noprint{text-align:center;margin-top:24px}@media print{.noprint{display:none}body{margin:16mm}}
    </style></head><body><h1>TERMO DE RESPONSABILIDADE</h1>
      <p>Eu, <span class="f">${safe(form.ownerName)}</span>, portador do CPF nº <span class="f">${safe(form.cpf)}</span> e R.G. nº <span class="f">${safe(form.rg)}</span>, nascido em <span class="f">${safe(form.birthDate)}</span>, residente à <span class="f">${safe(form.address)}</span>, CEP <span class="f">${safe(form.cep)}</span>, município de <span class="f">${safe(form.city)}</span>, telefone <span class="f">${safe(form.phone)}</span>, declaro para todos os fins e efeitos de direito, que vendi nesta data o veículo a seguir descrito, de minha propriedade, livre e desembaraçado de quaisquer ônus ou restrições ao GRUPO ABRÃO REZE, que é composto pelas seguintes empresas: ABRÃO REZE COMÉRCIO DE VEÍCULOS LTDA inscrita no CNPJ: 49.708.811/0001-30, e suas filiais (CNPJ: 49.708.811/0006-45, CNPJ: 49.708.811/0009-98, CNPJ: 49.708.811/0011-02 e CNPJ: 49.708.811/0012-93), CVR VEÍCULOS LTDA inscrita no CNPJ: 08.416.421/0001-00 e sua filial CNPJ: 08.416.421/0005-33, MOTONET COMÉRCIO DE VEÍCULOS LTDA inscrita no CNPJ: 09.277.968/0001-34, A.CENTER SOROCABA COMÉRCIO DE VEÍCULOS LTDA inscrita no CNPJ: 20.141.163/0001-00, DVU COMÉRCIO DE VEÍCULOS LTDA inscrita no CNPJ: 10.504.333/0001-01, AUTOZOE COMÉRCIO DE VEÍCULOS LTDA inscrita no CNPJ: 11.103.616/0001-04, REMOB COMÉRCIO DE VEÍCULOS LTDA inscrita no CNPJ: 26.609.106/0001-80.</p>
      <p><b>Características do Veículo</b><br>Marca <span class="f">${safe(form.brand)}</span> &nbsp; Modelo <span class="f">${safe(form.model)}</span> &nbsp; ano/modelo <span class="f">${safe(form.yearFab)}/${safe(form.yearModel)}</span> &nbsp; Cor <span class="f">${safe(form.color)}</span> &nbsp; placas <span class="f">${safe(form.plate)}</span> &nbsp; Chassi <span class="f">${safe(form.chassis)}</span>.</p>
      <p>Declaro ainda, que estou ciente de minhas responsabilidades quanto ao veículo ora transacionado, quer na esfera civil quanto criminal e, fornecendo neste ato toda e qualquer documentação relativa ao veículo, responsabilizando-me ainda, pela boa procedência, pela regularidade da documentação, por todas as multas de trânsito, eventual diferença de recolhimento de IPVA e outros quaisquer, ainda que futuramente lançados e, quando tratar-se de veículo importado, por eventual direito de regresso se sobre o mesmo recair qualquer ônus ou dívida que possa inviabilizar a sua transferência ao adquirente, encargos esses que me comprometo a pagar assim que cientificado para tal fim, autorizando neste ato e por este instrumento promover a cobrança através de instituição financeira, mediante a emissão de boleto bancário.</p>
      <p>No caso de serem os referidos encargos quitados pelo comprador acima qualificado, ficará o mesmo sub-rogado nestes créditos, ficando expressamente convencionado que se o comprador tiver de promover a execução judicial de seu crédito, o mesmo será acrescido de juros moratórios de 1% (um por cento) ao mês, mais multa de 2% (dois por cento) e mais correção, sujeitando-se ainda ao pagamento das custas e despesas processuais além da verba honorária de 20% (vinte por cento) sobre o valor da causa.</p>
      <p>Por ser verdade, firmo o presente.</p><p>Sorocaba, ${day} de ${safe(month)} de ${year}.</p>
      <div class="sig">_____________________________________________<br><b>${safe(form.ownerName)}</b><br><small>(reconhecer por autenticidade)</small></div>
      <div class="noprint"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div></body></html>`);
    w.document.close();
    setCompleted(prev=>({...prev,term:true}));
  };

  const finalize = () => {
    if (!ready) return;
    const item:HistoryItem = { id:`${Date.now()}`, ownerName:form.ownerName, plate:form.plate, vehicle:`${form.brand} ${form.model}`.trim(), completedAt:new Date().toISOString(), sellerName:currentUser.name };
    const next = [item,...history].slice(0,100);
    setHistory(next);
    try { localStorage.setItem(historyKey,JSON.stringify(next)); localStorage.removeItem(draftKey); } catch {}
    setForm(initialForm); setCompleted(initialCompleted); setUploads({}); setConsent(false); setStage('upload'); setMode('history');
    window.open('https://app.vianuvem.com.br/auto/home','_blank','noopener,noreferrer');
  };

  return <>
    <button onClick={()=>{setOpen(true);setMode('home')}} className="fixed bottom-5 right-5 z-[180] flex items-center gap-2 rounded-2xl border border-sky-400/25 bg-[#17202b] px-4 py-3 text-sm font-bold text-sky-200 shadow-2xl hover:bg-[#1d2936]">
      <Search size={17}/> TradeCheck
    </button>

    {open && <div className="fixed inset-0 z-[600] overflow-y-auto bg-black/80 p-3 backdrop-blur-sm md:p-6">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-[#171b21] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-6">
          <div className="flex items-start gap-3">
            {mode!=='home' && <button onClick={()=>setMode('home')} className="mt-0.5 rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white"><ArrowLeft size={17}/></button>}
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">MOTYQ · TRADECHECK</p><h2 className="mt-1 text-2xl font-semibold text-white">{mode==='home'?'Pesquisas da troca':mode==='history'?'Histórico':'Novo TradeCheck'}</h2><p className="mt-1 text-sm text-zinc-400">Exclusivo para vendedores.</p></div>
          </div>
          <button onClick={()=>setOpen(false)} className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white"><X size={18}/></button>
        </div>

        <div className="p-5 md:p-6">
          {mode==='home' && <div className="grid gap-4 md:grid-cols-2">
            <button onClick={startNew} className="group rounded-3xl border border-sky-400/20 bg-sky-400/[0.04] p-7 text-left transition hover:bg-sky-400/[0.08]"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-sky-400/10 text-sky-300"><Sparkles size={23}/></div><h3 className="text-xl font-semibold text-white">Novo TradeCheck</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Envie CNH, CRLV-e e print do cadastro. O Motyq lê os dados e monta o dossiê.</p></button>
            <button onClick={()=>setMode('history')} className="group rounded-3xl border border-white/10 bg-white/[0.03] p-7 text-left transition hover:bg-white/[0.06]"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-zinc-300"><History size={23}/></div><h3 className="text-xl font-semibold text-white">Histórico</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Consulte os TradeChecks concluídos por este vendedor.</p><p className="mt-4 text-xs font-bold text-sky-300">{history.length} concluído{history.length===1?'':'s'}</p></button>
          </div>}

          {mode==='history' && <div>
            <div className="mb-4 flex justify-end"><button onClick={startNew} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-black">+ NOVO TRADECHECK</button></div>
            {history.length===0 ? <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center"><History className="mx-auto text-zinc-700"/><p className="mt-3 font-semibold text-zinc-300">Nenhum TradeCheck concluído ainda.</p></div> : <div className="space-y-3">{history.map(item=><div key={item.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-semibold text-white">{item.ownerName}</p><p className="mt-1 text-sm text-zinc-400"><b className="text-sky-300">{item.plate}</b>{item.vehicle?` · ${item.vehicle}`:''}</p><p className="mt-1 text-xs text-zinc-600">Concluído em {formatDate(item.completedAt)}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300"><CheckCircle2 size={14}/> COMPLETO</span></div>)}</div>}
          </div>}

          {mode==='new' && <div>
            <div className="mb-6 flex items-center gap-2 text-xs font-semibold"><span className={stage==='upload'?'text-sky-300':'text-emerald-300'}>1. DOCUMENTOS</span><span className="text-zinc-700">›</span><span className={stage==='review'?'text-sky-300':stage==='research'?'text-emerald-300':'text-zinc-600'}>2. CONFERÊNCIA</span><span className="text-zinc-700">›</span><span className={stage==='research'?'text-sky-300':'text-zinc-600'}>3. PESQUISAS</span></div>
            {error && <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-200">{error}</div>}

            {stage==='upload' && <div>
              <div className="grid gap-4 md:grid-cols-3">
                <UploadCard title="CNH" subtitle="Do proprietário" file={uploads.cnh} onFile={f=>chooseFile('cnh',f)}/>
                <UploadCard title="CRLV-e" subtitle="Do veículo da troca" file={uploads.crlv} onFile={f=>chooseFile('crlv',f)}/>
                <UploadCard title="Cadastro" subtitle="Print da tela do cliente" file={uploads.cadastro} onFile={f=>chooseFile('cadastro',f)}/>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 text-xs leading-5 text-zinc-400"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1"/><span>Confirmo a leitura destes documentos. Os arquivos serão enviados ao serviço de IA configurado no Motyq para extrair os dados e não serão gravados no histórico local desta versão.</span></label>
              <button disabled={busy||!uploads.cnh||!uploads.crlv||!uploads.cadastro||!consent} onClick={readDocuments} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-400 text-sm font-bold text-slate-950 disabled:opacity-40"><Sparkles size={17}/>{busy?'Lendo documentos...':'LER DOCUMENTOS AUTOMATICAMENTE'}</button>
            </div>}

            {stage==='review' && <div>
              <div className="mb-5 rounded-2xl border border-sky-400/15 bg-sky-400/[0.04] p-4 text-sm text-zinc-300"><b className="text-sky-300">Confira antes de continuar.</b> O vendedor continua responsável por validar CPF, placa, RENAVAM e demais dados lidos.</div>
              <DataForm form={form} update={update}/>
              <button disabled={!criticalReady} onClick={()=>{setError('');setStage('research')}} className="mt-5 h-12 w-full rounded-2xl bg-white text-sm font-bold text-black disabled:opacity-40">CONFIRMAR DADOS E INICIAR PESQUISAS</button>
              {!criticalReady && <p className="mt-2 text-center text-xs text-zinc-600">Nome, CPF, placa e RENAVAM são obrigatórios.</p>}
            </div>}

            {stage==='research' && <div>
              <div className="mb-5 flex items-center justify-between gap-4"><div><p className="font-semibold text-white">{form.ownerName}</p><p className="text-sm text-zinc-500">{form.plate} · {form.brand} {form.model}</p></div><span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-300">{doneCount}/6</span></div>
              <div className="grid gap-3 md:grid-cols-2">{researchSteps.map(step=><div key={step.key} className={`rounded-2xl border p-4 ${completed[step.key]?'border-emerald-400/20 bg-emerald-400/[0.05]':'border-white/10 bg-white/[0.02]'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{step.label}</p><p className="mt-1 text-xs text-zinc-500">{step.hint}</p></div><button onClick={()=>toggle(step.key)} className={completed[step.key]?'text-emerald-300':'text-zinc-700'}><CheckCircle2 size={22}/></button></div><div className="mt-4 flex gap-2"><button onClick={()=>window.open(step.url,'_blank','noopener,noreferrer')} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-black"><ExternalLink size={14}/> ABRIR</button><button onClick={()=>copyText(step.copy(form),step.key)} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300"><Clipboard size={14}/>{copied===step.key?'COPIADO':'COPIAR'}</button></div></div>)}</div>
              <div className={`mt-3 rounded-2xl border p-4 ${completed.term?'border-emerald-400/20 bg-emerald-400/[0.05]':'border-white/10 bg-white/[0.02]'}`}><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-white">Termo de Responsabilidade de Multas</p><p className="mt-1 text-xs text-zinc-500">Gerado com os dados conferidos acima.</p></div>{completed.term?<FileCheck2 className="text-emerald-300"/>:<FileText className="text-zinc-700"/>}</div><button onClick={generateTerm} className="mt-4 w-full rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs font-bold text-sky-200">GERAR TERMO PREENCHIDO</button></div>
              <button disabled={!ready} onClick={finalize} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 text-sm font-bold text-emerald-950 disabled:opacity-35"><FolderCheck size={17}/>{ready?'FINALIZAR E ABRIR VIA NUVEM':'CONCLUA AS 5 PESQUISAS + TERMO'}</button>
              <button onClick={()=>setStage('review')} className="mt-3 w-full text-xs font-semibold text-zinc-500 hover:text-white">Voltar e corrigir dados</button>
            </div>}
          </div>}
        </div>
      </div>
    </div>}
  </>;
};

const UploadCard = ({title,subtitle,file,onFile}:{title:string;subtitle:string;file?:File;onFile:(file?:File)=>void}) => <label className={`cursor-pointer rounded-3xl border border-dashed p-6 text-center transition ${file?'border-emerald-400/25 bg-emerald-400/[0.04]':'border-white/15 bg-white/[0.02] hover:bg-white/[0.05]'}`}><input className="hidden" type="file" accept="image/*,application/pdf" onChange={e=>onFile(e.target.files?.[0])}/>{file?<FileCheck2 className="mx-auto text-emerald-300"/>:<UploadCloud className="mx-auto text-sky-300"/>}<p className="mt-3 font-semibold text-white">{title}</p><p className="mt-1 text-xs text-zinc-500">{file?file.name:subtitle}</p></label>;

const Field = ({label,value,onChange,wide}:{label:string;value:string;onChange:(v:string)=>void;wide?:boolean}) => <label className={wide?'sm:col-span-2':''}><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span><input value={value} onChange={e=>onChange(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-sky-400/30"/></label>;

const DataForm = ({form,update}:{form:FormState;update:(key:keyof FormState,value:string)=>void}) => <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-4 flex items-center gap-2"><UserRound size={17} className="text-sky-300"/><h3 className="font-semibold text-white">Proprietário</h3></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Nome completo" value={form.ownerName} onChange={v=>update('ownerName',v)} wide/><Field label="CPF" value={form.cpf} onChange={v=>update('cpf',v)}/><Field label="RG" value={form.rg} onChange={v=>update('rg',v)}/><Field label="Nascimento" value={form.birthDate} onChange={v=>update('birthDate',v)}/><Field label="Telefone" value={form.phone} onChange={v=>update('phone',v)}/><Field label="Endereço" value={form.address} onChange={v=>update('address',v)} wide/><Field label="CEP" value={form.cep} onChange={v=>update('cep',v)}/><Field label="Município" value={form.city} onChange={v=>update('city',v)}/></div></section><section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-4 flex items-center gap-2"><FileText size={17} className="text-sky-300"/><h3 className="font-semibold text-white">Veículo da troca</h3></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Marca" value={form.brand} onChange={v=>update('brand',v)}/><Field label="Modelo" value={form.model} onChange={v=>update('model',v)}/><Field label="Ano fabricação" value={form.yearFab} onChange={v=>update('yearFab',v)}/><Field label="Ano modelo" value={form.yearModel} onChange={v=>update('yearModel',v)}/><Field label="Cor" value={form.color} onChange={v=>update('color',v)}/><Field label="Placa" value={form.plate} onChange={v=>update('plate',v.toUpperCase())}/><Field label="Chassi" value={form.chassis} onChange={v=>update('chassis',v.toUpperCase())} wide/><Field label="RENAVAM" value={form.renavam} onChange={v=>update('renavam',v)} wide/></div></section></div>;

export default TradeCheckPanel;
