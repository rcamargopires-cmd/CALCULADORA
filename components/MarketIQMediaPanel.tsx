import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, FileImage, Plus, Trash2, Upload, Wrench, X } from 'lucide-react';
import { MarketIQDamageItem, MarketIQMediaCategory, MarketIQMediaItem, marketIqEvaluationService } from '../services/marketIqEvaluationService';
import { marketIqMediaService } from '../services/marketIqMediaService';

type Props = { companyId: string; storeId: string };

const categories: Array<{ value: MarketIQMediaCategory; label: string }> = [
  { value: 'front', label: 'Frente' }, { value: 'rear', label: 'Traseira' }, { value: 'left', label: 'Lateral esq.' }, { value: 'right', label: 'Lateral dir.' },
  { value: 'interior', label: 'Interior' }, { value: 'dashboard', label: 'Painel' }, { value: 'tires', label: 'Pneus' }, { value: 'damage', label: 'Avaria' }, { value: 'document', label: 'Documento' },
];
const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const isOpen = () => Array.from(document.querySelectorAll('p')).some(node => String(node.textContent || '').includes('MOTYQ MARKETIQ · V2'));
const currentPlate = () => {
  for (const label of Array.from(document.querySelectorAll('label'))) {
    if (!String(label.textContent || '').trim().toUpperCase().startsWith('PLACA')) continue;
    const input = label.querySelector('input') as HTMLInputElement | null;
    const value = cleanPlate(input?.value || '');
    if (value) return value;
  }
  return '';
};
const parseNumber = (value: string) => Number(String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;

const setOtherPreparation = (() => {
  let baseOther = 0;
  let lastDamage = 0;
  return (damageTotal: number) => {
    const label = Array.from(document.querySelectorAll('label')).find(item => String(item.textContent || '').trim().toUpperCase().startsWith('OUTROS')) as HTMLLabelElement | undefined;
    const input = label?.querySelector('input') as HTMLInputElement | null;
    if (!input) return;
    const current = parseNumber(input.value);
    if (lastDamage === 0) baseOther = current;
    else if (Math.abs(current - (baseOther + lastDamage)) > 0.01) baseOther = Math.max(0, current - lastDamage);
    const next = baseOther + damageTotal;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    lastDamage = damageTotal;
  };
})();

const MarketIQMediaPanel: React.FC<Props> = ({ companyId, storeId }) => {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState('');
  const [category, setCategory] = useState<MarketIQMediaCategory>('front');
  const [photos, setPhotos] = useState<MarketIQMediaItem[]>([]);
  const [damages, setDamages] = useState<MarketIQDamageItem[]>([]);
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [damageMediaId, setDamageMediaId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const savedRef = useRef(false);
  const filesRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const refresh = () => {
      const next = isOpen();
      setVisible(next);
      if (next) setPlate(currentPlate());
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    const poll = window.setInterval(() => { if (isOpen()) setPlate(currentPlate()); }, 700);
    return () => { observer.disconnect(); window.clearInterval(poll); };
  }, []);

  const damageTotal = useMemo(() => damages.reduce((sum, item) => sum + Math.max(0, Number(item.cost || 0)), 0), [damages]);
  useEffect(() => { if (visible) setOtherPreparation(damageTotal); }, [damageTotal, visible]);

  useEffect(() => {
    const persisted = async (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const eventPlate = cleanPlate(detail.plate || '');
      if (!detail.id || !eventPlate || eventPlate !== cleanPlate(plate)) return;
      try {
        await marketIqEvaluationService.attachMedia(detail.id, photos, damages);
        savedRef.current = true;
      } catch (e) {
        console.error('MarketIQ media attach failed', e);
      }
    };
    window.addEventListener('motyq:marketiq-persisted', persisted as EventListener);
    return () => window.removeEventListener('motyq:marketiq-persisted', persisted as EventListener);
  }, [plate, photos, damages]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const targetPlate = currentPlate();
    setPlate(targetPlate);
    if (!targetPlate) { setError('Informe a placa antes de adicionar fotos.'); return; }
    setUploading(true); setError('');
    try {
      const added: MarketIQMediaItem[] = [];
      for (const file of Array.from(files)) added.push(await marketIqMediaService.upload({ companyId, storeId, plate: targetPlate, category, file }));
      setPhotos(prev => [...prev, ...added]);
    } catch (e: any) {
      console.error('MarketIQ upload failed', e);
      setError(e?.message || 'Não foi possível enviar o arquivo.');
    } finally {
      setUploading(false);
      if (filesRef.current) filesRef.current.value = '';
    }
  };

  const removePhoto = async (item: MarketIQMediaItem) => {
    try { await marketIqMediaService.remove(item); } catch {}
    setPhotos(prev => prev.filter(photo => photo.id !== item.id));
    setDamages(prev => prev.map(d => d.mediaId === item.id ? { ...d, mediaId: undefined } : d));
  };

  const addDamage = () => {
    const value = Math.max(0, parseNumber(cost));
    if (!description.trim() && value <= 0) return;
    setDamages(prev => [...prev, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, description: description.trim() || 'Avaria sem descrição', cost: value, mediaId: damageMediaId || undefined }]);
    setDescription(''); setCost(''); setDamageMediaId('');
  };

  if (!visible && !open) return null;

  return <>
    {visible && !open && <button onClick={() => { setPlate(currentPlate()); setOpen(true); }} className="fixed right-[205px] top-[27px] z-[625] flex h-10 items-center gap-2 rounded-xl border border-amber-300/20 bg-[#11191b]/95 px-3 text-xs font-bold text-amber-200 shadow-xl backdrop-blur hover:border-amber-300/40"><Camera size={15}/>FOTOS & AVARIAS</button>}

    {open && <div className="fixed inset-0 z-[645] overflow-y-auto bg-black/75 p-3 backdrop-blur-sm md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-6xl rounded-[28px] border border-white/10 bg-[#101315] text-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-6">
          <div><p className="text-[10px] font-black uppercase tracking-[.17em] text-amber-300">MOTYQ MARKETIQ · EVIDÊNCIAS</p><h3 className="mt-1 text-xl font-semibold">Fotos & avarias · {plate || 'sem placa'}</h3><p className="mt-1 text-sm text-zinc-500">As avarias entram automaticamente no custo de preparação.</p></div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-zinc-400"><X size={18}/></button>
        </header>

        <div className="grid gap-5 p-4 md:p-6 lg:grid-cols-[1.12fr_.88fr]">
          <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold">Galeria da avaliação</h4><p className="mt-1 text-xs text-zinc-500">{photos.length} arquivo(s) nesta avaliação</p></div><div className="flex gap-2"><select value={category} onChange={e => setCategory(e.target.value as MarketIQMediaCategory)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs">{categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button disabled={uploading} onClick={() => filesRef.current?.click()} className="flex h-10 items-center gap-2 rounded-xl bg-amber-300 px-3 text-xs font-black text-black disabled:opacity-50"><Upload size={14}/>{uploading ? 'ENVIANDO...' : 'ADICIONAR'}</button><input ref={filesRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => void upload(e.target.files)}/></div></div>
            {error && <div className="mt-3 rounded-xl border border-red-300/15 bg-red-300/[.04] p-3 text-xs text-red-200">{error}</div>}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {photos.map(item => <div key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"><div className="aspect-[4/3] bg-black/30">{item.contentType === 'application/pdf' ? <div className="grid h-full place-items-center text-zinc-500"><FileImage size={30}/></div> : <img src={item.url} alt={item.name} className="h-full w-full object-cover"/>}</div><div className="p-2.5"><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold uppercase text-zinc-400">{categories.find(c => c.value === item.category)?.label || item.category}</span><button onClick={() => void removePhoto(item)} className="text-zinc-600 hover:text-red-300"><Trash2 size={13}/></button></div><p className="mt-1 truncate text-[10px] text-zinc-600">{item.name}</p></div></div>)}
              {!photos.length && <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-600">Adicione frente, traseira, interior, pneus e avarias para documentar a avaliação.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
            <div className="flex items-center gap-2"><Wrench size={16} className="text-amber-300"/><h4 className="font-semibold">Avarias e custo</h4></div>
            <div className="mt-4 grid gap-3"><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: amassado porta traseira direita" className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none"/><div className="grid grid-cols-2 gap-3"><input value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="Custo estimado" className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none"/><select value={damageMediaId} onChange={e => setDamageMediaId(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs"><option value="">Sem foto vinculada</option>{photos.filter(p => p.category === 'damage').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><button onClick={addDamage} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[.06] text-xs font-bold text-amber-200"><Plus size={14}/>ADICIONAR AVARIA</button></div>

            <div className="mt-4 space-y-2">{damages.map(item => <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-zinc-200">{item.description}</p><p className="mt-1 text-xs text-amber-200">{money(item.cost)}</p></div><button onClick={() => setDamages(prev => prev.filter(d => d.id !== item.id))} className="text-zinc-600 hover:text-red-300"><Trash2 size={14}/></button></div></div>)}{!damages.length && <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-zinc-600">Nenhuma avaria adicionada.</div>}</div>
            <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[.05] p-4"><p className="text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">TOTAL DE AVARIAS</p><p className="mt-1 text-2xl font-semibold text-amber-200">{money(damageTotal)}</p><p className="mt-1 text-[10px] text-zinc-600">Este valor é somado ao campo “Outros” da preparação do MarketIQ.</p></div>
          </section>
        </div>
      </div>
    </div>}
  </>;
};

export default MarketIQMediaPanel;
