import React, { useEffect } from 'react';
import { EvaluationQueueRequest, evaluationQueueService } from '../services/evaluationQueueService';

const ACTIVE_KEY = 'motyq:active-evaluation-request-v2';
const DECISION_KEY = 'motyq:active-evaluation-decision-v2';
const cleanPlate = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

const setNativeValue = (element: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
};

const inputByLabel = (prefix: string) => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(item => String(item.textContent || '').trim().toUpperCase().startsWith(prefix.toUpperCase()));
  return label?.querySelector('input') as HTMLInputElement | null;
};

const fillMarketIQ = (request: EvaluationQueueRequest) => {
  const plate = inputByLabel('PLACA');
  const model = inputByLabel('MODELO / VERSÃO');
  if (!plate || !model) return false;
  setNativeValue(plate, cleanPlate(request.plate));
  setNativeValue(model, request.vehicle === 'Veículo a identificar' ? '' : request.vehicle || '');
  const year = inputByLabel('ANO/MODELO');
  const km = inputByLabel('KM ATUAL');
  if (year && request.year) setNativeValue(year, request.year);
  if (km && request.km) setNativeValue(km, request.km);
  return true;
};

const EvaluationMarketIQBridge: React.FC = () => {
  useEffect(() => {
    const openRequest = (event: Event) => {
      const request = (event as CustomEvent).detail as EvaluationQueueRequest;
      if (!request?.id || !request?.plate) return;
      window.sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(request));

      const button = Array.from(document.querySelectorAll('button')).find(item =>
        String(item.getAttribute('title') || '').includes('MarketIQ · avaliação e precificação')
      ) as HTMLButtonElement | undefined;
      button?.click();

      let attempt = 0;
      const retry = () => {
        attempt += 1;
        if (fillMarketIQ(request) || attempt >= 15) return;
        window.setTimeout(retry, 120);
      };
      window.setTimeout(retry, 80);
    };

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
      window.sessionStorage.setItem(DECISION_KEY, JSON.stringify({ plate: cleanPlate(detail.plate), status: 'rejected' }));
    };

    const persisted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.action !== 'decision' || !['approved', 'rejected'].includes(detail.status)) return;
      try {
        const raw = window.sessionStorage.getItem(ACTIVE_KEY);
        if (!raw) return;
        const request = JSON.parse(raw) as EvaluationQueueRequest;
        if (!request?.id || cleanPlate(request.plate) !== cleanPlate(detail.plate)) return;
        const decisionRaw = window.sessionStorage.getItem(DECISION_KEY);
        const decision = decisionRaw ? JSON.parse(decisionRaw) : {};
        const recommendedBuy = detail.status === 'approved' && typeof decision.value === 'number' ? decision.value : undefined;
        void evaluationQueueService.finish(
          request.id,
          detail.status === 'approved' ? 'completed' : 'rejected',
          recommendedBuy,
          detail.id || undefined,
        ).then(() => {
          window.sessionStorage.removeItem(ACTIVE_KEY);
          window.sessionStorage.removeItem(DECISION_KEY);
          window.dispatchEvent(new CustomEvent('motyq:evaluation-returned', { detail: { requestId: request.id, plate: request.plate, status: detail.status } }));
        }).catch(error => console.error('Could not return MarketIQ result to evaluation queue', error));
      } catch (error) {
        console.error('Evaluation MarketIQ bridge failed', error);
      }
    };

    window.addEventListener('motyq:marketiq-open-request-v2', openRequest as EventListener);
    window.addEventListener('motyq:marketiq-approved', approved as EventListener);
    window.addEventListener('motyq:marketiq-rejected', rejected as EventListener);
    window.addEventListener('motyq:marketiq-persisted', persisted as EventListener);
    return () => {
      window.removeEventListener('motyq:marketiq-open-request-v2', openRequest as EventListener);
      window.removeEventListener('motyq:marketiq-approved', approved as EventListener);
      window.removeEventListener('motyq:marketiq-rejected', rejected as EventListener);
      window.removeEventListener('motyq:marketiq-persisted', persisted as EventListener);
    };
  }, []);

  return null;
};

export default EvaluationMarketIQBridge;
