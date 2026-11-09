/**
 * Private, browser-only cache of the TWO last parsed Dealer V44 snapshots.
 * Does not upload the original XLSM/XLSX, invoke macros, or write to Firestore.
 * Data is scoped by company/store/user, then hashed before use as an IDB key.
 * IndexedDB may be deleted by the browser or cleared by the operator.
 */
import type {DealerStockSnapshot} from './marketIqDealerRadar';

const DATABASE='motyq-iq-dealer-snapshots-v1';
const STORE='saved-stocks';
const CACHE_VERSION=1;
const MAX_VEHICLES=6000;
export type DealerLocalArchive={
 current:DealerStockSnapshot|null;
 previous:DealerStockSnapshot|null;
 savedAt:string;
};
type PersistedArchive=DealerLocalArchive&{version:1;key:string};

function assertSupported(){
 if(typeof indexedDB==='undefined')throw new Error('Este navegador não permite armazenamento local IndexedDB.');
 if(!globalThis.crypto?.subtle)throw new Error('Armazenamento seguro indisponível: abra o Motyq IQ em HTTPS.');
}
async function accountKey(scope:string):Promise<string>{
 assertSupported();
 if(!scope.trim())throw new Error('É necessário entrar na conta antes de salvar o estoque.');
 const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('motyq-dealer-cache-v1|'+scope.trim().toLowerCase()));
 return Array.from(new Uint8Array(raw),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function openDatabase():Promise<IDBDatabase>{
 assertSupported();
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DATABASE,CACHE_VERSION);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});
  };
  request.onsuccess=()=>{
   const db=request.result;
   db.onversionchange=()=>db.close();
   resolve(db);
  };
  request.onerror=()=>reject(request.error||new Error('Falha ao abrir o armazenamento do Radar.'));
  request.onblocked=()=>reject(new Error('Feche outras abas antigas do Motyq IQ e tente novamente.'));
 });
}
export function isValidDealerSnapshot(snapshot:unknown):snapshot is DealerStockSnapshot{
 if(!snapshot||typeof snapshot!=='object')return false;
 const record=snapshot as Record<string,unknown>;
 if(!Array.isArray(record.vehicles)||!record.vehicles.length||
  record.vehicles.length>MAX_VEHICLES||
  typeof record.reportDate!=='string'||typeof record.importedAt!=='string'||
  !Array.isArray(record.stores)||!Array.isArray(record.warnings))return false;
 return record.vehicles.every((vehicle:unknown)=>{
  if(!vehicle||typeof vehicle!=='object')return false;
  const v=vehicle as Record<string,unknown>;
  return typeof v.key==='string'&&v.key.length>0&&
   typeof v.plate==='string'&&typeof v.brand==='string'&&typeof v.model==='string'&&
   (v.vehicleType==='car'||v.vehicleType==='motorcycle')&&
   typeof v.cost==='number'&&Number.isFinite(v.cost)&&
   typeof v.price==='number'&&Number.isFinite(v.price)&&
   typeof v.days==='number'&&Number.isFinite(v.days);
 });
}
export function validateDealerArchive(input:unknown):DealerLocalArchive|null{
 if(!input||typeof input!=='object')return null;
 const archive=input as Record<string,unknown>;
 if(archive.version!==CACHE_VERSION||
  !isValidDealerSnapshot(archive.current))return null;
 if(archive.previous!==null&&archive.previous!==undefined&&
  !isValidDealerSnapshot(archive.previous))return null;
 return {
  current:archive.current as DealerStockSnapshot,
  previous:(archive.previous||null) as DealerStockSnapshot|null,
  savedAt:String(archive.savedAt||'')
 };
}
async function execute<T>(
 scope:string,mode:IDBTransactionMode,
 action:(store:IDBObjectStore,key:string,resolve:(value:T)=>void,reject:(reason:unknown)=>void)=>void
):Promise<T>{
 const key=await accountKey(scope);
 const db=await openDatabase();
 return new Promise<T>((resolve,reject)=>{
  let finished=false;
  const finish=(value:T)=>{if(finished)return;finished=true;db.close();resolve(value);};
  const fail=(error:unknown)=>{if(finished)return;finished=true;db.close();reject(error);};
  try{
   const tx=db.transaction(STORE,mode);
   const store=tx.objectStore(STORE);
   let result:T;
   let received=false;
   tx.oncomplete=()=>received?finish(result):fail(new Error('O armazenamento local não concluiu a operação.'));
   tx.onerror=()=>fail(tx.error||new Error('Erro ao acessar o cache do Dealer.'));
   tx.onabort=()=>fail(tx.error||new Error('O cache do Dealer não pôde ser gravado.'));
   action(store,key,(v)=>{result=v;received=true;},fail);
  }catch(error){fail(error);}
 });
}
export async function readDealerLocalArchive(scope:string):Promise<DealerLocalArchive|null>{
 return execute(scope,'readonly',(store,key,done,fail)=>{
  const q=store.get(key);
  q.onsuccess=()=>done(validateDealerArchive(q.result));
  q.onerror=()=>fail(q.error||new Error('Falha ao recuperar estoque salvo.'));
 });
}
async function writeDealerLocalArchive(
 scope:string,current:DealerStockSnapshot|null,previous:DealerStockSnapshot|null
):Promise<void>{
 if(!current)return execute<void>(scope,'readwrite',(store,key,done,fail)=>{
  const q=store.delete(key);
  q.onsuccess=()=>done();
  q.onerror=()=>fail(q.error||new Error('Falha ao limpar estoque salvo.'));
 });
 if(!isValidDealerSnapshot(current)||(previous&&!isValidDealerSnapshot(previous)))
  throw new Error('Fotografia do Dealer inválida, não armazenada neste dispositivo.');
 const record:PersistedArchive={
  key:await accountKey(scope),version:1,current,previous,
  savedAt:new Date().toISOString()
 };
 return execute<void>(scope,'readwrite',(store,_key,done,fail)=>{
  const q=store.put(record);
  q.onsuccess=()=>done();
  q.onerror=()=>fail(q.error||new Error('Não foi possível salvar o relatório no navegador.'));
 });
}
// Serialize subsequent imports/clears from the same account: an older write
// must never finish *after* a newer snapshot and replace it.
const queues=new Map<string,Promise<void>>();
export function persistDealerLocalArchive(
 scope:string,current:DealerStockSnapshot|null,previous:DealerStockSnapshot|null
):Promise<void>{
 const prior=queues.get(scope)||Promise.resolve();
 const next=prior.catch(()=>{}).then(()=>writeDealerLocalArchive(scope,current,previous));
 queues.set(scope,next);
 void next.finally(()=>{if(queues.get(scope)===next)queues.delete(scope);}).catch(()=>{});
 return next;
}
export async function clearDealerLocalArchive(scope:string):Promise<void>{
 await persistDealerLocalArchive(scope,null,null);
}
