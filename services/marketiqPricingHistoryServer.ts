/**
 * Motyq IQ pricing history. Server-side Firestore REST adapter.
 *
 * The Firebase service account already configured for production is used only
 * in this server route. The browser sends its Firebase ID token, which is
 * verified with Firebase Auth; company/store scope is derived from a *server-
 * read* active user profile, never from request body or URL.
 *
 * History is append-only. Firestore client rules deny direct access to this
 * separate collection; this route supplies the authorization boundary.
 */
import {createSign,randomUUID} from 'node:crypto';
import firebaseConfig from '../firebase-applet-config.json';

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
export default async function handler(req:any,res:any){
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
