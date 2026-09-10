import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';

const SLOT_ID = 'motyq-seller-delivery-agenda-slot';
const AGENDA_URL = 'https://agenda-gold-six.vercel.app/';

const findSellerNav = () => document.querySelector('#root nav') as HTMLElement | null;

const ensureSlot = () => {
  const existing = document.getElementById(SLOT_ID);
  if (existing) return existing;
  const nav = findSellerNav();
  if (!nav) return null;
  const slot = document.createElement('span');
  slot.id = SLOT_ID;
  slot.className = 'contents';
  nav.appendChild(slot);
  return slot;
};

const SellerDeliveryAgendaShortcut: React.FC = () => {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const next = ensureSlot();
      if (next) setSlot(next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!slot) return null;

  return createPortal(
    <a
      href={AGENDA_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir Agenda de Entregas"
      className="flex items-center gap-2 rounded-md px-4 py-1.5 text-xs font-bold text-zinc-500 transition-all hover:text-zinc-300"
    >
      <CalendarDays size={14}/>
      AGENDA DE ENTREGA
    </a>,
    slot,
  );
};

export default SellerDeliveryAgendaShortcut;
