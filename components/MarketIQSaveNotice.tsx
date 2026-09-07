import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Notice = { state: SaveState; text: string };

const findSaveButton = () => Array.from(document.querySelectorAll('button')).find(button => {
  const text = String(button.textContent || '').trim().toUpperCase();
  return text.includes('SALVAR AVALIAÇÃO') || text.includes('SALVAR ALTERAÇÕES') || text.includes('AVALIAÇÃO SALVA') || text.includes('SALVANDO') || text.includes('SALVAR NOVAMENTE');
}) as HTMLButtonElement | undefined;

const setButtonLabel = (button: HTMLButtonElement, label: string) => {
  const nodes = Array.from(button.childNodes);
  const textNode = nodes.find(node => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    if (textNode.textContent !== label) textNode.textContent = label;
  } else {
    button.appendChild(document.createTextNode(label));
  }
};

const MarketIQSaveNotice: React.FC = () => {
  const [notice, setNotice] = useState<Notice>({ state: 'idle', text: '' });
  const stateRef = useRef<SaveState>('idle');
  const timerRef = useRef<number | null>(null);

  const applyButtonState = () => {
    const button = findSaveButton();
    if (!button) return;
    const state = stateRef.current;
    if (state === 'saving') {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.classList.add('opacity-70', 'cursor-not-allowed');
      setButtonLabel(button, ' SALVANDO...');
      return;
    }
    if (state === 'saved') {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.classList.add('opacity-80', 'cursor-not-allowed');
      setButtonLabel(button, ' AVALIAÇÃO SALVA ✓');
      return;
    }
    button.disabled = false;
    button.removeAttribute('aria-disabled');
    button.classList.remove('opacity-70', 'opacity-80', 'cursor-not-allowed');
    setButtonLabel(button, state === 'error' ? ' SALVAR NOVAMENTE' : ' SALVAR AVALIAÇÃO');
  };

  const changeState = (next: Notice) => {
    stateRef.current = next.state;
    setNotice(next);
    window.setTimeout(applyButtonState, 0);
  };

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };

    const scheduleHide = (ms = 4500) => {
      clearTimer();
      timerRef.current = window.setTimeout(() => setNotice(v => ({ ...v, text: '' })), ms);
    };

    const requested = () => {
      clearTimer();
      changeState({ state: 'saving', text: 'Salvando avaliação...' });
    };

    const persisted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.action && detail.action !== 'save') return;
      if (detail.duplicatePrevented) {
        changeState({ state: 'saved', text: 'Esta avaliação já foi salva. Nenhuma cópia nova foi criada.' });
      } else if (detail.updatedExisting) {
        changeState({ state: 'saved', text: 'Avaliação atualizada com sucesso.' });
      } else {
        changeState({ state: 'saved', text: 'Avaliação salva com sucesso.' });
      }
      scheduleHide();
    };

    const failed = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.action && detail.action !== 'save') return;
      changeState({ state: 'error', text: detail.message || 'Não foi possível salvar a avaliação.' });
      scheduleHide(6000);
    };

    const unlockOnEdit = () => {
      if (stateRef.current !== 'saved') return;
      if (!findSaveButton()) return;
      changeState({ state: 'idle', text: 'Alterações detectadas. Salve novamente quando terminar.' });
      scheduleHide(3000);
    };

    const observer = new MutationObserver(() => applyButtonState());
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('motyq:marketiq-save-requested', requested as EventListener);
    window.addEventListener('motyq:marketiq-persisted', persisted as EventListener);
    window.addEventListener('motyq:marketiq-persistence-error', failed as EventListener);
    document.addEventListener('input', unlockOnEdit, true);
    document.addEventListener('change', unlockOnEdit, true);

    return () => {
      clearTimer();
      observer.disconnect();
      window.removeEventListener('motyq:marketiq-save-requested', requested as EventListener);
      window.removeEventListener('motyq:marketiq-persisted', persisted as EventListener);
      window.removeEventListener('motyq:marketiq-persistence-error', failed as EventListener);
      document.removeEventListener('input', unlockOnEdit, true);
      document.removeEventListener('change', unlockOnEdit, true);
    };
  }, []);

  if (!notice.text) return null;

  const tone = notice.state === 'error'
    ? 'border-red-200 bg-red-50 text-red-700'
    : notice.state === 'saving'
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : notice.state === 'idle'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return <div className={`fixed right-6 top-24 z-[720] flex max-w-sm items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg ${tone}`}>
    {notice.state === 'saving' ? <Loader2 size={18} className="shrink-0 animate-spin"/> : notice.state === 'error' ? <AlertCircle size={18} className="shrink-0"/> : <CheckCircle2 size={18} className="shrink-0"/>}
    <span>{notice.text}</span>
  </div>;
};

export default MarketIQSaveNotice;
