import React, { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { ShowroomPassage, User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser } from '../services/companyService';
import { storeIdForUser } from '../services/storeService';
import { showroomFlowService } from '../services/showroomFlowService';

const TERMINAL = new Set(['sale', 'no_deal']);

const clickClear = () => {
  const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  const clear = buttons.find(button => String(button.textContent || '').trim().toUpperCase() === 'LIMPAR')
    || buttons.find(button => String(button.textContent || '').toUpperCase().includes('LIMPAR'));
  clear?.click();

  window.dispatchEvent(new CustomEvent('motyq:group-stock-clear', { detail: { reason: 'showroom-finalized' } }));
  window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 80);
};

const SellerShowroomAutoReset: React.FC = () => {
  const previous = useRef(new Map<string, string>());
  const initialized = useRef(false);

  useEffect(() => {
    let unsubscribePassages: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async firebaseUser => {
      unsubscribePassages?.();
      unsubscribePassages = null;
      previous.current.clear();
      initialized.current = false;

      if (!firebaseUser?.email) return;

      let profile: User | null = null;
      try {
        profile = await userService.getUser(firebaseUser.email);
      } catch {
        return;
      }

      if (!profile || profile.status !== 'active' || (profile.role !== 'seller' && profile.role !== 'user')) return;

      const companyId = companyIdForUser(profile);
      const storeId = storeIdForUser(profile);

      unsubscribePassages = showroomFlowService.subscribeSellerPassages(
        companyId,
        storeId,
        profile.email,
        (items: ShowroomPassage[]) => {
          if (!initialized.current) {
            previous.current = new Map(items.map(item => [item.id, item.status]));
            initialized.current = true;
            return;
          }

          let finalizedNow = false;
          for (const item of items) {
            const before = previous.current.get(item.id);
            if (before && !TERMINAL.has(before) && TERMINAL.has(item.status)) {
              finalizedNow = true;
              break;
            }
          }

          previous.current = new Map(items.map(item => [item.id, item.status]));
          if (finalizedNow) clickClear();
        },
        error => console.warn('Motyq: não foi possível acompanhar o encerramento do atendimento.', error),
      );
    });

    return () => {
      unsubscribePassages?.();
      unsubscribeAuth();
    };
  }, []);

  return null;
};

export default SellerShowroomAutoReset;
