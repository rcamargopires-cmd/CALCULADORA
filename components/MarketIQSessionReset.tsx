import React, { useEffect } from 'react';

const marketRoot = () => Array.from(document.querySelectorAll('div.fixed.inset-0'))
  .find(el => String(el.textContent || '').includes('MOTYQ MARKETIQ')) as HTMLElement | undefined;

const resetInput = (input: HTMLInputElement) => {
  if (input.type === 'file') {
    input.value = '';
    return;
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const clearMarketIQFields = (root: HTMLElement) => {
  root.querySelectorAll<HTMLInputElement>('input').forEach(resetInput);
};

const MarketIQSessionReset: React.FC = () => {
  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      const root = marketRoot();
      if (!root) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const button = target.closest('button');
      const clickedClose = Boolean(button && root.contains(button) && button.querySelector('svg.lucide-x'));

      // Clique fora da janela é acidental: não fecha e não apaga a avaliação em andamento.
      // A limpeza fica restrita ao fechamento explícito pelo X.
      if (clickedClose) {
        clearMarketIQFields(root);
      }
    };

    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, []);

  return null;
};

export default MarketIQSessionReset;
