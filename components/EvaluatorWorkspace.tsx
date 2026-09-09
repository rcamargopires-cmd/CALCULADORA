import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Gauge, LogOut, Play, RefreshCw } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { companyIdForUser } from '../services/companyService';
import { storeIdForUser } from '../services/storeService';
import { EvaluationQueueRequest, evaluationQueueService } from '../services/evaluationQueueService';

const ACTIVE_EVALUATION_REQUEST_KEY = 'motyq:active-evaluation-request-v2';
const money = (value?: number) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : '';

const EvaluatorWorkspace: React.FC<{ user: User }> = ({ user }) => {
  const companyId = companyIdForUser(user);
  const storeId = storeIdForUser(user);
  const [requests, setRequests] = useState<EvaluationQueueRequest[]>([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => evaluationQueueService.subscribe(
    user,
    companyId,
    storeId,
    setRequests,
    () => setError('Não foi possível carregar a fila de avaliações.'),
  ), [user, companyId, storeId]);

  const queue = useMemo(() => {
    const email = user.email.toLowerCase();
    return requests.filter(item =>
      item.status === 'requested' ||
      (item.status === 'in_progress' && (!item.evaluatorEmail || item.evaluatorEmail.toLowerCase() === email))
    );
  }, [requests, user.email]);

  const openMarketIq = () => {
    const button = document.querySelector('button[title="MarketIQ · avaliação e precificação"]') as HTMLButtonElement | null;
    button?.click();
  };

  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const button = document.querySelector('button[title="MarketIQ · avaliação e precificação"]') as HTMLButtonElement | null;
      if (button) {
        button.click();
        window.clearInterval(timer);
      } else if (attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, []);

  const start = async (request: EvaluationQueueRequest) => {
    if (busyId) return;
    setBusyId(request.id);
    setError('');
    try {
      if (request.status === 'requested') await evaluationQueueService.start(request.id, user);
      const active: EvaluationQueueRequest = {
        ...request,
        status: 'in_progress',
        evaluatorEmail: user.email.toLowerCase(),
        evaluatorName: user.name || user.email,
      };
      window.sessionStorage.setItem(ACTIVE_EVALUATION_REQUEST_KEY, JSON.stringify(active));
      window.dispatchEvent(new CustomEvent('motyq:marketiq-open-request-v2', { detail: active }));
    } catch (e) {
      console.error('Evaluator could not start request', e);
      setError('Não foi possível iniciar esta avaliação.');
    } finally {
      setBusyId('');
    }
  };

  return <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-cyan-300"><Gauge size={22}/></div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-700">MOTYQ MARKETIQ</p>
            <h1 className="truncate text-lg font-semibold">Área do Avaliador</h1>
            <p className="truncate text-xs text-slate-500">{user.name} · {storeId}</p>
          </div>
        </div>
        <button onClick={() => signOut(auth)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50">
          <LogOut size={15}/> SAIR
        </button>
      </div>
    </header>

    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700">FILA MARKETIQ</p>
            <h2 className="mt-1 text-2xl font-semibold">Avaliações da unidade</h2>
            <p className="mt-1 text-sm text-slate-500">Este perfil tem acesso somente ao MarketIQ e às solicitações de avaliação.</p>
          </div>
          <button onClick={openMarketIq} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
            <Gauge size={17}/> ABRIR MARKETIQ
          </button>
        </div>

        {error && <div className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">{error}</div>}

        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck size={17} className="text-cyan-700"/> Pendentes</div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-600">{queue.length}</span>
          </div>

          {!queue.length ? <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <div><RefreshCw size={24} className="mx-auto text-slate-400"/><p className="mt-3 font-semibold">Fila vazia</p><p className="mt-1 text-sm text-slate-500">Novas solicitações aparecem aqui automaticamente.</p></div>
          </div> : <div className="grid gap-3 md:grid-cols-2">
            {queue.map(item => {
              const mine = item.status === 'in_progress';
              return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-lg font-black tracking-wider text-slate-900">{item.plate}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-700">{item.vehicle || 'Veículo a identificar'}{item.year ? ` · ${item.year}` : ''}</p>
                    <p className="mt-1 text-xs text-slate-500">Solicitado por {item.requesterName || item.requesterEmail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${mine ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{mine ? 'EM AVALIAÇÃO' : 'AGUARDANDO'}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div className="rounded-xl bg-slate-50 p-2.5">RENAVAM<br/><strong className="text-slate-700">{item.renavam || '—'}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-2.5">Chave / manual<br/><strong className="text-slate-700">{item.hasSpareKey === 'yes' ? 'Chave ✓' : 'Chave —'} · {item.hasManual === 'yes' ? 'Manual ✓' : 'Manual —'}</strong></div>
                </div>
                {item.notes && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{item.notes}</p>}
                {typeof item.recommendedBuy === 'number' && <p className="mt-3 text-sm text-emerald-700">Compra recomendada: <strong>{money(item.recommendedBuy)}</strong></p>}
                <button disabled={busyId === item.id} onClick={() => void start(item)} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50">
                  <Play size={15}/>{busyId === item.id ? 'ABRINDO...' : mine ? 'CONTINUAR NO MARKETIQ' : 'INICIAR NO MARKETIQ'}
                </button>
              </article>;
            })}
          </div>}
        </div>
      </section>
    </main>
  </div>;
};

export default EvaluatorWorkspace;