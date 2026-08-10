import React, { useEffect } from 'react';
import { User } from '../types';

type Props = { user: User };

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const SellerPrivacyGuard: React.FC<Props> = ({ user }) => {
  useEffect(() => {
    if (!['seller', 'user'].includes(user.role)) return;

    let applying = false;

    const applySellerScope = () => {
      if (applying) return;
      applying = true;
      try {
        const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
        const sellerSelect = selects.find(select =>
          Array.from(select.options).some(option => normalize(option.textContent || '').includes('todos os vendedores'))
        );

        if (!sellerSelect) return;

        const ownOption = Array.from(sellerSelect.options).find(option =>
          option.value === user.id || normalize(option.textContent || '') === normalize(user.name || '')
        );

        const selectorContainer = sellerSelect.parentElement;
        if (selectorContainer) selectorContainer.style.display = 'none';

        const heading = Array.from(document.querySelectorAll('h3')).find(el =>
          normalize(el.textContent || '').includes('historico de negocios')
        );
        const historySection = heading?.closest('.mt-8') as HTMLElement | null;

        if (ownOption) {
          if (sellerSelect.value !== ownOption.value) {
            sellerSelect.value = ownOption.value;
            sellerSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (historySection) historySection.style.display = '';
        } else if (historySection) {
          // Vendedor novo, sem negociações próprias ainda: não exibe negócios de terceiros.
          historySection.style.display = 'none';
        }
      } finally {
        applying = false;
      }
    };

    applySellerScope();
    const observer = new MutationObserver(() => window.requestAnimationFrame(applySellerScope));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [user.id, user.name, user.role]);

  return null;
};

export default SellerPrivacyGuard;
