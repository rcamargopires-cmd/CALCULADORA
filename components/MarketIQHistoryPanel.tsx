import React, { useEffect, useMemo, useState } from 'react';
import { Eye, History, Trash2, X } from 'lucide-react';
import { User } from '../types';
import { MarketIQEvaluation, MarketIQCommercialClass, marketIqEvaluationService } from '../services/marketIqEvaluationService';

type Props = { companyId: string; storeId: string; currentUser: User };

const money = (value?: number | string) => {
  const n = typeof value === 'number' ? value : Number(String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const dateOf = (value: any) => {
  try {
    if (value?.toDate) return value.toDate();
    if (value?.seconds) return new Date(value.seconds * 1000);
    if (value) return new Date(value);
  } catch {}
  return null;
};

const dateLabel = (value: any) => {
  const d = dateOf(value);
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('pt-BR') : 'Data indisponível';
};

const statusLabel = (status: MarketIQEvaluation['status']) => status === 'approved' ? 'APROVADA' : status === 'rejected' ? 'RECUSADA' : 'RASCUNHO';
const statusTone = (status: MarketIQEvaluation['status']) => status === 'approved' ? 'border-emerald-300/20 bg-emerald-300/[.06] text-emerald-300' : status === 'rejected' ? 'border-red-300/20 bg-red-300/[.05] text-red-300' : 'border-amber-300/20 bg-amber-300/[.05] text-amber-200';
const classTone: Record<MarketIQCommercialClass, string> = {
  A: 'border-emerald-300/30 bg-emerald-300/[.08] text-emerald-200',
  B: 'border-cyan-300/30 bg-cyan-300/[.08] text-cyan-200',
  C: 'border-amber-300/30 bg-amber-300/[.08] text-amber-200',
  D: 'border-orange-300/30 bg-orange-300/[.08] text-orange-200',
  E: 'border-red-300/30 bg-red-300/[.08] text-red-200',
};
const classDestination = (item: MarketIQEvaluation) => item.commercialDestination || (item.commercialClass === 'A' || item.commercialClass === 'B' ? 'SHOWROOM' : item.commercialClass === 'C' ? 'OUTLET' : item.commercialClass ? 'REPASSE' : '');

const readCurrentPlate = () => {
  const marketIq = Array.from(document.querySelectorAll('p')).find(node => String(node.textContent || '').includes('MOTYQ MARKETIQ · V2'))?.closest('header')?.parentElement;
  const labels = Array.from(marketIq?.querySelectorAll('label') || []);
  for (const label of labels) {
    const text = String(label.textContent || '').trim().toUpperCase();
    if (!text.startsWith('PLACA')) continue;
    const input = label.querySelector('input') as HTMLInputElement | null;
    const value = cleanPlate(input?.value || '');
    if (value) return value;
  }
  return '';
};

const isMarketIqOpen = () => Array.from(document.querySelectorAll('p')).some(node => String(node.textContent || '').includes('MOTYQ MARKETIQ · V2'));

const MarketIQHistoryPanel: React.FC<Props> = ({ companyId, storeId, currentUser }) => {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState('');
  const [items, setItems] = useState<MarketIQEvaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MarketIQEvaluation | null>(null);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [notice, setNotice] = useState('');
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    const refreshVisibility = () => setVisible(isMarketIqOpen());
    refreshVisibility();
    const observer = new MutationObserver(refreshVisibility);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const load = async (plateValue?: string) => {
    const target = cleanPlate(plateValue ?? plate);
    setPlate(target);
    setSelected(null);
    setLoading(true);
    setError('');
    try {
      setItems(target
        ? await marketIqEvaluationService.listByPlate(companyId, storeId, target)
        : await marketIqEvaluationService.listByStore(companyId, storeId));
    } catch (e) {
      console.error('MarketIQ history load failed', e);
      setItems([]);
      setError('Não foi possível carregar as avaliações da unidade.');
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (item: MarketIQEvaluation) => {
    if (!isAdmin || deletingId) return;
    const label = `${item.vehicle || 'Veículo'} · ${statusLabel(item.status)} · ${dateLabel(item.createdAt)}`;
    const confirmed = window.confirm(`Excluir esta avaliação do histórico?\n\n${label}\n\nEsta ação não pode ser desfeita.`);
    if (!confirmed) return;
    setDeletingId(item.id);
    setNotice('');
    setError('');
    try {
      await marketIqEvaluationService.remove(item.id, item.plate);
      setItems(current => current.filter(entry => entry.id !== item.id));
      if (selected?.id === item.id) setSelected(null);
      setNotice('Avaliação excluída do histórico.');
      window.setTimeout(() => setNotice(''), 3500);
    } catch (e) {
      console.error('MarketIQ history delete failed', e);
      setError('Não foi possível excluir esta avaliação. Verifique sua permissão de administrador.');
    } finally {
      setDeletingId('');
    }
  };

  useEffect(() => {
    const updated = (event: Event) => {
      if (!open) return;
      const eventPlate = cleanPlate((event as CustomEvent).detail?.plate || '');
      if (!eventPlate || eventPlate === plate) void load(eventPlate || plate);
    };
    window.addEventListener('motyq:marketiq-history-updated', updated as EventListener);
    return () => window.removeEventListener('motyq:marketiq-history-updated', updated as EventListener);
  }, [open, plate, companyId, storeId]);

  const rows = useMemo(() => items.map((item, index) => {
    const older = items[index + 1];
    const currentBuy = Number(item.recommendedBuy || 0);
    const olderBuy = Number(older?.recommendedBuy || 0);
    const buyDelta = currentBuy && olderBuy ? currentBuy - olderBuy : 0;
    const currentFipe = Number(String(item.fipe || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
    const olderFipe = Number(String(older?.fipe || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
    const fipeDelta = currentFipe && olderFipe ? currentFipe - olderFipe : 0;
    return { item, index, buyDelta, fipeDelta };
  }), [items]);

  if (!visible && !open) return null;

  return <>
    {visible && !open && <button
      onClick={() => { const current=readCurrentPlate(); setOpen(true); void load(current); }}
      className="fixed right-[74px] top-[27px] z-[625] flex h-10 items-center gap-2 rounded-xl border border-cyan-300/20 bg-[#11191b]/95 px-3 text-xs font-bold text-cyan-200 shadow-xl backdrop-blur hover:border-cyan-300/40"
      title="Histórico de avaliações MarketIQ"
    ><History size={15}/>HISTÓRICO</button>}

    {open && <div className="fixed inset-0 z-[640] overflow-y-auto bg-black/75 p-3 backdrop-blur-sm md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-5xl rounded-[26px] border border-white/10 bg-[#101315] text-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-white/10 p-5 md:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">MOTYQ MARKETIQ · HISTÓRICO</p>
            <h3 className="mt-1 text-xl font-semibold">{plate ? `Avaliações da placa ${plate}` : 'Histórico de avaliações da unidade'}</h3>
            <p className="mt-1 text-sm text-zinc-500">Histórico permanente da unidade ativa{isAdmin ? ' · administrador pode excluir registros' : ''}</p>
          </div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-zinc-400 hover:text-white"><X size={18}/></button>
        </header>

        <div className="p-4 md:p-6">
          <form onSubmit={event => {event.preventDefault();void load(plate);}} className="mb-4 flex flex-wrap items-end gap-2">
            <label className="min-w-[180px] flex-1 text-xs font-semibold text-zinc-500">
              Pesquisar pela placa
              <input value={plate} onChange={event=>setPlate(cleanPlate(event.target.value).slice(0,7))}
                maxLength={7} placeholder="Digite a placa" autoComplete="off"
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm font-bold uppercase text-slate-800 outline-none focus:border-cyan-500"/>
            </label>
            <button type="submit" className="h-11 rounded-xl bg-cyan-700 px-4 text-xs font-bold text-white">BUSCAR</button>
            <button type="button" onClick={()=>void load('')} className="h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700">VER TODAS</button>
          </form>
          {!!notice && <div className="mb-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/[.06] px-4 py-3 text-sm font-semibold text-emerald-200">{notice}</div>}
          {loading && <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5 text-sm text-zinc-400">Carregando avaliações...</div>}
          {!loading && error && <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-5 text-sm text-amber-100">{error}</div>}
          {!loading && !error && !items.length && <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5 text-sm text-zinc-400">{plate ? 'Ainda não existe avaliação salva para esta placa.' : 'Ainda não existem avaliações salvas nesta unidade.'}</div>}

          {!loading && rows.length > 0 && <div className="space-y-3">
            {rows.map(({ item, index, buyDelta, fipeDelta }) => <div key={item.id} className={`rounded-2xl border p-4 ${index === 0 ? 'border-cyan-300/25 bg-cyan-300/[.035]' : 'border-white/10 bg-white/[.02]'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-base">{item.plate} · {item.vehicle || 'Veículo sem descrição'}</strong>
                    {index === 0 && plate && <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.05] px-2 py-0.5 text-[9px] font-black uppercase text-cyan-300">ÚLTIMA</span>}
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
                    {item.commercialClass && <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black ${classTone[item.commercialClass]}`}>{item.commercialClass} · {classDestination(item)}</span>}
                    {!!item.photos?.length && <span className="rounded-full border border-amber-300/20 bg-amber-300/[.04] px-2 py-0.5 text-[9px] font-black text-amber-200">{item.photos.length} FOTO(S)</span>}
                    {!!item.damages?.length && <span className="rounded-full border border-red-300/20 bg-red-300/[.04] px-2 py-0.5 text-[9px] font-black text-red-200">{item.damages.length} AVARIA(S)</span>}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{dateLabel(item.createdAt)} · {item.createdByName || item.createdByEmail || 'Avaliador não identificado'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelected(item)} className="flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:border-cyan-300/30 hover:text-cyan-200"><Eye size={14}/>VER DETALHES</button>
                  {isAdmin && <button
                    onClick={() => void removeItem(item)}
                    disabled={deletingId === item.id}
                    className="flex h-9 items-center gap-2 rounded-xl border border-red-300/20 bg-red-300/[.04] px-3 text-xs font-semibold text-red-300 transition hover:border-red-300/40 hover:bg-red-300/[.08] disabled:cursor-not-allowed disabled:opacity-50"
                    title="Excluir esta avaliação"
                  ><Trash2 size={14}/>{deletingId === item.id ? 'EXCLUINDO...' : 'EXCLUIR'}</button>}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Ano / KM</p><p className="mt-1 text-sm font-semibold">{item.year || '—'} · {item.km || '—'} km</p></div>
                <div className={`rounded-xl border p-3 ${item.commercialClass ? classTone[item.commercialClass] : 'border-white/10 bg-black/20 text-zinc-400'}`}><p className="text-[9px] uppercase opacity-70">Classificação</p><p className="mt-1 text-sm font-black">{item.commercialClass ? `${item.commercialClass} · ${classDestination(item)}` : 'Não classificado'}</p>{item.commercialClassOverride && <p className="mt-1 text-[9px] font-bold">AJUSTADA PELO AVALIADOR</p>}</div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">FIPE</p><p className="mt-1 text-sm font-semibold">{money(item.fipe)}</p>{fipeDelta !== 0 && <p className={`mt-1 text-[10px] ${fipeDelta > 0 ? 'text-emerald-300' : 'text-red-300'}`}>{fipeDelta > 0 ? '+' : ''}{money(fipeDelta)} vs anterior</p>}</div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Compra recomendada</p><p className="mt-1 text-sm font-semibold text-cyan-200">{item.recommendedBuy ? money(item.recommendedBuy) : '—'}</p>{buyDelta !== 0 && <p className={`mt-1 text-[10px] ${buyDelta > 0 ? 'text-emerald-300' : 'text-red-300'}`}>{buyDelta > 0 ? '+' : ''}{money(buyDelta)} vs anterior</p>}</div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Avarias</p><p className="mt-1 text-sm font-semibold text-amber-200">{money(item.damageTotal || 0)}</p></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Status</p><p className="mt-1 text-sm font-semibold">{statusLabel(item.status)}</p></div>
              </div>
            </div>)}
          </div>}
        </div>
      </div>
    </div>}

    {selected && <div className="fixed inset-0 z-[660] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
      <div className="mx-auto my-6 w-full max-w-3xl rounded-[24px] border border-white/10 bg-[#111416] p-5 text-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-300">AVALIAÇÃO SALVA · SOMENTE CONSULTA</p><h4 className="mt-1 text-xl font-semibold">{selected.plate} · {selected.vehicle || 'Veículo'}</h4><div className="mt-2 flex flex-wrap items-center gap-2"><p className="text-xs text-zinc-500">{dateLabel(selected.createdAt)} · {selected.storeName}</p>{selected.commercialClass && <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black ${classTone[selected.commercialClass]}`}>{selected.commercialClass} · {classDestination(selected)}</span>}</div></div>
          <button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-zinc-400"><X size={16}/></button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Ano / KM</p><p className="mt-1 font-semibold">{selected.year || '—'} · {selected.km || '—'} km</p></div>
          <div className={`rounded-xl border p-3 ${selected.commercialClass ? classTone[selected.commercialClass] : 'border-white/10 bg-black/20 text-zinc-400'}`}><p className="text-[9px] uppercase opacity-70">Classificação</p><p className="mt-1 font-black">{selected.commercialClass ? `${selected.commercialClass} · ${classDestination(selected)}` : 'Não classificado'}</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">FIPE</p><p className="mt-1 font-semibold">{money(selected.fipe)}</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Compra recomendada</p><p className="mt-1 font-semibold text-cyan-200">{selected.recommendedBuy ? money(selected.recommendedBuy) : 'Não registrada'}</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Avarias</p><p className="mt-1 font-semibold text-amber-200">{money(selected.damageTotal || 0)}</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Status</p><p className="mt-1 font-semibold">{statusLabel(selected.status)}</p></div>
        </div>

        {selected.commercialClass && <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Classificação comercial</p><p className="mt-1 text-lg font-semibold">Classe {selected.commercialClass} · {classDestination(selected)}</p></div>{selected.commercialClassOverride && <span className="rounded-full border border-amber-300/25 bg-amber-300/[.06] px-3 py-1 text-[9px] font-black text-amber-200">ALTERADA MANUALMENTE</span>}</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs"><div className="rounded-xl border border-white/10 p-3"><span className="text-zinc-500">Classe sugerida</span><strong className="float-right text-white">{selected.suggestedCommercialClass || '—'}</strong></div><div className="rounded-xl border border-white/10 p-3"><span className="text-zinc-500">KM considerado</span><strong className="float-right text-white">{selected.classificationKm ? `${selected.classificationKm.toLocaleString('pt-BR')} km` : '—'}</strong></div><div className="rounded-xl border border-white/10 p-3"><span className="text-zinc-500">Garantia de fábrica</span><strong className="float-right text-white">{selected.factoryWarranty ? 'SIM' : 'NÃO'}</strong></div><div className="rounded-xl border border-white/10 p-3"><span className="text-zinc-500">Critério validado</span><strong className="float-right text-white">{selected.classificationValid === false ? 'PENDENTE' : 'OK'}</strong></div></div>
          {selected.commercialClassOverride && <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[.035] p-3"><p className="text-[9px] font-black uppercase text-amber-200">Justificativa da alteração</p><p className="mt-1 text-sm leading-5 text-zinc-300">{selected.commercialClassReason || 'Justificativa não registrada.'}</p></div>}
          {(selected.classificationByName || selected.classificationByEmail) && <p className="mt-3 text-[10px] text-zinc-600">Classificação registrada por {selected.classificationByName || selected.classificationByEmail}{selected.classificationUpdatedAt ? ` · ${dateLabel(selected.classificationUpdatedAt)}` : ''}</p>}
        </div>}

        {!!selected.photos?.length && <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Fotos & documentos</p><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">{selected.photos.map(photo => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-white/10 bg-black/20">{photo.contentType === 'application/pdf' ? <div className="grid aspect-[4/3] place-items-center text-xs font-bold text-zinc-500">ABRIR PDF</div> : <img src={photo.url} alt={photo.name} className="aspect-[4/3] w-full object-cover"/>}<div className="p-2 text-[10px] text-zinc-500">{photo.category} · {photo.name}</div></a>)}</div></div>}

        {!!selected.damages?.length && <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Avarias registradas</p><div className="mt-2 space-y-2">{selected.damages.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3"><span className="text-sm text-zinc-300">{item.description}</span><strong className="shrink-0 text-sm text-amber-200">{money(item.cost)}</strong></div>)}</div></div>}

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] font-black uppercase text-zinc-400">Ver evolução da avaliação</p>
          {(selected.revisionHistory||[]).length?
            <ol className="mt-3 space-y-3">{selected.revisionHistory!.map(entry=><li key={entry.id} className="border-l-2 border-cyan-400/40 pl-3 text-xs">
              <strong>{entry.type==='created'?'Rascunho criado':entry.type==='draft_updated'?'Rascunho atualizado':entry.type==='approved'?'Avaliação aprovada':'Avaliação recusada'}</strong>
              <p className="mt-1 text-zinc-400">{dateLabel(entry.at)} · {entry.byName||entry.byEmail||'Avaliador'}</p>
              {typeof entry.recommendedBuy==='number'&&<p className="mt-1 text-cyan-200">{money(entry.recommendedBuy)}</p>}
              {entry.notes&&<p className="mt-1 whitespace-pre-wrap text-zinc-400">{entry.notes}</p>}
            </li>)}</ol>
            :<p className="mt-2 text-xs text-zinc-500">Registro antigo: etapas anteriores não foram registradas.</p>}
          {!!selected.previousEvaluationId&&<p className="mt-3 text-xs text-zinc-500">Nova avaliação vinculada à anterior, sem alterar o registro anterior.</p>}
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Observações do avaliador</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{selected.notes || 'Sem observações registradas.'}</p></div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">Avaliado por {selected.createdByName || selected.createdByEmail || '—'}</div>
          {isAdmin && <button
            onClick={() => void removeItem(selected)}
            disabled={deletingId === selected.id}
            className="flex h-9 items-center gap-2 rounded-xl border border-red-300/20 bg-red-300/[.04] px-3 text-xs font-semibold text-red-300 hover:border-red-300/40 hover:bg-red-300/[.08] disabled:cursor-not-allowed disabled:opacity-50"
          ><Trash2 size={14}/>{deletingId === selected.id ? 'EXCLUINDO...' : 'EXCLUIR AVALIAÇÃO'}</button>}
        </div>
      </div>
    </div>}
  </>;
};

export default MarketIQHistoryPanel;
