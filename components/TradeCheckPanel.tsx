import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, ExternalLink, FileText, FolderCheck, Search, X } from 'lucide-react';
import { User } from '../types';

type Props = { currentUser: User };

type FormState = {
  ownerName: string;
  cpf: string;
  rg: string;
  birthDate: string;
  address: string;
  cep: string;
  city: string;
  phone: string;
  brand: string;
  model: string;
  yearFab: string;
  yearModel: string;
  color: string;
  plate: string;
  chassis: string;
  renavam: string;
};

type StepKey = 'tjsp' | 'pge' | 'detran' | 'sivei' | 'pedagio' | 'term';

type Persisted = {
  form: FormState;
  completed: Record<StepKey, boolean>;
};

const initialForm: FormState = {
  ownerName: '', cpf: '', rg: '', birthDate: '', address: '', cep: '', city: 'Sorocaba', phone: '',
  brand: '', model: '', yearFab: '', yearModel: '', color: '', plate: '', chassis: '', renavam: '',
};

const initialCompleted: Record<StepKey, boolean> = {
  tjsp: false, pge: false, detran: false, sivei: false, pedagio: false, term: false,
};

const researchSteps = [
  { key: 'tjsp' as const, label: 'TJSP / e-SAJ', url: 'https://esaj.tjsp.jus.br/cpopg/open.do', hint: 'Pesquisar pelo CPF do proprietário', copy: (f: FormState) => f.cpf },
  { key: 'pge' as const, label: 'Dívida Ativa PGE', url: 'https://www.dividaativa.pge.sp.gov.br/sc/pages/pagamento/gareLiquidacao.jsf', hint: 'Usar CPF e RENAVAM', copy: (f: FormState) => `CPF: ${f.cpf}\nRENAVAM: ${f.renavam}` },
  { key: 'detran' as const, label: 'Detran-SP', url: 'https://www.detran.sp.gov.br/detransp/pb/servicos/veiculos/consultar_debitos_restricoes?id=consultar_debitos_restricoes', hint: 'Usar placa e RENAVAM', copy: (f: FormState) => `PLACA: ${f.plate}\nRENAVAM: ${f.renavam}` },
  { key: 'sivei' as const, label: 'SIVEI / Fazenda', url: 'https://www3.fazenda.sp.gov.br/SIVEI/DebitosVinculados/Consulta', hint: 'Consulta de débitos vinculados', copy: (f: FormState) => `PLACA: ${f.plate}\nRENAVAM: ${f.renavam}` },
  { key: 'pedagio' as const, label: 'Pedágio Digital', url: 'https://www.pedagiodigital.com/', hint: 'Consultar pela placa', copy: (f: FormState) => f.plate },
];

const safe = (v: string) => String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c] || c));

const TradeCheckPanel: React.FC<Props> = ({ currentUser }) => {
  const storageKey = `motyq:tradecheck:${currentUser.email}`;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [completed, setCompleted] = useState<Record<StepKey, boolean>>(initialCompleted);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Persisted;
      if (saved?.form) setForm({ ...initialForm, ...saved.form });
      if (saved?.completed) setCompleted({ ...initialCompleted, ...saved.completed });
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ form, completed })); } catch {}
  }, [storageKey, form, completed]);

  const doneCount = useMemo(() => Object.values(completed).filter(Boolean).length, [completed]);
  const progress = Math.round((doneCount / 6) * 100);
  const ready = doneCount === 6;

  const update = (key: keyof FormState, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const toggle = (key: StepKey) => setCompleted(prev => ({ ...prev, [key]: !prev[key] }));

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text || '');
      setCopied(label);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {}
  };

  const generateTerm = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const date = new Date();
    const longDate = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Termo de Responsabilidade - ${safe(form.plate)}</title><style>
      body{font-family:Arial,sans-serif;color:#111;margin:34px;line-height:1.45;font-size:12px}h1{text-align:center;font-size:18px;margin:0 0 24px}p{margin:10px 0}.field{font-weight:700}.vehicle{border:1px solid #bbb;padding:12px;margin:16px 0}.signature{margin-top:50px;text-align:center}.hint{color:#666;font-size:10px}@media print{button{display:none}body{margin:18mm}}
    </style></head><body>
      <h1>TERMO DE RESPONSABILIDADE</h1>
      <p>Eu, <span class="field">${safe(form.ownerName)}</span>, portador do CPF nº <span class="field">${safe(form.cpf)}</span> e R.G. nº <span class="field">${safe(form.rg)}</span>, nascido em <span class="field">${safe(form.birthDate)}</span>, residente à <span class="field">${safe(form.address)}</span>, CEP <span class="field">${safe(form.cep)}</span>, município de <span class="field">${safe(form.city)}</span>, telefone <span class="field">${safe(form.phone)}</span>, declaro para todos os fins e efeitos de direito que vendi nesta data o veículo a seguir descrito, de minha propriedade, livre e desembaraçado de quaisquer ônus ou restrições ao GRUPO ABRÃO REZE.</p>
      <p>O GRUPO ABRÃO REZE é composto por ABRÃO REZE COMÉRCIO DE VEÍCULOS LTDA e suas filiais, CVR VEÍCULOS LTDA e sua filial, MOTONET COMÉRCIO DE VEÍCULOS LTDA, A.CENTER SOROCABA COMÉRCIO DE VEÍCULOS LTDA, DVU COMÉRCIO DE VEÍCULOS LTDA, AUTOZOE COMÉRCIO DE VEÍCULOS LTDA e REMOB COMÉRCIO DE VEÍCULOS LTDA.</p>
      <div class="vehicle"><b>Características do Veículo</b><br><br>
        Marca: <span class="field">${safe(form.brand)}</span> &nbsp;&nbsp; Modelo: <span class="field">${safe(form.model)}</span><br>
        Ano/modelo: <span class="field">${safe(form.yearFab)}/${safe(form.yearModel)}</span> &nbsp;&nbsp; Cor: <span class="field">${safe(form.color)}</span><br>
        Placa: <span class="field">${safe(form.plate)}</span> &nbsp;&nbsp; Chassi: <span class="field">${safe(form.chassis)}</span>
      </div>
      <p>Declaro ainda que estou ciente de minhas responsabilidades quanto ao veículo ora transacionado, quer na esfera civil quanto criminal, fornecendo neste ato toda e qualquer documentação relativa ao veículo, responsabilizando-me pela boa procedência, pela regularidade da documentação, por todas as multas de trânsito, eventual diferença de recolhimento de IPVA e outros quaisquer, ainda que futuramente lançados e, quando se tratar de veículo importado, por eventual direito de regresso se sobre o mesmo recair qualquer ônus ou dívida que possa inviabilizar sua transferência ao adquirente.</p>
      <p>Comprometo-me a pagar os encargos assim que cientificado para tal fim, autorizando a cobrança através de instituição financeira mediante emissão de boleto bancário. No caso de os referidos encargos serem quitados pelo comprador, ficará o mesmo sub-rogado nestes créditos, acrescidos, em caso de execução judicial, dos encargos previstos no termo original.</p>
      <p>Por ser verdade, firmo o presente.</p>
      <p><b>Sorocaba, ${safe(longDate)}.</b></p>
      <div class="signature">_____________________________________________<br><b>${safe(form.ownerName)}</b><br><span class="hint">reconhecer por autenticidade</span></div>
      <div style="margin-top:30px;text-align:center"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
    </body></html>`);
    w.document.close();
    setCompleted(prev => ({ ...prev, term: true }));
  };

  const reset = () => {
    if (!window.confirm('Limpar este TradeCheck e iniciar outro veículo?')) return;
    setForm(initialForm);
    setCompleted(initialCompleted);
    try { localStorage.removeItem(storageKey); } catch {}
  };

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-[180] flex items-center gap-2 rounded-2xl border border-sky-400/25 bg-[#17202b] px-4 py-3 text-sm font-bold text-sky-200 shadow-2xl hover:bg-[#1d2936]">
      <Search size={17}/> TradeCheck <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px]">{doneCount}/6</span>
    </button>

    {open && <div className="fixed inset-0 z-[600] overflow-y-auto bg-black/80 p-3 backdrop-blur-sm md:p-6">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-[#171b21] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">MOTYQ · TRADECHECK</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Dossiê da troca</h2>
            <p className="mt-1 text-sm text-zinc-400">5 pesquisas + termo de responsabilidade + envio ao Via Nuvem.</p>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white"><X size={18}/></button>
        </div>

        <div className="p-5 md:p-6">
          <div className="mb-6 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div><div className="mb-2 flex justify-between text-xs text-zinc-400"><span>Progresso do dossiê</span><b className={ready ? 'text-emerald-300' : 'text-white'}>{progress}%</b></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-sky-400 transition-all" style={{width:`${progress}%`}}/></div></div>
            <button onClick={reset} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white">Novo TradeCheck</button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="mb-4 font-semibold text-white">Proprietário</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome completo" value={form.ownerName} onChange={v=>update('ownerName',v)} wide/>
                <Field label="CPF" value={form.cpf} onChange={v=>update('cpf',v)}/><Field label="RG" value={form.rg} onChange={v=>update('rg',v)}/>
                <Field label="Nascimento" value={form.birthDate} onChange={v=>update('birthDate',v)}/><Field label="Telefone" value={form.phone} onChange={v=>update('phone',v)}/>
                <Field label="Endereço" value={form.address} onChange={v=>update('address',v)} wide/>
                <Field label="CEP" value={form.cep} onChange={v=>update('cep',v)}/><Field label="Município" value={form.city} onChange={v=>update('city',v)}/>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="mb-4 font-semibold text-white">Veículo da troca</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Marca" value={form.brand} onChange={v=>update('brand',v)}/><Field label="Modelo" value={form.model} onChange={v=>update('model',v)}/>
                <Field label="Ano fabricação" value={form.yearFab} onChange={v=>update('yearFab',v)}/><Field label="Ano modelo" value={form.yearModel} onChange={v=>update('yearModel',v)}/>
                <Field label="Cor" value={form.color} onChange={v=>update('color',v)}/><Field label="Placa" value={form.plate} onChange={v=>update('plate',v.toUpperCase())}/>
                <Field label="Chassi" value={form.chassis} onChange={v=>update('chassis',v.toUpperCase())} wide/>
                <Field label="RENAVAM" value={form.renavam} onChange={v=>update('renavam',v)} wide/>
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="mb-4 font-semibold text-white">Pesquisas obrigatórias</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {researchSteps.map(step => <div key={step.key} className={`rounded-2xl border p-4 ${completed[step.key] ? 'border-emerald-400/20 bg-emerald-400/[0.05]' : 'border-white/10 bg-black/10'}`}>
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{step.label}</p><p className="mt-1 text-xs text-zinc-500">{step.hint}</p></div><button onClick={()=>toggle(step.key)} className={completed[step.key] ? 'text-emerald-300' : 'text-zinc-700'} title="Marcar concluída"><CheckCircle2 size={22}/></button></div>
                <div className="mt-4 flex gap-2"><button onClick={()=>window.open(step.url,'_blank','noopener,noreferrer')} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-black"><ExternalLink size={14}/> Abrir pesquisa</button><button onClick={()=>copyText(step.copy(form),step.key)} className="rounded-xl border border-white/10 px-3 py-2 text-zinc-300" title="Copiar dados"><Clipboard size={14}/></button></div>
                {copied === step.key && <p className="mt-2 text-[10px] text-sky-300">Dados copiados.</p>}
              </div>)}
            </div>
          </section>

          <section className="mt-6 grid gap-3 md:grid-cols-2">
            <div className={`rounded-2xl border p-4 ${completed.term ? 'border-emerald-400/20 bg-emerald-400/[0.05]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="flex items-center gap-3"><FileText className="text-sky-300" size={22}/><div><p className="font-semibold text-white">Termo de responsabilidade de multas</p><p className="text-xs text-zinc-500">Gera o termo já preenchido para imprimir ou salvar em PDF.</p></div></div>
              <button onClick={generateTerm} className="mt-4 w-full rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-bold text-slate-950">Gerar termo preenchido</button>
            </div>

            <div className={`rounded-2xl border p-4 ${ready ? 'border-emerald-400/25 bg-emerald-400/[0.05]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="flex items-center gap-3"><FolderCheck className={ready ? 'text-emerald-300' : 'text-zinc-500'} size={22}/><div><p className="font-semibold text-white">Via Nuvem</p><p className="text-xs text-zinc-500">Envie as 5 pesquisas e o termo para o processo do veículo.</p></div></div>
              <button onClick={()=>window.open('https://app.vianuvem.com.br/auto/home','_blank','noopener,noreferrer')} className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-white">Abrir Via Nuvem</button>
              {!ready && <p className="mt-2 text-[10px] text-amber-300">Ainda faltam {6-doneCount} item(ns) para completar o dossiê.</p>}
              {ready && <p className="mt-2 text-[10px] font-semibold text-emerald-300">Dossiê completo e pronto para arquivamento.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>}
  </>;
};

const Field = ({ label, value, onChange, wide=false }: {label:string;value:string;onChange:(v:string)=>void;wide?:boolean}) => <label className={wide ? 'sm:col-span-2' : ''}><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span><input value={value} onChange={e=>onChange(e.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-sky-400/40"/></label>;

export default TradeCheckPanel;
