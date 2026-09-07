import React, { useEffect, useMemo, useState } from 'react';
import { Eye, History, Trash2, X } from 'lucide-react';
import { User } from '../types';
import { MarketIQEvaluation, marketIqEvaluationService } from '../services/marketIqEvaluationService';

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

const readCurrentPlate = () => {
  const labels = Array.from(document.querySelectorAll('label'));
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
    const target = cleanPlate(plateValue || plate || readCurrentPlate());
    setPlate(target);
    setSelected(null);
    if (!target) {
      setItems([]);
      setError('Informe a placa na avaliação para consultar o histórico.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setItems(await marketIqEvaluationService.listByPlate(companyId, storeId, target));
    } catch (e) {
      console.error('MarketIQ history load failed', e);
      setItems([]);
      setError('Não foi possível carregar o histórico desta placa.');
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
      onClick={() => { setOpen(true); void load(readCurrentPlate()); }}
      className="fixed right-[74px] top-[27px] z-[625] flex h-10 items-center gap-2 rounded-xl border border-cyan-300/20 bg-[#11191b]/95 px-3 text-xs font-bold text-cyan-200 shadow-xl backdrop-blur hover:border-cyan-300/40"
      title="Histórico de avaliações MarketIQ"
    ><History size={15}/>HISTÓRICO</button>}

    {open && <div className="fixed inset-0 z-[640] overflow-y-auto bg-black/75 p-3 backdrop-blur-sm md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-5xl rounded-[26px] border border-white/10 bg-[#101315] text-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-white/10 p-5 md:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">MOTYQ MARKETIQ · HISTÓRICO</p>
            <h3 className="mt-1 text-xl font-semibold">Avaliações da placa {plate || '—'}</h3>
            <p className="mt-1 text-sm text-zinc-500">Histórico permanente da unidade ativa{isAdmin ? ' · administrador pode excluir registros' : ''}</p>
          </div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-zinc-400 hover:text-white"><X size={18}/></button>
        </header>

        <div className="p-4 md:p-6">
          {!!notice && <div className="mb-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/[.06] px-4 py-3 text-sm font-semibold text-emerald-200">{notice}</div>}
          {loading && <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5 text-sm text-zinc-400">Carregando avaliações...</div>}
          {!loading && error && <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-5 text-sm text-amber-100">{error}</div>}
          {!loading && !error && !items.length && <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5 text-sm text-zinc-400">Ainda não existe avaliação salva para esta placa.</div>}

          {!loading && rows.length > 0 && <div className="space-y-3">
            {rows.map(({ item, index, buyDelta, fipeDelta }) => <div key={item.id} className={`rounded-2xl border p-4 ${index === 0 ? 'border-cyan-300/25 bg-cyan-300/[.035]' : 'border-white/10 bg-white/[.02]'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-base">{item.vehicle || 'Veículo sem descrição'}</strong>
                    {index === 0 && <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.05] px-2 py-0.5 text-[9px] font-black uppercase text-cyan-300">ÚLTIMA</span>}
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
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

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Ano / KM</p><p className="mt-1 text-sm font-semibold">{item.year || '—'} · {item.km || '—'} km</p></div>
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
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-300">AVALIAÇÃO SALVA · SOMENTE CONSULTA</p><h4 className="mt-1 text-xl font-semibold">{selected.plate} · {selected.vehicle || 'Veículo'}</h4><p className="mt-1 text-xs text-zinc-500">{dateLabel(selected.createdAt)} · {selected.storeName}</p></div>
          <button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-zinc-400"><X size={16}/></button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Ano / KM</p><p className="mt-1 font-semibold">{selected.year || '—'} · {selected.km || '—'} km</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">FIPE</p><p className="mt-1 font-semibold">{money(selected.fipe)}</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Compra recomendada</p><p className="mt-1 font-semibold text-cyan-200">{selected.recommendedBuy ? money(selected.recommendedBuy) : 'Não registrada'}</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Avarias</p><p className="mt-1 font-semibold text-amber-200">{money(selected.damageTotal || 0)}</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-500">Status</p><p className="mt-1 font-semibold">{statusLabel(selected.status)}</p></div>
        </div>

        {!!selected.photos?.length && <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Fotos & documentos</p><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">{selected.photos.map(photo => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-white/10 bg-black/20">{photo.contentType === 'application/pdf' ? <div className="grid aspect-[4/3] place-items-center text-xs font-bold text-zinc-500">ABRIR PDF</div> : <img src={photo.url} alt={photo.name} className="aspect-[4/3] w-full object-cover"/>}<div className="p-2 text-[10px] text-zinc-500">{photo.category} · {photo.name}</div></a>)}</div></div>}

        {!!selected.damages?.length && <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Avarias registradas</p><div className="mt-2 space-y-2">{selected.damages.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3"><span className="text-sm text-zinc-300">{item.description}</span><strong className="shrink-0 text-sm text-amber-200">{money(item.cost)}</strong></div>)}</div></div>}

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
