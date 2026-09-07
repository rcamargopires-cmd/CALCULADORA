import React, { useEffect } from 'react';
import { arrayUnion, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';
import { marketIqEvaluationService } from '../services/marketIqEvaluationService';
import { MARKETIQ_SHOWROOM_LINK_KEY, MarketIQShowroomLink } from './MarketIQShowroomLinkBridge';

type Props = {
  currentUser: User;
  companyId: string;
  storeId: string;
  storeName: string;
};

const normalize = (value: unknown) => String(value || '').trim();

const readLink = (): MarketIQShowroomLink | null => {
  try {
    const raw = window.sessionStorage.getItem(MARKETIQ_SHOWROOM_LINK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketIQShowroomLink;
    return parsed?.passageId ? parsed : null;
  } catch { return null; }
};

const linkFields = (link: MarketIQShowroomLink | null) => link ? {
  showroomPassageId: link.passageId,
  dealId: link.dealId || '',
  customerName: link.customerName || '',
  customerPhone: link.customerPhone || '',
  interestModel: link.interestModel || '',
  sellerName: link.sellerName || '',
  sellerEmail: link.sellerEmail || '',
  linkedAt: new Date().toISOString(),
} : {};

const MarketIQPersistenceBridge: React.FC<Props> = ({ currentUser, companyId, storeId, storeName }) => {
  useEffect(() => {
    const linkBack = async (evaluationId: string, link: MarketIQShowroomLink | null) => {
      if (!link?.passageId) return;
      const now = new Date().toISOString();
      try {
        await updateDoc(doc(db, 'showroom_passages', link.passageId), {
          marketIqEvaluationIds: arrayUnion(evaluationId),
          marketIqLatestEvaluationId: evaluationId,
          updatedAt: now,
        });
      } catch (error) {
        console.warn('MarketIQ: avaliação salva, mas não foi possível gravar o vínculo no atendimento.', error);
      }
      if (!link.dealId) return;
      try {
        await setDoc(doc(db, 'deals', link.dealId), {
          marketIqEvaluationIds: arrayUnion(evaluationId),
          marketIqLatestEvaluationId: evaluationId,
          marketIqLinkedAt: now,
        }, { merge: true });
      } catch (error) {
        console.warn('MarketIQ: avaliação salva, mas não foi possível gravar o vínculo na negociação.', error);
      }
    };

    const save = async (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const plate = normalize(detail.plate).toUpperCase();
      if (!plate) {
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persistence-error', { detail: { message: 'Informe a placa antes de salvar.' } }));
        return;
      }
      const link = readLink();
      try {
        const id = await marketIqEvaluationService.create({
          companyId,
          storeId,
          storeName,
          plate,
          vehicle: normalize(detail.vehicle),
          year: normalize(detail.year),
          km: normalize(detail.km),
          fipe: normalize(detail.fipe),
          notes: normalize(detail.notes),
          ...linkFields(link),
          createdByEmail: normalize((currentUser as any)?.email).toLowerCase(),
          createdByName: normalize((currentUser as any)?.name || (currentUser as any)?.displayName || (currentUser as any)?.email),
        });
        await linkBack(id, link);
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persisted', { detail: { id, plate, status: 'draft', showroomPassageId: link?.passageId || '', dealId: link?.dealId || '' } }));
      } catch (error) {
        console.error('MarketIQ save failed', error);
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persistence-error', { detail: { message: 'Não foi possível salvar a avaliação.' } }));
      }
    };

    const setDecision = async (event: Event, status: 'approved' | 'rejected') => {
      const detail = (event as CustomEvent).detail || {};
      const plate = normalize(detail.plate).toUpperCase();
      if (!plate) return;
      const link = readLink();
      try {
        let latest = await marketIqEvaluationService.getLatestByPlate(companyId, storeId, plate);
        if (!latest) {
          const id = await marketIqEvaluationService.create({
            companyId,
            storeId,
            storeName,
            plate,
            vehicle: '',
            year: '',
            km: '',
            fipe: '',
            notes: '',
            recommendedBuy: typeof detail.value === 'number' ? detail.value : undefined,
            ...linkFields(link),
            createdByEmail: normalize((currentUser as any)?.email).toLowerCase(),
            createdByName: normalize((currentUser as any)?.name || (currentUser as any)?.displayName || (currentUser as any)?.email),
          });
          await linkBack(id, link);
          latest = await marketIqEvaluationService.getLatestByPlate(companyId, storeId, plate);
          if (!latest && id) return;
        }
        if (!latest) return;
        await marketIqEvaluationService.setStatus(latest.id, status, typeof detail.value === 'number' ? detail.value : undefined);
        if (link?.passageId) await linkBack(latest.id, link);
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persisted', { detail: { id: latest.id, plate, status, showroomPassageId: link?.passageId || latest.showroomPassageId || '', dealId: link?.dealId || latest.dealId || '' } }));
      } catch (error) {
        console.error('MarketIQ decision failed', error);
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persistence-error', { detail: { message: 'Não foi possível atualizar o status da avaliação.' } }));
      }
    };

    const approved = (event: Event) => void setDecision(event, 'approved');
    const rejected = (event: Event) => void setDecision(event, 'rejected');

    window.addEventListener('motyq:marketiq-save-requested', save as EventListener);
    window.addEventListener('motyq:marketiq-approved', approved as EventListener);
    window.addEventListener('motyq:marketiq-rejected', rejected as EventListener);
    return () => {
      window.removeEventListener('motyq:marketiq-save-requested', save as EventListener);
      window.removeEventListener('motyq:marketiq-approved', approved as EventListener);
      window.removeEventListener('motyq:marketiq-rejected', rejected as EventListener);
    };
  }, [currentUser, companyId, storeId, storeName]);

  return null;
};

export default MarketIQPersistenceBridge;
