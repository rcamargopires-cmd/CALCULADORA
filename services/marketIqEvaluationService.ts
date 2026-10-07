import { arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

export type MarketIQEvaluationStatus = 'draft' | 'approved' | 'rejected';
export type MarketIQCommercialClass = 'A' | 'B' | 'C' | 'D' | 'E';
export type MarketIQCommercialDestination = 'SHOWROOM' | 'OUTLET' | 'REPASSE';
export type MarketIQMediaCategory = 'front' | 'rear' | 'left' | 'right' | 'interior' | 'dashboard' | 'tires' | 'damage' | 'document';
export type MarketIQMediaItem = { id: string; category: MarketIQMediaCategory; url: string; path: string; name: string; contentType?: string; createdAt?: string };
export type MarketIQDamageItem = { id: string; description: string; cost: number; mediaId?: string };

export type MarketIQRevision = {
  id:string;
  at:string;
  type:'created'|'draft_updated'|'approved'|'rejected';
  byEmail:string;
  byName:string;
  status:MarketIQEvaluationStatus;
  vehicle:string;
  year:string;
  km:string;
  fipe:string;
  notes:string;
  recommendedBuy?:number;
};

export type MarketIQEvaluation = {
  id: string;
  revisionHistory?: MarketIQRevision[];
  previousEvaluationId?:string;
  kind: 'marketiq_evaluation';
  companyId: string;
  storeId: string;
  storeName: string;
  plate: string;
  vehicle: string;
  year: string;
  km: string;
  fipe: string;
  notes: string;
  recommendedBuy?: number;
  commercialClass?: MarketIQCommercialClass;
  suggestedCommercialClass?: MarketIQCommercialClass | '';
  commercialDestination?: MarketIQCommercialDestination | '';
  commercialClassOverride?: boolean;
  commercialClassReason?: string;
  factoryWarranty?: boolean;
  onlyHygiene?: boolean;
  minorDetails?: boolean;
  classificationValid?: boolean;
  classificationKm?: number;
  classificationByEmail?: string;
  classificationByName?: string;
  classificationUpdatedAt?: any;
  status: MarketIQEvaluationStatus;
  createdByEmail: string;
  createdByName: string;
  showroomPassageId?: string;
  dealId?: string;
  customerName?: string;
  customerPhone?: string;
  interestModel?: string;
  sellerName?: string;
  sellerEmail?: string;
  linkedAt?: string;
  photos?: MarketIQMediaItem[];
  damages?: MarketIQDamageItem[];
  damageTotal?: number;
  createdAt?: any;
  updatedAt?: any;
  decidedAt?: any;
};

const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 180);
const isIncompleteLegacyDecision=(item:MarketIQEvaluation)=>item.status!=='draft'&&Boolean(item.previousEvaluationId)&&(!String(item.vehicle||'').trim()||!String(item.year||'').trim()||!String(item.km||'').trim()||!String(item.fipe||'').trim());
const coalesceLegacy=(items:MarketIQEvaluation[])=>{
  const byId=new Map(items.map(item=>[item.id,item]));
  const hidden=new Set<string>();
  const merged=items.map(item=>{
    if(!isIncompleteLegacyDecision(item))return item;
    const base=byId.get(String(item.previousEvaluationId||''));
    if(!base)return item;
    hidden.add(base.id);
    return{
      ...base,
      ...item,
      vehicle:item.vehicle||base.vehicle,
      year:item.year||base.year,
      km:item.km||base.km,
      fipe:item.fipe||base.fipe,
      notes:item.notes||base.notes,
      photos:item.photos?.length?item.photos:base.photos,
      damages:item.damages?.length?item.damages:base.damages,
      damageTotal:Number(item.damageTotal||base.damageTotal||0),
      revisionHistory:[...(base.revisionHistory||[]),...(item.revisionHistory||[])],
      createdAt:base.createdAt||item.createdAt,
    } as MarketIQEvaluation;
  });
  return merged.filter(item=>!hidden.has(item.id));
};
const sortNewest = (items: MarketIQEvaluation[]) => items.sort((a, b) => {
  const ta = Number((a.createdAt as any)?.seconds || 0);
  const tb = Number((b.createdAt as any)?.seconds || 0);
  return tb - ta;
});

export const marketIqEvaluationService = {
  create: async (input: Omit<MarketIQEvaluation, 'id' | 'kind' | 'status' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const plate = cleanPlate(input.plate);
    const id = safeId(`marketiq_${input.companyId}_${input.storeId}_${plate || 'sem-placa'}_${Date.now()}`);
    await setDoc(doc(db, 'operational_meta', id), {
      ...input,
      plate,
      id,
      kind: 'marketiq_evaluation',
      status: 'draft',
      revisionHistory:[{
        id:'created_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
        at:new Date().toISOString(),type:'created',status:'draft',
        byEmail:input.createdByEmail,byName:input.createdByName,
        vehicle:input.vehicle,year:input.year,km:input.km,
        fipe:input.fipe,notes:input.notes,
        ...(typeof input.recommendedBuy==='number'?{recommendedBuy:input.recommendedBuy}:{})
      }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    window.dispatchEvent(new CustomEvent('motyq:marketiq-history-updated', { detail: { plate } }));
    return id;
  },

  updateDraft: async (
    id: string,
    patch: Partial<Pick<MarketIQEvaluation, 'vehicle' | 'year' | 'km' | 'fipe' | 'notes' | 'photos' | 'damages' | 'damageTotal'>>,
    actor?: { email?: string; name?: string },
  ): Promise<void> => {
    const current=await marketIqEvaluationService.getById(id);
    if(!current)throw new Error('Avaliação não encontrada.');
    if(current.status!=='draft')throw new Error('A avaliação já foi concluída e não pode ser alterada.');
    const next={...patch};
    await updateDoc(doc(db,'operational_meta',id),{
      ...next,
      revisionHistory:arrayUnion({
        id:'draft_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
        at:new Date().toISOString(),type:'draft_updated',status:'draft',
        byEmail:String(actor?.email||current.createdByEmail||'').toLowerCase(),
        byName:String(actor?.name||current.createdByName||actor?.email||''),
        vehicle:String(patch.vehicle??current.vehicle??''),
        year:String(patch.year??current.year??''),
        km:String(patch.km??current.km??''),
        fipe:String(patch.fipe??current.fipe??''),
        notes:String(patch.notes??current.notes??''),
        recommendedBuy:Number(current.recommendedBuy||0),
      }),
      updatedAt:serverTimestamp(),
    });
    window.dispatchEvent(new CustomEvent('motyq:marketiq-history-updated',{detail:{plate:current.plate}}));
  },

  getById:async(id:string):Promise<MarketIQEvaluation|null>=>{
    if(!id)return null;
    const snap=await getDoc(doc(db,'operational_meta',id));
    return snap.exists()?({id:snap.id,...snap.data()} as MarketIQEvaluation):null;
  },

  listByPlate: async (companyId: string, storeId: string, plateValue: string): Promise<MarketIQEvaluation[]> => {
    const plate = cleanPlate(plateValue);
    if (!companyId || !storeId || !plate) return [];
    const snap = await getDocs(query(
      collection(db, 'operational_meta'),
      where('kind', '==', 'marketiq_evaluation'),
      where('companyId', '==', companyId),
      where('storeId', '==', storeId),
      where('plate', '==', plate),
    ));
    return sortNewest(coalesceLegacy(snap.docs.map(item => ({ id: item.id, ...item.data() } as MarketIQEvaluation))));
  },

  listByStore: async (companyId: string, storeId: string): Promise<MarketIQEvaluation[]> => {
    if (!companyId || !storeId) return [];
    const snap = await getDocs(query(
      collection(db, 'operational_meta'),
      where('kind', '==', 'marketiq_evaluation'),
      where('companyId', '==', companyId),
      where('storeId', '==', storeId),
    ));
    return sortNewest(coalesceLegacy(snap.docs.map(item => ({ id: item.id, ...item.data() } as MarketIQEvaluation))));
  },

  listByPassage: async (companyId: string, storeId: string, passageId: string): Promise<MarketIQEvaluation[]> => {
    if (!companyId || !storeId || !passageId) return [];
    const all = await marketIqEvaluationService.listByStore(companyId, storeId);
    return all.filter(item => item.showroomPassageId === passageId);
  },

  getLatestByPlate: async (companyId: string, storeId: string, plate: string): Promise<MarketIQEvaluation | null> => {
    const list = await marketIqEvaluationService.listByPlate(companyId, storeId, plate);
    return list[0] || null;
  },

  setStatus: async (id: string, status: MarketIQEvaluationStatus, recommendedBuy?: number, actor?:{email:string;name:string}): Promise<void> => {
    const current=await marketIqEvaluationService.getById(id);
    if(!current)throw new Error('Avaliação não encontrada.');
    if(current.status!=='draft')throw new Error('Avaliação concluída não pode ser alterada. Inicie uma nova revisão.');
    await updateDoc(doc(db, 'operational_meta', id), {
      status,
      ...(recommendedBuy !== undefined ? { recommendedBuy } : {}),
      revisionHistory:arrayUnion({
        id:'decision_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
        at:new Date().toISOString(),type:status,status,
        byEmail:actor?.email||current.createdByEmail,
        byName:actor?.name||current.createdByName,
        vehicle:current.vehicle||'',year:current.year||'',km:current.km||'',
        fipe:current.fipe||'',notes:current.notes||'',
        recommendedBuy:recommendedBuy!==undefined?recommendedBuy:Number(current.recommendedBuy||0),
      }),
      updatedAt: serverTimestamp(),
      decidedAt: serverTimestamp(),
    });
    window.dispatchEvent(new CustomEvent('motyq:marketiq-history-updated',{detail:{plate:current.plate}}));
  },

  attachMedia: async (id: string, photos: MarketIQMediaItem[], damages: MarketIQDamageItem[]): Promise<void> => {
    const damageTotal = damages.reduce((sum, item) => sum + Math.max(0, Number(item.cost || 0)), 0);
    await updateDoc(doc(db, 'operational_meta', id), {
      photos,
      damages,
      damageTotal,
      updatedAt: serverTimestamp(),
    });
    window.dispatchEvent(new CustomEvent('motyq:marketiq-history-updated'));
  },

  remove: async (id: string, plateValue?: string): Promise<void> => {
    if (!id) return;
    await deleteDoc(doc(db, 'operational_meta', id));
    window.dispatchEvent(new CustomEvent('motyq:marketiq-history-updated', { detail: { plate: cleanPlate(plateValue || '') } }));
  },
};
