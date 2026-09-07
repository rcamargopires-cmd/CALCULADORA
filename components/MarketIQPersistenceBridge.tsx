import React, { useEffect } from 'react';
import { User } from '../types';
import { marketIqEvaluationService } from '../services/marketIqEvaluationService';

type Props = {
  currentUser: User;
  companyId: string;
  storeId: string;
  storeName: string;
};

const normalize = (value: unknown) => String(value || '').trim();

const MarketIQPersistenceBridge: React.FC<Props> = ({ currentUser, companyId, storeId, storeName }) => {
  useEffect(() => {
    const save = async (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const plate = normalize(detail.plate).toUpperCase();
      if (!plate) {
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persistence-error', { detail: { message: 'Informe a placa antes de salvar.' } }));
        return;
      }
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
          createdByEmail: normalize((currentUser as any)?.email).toLowerCase(),
          createdByName: normalize((currentUser as any)?.name || (currentUser as any)?.displayName || (currentUser as any)?.email),
        });
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persisted', { detail: { id, plate, status: 'draft' } }));
      } catch (error) {
        console.error('MarketIQ save failed', error);
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persistence-error', { detail: { message: 'Não foi possível salvar a avaliação.' } }));
      }
    };

    const setDecision = async (event: Event, status: 'approved' | 'rejected') => {
      const detail = (event as CustomEvent).detail || {};
      const plate = normalize(detail.plate).toUpperCase();
      if (!plate) return;
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
            createdByEmail: normalize((currentUser as any)?.email).toLowerCase(),
            createdByName: normalize((currentUser as any)?.name || (currentUser as any)?.displayName || (currentUser as any)?.email),
          });
          latest = await marketIqEvaluationService.getLatestByPlate(companyId, storeId, plate);
          if (!latest && id) return;
        }
        if (!latest) return;
        await marketIqEvaluationService.setStatus(latest.id, status, typeof detail.value === 'number' ? detail.value : undefined);
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persisted', { detail: { id: latest.id, plate, status } }));
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
