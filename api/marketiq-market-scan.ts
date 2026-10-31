import {createSign,randomUUID} from 'node:crypto';
import { GoogleGenAI } from '@google/genai';


/**
 * Embedded history handler because Vercel Node functions do not resolve extensionless TS
 * sibling modules at runtime. Keep this inline so the entire route is self-contained.
 */
const pricingHistoryHandler=(()=>{
 const firebaseConfig={"apiKey":"AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q","projectId":"gen-lang-client-0531247430","firestoreDatabaseId":"ai-studio-447676b4-da38-4e69-b22f-6aa10f85367b"};
type Json=string|number|boolean|null|Json[]|{[key:string]:Json};
type JsonObject=Record<string,Json>;
type Field={stringValue?:string;integerValue?:string;booleanValue?:boolean;mapValue?:{fields?:Record<string,Field>}};
const respond=(res:any,status:number,body:unknown)=>res.status(status).json(body);
const text=(value:unknown,size=180)=>String(value??'').trim().slice(0,size);
const finite=(value:unknown,min:number,max:number)=>{
 const raw=String(value??'').trim().replace(/\s/g,'').replace(/R\$/gi,'');
 if(!raw)return 0;
 const clean=raw.replace(/[^0-9.,-]/g,'');
 const normalized=clean.includes(',')?clean.replace(/\./g,'').replace(',','.'):
   /^\d{1,3}(?:\.\d{3})+$/.test(clean)?clean.replace(/\./g,''):clean;
 const n=typeof value==='number'?value:Number(normalized);
 return Number.isFinite(n)&&n>=min&&n<=max?n:0;
};
const email=(value:unknown)=>text(value,240).toLowerCase();
const idTokenFrom=(req:any)=>{
 const raw=String(req.headers?.authorization||'');
 return raw.startsWith('Bearer ')?raw.slice(7).trim():'';
};
const accountFromToken=async(idToken:string)=>{
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(firebaseConfig.apiKey),{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken}),signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)return null;
 const parsed=await response.json() as any;
 return parsed?.users?.[0]||null;
};
const serviceCredential=()=>{
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 if(!raw)throw new Error('HISTORY_SERVICE_CREDENTIAL_MISSING');
 const sa=JSON.parse(raw);
 if(!sa.project_id||!sa.client_email||!sa.private_key)throw new Error('HISTORY_SERVICE_CREDENTIAL_INVALID');
 if(sa.project_id!==firebaseConfig.projectId)throw new Error('HISTORY_FIREBASE_PROJECT_MISMATCH');
 return sa;
};
const googleAccessToken=async(sa:any)=>{
 const b64=(v:string)=>Buffer.from(v).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 const header=b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
 const claims=b64(JSON.stringify({
   iss:sa.client_email,sub:sa.client_email,aud:'https://oauth2.googleapis.com/token',
   iat:now,exp:now+1800,scope:'https://www.googleapis.com/auth/datastore'
 }));
 const unsigned=header+'.'+claims;
 const signer=createSign('RSA-SHA256');
 signer.update(unsigned);signer.end();
 const assertion=unsigned+'.'+signer.sign(String(sa.private_key).replace(/\\n/g,'\n')).toString('base64url');
 const response=await fetch('https://oauth2.googleapis.com/token',{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
   signal:AbortSignal.timeout(12000)
 });
 const data=await response.json() as any;
 if(!response.ok||!data.access_token)throw new Error('HISTORY_GOOGLE_AUTH_FAILED');
 return String(data.access_token);
};
const baseUrl=(sa:any)=>{
 const dbId=text(firebaseConfig.firestoreDatabaseId,150);
 return 'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(sa.project_id)+
   '/databases/'+encodeURIComponent(dbId)+'/documents';
};
const documentFields=(body:any):Record<string,Field>=>body?.fields||{};
const readString=(fields:Record<string,Field>,key:string)=>String(fields[key]?.stringValue||'');
const seg=(value:unknown)=>{
 const v=text(value,80);
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(v))throw new Error('HISTORY_SCOPE_INVALID');
 return v;
};
const userContext=async(sa:any,token:string,firebaseUser:any)=>{
 const who=email(firebaseUser?.email);
 if(!who)throw new Error('HISTORY_AUTH_REQUIRED');
 const isOwner=who==='r.camargo.pires@gmail.com'&&firebaseUser.emailVerified===true;
 const response=await fetch(baseUrl(sa)+'/users/'+encodeURIComponent(who),{
   headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)
 });
 let profile:any=null;
 if(response.ok){
   const data=await response.json() as any;
   const f=documentFields(data);
   profile={
     role:readString(f,'role'),status:readString(f,'status'),
     companyId:readString(f,'companyId'),storeId:readString(f,'storeId'),
     name:readString(f,'name'),pricingDeskOnly:f.pricingDeskOnly?.booleanValue===true
   };
 }else if(response.status!==404){
   throw new Error('HISTORY_USER_LOOKUP_FAILED');
 }
 const valid=isOwner||(profile?.status==='active'&&(
   ['admin','manager','pricing'].includes(profile?.role)||profile?.pricingDeskOnly===true
 ));
 if(!valid)throw new Error('HISTORY_PERMISSION_DENIED');
 return {
   email:who,name:text(profile?.name||firebaseUser?.displayName||who,100),
   companyId:seg(profile?.companyId||'abrao-reze'),
   storeId:seg(profile?.storeId||'outlet-sorocaba')
 };
};
const validAdUrl=(value:unknown)=>{
 try{
   const u=new URL(String(value||''));
   if(u.protocol!=='https:')return false;
   const host=u.hostname.toLowerCase();
   return ['webmotors.com.br','olx.com.br','napista.com.br'].some(domain=>host===domain||host.endsWith('.'+domain));
 }catch{return false;}
};
const normalizePayload=(input:any)=>{
 if(!input||typeof input!=='object')throw new Error('HISTORY_INVALID_PAYLOAD');
 const plate=text(input.plate,7).toUpperCase();
 const model=text(input.model,140),brand=text(input.brand,90);
 const date=text(input.date,40);
 if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)||
    !brand||!model||!Number.isFinite(Date.parse(date))||
    !finite(input.km,1,999999)||!Number.isFinite(Number(input.value))||Number(input.value)<0||Number(input.value)>2000000)throw new Error('HISTORY_INVALID_VEHICLE');
 const ads=(Array.isArray(input.ads)?input.ads:[]).slice(0,30).flatMap((ad:any)=>{
   if(!validAdUrl(ad?.url))return [];
   const source=['webmotors','olx','napista'].includes(ad?.source)?ad.source:'webmotors';
   return [{
     source,price:String(finite(ad?.price,1,2000000)),km:String(finite(ad?.km,1,999999)),
     url:text(ad.url,1300),status:ad.status==='valid'?'valid':ad.status==='excluded'?'excluded':'pending',
     note:text(ad.note,350),title:text(ad.title,180),auto:ad.auto===true,catalog:ad.catalog===true
   }];
 });
 const year=text(input.year,60);
 const payload={
   date,plate,model,brand,year,km:String(finite(input.km,1,999999)),
   cost:String(finite(input.cost,0,2000000)),
   repasse:input.repasse===true,ads,
   value:finite(input.value,0,2000000),
   provisional:input.provisional!==false,
   referenceName:text(input.referenceName,110),
   historicalTarget:finite(input.historicalTarget,0,2000000),
   historicalClass:['A','B','C','D','E','SEM CLASSE'].includes(input.historicalClass)?input.historicalClass:'',
   brandCode:text(input.brandCode,90),modelCode:text(input.modelCode,90),yearCode:text(input.yearCode,90),
   fipe:input.fipe&&typeof input.fipe==='object'?{
     value:finite(input.fipe.value,0,2000000),brand:text(input.fipe.brand,100),
     model:text(input.fipe.model,150),year:finite(input.fipe.year,1990,2100),
     fuel:text(input.fipe.fuel,40),referenceMonth:text(input.fipe.referenceMonth,70),
     fipeCode:text(input.fipe.fipeCode,90)
   }:null
 };
 if(JSON.stringify(payload).length>30000)throw new Error('HISTORY_PAYLOAD_TOO_LARGE');
 return payload;
};
// Purchase amounts are separate, append-only events. The original valuation is never overwritten.
const hydratePaidRecords=(records:any[])=>{
 const newest=new Map<string,any>();
 for(const entry of records){
   if(entry?.kind!=='purchase_paid'||typeof entry.evaluationId!=='string')continue;
   const previous=newest.get(entry.evaluationId);
   if(!previous||String(entry.recordedAt)>String(previous.recordedAt))newest.set(entry.evaluationId,entry);
 }
 return records.filter(entry=>entry?.kind!=='purchase_paid').map(entry=>{
   const paid=newest.get(entry.id);
   return paid?{...entry,paidValue:paid.paidValue,paidAt:paid.paidAt,
      paidRecordedAt:paid.recordedAt,paidRecordedBy:paid.recordedBy,
      paidRecordedEmail:paid.recordedEmail}:entry;
 });
};
const historyPath=(base:string,scope:{companyId:string;storeId:string})=>
 base+'/marketiq_pricing_histories_v1/'+scope.companyId+'/stores/'+scope.storeId+'/evaluations';
return async function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store, private');
 if(req.method!=='POST')return respond(res,405,{error:'Método não permitido.'});
 if(!['pricing_history_list','pricing_history_save','pricing_history_paid'].includes(String(req.body?.action||'')))return respond(res,400,{error:'Operação inválida.'});
 const idToken=idTokenFrom(req);
 if(!idToken||idToken.length>8000)return respond(res,401,{error:'Entre no Motyq novamente.'});
 try{
   const fb=await accountFromToken(idToken);
   if(!fb?.email)return respond(res,401,{error:'Sessão inválida. Entre novamente.'});
   const sa=serviceCredential();
   const token=await googleAccessToken(sa);
   const scope=await userContext(sa,token,fb);
   const base=historyPath(baseUrl(sa),scope);
   const authorization={authorization:'Bearer '+token};
   if(req.body.action==='pricing_history_save'){
     const payload=normalizePayload(req.body.evaluation);
     const id=randomUUID();
     const record={...payload,id,createdAt:new Date().toISOString(),
       createdByEmail:scope.email,createdByName:scope.name,
       companyId:scope.companyId,storeId:scope.storeId};
     const response=await fetch(base+'?documentId='+encodeURIComponent(id),{
       method:'POST',headers:{...authorization,'content-type':'application/json'},
       body:JSON.stringify({fields:{
         payload:{stringValue:JSON.stringify(record)},
         companyId:{stringValue:scope.companyId},storeId:{stringValue:scope.storeId},
         createdAt:{stringValue:record.createdAt},
         plate:{stringValue:record.plate},model:{stringValue:record.model}
       }}),signal:AbortSignal.timeout(16000)
     });
     if(!response.ok)throw new Error('HISTORY_WRITE_FAILED_'+response.status);
     return respond(res,200,{saved:true,record});
   }
   if(req.body.action==='pricing_history_paid'){
     const evaluationId=text(req.body?.evaluationId,80);
     const rawAmount=req.body?.amount;
     const amount=Number(rawAmount);
     const paidAt=text(req.body?.paidAt,10);
     const paidDate=new Date(paidAt+'T12:00:00Z');
     if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evaluationId)||
       typeof rawAmount!=='number'||!Number.isFinite(amount)||amount<=0||amount>2000000||
       !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)||
       Number.isNaN(paidDate.getTime())||paidDate.toISOString().slice(0,10)!==paidAt||
       paidAt>new Date().toISOString().slice(0,10))
       return respond(res,400,{error:'Confira o valor pago e a data da compra.'});
     // The authenticated tenant determines the collection path. A forged record id
     // can never point to another store's valuation.
     const originalResponse=await fetch(base+'/'+encodeURIComponent(evaluationId),{
       headers:authorization,signal:AbortSignal.timeout(12000)
     });
     if(originalResponse.status===404)return respond(res,404,{error:'Avaliação não encontrada nesta unidade.'});
     if(!originalResponse.ok)throw new Error('HISTORY_PAID_ORIGINAL_READ_FAILED_'+originalResponse.status);
     const originalData=await originalResponse.json() as any;
     let original:any;
     try{original=JSON.parse(readString(documentFields(originalData),'payload'));}catch{}
     if(!original||original.id!==evaluationId||original.companyId!==scope.companyId||
        original.storeId!==scope.storeId||original.kind==='purchase_paid')
       return respond(res,404,{error:'Avaliação não encontrada nesta unidade.'});
     const event={
       kind:'purchase_paid',id:randomUUID(),evaluationId,
       paidValue:Math.round(amount*100)/100,paidAt,
       recordedAt:new Date().toISOString(),
       recordedBy:scope.name,recordedEmail:scope.email,
       companyId:scope.companyId,storeId:scope.storeId
     };
     const response=await fetch(base+'?documentId='+encodeURIComponent(event.id),{
       method:'POST',headers:{...authorization,'content-type':'application/json'},
       body:JSON.stringify({fields:{
         payload:{stringValue:JSON.stringify(event)},
         companyId:{stringValue:scope.companyId},storeId:{stringValue:scope.storeId},
         createdAt:{stringValue:event.recordedAt},
         eventType:{stringValue:'purchase_paid'},evaluationId:{stringValue}
       }}),signal:AbortSignal.timeout(16000)
     });
     if(!response.ok)throw new Error('HISTORY_PAID_WRITE_FAILED_'+response.status);
     return respond(res,200,{saved:true,paid:event});
   }
   const rows:any[]=[];
   let pageToken='';
   for(let page=0;page<5;page++){
     const url=new URL(base);
     url.searchParams.set('pageSize','100');
     if(pageToken)url.searchParams.set('pageToken',pageToken);
     const response=await fetch(url,{headers:authorization,signal:AbortSignal.timeout(16000)});
     if(!response.ok)throw new Error('HISTORY_READ_FAILED_'+response.status);
     const body=await response.json() as any;
     for(const doc of (Array.isArray(body.documents)?body.documents:[])){
       try{
         const record=JSON.parse(readString(documentFields(doc),'payload'));
         if(record?.companyId===scope.companyId&&record?.storeId===scope.storeId&&
           typeof record?.id==='string'&&(typeof record?.plate==='string'||record?.kind==='purchase_paid'))rows.push(record);
       }catch{}
     }
     pageToken=String(body.nextPageToken||'');
     if(!pageToken)break;
   }
   const history=hydratePaidRecords(rows);
   history.sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date)));
   return respond(res,200,{records:history,hasMore:Boolean(pageToken)});
 }catch(error:any){
   const name=String(error?.message||'');
   if(name==='HISTORY_PERMISSION_DENIED')return respond(res,403,{error:'Seu perfil não tem permissão para acessar o histórico da mesa.'});
   if(name==='HISTORY_INVALID_PAYLOAD'||name==='HISTORY_INVALID_VEHICLE'||name==='HISTORY_PAYLOAD_TOO_LARGE')
     return respond(res,400,{error:'Confira placa, veículo, valor e anúncios antes de salvar.'});
   // Do not expose service account errors or infrastructure details to the browser.
   console.error('Motyq IQ history:',name.slice(0,80));
   return respond(res,503,{error:'Histórico online temporariamente indisponível. Sua avaliação continua na tela, mas ainda não foi salva.'});
 }
}

})();

const FIREBASE_API_KEY = 'AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';

const verifyFirebaseToken = async (idToken: string) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const data = await response.json() as any;
  return data?.users?.[0] || null;
};

type MatchTier = 'exact' | 'same_model' | 'adjacent_year' | 'technical_peer';

type Comparable = {
  source?: string;
  title?: string;
  price?: number | string;
  year?: number | string;
  km?: number | string | null;
  location?: string;
  url?: string | null;
  matchType?: string;
  matchTier?: string;
  compatibilityScore?: number | string;
  similarityReason?: string;
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  return Number(normalized) || 0;
};

const toModelYear = (value: unknown) => {
  const raw = String(value ?? '').trim();
  const matches = raw.match(/(?:19|20)\d{2}/g) || [];
  if (matches.length) return Number(matches[matches.length - 1]);
  const numeric = Math.round(toNumber(value));
  return numeric >= 1900 && numeric <= 2100 ? numeric : 0;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const round100 = (value: number) => Math.round(value / 100) * 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseJson = (text: string) => {
  const clean = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch {}
  }
  return null;
};

const domainOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

const sourceKey = (source: string, url: string) => `${String(source || '')} ${String(url || '')}`.toLowerCase();
const isExcludedSource = (source: string, url: string) => {
  const key = sourceKey(source, url);
  return key.includes('facebook') || key.includes('facebook.com') || key.includes('mercado livre') || key.includes('mercadolivre') || key.includes('mercadolivre.com');
};
const isPreferredSource = (source: string, url: string) => {
  const key = sourceKey(source, url);
  return key.includes('webmotors') || key.includes('webmotors.com') || key.includes('icarros') || key.includes('icarros.com');
};

const normalizeTier = (item: Comparable): MatchTier => {
  const raw = String(item.matchTier || item.matchType || '').toLowerCase().replace(/[-\s]+/g, '_');
  if (raw === 'exact' || raw === 'exato') return 'exact';
  if (raw.includes('adjacent') || raw.includes('ano_adjacente')) return 'adjacent_year';
  if (raw.includes('technical') || raw.includes('peer') || raw.includes('concorrente') || raw.includes('similar_model')) return 'technical_peer';
  return 'same_model';
};

const defaultScore = (tier: MatchTier) => {
  if (tier === 'exact') return 100;
  if (tier === 'same_model') return 92;
  if (tier === 'adjacent_year') return 84;
  return 74;
};

const defaultReason = (tier: MatchTier) => {
  if (tier === 'same_model') return 'mesmo modelo, ano-modelo e powertrain; versão comercial próxima';
  if (tier === 'adjacent_year') return 'mesmo modelo e powertrain em ano-modelo adjacente';
  if (tier === 'technical_peer') return 'veículo tecnicamente próximo em categoria, powertrain e faixa de mercado';
  return '';
};

const normalizeComparables = (raw: Comparable[], model: string, year: number) => raw
  .map((item) => {
    const tier = normalizeTier(item);
    const parsedYear = toModelYear(item.year) || 0;
    const scoreRaw = Math.round(toNumber(item.compatibilityScore));
    const score = clamp(scoreRaw || defaultScore(tier), 0, 100);
    const reasonRaw = String(item.similarityReason || '').trim() || defaultReason(tier);
    return {
      source: String(item.source || '').trim() || 'Web',
      title: String(item.title || '').trim() || model,
      price: toNumber(item.price),
      year: parsedYear,
      km: toNumber(item.km) || 0,
      location: String(item.location || '').trim(),
      url: item.url ? String(item.url) : '',
      matchType: tier === 'exact' ? 'exact' as const : 'similar' as const,
      matchTier: tier,
      compatibilityScore: score,
      similarityReason: tier === 'exact' ? '' : `Compatibilidade ${score}% · ${reasonRaw}`,
    };
  })
  .filter(item => item.price >= 10000 && item.price <= 2000000)
  .filter(item => item.year >= year - 1 && item.year <= year + 1)
  .filter(item => !isExcludedSource(item.source, item.url));

const dedupeComparables = <T extends { source: string; title: string; price: number; year: number; location: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.source}|${item.title}|${item.price}|${item.year}|${item.location}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sortByCompetitivePrice = <T extends { price: number; source: string; url: string }>(items: T[]) => [...items].sort((a, b) => {
  if (a.price !== b.price) return a.price - b.price;
  const sourceA = isPreferredSource(a.source, a.url) ? 0 : 1;
  const sourceB = isPreferredSource(b.source, b.url) ? 0 : 1;
  return sourceA - sourceB;
});

const groundingData = (response: any) => {
  const grounding = response?.candidates?.[0]?.groundingMetadata || {};
  const chunks = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [];
  const sources = chunks
    .map((chunk: any) => chunk?.web)
    .filter((web: any) => web?.uri)
    .map((web: any) => ({ title: String(web.title || domainOf(web.uri) || 'Fonte web'), url: String(web.uri) }))
    .filter((item: any) => !isExcludedSource(item.title, item.url));
  return { sources, queries: Array.isArray(grounding?.webSearchQueries) ? grounding.webSearchQueries : [] };
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const authHeader = String(req.headers?.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sessão do Motyq não encontrada.' });

    const firebaseUser = await verifyFirebaseToken(token);
    if (!firebaseUser?.email) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    if (['pricing_history_list','pricing_history_save','pricing_history_paid'].includes(String(req.body?.action||''))) return pricingHistoryHandler(req,res);
    if (req.body?.action === 'desk_market_search') return marketIqDeskSearchServer(req, res);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Gemini ainda não está configurado no servidor.' });

    if (req.body?.action === 'visual_analysis') {
      const photos = Array.isArray(req.body?.photos) ? req.body.photos.slice(0, 10) : [];
      const imageParts = photos
        .map((item:any) => {
          const url = String(item?.dataUrl || item?.url || '');
          const match = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (!match) return null;
          return { inlineData: { mimeType: match[1], data: match[2] } };
        })
        .filter(Boolean);

      if (!imageParts.length) return res.status(400).json({ error: 'Adicione fotos da avaliação antes de usar a análise visual por IA.' });

      const vehicle = String(req.body?.vehicle || '').trim();
      const plate = String(req.body?.plate || '').trim();
      const yearLabel = String(req.body?.year || '').trim();
      const kmLabel = String(req.body?.km || '').trim();
      const fipeValue = toNumber(req.body?.fipe);
      const evaluatorDamageTotal = toNumber(req.body?.damageTotal);
      const categories = photos.map((item:any) => String(item?.category || '')).filter(Boolean);

      const visualPrompt = `
Você é o assistente visual da Mesa de Precificação do MOTYQ, um DMS de veículos seminovos no Brasil.
Analise SOMENTE o que é visualmente sustentado pelas fotos anexadas. Não invente defeitos.

VEÍCULO
- Placa: ${plate || 'não informada'}
- Modelo: ${vehicle || 'não informado'}
- Ano/modelo: ${yearLabel || 'não informado'}
- KM: ${kmLabel || 'não informado'}
- FIPE: ${fipeValue ? 'R$ ' + fipeValue.toLocaleString('pt-BR') : 'não informada'}
- Avarias já registradas pelo avaliador: R$ ${evaluatorDamageTotal.toLocaleString('pt-BR')}
- Categorias de fotos recebidas: ${categories.join(', ') || 'não classificadas'}

OBJETIVO
Ajude a Mesa de Precificação a revisar a inspeção visual antes da decisão de compra.

PODE AVALIAR VISUALMENTE
- riscos, amassados e danos aparentes de lataria/para-choque
- possível diferença de tonalidade ou retoque, sempre como "possível" quando não for conclusivo
- condição aparente de faróis, vidros e acabamentos
- desgaste aparente de pneus quando visível
- desgaste de bancos, volante e acabamento interno
- luzes/alertas visíveis no painel
- falta de cobertura fotográfica importante

NÃO PODE AFIRMAR
- dano estrutural/chassi
- problema mecânico interno
- quilometragem adulterada
- histórico de colisão
- sinistro, leilão ou enchente
sem evidência documental específica. Nesses casos use "merece inspeção presencial".

CUSTO
Estime apenas uma faixa aproximada de preparação VISUAL com base nas fotos. Seja conservador.
O impacto sugerido na compra deve ser um valor NEGATIVO ou ZERO e representar uma reserva adicional prudente, nunca uma decisão automática.
Se as fotos forem insuficientes, reduza a confiança e não invente custo.

RETORNE SOMENTE JSON válido:
{
  "visualScore": 0,
  "overallConfidence": "high|medium|low",
  "summary": "resumo curto",
  "findings": [
    {
      "area": "Lataria",
      "finding": "descrição objetiva",
      "confidence": "high|medium|low",
      "severity": "low|medium|high",
      "action": "ação sugerida"
    }
  ],
  "missingViews": ["traseira"],
  "photoCoverage": 0,
  "estimatedPrepLow": 0,
  "estimatedPrepHigh": 0,
  "impactSuggested": 0,
  "pricingNote": "como isso deve ser considerado pela mesa",
  "safetyNote": "A análise visual é apoio e não substitui inspeção presencial."
}
`;

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: String(process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash'),
        contents: [{ role: 'user', parts: [{ text: visualPrompt }, ...imageParts] }],
        config: { responseMimeType: 'application/json', temperature: 0.15 },
      });
      const parsed = parseJson(response.text || '');
      if (!parsed) return res.status(502).json({ error: 'A IA não conseguiu estruturar a análise visual nesta tentativa.' });

      const low = Math.max(0, Math.round(toNumber(parsed.estimatedPrepLow) / 50) * 50);
      const high = Math.max(low, Math.round(toNumber(parsed.estimatedPrepHigh) / 50) * 50);
      const impact = Math.min(0, -Math.abs(Math.round(toNumber(parsed.impactSuggested) / 50) * 50));

      return res.status(200).json({
        visualScore: clamp(Math.round(toNumber(parsed.visualScore)), 0, 100),
        overallConfidence: ['high','medium','low'].includes(String(parsed.overallConfidence)) ? parsed.overallConfidence : 'low',
        summary: String(parsed.summary || '').slice(0, 700),
        findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 12) : [],
        missingViews: Array.isArray(parsed.missingViews) ? parsed.missingViews.slice(0, 12) : [],
        photoCoverage: clamp(Math.round(toNumber(parsed.photoCoverage)), 0, 100),
        estimatedPrepLow: low,
        estimatedPrepHigh: high,
        impactSuggested: impact,
        pricingNote: String(parsed.pricingNote || '').slice(0, 800),
        safetyNote: 'Análise visual por IA é apoio à Mesa de Precificação e não substitui inspeção presencial, laudo ou diagnóstico mecânico.',
        model: String(process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash'),
      });
    }

    const model = String(req.body?.model || '').trim();
    const year = toModelYear(req.body?.yearLabel || req.body?.year);
    const km = Math.round(toNumber(req.body?.km));
    const fipe = toNumber(req.body?.fipe);
    const storeName = String(req.body?.storeName || 'Sorocaba, SP').trim();

    if (!model || !year) {
      return res.status(400).json({ error: 'Informe modelo/versão e ano antes de pesquisar o mercado.' });
    }

    const prompt = `
Você é o motor de pesquisa do MOTYQ MarketScan, usado por avaliadores profissionais de seminovos no Brasil.
Sua missão é medir o MERCADO REAL DE COMPRA, dando prioridade aos anúncios válidos de MENOR PREÇO, porque são eles que pressionam a revenda e a avaliação de entrada.
Use Pesquisa Google e pesquise de verdade nas páginas/resultados dos portais.

VEÍCULO ALVO
- Modelo / versão informado: ${model}
- Ano-modelo alvo: ${year}
- KM atual: ${km || 'não informado'}
- FIPE atual: ${fipe ? `R$ ${fipe.toLocaleString('pt-BR')}` : 'não informada'}
- Região de origem: ${storeName}

REGRAS DE PREÇO
- ${fipe ? `A FIPE de R$ ${fipe.toLocaleString('pt-BR')} é o TETO absoluto desta amostra.` : 'A FIPE não foi informada; não aplique teto de FIPE.'}
- Quando houver FIPE, NÃO retorne nem use anúncio com preço acima dela.
- Anúncios abaixo da FIPE são válidos e devem permanecer na amostra.
- NÃO use média genérica do portal para substituir preços visíveis dos anúncios.
- Se houver anúncios exatos a R$ 83 mil, R$ 92 mil, R$ 95 mil e outros a R$ 103 mil, os mais baratos DEVEM aparecer na amostra.
- Quilometragem alta NÃO elimina o anúncio. Retorne a KM para o MOTYQ ponderar depois.
- Ignore apenas parcela, entrada, consórcio, aluguel, leilão sem preço integral e preço evidentemente inválido.

FONTES
- Prioridade: Webmotors e iCarros.
- Depois: Mobiauto, OLX Autos e sites confiáveis de lojas/concessionárias.
- Nunca Facebook ou Mercado Livre.

NORMALIZAÇÃO DO NOME
- Interprete abreviações do estoque. Exemplos: HL=Highline, LGTD=Longitude, LTD=Limited, AT/AUT=automático.
- Pesquise usando também o nome comercial completo usado pelos portais.

FUNIL
1. EXATO: mesma marca + modelo + versão + powertrain + ano-modelo ${year}.
2. Se houver menos de 3 exatos, mesmo modelo/ano/powertrain em versão comercial próxima.
3. Depois ano-modelo ${year - 1} ou ${year + 1} do mesmo modelo/powertrain.
4. Só por último semelhante técnico.

OBRIGATÓRIO NA ETAPA EXATA
- Procure uma página/listagem ordenada por MENOR PREÇO quando possível.
- Se a página indicar mais de 8 anúncios exatos, tente retornar pelo menos os 8 a 12 anúncios mais baratos válidos, não apenas três anúncios aleatórios.
- A amostra deve representar o piso competitivo do mercado, não os anúncios mais caros.
- Se a Webmotors mostrar uma contagem com filtros exatos de versão + ano, use essa contagem.
- Não use contagem de modelo mais amplo como se fosse da versão exata.

PONTUAÇÃO
- exact: 100
- same_model: 88 a 95
- adjacent_year: 80 a 87
- technical_peer: 65 a 79

RETORNE APENAS JSON VÁLIDO:
{
  "comparables": [
    {
      "source": "Webmotors",
      "title": "nome completo do anúncio",
      "price": 93000,
      "year": ${year},
      "km": 80000,
      "location": "Campinas, SP",
      "url": null,
      "matchType": "exact",
      "matchTier": "exact",
      "compatibilityScore": 100,
      "similarityReason": ""
    }
  ],
  "marketOfferCount": 0,
  "marketOfferSource": "",
  "marketOfferScope": "exact",
  "expandedGeography": false,
  "notes": "resumo curto"
}
`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });

    const parsed = parseJson(response.text || '') || {};
    const mainRaw: Comparable[] = Array.isArray(parsed?.comparables) ? parsed.comparables : [];
    const mainNormalizedAll = normalizeComparables(mainRaw, model, year);
    // Regra comercial do MOTYQ: anúncios acima da FIPE não entram na amostra nem nos cálculos.
    const mainNormalized = fipe ? mainNormalizedAll.filter(item => item.price <= fipe) : mainNormalizedAll;
    const initialExact = mainNormalized.filter(item => item.matchTier === 'exact' && item.year === year);
    const initialOfferCount = Math.max(0, Math.round(toNumber(parsed?.marketOfferCount)));
    const initialOfferScope = String(parsed?.marketOfferScope || '').toLowerCase();
    const initialMinExact = initialExact.length ? Math.min(...initialExact.map(item => item.price)) : 0;

    const shouldAuditExactFloor =
      (initialOfferCount >= 8 && initialExact.length < 6) ||
      (initialOfferCount >= 12 && initialExact.length < 8) ||
      Boolean(fipe && initialExact.length >= 3 && initialMinExact > fipe * 1.03);

    let auditResponse: any = null;
    let auditParsed: any = null;

    if (shouldAuditExactFloor) {
      const auditPrompt = `
Você é o AUDITOR DE PREÇO do MOTYQ. A primeira busca encontrou poucos anúncios ou um piso suspeitamente alto.
Faça uma SEGUNDA BUSCA independente e focada somente nos MENORES PREÇOS da versão EXATA.

ALVO EXATO
- ${model}
- ano-modelo ${year}
- FIPE informada: ${fipe ? `R$ ${fipe.toLocaleString('pt-BR')}` : 'não informada'}

REGRAS
- Pesquise primeiro Webmotors, depois iCarros.
- Use filtros de versão e ano exatos e procure/considere ordenação por MENOR PREÇO.
- NÃO amplie para outra versão, outro motor ou outro ano nesta auditoria.
- Retorne os 8 a 12 menores preços válidos que conseguir confirmar.
- NÃO descarte anúncio por KM alta.
- NÃO descarte anúncio por preço abaixo da FIPE.
- ${fipe ? `DESCARTE qualquer anúncio acima de R$ ${fipe.toLocaleString('pt-BR')} (FIPE alvo).` : 'Sem FIPE informada, não aplique teto de preço.'}
- Se a página da Webmotors informar, por exemplo, 19 anúncios com esses filtros exatos, exactOfferCount deve ser 19.
- Não confunda contagem de toda a linha/modelo com a versão exata.
- Não invente preços nem contagem.

RETORNE APENAS JSON:
{
  "comparables": [
    {"source":"Webmotors","title":"","price":0,"year":${year},"km":0,"location":"","url":null,"matchType":"exact","matchTier":"exact","compatibilityScore":100,"similarityReason":""}
  ],
  "exactOfferCount": 0,
  "exactOfferSource": "",
  "notes": ""
}
`;
      auditResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: auditPrompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      auditParsed = parseJson(auditResponse.text || '') || {};
    }

    const auditRaw: Comparable[] = Array.isArray(auditParsed?.comparables) ? auditParsed.comparables : [];
    const mergedNormalizedAll = dedupeComparables(normalizeComparables([...mainRaw, ...auditRaw], model, year));
    const mergedNormalized = fipe ? mergedNormalizedAll.filter(item => item.price <= fipe) : mergedNormalizedAll;

    const exact = sortByCompetitivePrice(mergedNormalized.filter(item => item.matchTier === 'exact' && item.year === year));
    const sameModel = sortByCompetitivePrice(mergedNormalized.filter(item => item.matchTier === 'same_model' && item.year === year));
    const adjacent = sortByCompetitivePrice(mergedNormalized.filter(item => item.matchTier === 'adjacent_year'));
    const peers = sortByCompetitivePrice(mergedNormalized.filter(item => item.matchTier === 'technical_peer'));

    let selectedTier: MatchTier = 'technical_peer';
    let sourcePool = [...exact, ...sameModel, ...adjacent, ...peers];

    if (exact.length >= 3) {
      selectedTier = 'exact';
      sourcePool = exact;
    } else if (exact.length + sameModel.length >= 3) {
      selectedTier = 'same_model';
      sourcePool = [...exact, ...sameModel];
    } else if (exact.length + sameModel.length + adjacent.length >= 3) {
      selectedTier = 'adjacent_year';
      sourcePool = [...exact, ...sameModel, ...adjacent];
    }

    // Para avaliação de compra, a amostra principal é a faixa competitiva: os menores anúncios válidos.
    // Isso impede três anúncios caros de inflarem artificialmente o "mercado observado".
    const sample = sortByCompetitivePrice(sourcePool).slice(0, 12);
    const prices = sample.map(item => item.price).sort((a, b) => a - b);
    const marketMedian = median(prices);
    const low = prices.length ? prices[0] : 0;
    const high = prices.length ? prices[prices.length - 1] : 0;
    const lowerBandCount = prices.length ? Math.min(prices.length, Math.max(3, Math.ceil(prices.length * 0.30))) : 0;
    const observed = median(prices.slice(0, lowerBandCount)) || marketMedian || 0;

    const auditOfferCount = Math.max(0, Math.round(toNumber(auditParsed?.exactOfferCount)));
    const auditOfferSource = String(auditParsed?.exactOfferSource || '').trim();
    const mainCountIsExact = initialOfferScope === 'exact';
    const reportedOfferCount = auditOfferCount || (mainCountIsExact ? initialOfferCount : 0);
    const offerCount = reportedOfferCount || sample.length;
    const offerSource = auditOfferSource || (mainCountIsExact ? String(parsed?.marketOfferSource || '').trim() : '');
    const offerReported = Boolean(reportedOfferCount);
    const offerLevel = offerReported
      ? (reportedOfferCount >= 30 ? 'high' : reportedOfferCount >= 12 ? 'medium' : 'low')
      : (sample.length >= 10 ? 'medium' : 'low');
    const offerWarning = offerLevel === 'high'
      ? `ALTA OFERTA NO MERCADO: ${reportedOfferCount} anúncios exatos identificados. Cautela na compra: muita oferta aumenta a concorrência, pressiona preço e pode alongar o giro.`
      : offerLevel === 'medium'
        ? `${offerReported ? `Oferta relevante: ${reportedOfferCount} anúncios exatos identificados.` : 'Amostra competitiva relevante encontrada.'} Avalie preço de entrada e giro com atenção.`
        : '';

    const mainGrounding = groundingData(response);
    const auditGrounding = groundingData(auditResponse);
    const sources = [...mainGrounding.sources, ...auditGrounding.sources]
      .filter((item, index, arr) => arr.findIndex(other => other.url === item.url) === index)
      .slice(0, 20);
    const searchQueries = Array.from(new Set([...mainGrounding.queries, ...auditGrounding.queries]));

    if (!sample.length || !observed) {
      return res.status(200).json({
        comparables: [],
        stats: { count: 0, low: 0, median: 0, high: 0, observed: 0 },
        confidence: 'low',
        marketSupply: { level: offerLevel, count: offerCount, reported: offerReported, source: offerSource, warning: offerWarning },
        expandedSearch: {
          used: true,
          scope: 'national_similar',
          exactCount: exact.length,
          similarCount: sameModel.length + adjacent.length + peers.length,
          warning: 'O MarketScan percorreu versão exata, mesmo modelo, anos adjacentes e semelhantes técnicos, mas não conseguiu validar preços suficientes nesta execução.',
        },
        notes: String(parsed?.notes || '').trim(),
        sources,
        searchQueries,
      });
    }

    const exactInSample = sample.filter(item => item.matchType === 'exact').length;
    const similarInSample = sample.filter(item => item.matchType === 'similar').length;
    const expandedGeography = Boolean(parsed?.expandedGeography);
    const expandedUsed = selectedTier !== 'exact' || expandedGeography;

    const warning = selectedTier === 'exact'
      ? (expandedGeography
        ? 'A busca local foi pequena; o MarketScan ampliou a distância, mas manteve a versão exata e priorizou os menores preços válidos.'
        : 'Amostra formada com a versão exata, priorizando os menores preços válidos do mercado.')
      : selectedTier === 'same_model'
        ? 'Havia poucos anúncios da versão exata. O MarketScan manteve o mesmo modelo, ano e powertrain e incluiu versões próximas com compatibilidade indicada.'
        : selectedTier === 'adjacent_year'
          ? 'A amostra exata continuou pequena. O MarketScan manteve o mesmo modelo/powertrain e incluiu anos-modelo adjacentes com peso menor.'
          : 'A oferta do mesmo modelo foi insuficiente. O MarketScan incluiu semelhantes técnicos e reduziu a confiança da referência.';

    const sourceDomains = new Set([
      ...sample.map(item => String(item.source || '').toLowerCase()).filter(Boolean),
      ...sources.map(item => domainOf(item.url)).filter(Boolean),
    ]);

    const coverage = reportedOfferCount ? sample.length / reportedOfferCount : 0;
    const confidence = selectedTier === 'exact'
      ? (sample.length >= 8 && sourceDomains.size >= 2 ? 'high' : sample.length >= 5 || coverage >= 0.30 ? 'medium' : 'low')
      : selectedTier === 'same_model'
        ? (sample.length >= 6 ? 'medium' : 'low')
        : 'low';

    const noteParts = [
      warning,
      shouldAuditExactFloor ? 'O piso de preço foi auditado em uma segunda busca focada nos anúncios exatos mais baratos.' : '',
      'O mercado observado usa a faixa inferior da amostra competitiva, evitando que anúncios caros inflem a avaliação.',
      fipe ? `FIPE de R$ ${fipe.toLocaleString('pt-BR')} aplicada como teto: anúncios acima dela foram excluídos da amostra e dos cálculos.` : '',
      reportedOfferCount && offerSource ? offerSource : '',
      parsed?.notes ? String(parsed.notes).trim() : '',
      auditParsed?.notes ? String(auditParsed.notes).trim() : '',
    ].filter(Boolean);

    return res.status(200).json({
      comparables: sample,
      stats: {
        count: sample.length,
        low: round100(low),
        median: round100(marketMedian),
        high: round100(high),
        observed: round100(observed),
      },
      confidence,
      marketSupply: { level: offerLevel, count: offerCount, reported: offerReported, source: offerSource, warning: offerWarning },
      expandedSearch: {
        used: expandedUsed,
        scope: selectedTier === 'exact' ? 'national_exact' : 'national_similar',
        exactCount: exactInSample,
        similarCount: similarInSample,
        warning,
      },
      notes: noteParts.join(' '),
      sources,
      searchQueries,
    });
  } catch (error: any) {
    console.error('Motyq MarketScan error:', error?.message || error);
    return res.status(500).json({ error: 'Não foi possível pesquisar o mercado agora. Tente novamente.' });
  }
}


const string = (value: unknown) => String(value ?? '').trim();
const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const marketBrand = (value: string) => {
  const parts = string(value).split(/\s+-\s+/).map(x => x.trim()).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : string(value);
  return last.replace(/^vw\s+/i,'').replace(/^gm\s+/i,'').trim();
};
type Source = 'webmotors' | 'olx' | 'napista';
const portal = (raw: string): Source | null => {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase(), path = u.pathname.toLowerCase();
    if ((host === 'webmotors.com.br' || host.endsWith('.webmotors.com.br')) && (path.startsWith('/comprar/') || path.startsWith('/carros-usados/') || path.startsWith('/carros-novos/') || path.includes('/estoque/') || path.startsWith('/carros/'))) return 'webmotors';
    if ((host === 'olx.com.br' || host.endsWith('.olx.com.br')) && /autos-e-pecas|carros-vans-e-utilitarios|-id-\d{7,}|\/d\/|\/item\//.test(path)) return 'olx';
    if ((host === 'napista.com.br' || host.endsWith('.napista.com.br')) && path.startsWith('/busca/')) return 'napista';
    return null;
  } catch { return null; }
};
// Lists and search pages are never treated as verified, individual advertisements.
const isIndividualAdUrl = (source: Source, raw: string) => {
  try {
    const path = new URL(raw).pathname.toLowerCase();
    if (source === 'webmotors') return /^\/comprar\/[^/]+\/[^/]+\/.+\/\d{7,}\/?$/.test(path);
    if (source === 'olx') return /(?:-id-|\/item\/|\/d\/)[a-z0-9-]*\d{7,}\/?$/.test(path);
    return false;
  } catch {return false;}
};
const priceOf = (text: string) => {
  const found = text.match(/R\$\s*((?:\d{1,3}\.){1,2}\d{3})(?:,\d{2})?/i);
  const value = found ? Number(found[1].replace(/\./g, '')) : 0;
  return value >= 15000 && value <= 2000000 ? value : 0;
};
const kmOf = (text: string) => {
  const backwards = text.match(/\bKM\s*[:\n\r-]*\s*(\d{1,3}(?:\.\d{3})+|\d{4,6})\b/i);
  if (backwards) return Number(backwards[1].replace(/\./g,''));
  const compact = text.match(/\b(\d{1,3}(?:\.\d{3})+|\d{4,6})\s*(?:km|quil[oô]metros)\b/i);
  if (compact) return Number(compact[1].replace(/\./g, ''));
  const thousands = text.match(/\b(\d{1,3})(?:[,.](\d))?\s*mil\s*(?:km|quil[oô]metros)\b/i);
  return thousands ? Number(thousands[1]) * 1000 + Number(thousands[2] || 0) * 100 : 0;
};
const riskWords = /leil[aã]o|sinistr|recuperad|batid|salvado|sucata|cons[oó]rcio/i;
const search = async (query: string, domain: string) => {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'X-Tavily-Access-Mode': 'keyless',
      'X-Client-Source': 'tavily-mcp-keyless',
      'X-Session-Id': 'motyq-iq-market-preview',
    },
    body: JSON.stringify({ query, search_depth: 'basic', topic: 'general', max_results: 8, include_domains: [domain], include_raw_content: 'markdown' }),
    signal: AbortSignal.timeout(16000),
  });
  if (response.status === 401 || response.status === 402 || response.status === 429) {
    throw new Error('Cota gratuita de pesquisa temporariamente indisponível (HTTP ' + response.status + ').');
  }
  if (!response.ok) throw new Error('Pesquisa web falhou (HTTP ' + response.status + ').');
  const data = await response.json() as any;
  return Array.isArray(data?.results) ? data.results : [];
};


// Candidate prices from public search-index snippets and public catalog page content.
// Each candidate is explicitly provisional and must not be classified as a verified ad.
const listingPageCandidates = (pages: any[], brand: string, model: string, year: number, targetKm: number) => {
  const canonical = (s:string) => normalize(s).replace(/[^a-z0-9]+/g,' ');
  const tokens = canonical(model).split(/\s+/).filter(Boolean);
  const core = tokens[0] || '';
  const variant = tokens.slice(1).find(token => token.length >= 4 &&
    !['flex','auto','automatico','manual','turbo','diesel','gasolina','motor','hibrido','eletrico','gas','aut'].includes(token)) || '';
  const engine = tokens.find(token => /^t\d{3,4}$/.test(token)) || '';
  const normalizedBrand=marketBrand(brand);
  const firstPart = canonical(normalizedBrand+' '+core).trim();
  const outputs: any[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    const url = string(page.url);
    const source = portal(url);
    if (!source || isIndividualAdUrl(source,url)) continue;
    // Public index snippets often contain price/KM where full-page extraction only has navigation.
    // Inspect both representations separately so the latter cannot mask the former.
    const texts = [string(page.content).slice(0,5500),string(page.raw_content).slice(0,100000)]
      .filter(Boolean);
    for (const content of texts) {
      const normalized=content.replace(/\u00a0/g,' ').replace(/\s+/g,' ');
      const heading = /(?:JEEP\s+COMMANDER|HYUNDAI\s+CRETA|FIAT\s+STRADA)/ig;
      // General matching for other makes/models, with space/markup-separated words.
      const pattern = new RegExp(normalizedBrand.replace(/[^a-zA-Z0-9 ]/g,'').trim().replace(/\s+/g,'\\s+')+
        '[\\s*#:_\\-]+'+core.replace(/[^a-z0-9]/g,''),'gi');
      const hits = [...normalized.matchAll(pattern)].slice(0,60);
      for(let i=0;i<hits.length;i++){
        const from=hits[i].index||0;
        const next=i+1<hits.length?(hits[i+1].index||normalized.length):normalized.length;
        const block=normalized.slice(from,Math.min(next,from+580));
        const normalizedBlock=canonical(block);
        if (!normalizedBlock.includes(firstPart)) continue;
        if (variant && !normalizedBlock.split(' ').some(token=>token===variant||
          (token.length>=4&&variant.length>=5&&variant.startsWith(token)))) continue;
        if (engine && !normalizedBlock.split(' ').includes(engine)) continue;
        // The exact model year must be explicit in the same item block.
        const yearPair=block.match(/\b(?:19|20)\d{2}\s*\/\s*((?:19|20)\d{2})\b/);
        const modelYear=yearPair?Number(yearPair[1]):/\b(?:19|20)\d{2}\b/.test(block)&&
          new RegExp('\\b'+year+'\\b').test(block)?year:0;
        if(modelYear!==year)continue;
        const price=priceOf(block);
        const adKm=kmOf(block);
        if(!price||!adKm||Math.abs(adKm-targetKm)>60000)continue;
        if(riskWords.test(block.slice(0,160)))continue;
        const key=[source,price,adKm,modelYear].join('|');
        if(seen.has(key))continue;
        seen.add(key);
        outputs.push({
          source,price,km:adKm,year:modelYear,
          title:normalizedBrand+' '+model+' · '+modelYear+' · '+adKm.toLocaleString('pt-BR')+' km',
          url:url.split('?')[0],
          evidence:'Preço, KM e versão presentes no mesmo trecho indexado de vitrine pública; anúncio individual não confirmado.',
          catalog:true,confidence:'catalog_page',
        });
      }
    }
  }
  return outputs.sort((a,b)=>a.price-b.price).slice(0,20);
};

// Search queries depend on model/year, not the vehicle's plate or KM.
// Keep successful public-index responses briefly to reduce free shared-rate-limit pressure.
const marketSearchCache=new Map<string,{expiresAt:number;lookups:PromiseSettledResult<any[]>[]}>();
async function marketIqDeskSearchServer(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const brand = string(req.body?.brand).slice(0, 60);
  const model = string(req.body?.model).slice(0, 140);
  const year = Number(req.body?.year);
  const km = Number(req.body?.km);
  if (!brand || !model || !Number.isInteger(year) || year < 1990 || year > 2100 || !Number.isFinite(km) || km <= 0)
    return res.status(400).json({ error: 'Selecione marca, versão, ano e quilometragem antes da pesquisa.' });
  const tokens = normalize(model).split(/[^a-z0-9]+/).filter(Boolean);
  const variant = tokens.slice(1).find(t => t.length >= 4 && !['flex','auto','automatico','manual','turbo','diesel','gasolina','motor'].includes(t)) || '';
  const queryBase = [marketBrand(brand),tokens[0],variant,year].filter(Boolean).join(' ');
  const cacheKey=normalize(queryBase).replace(/\s+/g,' ');
  const cached=marketSearchCache.get(cacheKey);
  const cacheHit=Boolean(cached&&cached.expiresAt>Date.now());
  let lookups:PromiseSettledResult<any[]>[];
  if(cacheHit) {
    lookups=cached!.lookups;
  } else {
    lookups=await Promise.allSettled([
      search(queryBase + ' ' + year + '/' + year + ' site:webmotors.com.br/carros-usados preço km', 'webmotors.com.br'),
      search(queryBase + ' site:webmotors.com.br/comprar/ preço km', 'webmotors.com.br'),
      search(queryBase + ' site:olx.com.br carro usado preço quilometragem', 'olx.com.br'),
      search(queryBase + ' site:napista.com.br/busca/ preço km', 'napista.com.br'),
    ]);
    if(lookups.some(result=>result.status==='fulfilled'&&result.value.length>0)) {
      if(marketSearchCache.size>=60)marketSearchCache.delete(marketSearchCache.keys().next().value!);
      marketSearchCache.set(cacheKey,{expiresAt:Date.now()+15*60*1000,lookups});
    }
  }
  const complete = lookups.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const failed = lookups.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
  if (!complete.length && failed.length === lookups.length) {
    const detail = failed.map(x => String(x.reason?.message || '')).filter(Boolean).join(' / ');
    return res.status(503).json({ error: 'A pesquisa gratuita está indisponível. ' + detail.slice(0, 240) });
  }
  const modelTokens = normalize(model).split(/[^a-z0-9]+/).filter(Boolean);
  const coreModel = modelTokens[0] || '';
  const trimToken = modelTokens.slice(1).find(token =>
    token.length >= 4 && !['flex','auto','automatico','manual','turbo','diesel','gasolina','hibrido','eletrico','motor','sedan','hatch'].includes(token));
  const seen = new Set<string>();
  const individualAds = complete.map((item: any) => {
    const url = string(item?.url);
    const source = portal(url);
    const title = string(item?.title).slice(0, 180);
    const snippet = string(item?.content).slice(0, 2200);
    const text = title + ' ' + snippet + ' ' + string(item?.raw_content).slice(0, 5000);
    const normalizedText = normalize(text + ' ' + url);
    const price = priceOf(text), adKm = kmOf(text);
    if (!source || !isIndividualAdUrl(source,url) || !coreModel || !normalizedText.includes(coreModel)) return null;
    if (trimToken && !normalizedText.includes(trimToken)) return null;
    if (!normalizedText.includes(String(year))) return null;
    if (!price || !adKm || Math.abs(adKm - km) > 60000 || riskWords.test(title + ' ' + snippet.slice(0, 250))) return null;
    const cleanUrl = url.split('?')[0];
    if (seen.has(cleanUrl) || /\/estoque\/|\/carros\/|\/carros-usados\//.test(new URL(url).pathname) && !/\/comprar\//.test(new URL(url).pathname)) return null;
    seen.add(cleanUrl);
    return { source, title, url: cleanUrl, price, km: adKm, year,
      evidence: snippet.slice(0, 220), confidence: 'candidate' };
  }).filter(Boolean).sort((a: any, b: any) => a.price - b.price).slice(0, 20);
  const listingAds = listingPageCandidates(complete, marketBrand(brand), model, year, km);
  const ads = [...individualAds, ...listingAds].filter((item:any,index:number,items:any[])=>items.findIndex((other:any)=>other.source===item.source&&other.price===item.price&&other.km===item.km&&other.year===item.year)===index).sort((a:any,b:any)=>a.price-b.price).slice(0,24);
  const searchEvidence = complete.map((p:any) => {
    const source=portal(string(p.url));
    const text=string(p.title)+' '+string(p.content);
    const raw=string(p.raw_content);
    return {
      source:source||'other', pageType:source&&isIndividualAdUrl(source,string(p.url))?'individual':'listing',
      hasPrice:Boolean(priceOf(text)), hasKm:Boolean(kmOf(text)), mentionsYear:normalize(text).includes(String(year)),
      mentionsModel:normalize(text).includes(coreModel), mentionsVersion:!trimToken||normalize(text).includes(trimToken),
      hasFullText:Boolean(raw), fullTextLength:raw.length, hrefPath:(()=>{try{return new URL(string(p.url)).pathname.slice(0,160)}catch{return ''}})(),
    };
  });
  console.info('Desk MarketScan counts', JSON.stringify({
    pages: complete.length,
    pagesWithFullContent: complete.filter((p:any)=>Boolean(p.raw_content)).length,
    individualAds: individualAds.length, listingAds: listingAds.length, failedSources: failed.length,
    evidence:searchEvidence,
  }));
  return res.status(200).json({
    ads, searchedAt: new Date().toISOString(), cached:cacheHit, provider: 'Tavily Keyless · busca web gratuita',
    warning: 'Dados extraídos de trechos indexados, não diretamente da página do anunciante. Conferência do anúncio necessária antes de aprovar compra.',
    pagesFound: complete.length,
    evidenceSummary: {
      individualPages:searchEvidence.filter((p:any)=>p.pageType==='individual').length,
      listingsPages:searchEvidence.filter((p:any)=>p.pageType==='listing').length,
      snippetPriceAndKm:searchEvidence.filter((p:any)=>p.hasPrice&&p.hasKm&&p.mentionsYear&&p.mentionsModel).length,
      fullContentByPortal:{webmotors:searchEvidence.filter((p:any)=>p.source==='webmotors'&&p.hasFullText).length,olx:searchEvidence.filter((p:any)=>p.source==='olx'&&p.hasFullText).length,napista:searchEvidence.filter((p:any)=>p.source==='napista'&&p.hasFullText).length},
    },
    sourcePagesWithFullContent: complete.filter((p:any) => Boolean(p.raw_content)).length,
    sourcesChecked: lookups.map((result, i) => ({
      source: i < 2 ? 'Webmotors' : i === 2 ? 'OLX' : 'NaPista', available: result.status === 'fulfilled',
      pageCount: result.status === 'fulfilled' ? result.value.length : 0,
      error: result.status === 'rejected' ? String(result.reason?.message || 'Fonte indisponível').slice(0,180) : '',
    })),
  });
}
