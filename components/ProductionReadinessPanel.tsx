import React,{useEffect,useState} from 'react';
import { CheckCircle2, ExternalLink, RefreshCw, Rocket, TriangleAlert, X } from 'lucide-react';
import type { Company, User } from '../types';
import { productionReadinessService, type ProductionReadiness } from '../services/productionReadinessService';

type Props={open:boolean;onClose:()=>void;currentUser:User;company:Company};

const ProductionReadinessPanel:React.FC<Props>=({open,onClose,currentUser,company})=>{
  const[data,setData]=useState<ProductionReadiness|null>(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');

  const load=async()=>{
    setLoading(true);setError('');
    try{setData(await productionReadinessService.check(company.id,company.fiscal?.environment||'homologacao'));}
    catch(cause:any){setError(cause?.message||'Não foi possível executar o pré-voo.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(open)void load();},[open,company.id,company.fiscal?.environment]);

  if(!open)return null;
  const checks=[
    {label:'Servidor Firebase',ok:Boolean(data?.serverFirebase),detail:'Credencial server-side da aplicação'},
    {label:'Asaas API',ok:Boolean(data?.asaas.apiKey),detail:data?.asaas.environment||'sandbox'},
    {label:'Asaas webhook',ok:Boolean(data?.asaas.webhookToken),detail:'Token de autenticação do webhook'},
    {label:'Focus NFe',ok:company.fiscal?.provider!=='focus_nfe'||Boolean(data?.fiscal.configured),detail:company.fiscal?.provider==='focus_nfe'?(company.fiscal.environment||'homologacao'):'Integração não exigida'},
  ];
  const appReady=checks.every(item=>item.ok);
  return <div className="fixed inset-0 z-[950] overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="mx-auto my-8 max-w-2xl rounded-[30px] bg-white p-6 text-slate-900 shadow-2xl" onClick={event=>event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-blue-700">MOTYQ · PRÉ-VOO</p><h2 className="mt-1 text-2xl font-semibold">{company.name}</h2><p className="mt-1 text-sm text-slate-500">Checagem segura das integrações antes do piloto/produção.</p></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200"><X size={17}/></button></header>
      {error&&<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="mt-5 space-y-2">
        {checks.map(item=><div key={item.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">{item.ok?<CheckCircle2 size={19} className="shrink-0 text-emerald-600"/>:<TriangleAlert size={19} className="shrink-0 text-amber-600"/>}<div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.label}</p><p className="mt-0.5 text-xs text-slate-500">{item.detail}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${item.ok?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-800'}`}>{item.ok?'OK':'PENDENTE'}</span></div>)}
      </div>
      <div className={`mt-5 rounded-2xl border p-4 ${appReady?'border-emerald-200 bg-emerald-50':'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center gap-2">{appReady?<Rocket size={18} className="text-emerald-700"/>:<TriangleAlert size={18} className="text-amber-700"/>}<p className={`text-sm font-semibold ${appReady?'text-emerald-800':'text-amber-800'}`}>{appReady?'Integrações da aplicação prontas.':'Ainda existem credenciais da aplicação pendentes.'}</p></div>
      </div>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-bold text-slate-700">Validações externas que não podem ser concluídas pelo navegador</p>
        <div className="mt-2 space-y-2 text-xs text-slate-500">
          <p>• GitHub Environment: confirmar <b>FIREBASE_SERVICE_ACCOUNT_JSON</b>.</p>
          <p>• GitHub Actions: executar primeiro backup real e validar restauração em homologação.</p>
          <p>• Fiscal: homologar NF-e com contador e certificado antes de produção.</p>
          <p>• Montadoras: dependem de contrato/API de cada fabricante.</p>
        </div>
      </div>
      <div className="mt-5 flex gap-2"><button disabled={loading} onClick={()=>void load()} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white disabled:opacity-50"><RefreshCw size={15} className={loading?'animate-spin':''}/>{loading?'VERIFICANDO...':'VERIFICAR NOVAMENTE'}</button><a href="https://github.com/rcamargopires-cmd/CALCULADORA/actions" target="_blank" rel="noreferrer" className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-600" title="Abrir GitHub Actions"><ExternalLink size={16}/></a></div>
      <p className="mt-3 text-[10px] text-slate-400">Usuário administrativo: {currentUser.email}</p>
    </div>
  </div>;
};

export default ProductionReadinessPanel;
