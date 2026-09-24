import React, { useEffect } from 'react';
import { arrayUnion, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
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

const SESSION_KEY='motyq:marketiq-active-draft-v3';
const readDraft=():{id:string;plate:string;companyId:string;storeId:string}|null=>{
  try {const raw=window.sessionStorage.getItem(SESSION_KEY);return raw?JSON.parse(raw):null;}catch{return null;}
};
const rememberDraft=(id:string,plate:string,companyId:string,storeId:string)=>{
  try{window.sessionStorage.setItem(SESSION_KEY,JSON.stringify({id,plate,companyId,storeId}));}catch{}
};
const forgetDraft=()=>{try{window.sessionStorage.removeItem(SESSION_KEY);}catch{}};
const revision=(value:{vehicle:string;year:string;km:string;fipe:string;notes:string},
 byEmail:string,byName:string)=>({
  id:'draft_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
  at:new Date().toISOString(),type:'draft_updated',status:'draft',
  byEmail,byName,...value,
});

const MarketIQPersistenceBridge: React.FC<Props> = ({ currentUser, companyId, storeId, storeName }) => {
  useEffect(() => {
    let saveInFlight = false;
    let lastSaveSignature = '';
    let lastSavedAt = 0;

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
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persistence-error', { detail: { action: 'save', message: 'Informe a placa antes de salvar.' } }));
        return;
      }

      const signature = JSON.stringify([
        plate,
        normalize(detail.vehicle),
        normalize(detail.year),
        normalize(detail.km),
        normalize(detail.fipe),
        normalize(detail.notes),
      ]);
      const nowMs = Date.now();
      if (saveInFlight || (signature === lastSaveSignature && nowMs - lastSavedAt < 8000)) {
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persisted', {
          detail: { action: 'save', plate, status: 'draft', duplicatePrevented: true, message: 'Esta avaliação já foi salva.' },
        }));
        return;
      }

      saveInFlight = true;
      const link = readLink();
      try {
        const vehicle = normalize(detail.vehicle);
        const year = normalize(detail.year);
        const km = normalize(detail.km);
        const fipe = normalize(detail.fipe);
        const notes = normalize(detail.notes);
        const createdByEmail = normalize((currentUser as any)?.email).toLowerCase();
        const createdByName = normalize((currentUser as any)?.name || (currentUser as any)?.displayName || (currentUser as any)?.email);

        const latest = await marketIqEvaluationService.getLatestByPlate(companyId, storeId, plate);
        const session = readDraft();
        const sameSession=session?.plate===plate&&session.companyId===companyId&&session.storeId===storeId;
        let existing = sameSession ? await marketIqEvaluationService.getById(session.id) : null;
        if(existing&&(existing.companyId!==companyId||existing.storeId!==storeId||existing.plate!==plate||existing.status!=='draft'))existing=null;
        if(!existing&&latest?.status==='draft'){
          const useExisting=window.confirm(
            'Já existe um rascunho para a placa '+plate+'.\n\nOK: continuar este rascunho.\nCancelar: iniciar uma NOVA avaliação, mantendo a anterior.'
          );
          if(useExisting)existing=latest;
        }
        let id = '';
        let updatedExisting = false;

        if (existing?.status === 'draft') {
          id = existing.id;
          updatedExisting = true;
          await updateDoc(doc(db, 'operational_meta', id), {
            vehicle,
            year,
            km,
            fipe,
            notes,
            revisionHistory:arrayUnion(revision({vehicle,year,km,fipe,notes},createdByEmail,createdByName)),
            ...linkFields(link),
            updatedByEmail: createdByEmail,
            updatedByName: createdByName,
            updatedAt: serverTimestamp(),
          });
          window.dispatchEvent(new CustomEvent('motyq:marketiq-history-updated', { detail: { plate } }));
        } else {
          id = await marketIqEvaluationService.create({
            companyId,
            storeId,
            storeName,
            plate,
            vehicle,
            year,
            km,
            fipe,
            notes,
            ...(latest?{previousEvaluationId:latest.id}:{}),
            ...linkFields(link),
            createdByEmail,
            createdByName,
          });
        }

        rememberDraft(id,plate,companyId,storeId);
        await linkBack(id, link);
        lastSaveSignature = signature;
        lastSavedAt = Date.now();
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persisted', {
          detail: {
            action: 'save',
            id,
            plate,
            status: 'draft',
            updatedExisting,
            showroomPassageId: link?.passageId || '',
            dealId: link?.dealId || '',
          },
        }));
      } catch (error) {
        console.error('MarketIQ save failed', error);
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persistence-error', { detail: { action: 'save', message: 'Não foi possível salvar a avaliação.' } }));
      } finally {
        saveInFlight = false;
      }
    };

    const setDecision = async (event: Event, status: 'approved' | 'rejected') => {
      const detail = (event as CustomEvent).detail || {};
      const plate = normalize(detail.plate).toUpperCase();
      if (!plate) return;
      const link = readLink();
      try {
        const latest = await marketIqEvaluationService.getLatestByPlate(companyId, storeId, plate);
        const session=readDraft();
        const sameSession=session?.plate===plate&&session.companyId===companyId&&session.storeId===storeId;
        let draft=sameSession?await marketIqEvaluationService.getById(session.id):null;
        if(draft&&(draft.companyId!==companyId||draft.storeId!==storeId||draft.plate!==plate||draft.status!=='draft'))draft=null;
        if(!draft&&latest?.status==='draft'){
          const accepted=window.confirm(
            'Existe um rascunho desta placa.\n\nOK: concluir esse rascunho.\nCancelar: criar uma NOVA avaliação para esta decisão.'
          );
          if(accepted)draft=latest;
        }
        if(!draft){
          const id=await marketIqEvaluationService.create({
            companyId,storeId,storeName,plate,
            vehicle:normalize(detail.vehicle),year:normalize(detail.year),km:normalize(detail.km),
            fipe:normalize(detail.fipe),notes:normalize(detail.notes),
            ...(latest?{previousEvaluationId:latest.id}:{}),
            ...linkFields(link),
            createdByEmail:normalize((currentUser as any)?.email).toLowerCase(),
            createdByName:normalize((currentUser as any)?.name || (currentUser as any)?.displayName || (currentUser as any)?.email),
          });
          draft=await marketIqEvaluationService.getById(id);
        }
        if(!draft)throw new Error('Não foi possível criar ou recuperar o rascunho.');
        await marketIqEvaluationService.setStatus(draft.id,status,
          typeof detail.value==='number'?detail.value:undefined,
          {email:normalize((currentUser as any)?.email).toLowerCase(),name:normalize((currentUser as any)?.name)});
        if(link?.passageId)await linkBack(draft.id,link);
        forgetDraft();
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persisted',{
          detail:{action:'decision',id:draft.id,plate,status,
            showroomPassageId:link?.passageId||draft.showroomPassageId||'',
            dealId:link?.dealId||draft.dealId||''}
        }));
      } catch (error) {
        console.error('MarketIQ decision failed', error);
        window.dispatchEvent(new CustomEvent('motyq:marketiq-persistence-error', { detail: { action: 'decision', message: 'Não foi possível atualizar o status da avaliação.' } }));
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
