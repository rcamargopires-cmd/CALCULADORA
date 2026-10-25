import React, { useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, ListTodo, MessageCircle, Send, Zap } from 'lucide-react';
import { getGoGuidance } from '../services/goCopilotReadOnly';

export type GoFocusTask = {
  id: string;
  title: string;
  reason: string;
  dueLabel: string;
  urgent: boolean;
  onOpen: () => void;
};

type Props = {
  tasks: GoFocusTask[];
  loading: boolean;
  error: boolean;
  name: string;
  onStartNewService?: () => void;
  context?: 'crm' | 'pricing';
  onOpenLabel?: string;
};

/** Read-only GO entry point. Completion stays exclusively in the source CRM. */
const MotyqGoFocus: React.FC<Props> = ({ tasks, loading, error, name, onStartNewService, context = 'crm', onOpenLabel = 'Abrir cliente no CRM' }) => {
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [questionDraft, setQuestionDraft] = useState('');
  const [askedQuestion, setAskedQuestion] = useState('');
  const active = tasks.find(task => task.id === selectedId) || tasks[0];
  const reply = askedQuestion && !loading && !error ? getGoGuidance(askedQuestion, tasks, active, context) : '';
  return <section aria-label="Motyq GO" className="mb-5 rounded-[28px] border border-slate-200 bg-white p-4 text-slate-900 shadow-sm md:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[.16em] text-emerald-700">MOTYQ GO · MODO FOCO</p>
        <h2 className="mt-1 text-xl font-bold">Seu próximo passo, {name}</h2>
        <p className="text-sm text-slate-500">Uma prioridade por vez. Sua agenda continua disponível.</p>
      </div>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{tasks.length} pendência(s)</span>
    </div>
    {loading ? <p role="status" className="rounded-xl bg-slate-50 p-5 text-sm">Carregando suas tarefas...</p>
      : error ? <p role="alert" className="rounded-xl bg-rose-50 p-5 text-sm text-rose-800">Não foi possível carregar as tarefas. Nenhuma tarefa foi marcada como concluída.</p>
      : active ? <div className="rounded-2xl border border-emerald-100 bg-[#f4faf8] p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-black text-emerald-800"><Zap size={16}/> FAÇA AGORA</span>
            <span className={active.urgent ? 'rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-800' : 'rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800'}>{active.urgent ? 'Atenção' : 'Planejado'}</span>
          </div>
          <h3 className="text-xl font-bold">{active.title}</h3>
          <p className="mt-2 text-sm text-slate-700">{active.reason}</p>
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-600"><Clock3 size={15}/>{active.dueLabel}</p>
          <button type="button" onClick={active.onOpen} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800">{onOpenLabel} <ArrowRight size={16}/></button>
          <p className="mt-2 text-xs text-slate-500">A tarefa só desaparecerá quando a etapa for registrada no sistema.</p>
        </div>
      : <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-5 text-sm text-emerald-900"><CheckCircle2 size={22}/> {context === 'pricing' ? 'Nenhuma avaliação aguardando decisão na sua fila neste momento.' : 'Nenhuma pendência identificada no CRM neste momento.'}</div>}
    {!loading && !error && !tasks.length && onStartNewService && <button type="button" onClick={onStartNewService} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800">Abrir CRM para novo atendimento <ArrowRight size={16}/></button>}
    <button type="button" aria-expanded={agendaOpen} onClick={() => setAgendaOpen(value => !value)}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold hover:bg-slate-50">
      {agendaOpen ? <ListTodo size={17}/> : <CalendarDays size={17}/>} {agendaOpen ? 'Ocultar agenda' : 'Ver agenda completa'}
    </button>
    {agendaOpen && <div className="mt-3 space-y-2" aria-label="Agenda de pendências">
      {tasks.map(task => <button type="button" key={task.id} onClick={() => {setSelectedId(task.id);setAgendaOpen(false);}}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50">
        <span><strong className="block text-sm">{task.title}</strong><small className="text-slate-500">{task.dueLabel}</small></span><ArrowRight size={16} className="shrink-0"/>
      </button>)}
      {!tasks.length && <p className="p-3 text-sm text-slate-500">Não há tarefas para mostrar.</p>}
    </div>}

    <button type="button" aria-expanded={copilotOpen} onClick={() => setCopilotOpen(value => !value)}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 hover:bg-emerald-100">
      <MessageCircle size={17}/> {copilotOpen ? 'Fechar orientação GO' : 'Pergunte ao GO'}
    </button>
    {copilotOpen && <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-label="Assistente GO somente leitura">
      <p className="text-sm font-semibold text-slate-800">Seu assistente de prioridades</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">Versão inicial: respostas somente sobre as pendências disponíveis nesta tela. Ainda não consulta Syonet, AutoAvaliar ou DealerNet nem executa ações por você.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {['O que faço agora?', 'Resuma minhas pendências', 'Por que esta prioridade?'].map(prompt =>
          <button key={prompt} type="button" disabled={loading || error} onClick={() => setAskedQuestion(prompt)}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-300 disabled:opacity-50">{prompt}</button>)}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (questionDraft.trim()) { setAskedQuestion(questionDraft.trim()); setQuestionDraft(''); } }}>
        <input value={questionDraft} onChange={event => setQuestionDraft(event.target.value)} disabled={loading || error}
          maxLength={240} aria-label="Sua pergunta para o GO" placeholder="Pergunte sobre sua agenda..."
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-emerald-500 disabled:opacity-50"/>
        <button type="submit" disabled={loading || error || !questionDraft.trim()} aria-label="Enviar pergunta ao GO"
          className="flex min-w-11 items-center justify-center rounded-xl bg-emerald-700 px-3 text-white hover:bg-emerald-800 disabled:opacity-50"><Send size={17}/></button>
      </form>
      {askedQuestion && <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-emerald-100 bg-white p-3">
        <p className="text-xs font-semibold text-emerald-800">{askedQuestion}</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{error ? 'Não foi possível consultar a agenda agora.' : loading ? 'Carregando as informações da agenda...' : reply}</p>
      </div>}
    </div>}
  </section>;
};

export default MotyqGoFocus;
