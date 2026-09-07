import React, { useEffect } from 'react';
import { EvaluationRequest, evaluationRequestService } from '../services/evaluationRequestService';

const ACTIVE_REQUEST_KEY = 'motyq:active-evaluation-request';
const PENDING_DECISION_KEY = 'motyq:active-evaluation-decision';

const cleanPlate = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
};

const findInputByLabel = (prefix: string) => {
  const labels = Array.from(document.querySelectorAll('label'));
  for (const label of labels) {
    const text = String(label.textContent || '').trim().toUpperCase();
    if (!text.startsWith(prefix.toUpperCase())) continue;
    const input = label.querySelector('input') as HTMLInputElement | null;
    if (input) return input;
  }
  return null;
};

const fillMarketIQ = (request: EvaluationRequest) => {
  const plate = findInputByLabel('PLACA');
  const vehicle = findInputByLabel('MODELO / VERSÃO');
  const year = findInputByLabel('ANO/MODELO');
  const km = findInputByLabel('KM ATUAL');
  if (!plate || !vehicle) return false;
  setNativeValue(plate, cleanPlate(request.plate));
  setNativeValue(vehicle, request.vehicle || '');
  if (year && request.year) setNativeValue(year, request.year);
  if (km && request.km) setNativeValue(km, request.km);
  return true;
};

const EvaluationRequestMarketIQBridge: React.FC = () => {
  useEffect(() => {
    const openRequest = (event: Event) => {
      const request = (event as CustomEvent).detail as EvaluationRequest;
      if (!request?.id || !request?.plate) return;
      window.sessionStorage.setItem(ACTIVE_REQUEST_KEY, JSON.stringify(request));

      const openButton = Array.from(document.querySelectorAll('button')).find(button =>
        String(button.getAttribute('title') || '').includes('MarketIQ') ||
        String(button.textContent || '').trim() === 'MarketIQ'
      ) as HTMLButtonElement | undefined;
      openButton?.click();

      let attempts = 0;
      const tryFill = () => {
        attempts += 1;
        if (fillMarketIQ(request) || attempts >= 12) return;
        window.setTimeout(tryFill, 120);
      };
      window.setTimeout(tryFill, 80);
    };

    const approved = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      window.sessionStorage.setItem(PENDING_DECISION_KEY, JSON.stringify({
        plate: cleanPlate(detail.plate),
        status: 'approved',
        value: typeof detail.value === 'number' ? detail.value : undefined,
      }));
    };

    const rejected = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      window.sessionStorage.setItem(PENDING_DECISION_KEY, JSON.stringify({
        plate: cleanPlate(detail.plate),
        status: 'rejected',
      }));
    };

    const persisted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.action !== 'decision' || !['approved', 'rejected'].includes(detail.status)) return;
      try {
        const requestRaw = window.sessionStorage.getItem(ACTIVE_REQUEST_KEY);
        if (!requestRaw) return;
        const request = JSON.parse(requestRaw) as EvaluationRequest;
        if (!request?.id || cleanPlate(request.plate) !== cleanPlate(detail.plate)) return;
        const decisionRaw = window.sessionStorage.getItem(PENDING_DECISION_KEY);
        const decision = decisionRaw ? JSON.parse(decisionRaw) : {};
        const recommendedBuy = decision.status === 'approved' && typeof decision.value === 'number' ? decision.value : undefined;
        void evaluationRequestService.finish(
          request.id,
          detail.status === 'approved' ? 'completed' : 'rejected',
          recommendedBuy,
          detail.id || undefined,
        ).then(() => {
          window.sessionStorage.removeItem(ACTIVE_REQUEST_KEY);
          window.sessionStorage.removeItem(PENDING_DECISION_KEY);
        }).catch(error => console.error('Could not return MarketIQ result to seller', error));
      } catch (error) {
        console.error('Evaluation request decision bridge failed', error);
      }
    };

    window.addEventListener('motyq:marketiq-open-request', openRequest as EventListener);
    window.addEventListener('motyq:marketiq-approved', approved as EventListener);
    window.addEventListener('motyq:marketiq-rejected', rejected as EventListener);
    window.addEventListener('motyq:marketiq-persisted', persisted as EventListener);
    return () => {
      window.removeEventListener('motyq:marketiq-open-request', openRequest as EventListener);
      window.removeEventListener('motyq:marketiq-approved', approved as EventListener);
      window.removeEventListener('motyq:marketiq-rejected', rejected as EventListener);
      window.removeEventListener('motyq:marketiq-persisted', persisted as EventListener);
    };
  }, []);

  return null;
};

export default EvaluationRequestMarketIQBridge;
