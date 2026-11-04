/**
 * Authenticated, tenant-scoped, month-by-month AutoAvaliar archive.
 * No original XLSX/PII uploads. Browser sends allowlisted operational rows.
 * A new month snapshot becomes visible only after every chunk is validated.
 * Uses existing Firebase service account, with direct Firestore client access denied.
 */
import {createSign} from 'node:crypto';
import firebaseConfig from '../firebase-applet-config.json';
import {classifyByMileage} from '../services/marketIqFleetClassification';

type Field={stringValue?:string;booleanValue?:boolean};
const response=(res:any,status:number,payload:unknown)=>res.status(status).json(payload);
const trim=(s:unknown,max=120)=>String(s??'').trim().replace(/\s+/g,' ').slice(0,max);
const monthValid=(s:unknown)=>/^(20\d{2})-(0[1-9]|1[0-2])$/.test(String(s||''));
const batchValid=(s:unknown)=>/^[a-zA-Z0-9-]{12,50}$/.test(String(s||''));
const int=(v:unknown,min:number,max:number):number|null=>
 typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max?v:null;
const cash=(v:unknown):number|null=>
 typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=2000000?
 Math.round(v*100)/100:null;
const cleanDate=(s:unknown)=>{
 const value=trim(s,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
 const d=new Date(value+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:'';
};
const seg=(value:unknown)=>{
 const s=trim(value,80);
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(s))throw new Error('SCOPE_INVALID');
 return s;
};
const getBearer=(req:any)=>{
 const h=String(req.headers?.authorization||'');
 return h.startsWith('Bearer ')?h.slice(7).trim():'';
};
const serviceAccount=()=>{
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 if(!raw)throw new Error('SERVICE_ACCOUNT_MISSING');
 const sa=JSON.parse(raw);
 if(!sa.project_id||!sa.client_email||!sa.private_key||
    sa.project_id!==firebaseConfig.projectId)throw new Error('SERVICE_ACCOUNT_INVALID');
 return sa;
};
const accessToken=async(sa:any)=>{
 const encode=(v:string)=>Buffer.from(v).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 const unsigned=encode(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+
  encode(JSON.stringify({iss:sa.client_email,sub:sa.client_email,
   aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+1800,
   scope:'https://www.googleapis.com/auth/datastore'}));
 const signer=createSign('RSA-SHA256');
 signer.update(unsigned);signer.end();
 const assertion=unsigned+'.'+signer.sign(String(sa.private_key).replace(/\\n/g,'\n')).toString('base64url');
 const res=await fetch('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
  signal:AbortSignal.timeout(12000)
 });
 const body=await res.json() as any;
 if(!res.ok||!body.access_token)throw new Error('GOOGLE_AUTH_FAILED');
 return String(body.access_token);
};
const dbBase=(sa:any)=>
 'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(sa.project_id)+
 '/databases/'+encodeURIComponent(String(firebaseConfig.firestoreDatabaseId))+'/documents';
const firestoreRead=async(url:string,token:string)=>{
 const res=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(16000)});
 if(res.status===404)return null;
 if(!res.ok)throw new Error('FIRESTORE_READ_FAILED_'+res.status);
 return res.json() as Promise<any>;
};
const firestoreWrite=async(url:string,token:string,payload:unknown)=>{
 const res=await fetch(url,{method:'PATCH',headers:{
  authorization:'Bearer '+token,'content-type':'application/json'
 },body:JSON.stringify({fields:{payload:{stringValue:JSON.stringify(payload)}}}),
  signal:AbortSignal.timeout(16000)});
 if(!res.ok)throw new Error('FIRESTORE_WRITE_FAILED_'+res.status);
 return res.json();
};
const unpack=(doc:any):any=>{
 try{
  return JSON.parse(String(doc?.fields?.payload?.stringValue||''));
 }catch{return null;}
};
const scopedUser=async(req:any,sa:any,token:string)=>{
 const idToken=getBearer(req);
 if(!idToken)throw new Error('AUTH_REQUIRED');
 const auth=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+
  encodeURIComponent(firebaseConfig.apiKey),{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken}),
   signal:AbortSignal.timeout(12000)
  });
 if(!auth.ok)throw new Error('AUTH_REQUIRED');
 const authData=await auth.json() as any;
 const u=authData?.users?.[0];
 const who=trim(u?.email,240).toLowerCase();
 if(!who)throw new Error('AUTH_REQUIRED');
 const isOwner=who==='r.camargo.pires@gmail.com'&&u.emailVerified===true;
 const profileRes=await firestoreRead(dbBase(sa)+'/users/'+encodeURIComponent(who),token);
 const f:Record<string,Field>=profileRes?.fields||{};
 const role=String(f.role?.stringValue||'');
 const active=String(f.status?.stringValue||'')==='active';
 const access=isOwner||(active&&(
  ['admin','manager','pricing'].includes(role)||
  f.pricingDeskOnly?.booleanValue===true||f.pricingDeskAccess?.booleanValue===true
 ));
 if(!access)throw new Error('PERMISSION_DENIED');
 return {email:who,companyId:seg(f.companyId?.stringValue||'abrao-reze')};
};
const normalizeRow=(raw:any,month:string)=>{
 if(!raw||typeof raw!=='object')throw new Error('INVALID_ROW');
 const id=trim(raw.id,48);
 const evaluationDate=cleanDate(raw.evaluationDate);
 const plate=trim(raw.plate,10).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
 if(!/^[a-zA-Z0-9_-]{1,48}$/.test(id)||!evaluationDate||
    evaluationDate.slice(0,7)!==month)throw new Error('INVALID_ROW_DATE_OR_ID');
 const km=int(raw.km,0,999999);
 const row={
  id,month,evaluationDate,purchaseDate:cleanDate(raw.purchaseDate),
  plate,brand:trim(raw.brand,100),model:trim(raw.model,100),
  version:trim(raw.version,160),vehicleType:raw.vehicleType==='motorcycle'?'motorcycle':'car',
  manufacturingYear:int(raw.manufacturingYear,1900,2100),
  modelYear:int(raw.modelYear,1900,2100),km,
  classRecorded:trim(raw.classRecorded,16),classSuggested:
   km===null?'':classifyByMileage(km)?.classification||'',
  destination:trim(raw.destination,35),status:trim(raw.status,35),
  store:trim(raw.store,110),evaluator:trim(raw.evaluator,110),
  seller:trim(raw.seller,110),color:trim(raw.color,40),
  assessedValue:cash(raw.assessedValue),estimatedCost:cash(raw.estimatedCost),
  fipe:cash(raw.fipe),webReference:cash(raw.webReference),
  fipeCode:trim(raw.fipeCode,32)
 };
 return row;
};
const pathFor=(base:string,company:string,month:string)=>
 base+'/marketiq_monthly_archive_v1/'+encodeURIComponent(company)+'/months/'+encodeURIComponent(month);
const batchPath=(monthPath:string,batchId:string,index:number)=>
 monthPath+'/chunks/'+batchId+'-'+String(index).padStart(3,'0');
const getManifest=async(monthPath:string,token:string)=>{
 const doc=await firestoreRead(monthPath,token);
 return unpack(doc);
};
const readChunks=async(monthPath:string,token:string,batchId:string,count:number,month:string)=>{
 if(!batchValid(batchId)||!Number.isInteger(count)||count<1||count>100)throw new Error('INVALID_MANIFEST');
 const jobs=Array.from({length:count},(_,i)=>i);
 const output:any[]=[];
 for(let i=0;i<jobs.length;i+=10){
  const subset=jobs.slice(i,i+10);
  const fetched=await Promise.all(subset.map(index=>
    firestoreRead(batchPath(monthPath,batchId,index),token)));
  for(let j=0;j<fetched.length;j++){
   const payload=unpack(fetched[j]);
   if(!payload||payload.batchId!==batchId||payload.month!==month||
    payload.index!==subset[j]||!Array.isArray(payload.rows)||
    payload.rows.length===0||payload.rows.length>150)throw new Error('ARCHIVE_INCOMPLETE');
   output.push(...payload.rows.map((r:any)=>normalizeRow(r,month)));
  }
 }
 return output;
};
export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return response(res,405,{error:'Método não permitido.'});
 try{
  const sa=serviceAccount();
  const token=await accessToken(sa);
  const user=await scopedUser(req,sa,token);
  const action=String(req.method==='GET'?req.query?.action:req.body?.action||'');
  const root=dbBase(sa)+'/marketiq_monthly_archive_v1/'+encodeURIComponent(user.companyId)+'/months';
  if(req.method==='GET'&&action==='months'){
   const doc=await firestoreRead(root+'?pageSize=100',token);
   const months=(doc?.documents||[]).map((x:any)=>unpack(x)).filter((x:any)=>
     x&&monthValid(x.month)&&Number.isInteger(x.count)&&x.count>=0);
   if(doc?.nextPageToken)throw new Error('ARCHIVE_MONTH_LIST_TOO_LARGE');
   months.sort((a:any,b:any)=>String(b.month).localeCompare(String(a.month)));
   return response(res,200,{months});
  }
  const month=String(req.method==='GET'?req.query?.month:req.body?.month||'');
  if(!monthValid(month))return response(res,400,{error:'Informe um mês válido (AAAA-MM).'});
  const monthPath=pathFor(dbBase(sa),user.companyId,month);
  if(req.method==='GET'&&action==='load'){
   const manifest=await getManifest(monthPath,token);
   if(!manifest)return response(res,404,{error:'Mês não encontrado.'});
   const records=await readChunks(monthPath,token,manifest.batchId,manifest.chunks,month);
   if(records.length!==manifest.count)throw new Error('ARCHIVE_INCOMPLETE');
   return response(res,200,{month,manifest,records});
  }
  if(req.method==='POST'&&action==='chunk'){
   const batchId=String(req.body?.batchId||'');
   const index=req.body?.index;
   const records=req.body?.rows;
   if(!batchValid(batchId)||!Number.isInteger(index)||index<0||index>=100||
      !Array.isArray(records)||records.length<1||records.length>150)
      return response(res,400,{error:'Lote inválido (máximo 150 avaliações por lote).'});
   if(JSON.stringify(records).length>230000)
      return response(res,413,{error:'Lote muito grande.'});
   const clean=records.map(r=>normalizeRow(r,month));
   const keys=new Set(clean.map(r=>r.id));
   if(keys.size!==clean.length)return response(res,400,{error:'IDs repetidos no mesmo lote.'});
   await firestoreWrite(batchPath(monthPath,batchId,index),token,{
    month,batchId,index,rows:clean
   });
   return response(res,200,{saved:true,index,count:clean.length});
  }
  if(req.method==='POST'&&action==='commit'){
   const batchId=String(req.body?.batchId||'');
   const chunks=req.body?.chunks;
   const expectedCount=req.body?.expectedCount;
   if(!batchValid(batchId)||!Number.isInteger(chunks)||chunks<1||chunks>100||
      !Number.isInteger(expectedCount)||expectedCount<1||expectedCount>15000||
      chunks!==Math.ceil(expectedCount/150))
      return response(res,400,{error:'Manifesto inválido.'});
   const records=await readChunks(monthPath,token,batchId,chunks,month);
   const ids=new Set(records.map(r=>r.id));
   if(records.length!==expectedCount||ids.size!==records.length)
      return response(res,409,{error:'Lotes incompletos ou IDs repetidos. Nenhum mês foi substituído.'});
   const manifest={
    month,count:records.length,chunks,batchId,sourceName:trim(req.body?.sourceName,120),
    importedAt:new Date().toISOString(),importedBy:user.email,
    withPurchaseDate:records.filter(r=>r.purchaseDate).length,
    withWebReference:records.filter(r=>r.webReference!==null).length,
    withAssessedValue:records.filter(r=>r.assessedValue!==null).length,
    classDifference:records.filter(r=>r.classRecorded&&r.classSuggested&&r.classRecorded!==r.classSuggested).length,
    // No real paid amount is inferred from the source's "Valor avaliado".
    paidAmountCoverage:0,version:1
   };
   await firestoreWrite(monthPath,token,manifest);
   return response(res,200,{saved:true,manifest});
  }
  return response(res,400,{error:'Ação inválida.'});
 }catch(e:any){
  const msg=String(e?.message||'ARCHIVE_FAILED');
  const status=msg==='AUTH_REQUIRED'?401:msg==='PERMISSION_DENIED'?403:
   msg.startsWith('INVALID_')?400:msg==='ARCHIVE_INCOMPLETE'?409:500;
  console.error('Motyq IQ monthly archive:',msg);
  return response(res,status,{error:status===500?
   'Arquivo mensal indisponível. Nenhuma informação de avaliações foi alterada.':
   status===403?'Sem permissão para acessar o arquivo mensal.':
   status===401?'Sessão expirada. Entre novamente.':
   msg==='ARCHIVE_INCOMPLETE'?'O mês está incompleto. Repita a importação.':
   'Dados inválidos na importação.'});
 }
}
