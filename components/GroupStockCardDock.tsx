import React, { useEffect, useState } from 'react';
import { CarFront, X } from 'lucide-react';

const LOOKUP_LABEL = 'estoque compartilhado do grupo';

const findLookupCard = () => {
  const labels = Array.from(document.querySelectorAll('p')) as HTMLParagraphElement[];
  for (const label of labels) {
    if (String(label.textContent || '').trim().toLowerCase() !== LOOKUP_LABEL) continue;
    const card = label.closest('div.fixed') as HTMLDivElement | null;
    if (card && String(card.className || '').includes('max-w-[410px]')) return card;
  }
  return null;
};

const GroupStockCardDock: React.FC = () => {
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const discover = () => {
      const next = findLookupCard();
      if (!next) {
        setCard(current => current && document.body.contains(current) ? current : null);
        return;
      }
      setCard(next);
      const title = next.querySelector('h3');
      const meta = title?.nextElementSibling;
      setModel(String(title?.textContent || '').trim());
      setPlate(String(meta?.textContent || '').split('·')[0]?.trim() || '');
    };

    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!card) return;
    card.style.display = open ? 'block' : 'none';
    if (open) {
      card.style.top = '150px';
      card.style.right = '72px';
    }
    return () => {
      if (card) {
        card.style.display = '';
        card.style.top = '';
        card.style.right = '';
      }
    };
  }, [card, open]);

  useEffect(() => {
    if (!card) setOpen(false);
  }, [card]);

  if (!card) return null;

  return <>
    <button
      type="button"
      onClick={() => setOpen(value => !value)}
      title={model ? `${model}${plate ? ` · ${plate}` : ''}` : 'Veículo localizado no estoque do grupo'}
      className={`fixed right-3 top-1/2 z-[346] flex -translate-y-1/2 items-center gap-2 rounded-2xl border px-3 py-2.5 shadow-2xl backdrop-blur-xl transition md:right-4 ${open ? 'border-sky-300/40 bg-sky-300 text-sky-950' : 'border-sky-300/25 bg-zinc-950/95 text-sky-300 hover:border-sky-300/45'}`}
    >
      {open ? <X size={17}/> : <CarFront size={18}/>} 
      <span className="hidden max-w-[160px] truncate text-[10px] font-black uppercase tracking-[.08em] lg:block">{open ? 'FECHAR DETALHES' : 'VEÍCULO DO GRUPO'}</span>
      {!open && <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full border-2 border-zinc-950 bg-emerald-400"/>}
    </button>
  </>;
};

export default GroupStockCardDock;
