import React, { useEffect } from 'react';
import { evaluationQueueService, EvaluationQueueRequest } from '../services/evaluationQueueService';
import { ACTIVE_EVALUATION_REQUEST_KEY } from './EvaluationCenter';

const DECISION_KEY = 'motyq:active-evaluation-decision-v2';
const cleanPlate = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

const readActiveRequest = (): EvaluationQueueRequest | null => {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_EVALUATION_REQUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EvaluationQueueRequest;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
};

const EvaluationDecisionBridge: React.FC = () => {
  useEffect(() => {
    const approved = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      window.sessionStorage.setItem(DECISION_KEY, JSON.stringify({
        plate: cleanPlate(detail.plate),
        status: 'approved',
        value: typeof detail.value === 'number' ? detail.value : undefined,
      }));
    };

    const rejected = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      window.sessionStorage.setItem(DECISION_KEY, JSON.stringify({
        plate: cleanPlate(detail.plate),
        status: 'rejected',
      }));
    };

    const persisted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.action !== 'decision' || !['approved', 'rejected'].includes(detail.status)) return;

      const request = readActiveRequest();
      if (!request) return;
      if (cleanPlate(request.plate) !== cleanPlate(detail.plate)) return;

      let decision: any = {};
      try {
        const raw = window.sessionStorage.getItem(DECISION_KEY);
        decision = raw ? JSON.parse(raw) : {};
      } catch {}

      const recommendedBuy = detail.status === 'approved' && typeof decision.value === 'number'
        ? decision.value
        : undefined;

      void evaluationQueueService.finish(
        request.id,
        detail.status === 'approved' ? 'completed' : 'rejected',
        recommendedBuy,
        detail.id || undefined,
      ).then(() => {
        window.sessionStorage.removeItem(ACTIVE_EVALUATION_REQUEST_KEY);
        window.sessionStorage.removeItem(DECISION_KEY);
        window.dispatchEvent(new CustomEvent('motyq:evaluation-returned', {
          detail: {
            requestId: request.id,
            plate: request.plate,
            status: detail.status,
            recommendedBuy,
          },
        }));
      }).catch(error => {
        console.error('Could not return MarketIQ decision to evaluation queue', error);
      });
    };

    window.addEventListener('motyq:marketiq-approved', approved as EventListener);
    window.addEventListener('motyq:marketiq-rejected', rejected as EventListener);
    window.addEventListener('motyq:marketiq-persisted', persisted as EventListener);
    return () => {
      window.removeEventListener('motyq:marketiq-approved', approved as EventListener);
      window.removeEventListener('motyq:marketiq-rejected', rejected as EventListener);
      window.removeEventListener('motyq:marketiq-persisted', persisted as EventListener);
    };
  }, []);

  return null;
};

export default EvaluationDecisionBridge;
