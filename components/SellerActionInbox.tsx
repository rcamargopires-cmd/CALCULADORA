import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ListTodo, Play, RefreshCw, Save, UserCheck, X } from 'lucide-react';
import { User } from '../types';
import { ActionTask, actionTaskService } from '../services/actionTaskService';

type Props = {
  currentUser: User;
  companyId: string;
  storeId: string;
  storeName: string;
};

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatDate = (value: string) => {
  if (!value) return 'Sem prazo';
  const [year, month, day] = value.split('-');
  return day && month && year ? `${day}/${month}/${year}` : value;
};

const SellerActionInbox: React.FC<Props> = ({ currentUser, companyId, storeId, storeName }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [results, setResults] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    if (!currentUser.email) return;
    setLoading(true);
    try {
      const rows = await actionTaskService.listAssigned(currentUser.email, companyId, storeId);
      setTasks(rows);
      setResults(Object.fromEntries(rows.map(task => [task.id, task.result || ''])));
      setFeedback('');
    } catch (error: any) {
      console.error('Seller action inbox load error', error);
      if (String(error?.code || '').includes('permission-denied')) {
        setFeedback('Sua agenda ainda está sendo ativada. Tente novamente em instantes.');
      } else {
        setFeedback('Não consegui carregar suas ações agora.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener('motyq:action-task-updated', refresh);
    return () => window.removeEventListener('motyq:action-task-updated', refresh);
  }, [currentUser.email, companyId, storeId]);

  const ordered = useMemo(() => [...tasks].sort((a, b) => {
    const rank = (status: ActionTask['status']) => status === 'in_progress' ? 0 : status === 'open' ? 1 : 2;
    return rank(a.status) - rank(b.status) || String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
  }), [tasks]);

  const openTasks = ordered.filter(task => task.status !== 'done');
  const doneTasks = ordered.filter(task => task.status === 'done');
  const overdue = openTasks.filter(task => task.dueDate && task.dueDate < localDate()).length;

  const updateTask = async (task: ActionTask, status: ActionTask['status']) => {
    const result = String(results[task.id] || task.result || '').trim();
    if (status === 'done' && !result) {
      setFeedback('Escreva o resultado da ação antes de concluir.');
      return;
    }
    setSaving(true);
    try {
      await actionTaskService.update(task.id, { status, result });
      setFeedback(status === 'done' ? 'Ação concluída e resultado registrado.' : 'Ação iniciada.');
      window.dispatchEvent(new CustomEvent('motyq:action-task-updated'));
      await load();
    } catch (error) {
      console.error('Seller action task update error', error);
      setFeedback('Não consegui atualizar a ação.');
    } finally {
      setSaving(false);
    }
  };

  const saveResult = async (task: ActionTask) => {
    setSaving(true);
    try {
      await actionTaskService.update(task.id, { result: String(results[task.id] || '').trim() });
      setFeedback('Anotação salva.');
      window.dispatchEvent(new CustomEvent('motyq:action-task-updated'));
      await load();
    } catch (error) {
      console.error('Seller action result save error', error);
      setFeedback('Não consegui salvar a anotação.');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <button
      onClick={() => { setOpen(true); load(); }}
      title="Minha Agenda Motyq"
      className="fixed right-[22px] top-[84px] z-[142] w-[270px] rounded-[20px] border border-sky-300/30 bg-gradient-to-br from-[#0e1c2c] to-[#1d2430] p-4 text-left text-white shadow-2xl shadow-black/40 transition hover:border-sky-300/50 active:scale-[0.99] max-[900px]:bottom-[18px] max-[900px]:right-[14px] max-[900px]:top-auto max-[900px]:w-[calc(100vw-28px)]"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-sky-300/15 bg-sky-300/[0.08] text-sky-300"><ListTodo size={18}/></div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-sky-300">MINHA AGENDA</p>
          <p className="mt-1 text-sm font-semibold text-white">Ações do dia</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">{openTasks.length ? `${openTasks.length} pendente(s)${overdue ? ` · ${overdue} atrasada(s)` : ''}` : 'Nenhuma pendência'}</p>
        </div>
        {openTasks.length > 0 && <span className={`grid min-w-7 place-items-center rounded-full px-2 py-1 text-[11px] font-black ${overdue ? 'bg-red-500 text-white' : 'bg-sky-300 text-slate-950'}`}>{openTasks.length}</span>}
      </div>
    </button>

    {open && <div className="fixed inset-0 z-[280] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[32px] border border-white/10 bg-[#171a20] shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-7">
          <div className="flex gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-sky-300/15 bg-sky-300/[0.07] text-sky-200"><UserCheck size={21}/></div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">MOTYQ · MINHA AGENDA</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">O que precisa ser feito</h2>
              <p className="mt-1 text-sm text-zinc-500">{storeName} · tarefas atribuídas pela gestão.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400"><X size={18}/></button>
          </div>
        </header>

        <div className="p-5 md:p-7">
          {feedback && <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-sky-300/15 bg-sky-300/[0.05] px-4 py-3 text-sm text-sky-100"><span>{feedback}</span><button onClick={() => setFeedback('')} className="text-sky-300"><X size={15}/></button></div>}

          <section className="grid gap-3 sm:grid-cols-3">
            <Summary label="Pendentes" value={`${openTasks.length}`} hint={overdue ? `${overdue} atrasada(s)` : 'dentro do prazo'} />
            <Summary label="Em andamento" value={`${openTasks.filter(task => task.status === 'in_progress').length}`} hint="ações iniciadas" />
            <Summary label="Concluídas" value={`${doneTasks.length}`} hint="resultado registrado" />
          </section>

          {loading && !tasks.length ? <div className="grid min-h-60 place-items-center text-zinc-500"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin"/><p>Carregando sua agenda...</p></div></div> : !ordered.length ? <div className="mt-6 rounded-[26px] border border-emerald-400/15 bg-emerald-400/[0.04] p-7 text-center"><CheckCircle2 className="mx-auto text-emerald-300"/><p className="mt-3 font-semibold text-emerald-100">Nenhuma ação atribuída.</p><p className="mt-1 text-sm text-emerald-200/60">Quando a gestão atribuir uma tarefa, ela aparecerá aqui automaticamente.</p></div> : <div className="mt-6 space-y-3">
            {ordered.map(task => {
              const isOverdue = task.status !== 'done' && task.dueDate && task.dueDate < localDate();
              return <article key={task.id} className={`rounded-[24px] border p-5 ${task.status === 'done' ? 'border-emerald-400/15 bg-emerald-400/[0.035]' : isOverdue ? 'border-red-400/20 bg-red-400/[0.04]' : 'border-white/10 bg-white/[0.025]'}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Status status={task.status}/>
                      <span className="text-[10px] font-black uppercase tracking-[0.13em] text-zinc-600">{task.scope}</span>
                      {isOverdue && <span className="rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-black text-red-300">ATRASADA</span>}
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-white">{task.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">{task.recommendedAction}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1.5"><CalendarDays size={14}/> prazo {formatDate(task.dueDate)}</span>
                      <span>atribuída por {task.createdByName || task.createdByEmail}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/15 p-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">Resultado / anotação</label>
                  <textarea
                    value={results[task.id] ?? task.result ?? ''}
                    onChange={event => setResults(value => ({ ...value, [task.id]: event.target.value }))}
                    disabled={task.status === 'done'}
                    placeholder="Ex.: cliente reativado, proposta enviada, veículo anunciado, avaliação gerada..."
                    className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none disabled:opacity-60"
                  />
                  {task.status !== 'done' && <div className="mt-3 flex flex-wrap gap-2">
                    {task.status === 'open' && <button disabled={saving} onClick={() => updateTask(task, 'in_progress')} className="rounded-xl border border-sky-300/20 bg-sky-300/[0.07] px-3 py-2 text-xs font-black text-sky-200 disabled:opacity-50"><Play size={14} className="mr-1.5 inline"/> INICIAR</button>}
                    <button disabled={saving} onClick={() => saveResult(task)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-zinc-300 disabled:opacity-50"><Save size={14} className="mr-1.5 inline"/> SALVAR</button>
                    <button disabled={saving} onClick={() => updateTask(task, 'done')} className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950 disabled:opacity-50"><CheckCircle2 size={14} className="mr-1.5 inline"/> CONCLUIR</button>
                  </div>}
                </div>
              </article>;
            })}
          </div>}
        </div>
      </div>
    </div>}
  </>;
};

const Summary = ({ label, value, hint }: { label: string; value: string; hint: string }) => <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;

const Status = ({ status }: { status: ActionTask['status'] }) => {
  const classes = status === 'done' ? 'bg-emerald-400/12 text-emerald-300' : status === 'in_progress' ? 'bg-sky-400/12 text-sky-300' : 'bg-amber-400/12 text-amber-300';
  const label = status === 'done' ? 'CONCLUÍDA' : status === 'in_progress' ? 'EM ANDAMENTO' : 'ABERTA';
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${classes}`}>{label}</span>;
};

export default SellerActionInbox;
