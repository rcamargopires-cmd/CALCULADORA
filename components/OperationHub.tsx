import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  BellRing,
  BrainCircuit,
  CheckCircle2,
  LayoutDashboard,
  ListTodo,
  PanelsTopLeft,
  Sparkles,
  X,
} from 'lucide-react';

type Props = {
  storeName: string;
  canAlerts: boolean;
  canAi: boolean;
  canReports: boolean;
};

type ToolKey = 'overview' | 'actions' | 'alerts' | 'ai' | 'impact' | 'reports';

const findButton = (predicate: (button: HTMLButtonElement) => boolean) =>
  Array.from(document.querySelectorAll('button')).find(button => predicate(button as HTMLButtonElement)) as HTMLButtonElement | undefined;

const clickTitle = (title: string) => {
  const button = document.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
  button?.click();
  return Boolean(button);
};

const clickText = (text: string) => {
  const target = text.trim().toLowerCase();
  const button = findButton(item => String(item.textContent || '').trim().toLowerCase() === target)
    || findButton(item => String(item.textContent || '').trim().toLowerCase().includes(target));
  button?.click();
  return Boolean(button);
};

const tools: Array<{
  key: ToolKey;
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'overview', eyebrow: 'Visão Geral', title: 'Command Center',
    description: 'Vendas, projeção, captura, margem, estoque e equipe em uma única leitura.',
    icon: <LayoutDashboard size={19}/>,
  },
  {
    key: 'actions', eyebrow: 'Gestão Hoje', title: 'Prioridades e execução',
    description: 'Transforme os desvios da operação em ações com responsável, prazo e resultado.',
    icon: <ListTodo size={19}/>,
  },
  {
    key: 'alerts', eyebrow: 'Alertas', title: 'O que mudou',
    description: 'Mudanças relevantes de projeção, captura, margem, vendedores e estoque crítico.',
    icon: <BellRing size={19}/>,
  },
  {
    key: 'ai', eyebrow: 'Copiloto IA', title: 'Leitura inteligente',
    description: 'Interpretação executiva dos mesmos sinais com briefing e recomendações contextuais.',
    icon: <BrainCircuit size={19}/>,
  },
  {
    key: 'impact', eyebrow: 'Resultados', title: 'Impacto Motyq',
    description: 'Evolução do mês, tarefas concluídas, evidências e resultados registrados pela equipe.',
    icon: <Activity size={19}/>,
  },
  {
    key: 'reports', eyebrow: 'Relatórios', title: 'Executive Insights',
    description: 'Compare hoje, 7 dias, quinzena e mês sem criar uma leitura paralela fora da operação.',
    icon: <BarChart3 size={19}/>,
  },
];

const OperationHub: React.FC<Props> = ({ storeName, canAlerts, canAi, canReports }) => {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const enabled = (key: ToolKey) => {
    if (key === 'alerts') return canAlerts;
    if (key === 'ai') return canAi;
    if (key === 'reports') return canReports;
    return true;
  };

  const launch = (key: ToolKey) => {
    if (!enabled(key)) {
      setFeedback('Este recurso não está liberado no plano atual.');
      return;
    }

    let found = false;
    if (key === 'overview') found = clickText('DASHBOARD');
    if (key === 'actions') found = clickTitle('Centro de Ação Motyq');
    if (key === 'alerts') found = clickText('Smart Alerts');
    if (key === 'ai') found = clickText('MOTYQ AI');
    if (key === 'impact') found = clickTitle('Impacto Motyq');
    if (key === 'reports') found = clickText('Executive');

    if (!found) {
      setFeedback('O módulo está carregando. Tente novamente em instantes.');
      return;
    }
    setFeedback('');
    setOpen(false);
  };

  return <>
    <style>{`
      /* Operação Motyq replaces the five legacy standalone launchers. */
      body.motyq-graphite button[title="Centro de Ação Motyq"],
      body.motyq-graphite button[title="Impacto Motyq"],
      body.motyq-graphite button.fixed.bottom-20.right-5,
      body.motyq-graphite button.fixed.bottom-32.right-5,
      body.motyq-graphite button.fixed.bottom-5.right-5 {
        display: none !important;
      }
    `}</style>

    <button
      onClick={() => setOpen(true)}
      title="Operação Motyq"
      className="fixed bottom-4 right-4 z-[155] flex items-center gap-3 rounded-2xl border border-sky-300/25 bg-[#141a20]/95 px-4 py-3 text-left text-white shadow-2xl shadow-black/45 backdrop-blur-xl transition hover:border-sky-300/45 hover:bg-[#18212a] active:scale-[.98]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-sky-300/15 bg-sky-300/[.08] text-sky-300"><PanelsTopLeft size={20}/></span>
      <span className="hidden sm:block">
        <span className="block text-[9px] font-black uppercase tracking-[.17em] text-sky-300">OPERAÇÃO</span>
        <span className="mt-0.5 block text-sm font-semibold">Central Motyq</span>
      </span>
    </button>

    {open && <div className="fixed inset-0 z-[560] bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <aside
        className="ml-auto flex min-h-full w-full max-w-[470px] flex-col border-l border-white/10 bg-[#11151b] text-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-white/10 p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-sky-300"><Sparkles size={15}/><p className="text-[10px] font-black uppercase tracking-[.18em]">OPERAÇÃO MOTYQ</p></div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Uma operação, seis leituras.</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">{storeName}. Os motores continuam especializados, mas agora vivem no mesmo lugar.</p>
          </div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-zinc-400"><X size={18}/></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="mb-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.045] p-4">
            <div className="flex gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300"/><div><p className="text-sm font-semibold text-emerald-100">Sem perda de funcionalidade</p><p className="mt-1 text-xs leading-5 text-zinc-500">Alertas, IA, tarefas, impacto e relatórios continuam usando seus motores atuais. Mudamos a experiência, não os dados.</p></div></div>
          </div>

          <div className="space-y-2.5">
            {tools.map(tool => {
              const available = enabled(tool.key);
              return <button
                key={tool.key}
                onClick={() => launch(tool.key)}
                className={`w-full rounded-[22px] border p-4 text-left transition ${available ? 'border-white/10 bg-white/[.035] hover:border-sky-300/25 hover:bg-sky-300/[.045]' : 'border-white/5 bg-white/[.015] opacity-45'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.055] text-zinc-300">{tool.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-[9px] font-black uppercase tracking-[.14em] text-sky-300">{tool.eyebrow}</p>{!available && <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[9px] font-bold text-zinc-500">PLANO</span>}</div>
                    <p className="mt-1 font-semibold text-white">{tool.title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{tool.description}</p>
                  </div>
                </div>
              </button>;
            })}
          </div>

          {feedback && <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[.05] px-4 py-3 text-xs text-amber-200">{feedback}</div>}
        </div>
      </aside>
    </div>}
  </>;
};

export default OperationHub;
