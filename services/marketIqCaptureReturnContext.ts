/**
 * Last completed appraisal form, for a user-confirmed return from the Webmotors
 * bookmarklet to Motyq in a different browser tab. This is NOT a paid value,
 * not the official history and never authorizes an automatic vehicle match.
 */
export type CaptureReturnContext={
 vehicleType:'car'|'motorcycle';
 plate:string;brand:string;brandCode:string;model:string;modelCode:string;
 year:string;yearCode:string;marketYear:number;km:string;cost:string;
 updatedAt:number;
};
type ScopeStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const PREFIX='motyq-iq-bookmarklet-return-context-v1-';
const TTL=24*60*60*1000;
const normalizeText=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):'';
const scopeKey=(scope:string)=>PREFIX+encodeURIComponent(scope.slice(0,200));
const integer=(n:unknown)=>Number.isInteger(n)&&Number(n)>=1990&&Number(n)<=2100?Number(n):0;
export function readCaptureReturnContext(storage:ScopeStorage|undefined,scope:string,now=Date.now()):CaptureReturnContext|null{
 if(!storage||!scope)return null;
 try{
  const obj=JSON.parse(storage.getItem(scopeKey(scope))||'null');
  if(!obj||typeof obj!=='object')return null;
  if(typeof obj.updatedAt!=='number'||obj.updatedAt>now+60000||now-obj.updatedAt>TTL)return null;
  const vehicleType=obj.vehicleType==='motorcycle'?'motorcycle':'car';
  const brand=normalizeText(obj.brand,100),model=normalizeText(obj.model,200);
  const brandCode=normalizeText(obj.brandCode,40),modelCode=normalizeText(obj.modelCode,40);
  const year=normalizeText(obj.year,100),yearCode=normalizeText(obj.yearCode,40),marketYear=integer(obj.marketYear);
  const km=normalizeText(obj.km,12),mileage=Number(km.replace(/[^0-9]/g,''));
  if(!brand||!model||!brandCode||!modelCode||!yearCode||!marketYear||!Number.isFinite(mileage)||mileage<=0||mileage>999999)return null;
  return {vehicleType,brand,model,brandCode,modelCode,year,yearCode,marketYear,km,
   plate:normalizeText(obj.plate,7).replace(/[^A-Za-z0-9]/g,'').toUpperCase(),
   cost:normalizeText(obj.cost,20),updatedAt:obj.updatedAt};
 }catch{return null;}
}
export function writeCaptureReturnContext(
 storage:ScopeStorage|undefined,scope:string,details:Omit<CaptureReturnContext,'updatedAt'>,now=Date.now()
):boolean{
 if(!storage||!scope)return false;
 const candidate={...details,updatedAt:now};
 try{
  storage.setItem(scopeKey(scope),JSON.stringify(candidate));
  return Boolean(readCaptureReturnContext(storage,scope,now));
 }catch{return false;}
}
export function capturedOffersFitReturnContext(
 urls:{url:string;year:number}[],expectedModelUrl:string|null,expectedYear:number
):boolean{
 if(!expectedModelUrl||!Number.isInteger(expectedYear)||expectedYear<1990||urls.length===0)return false;
 try{
  const p=new URL(expectedModelUrl);
  if(p.protocol!=='https:'||!['www.webmotors.com.br','webmotors.com.br'].includes(p.hostname))return false;
  const x=p.pathname.split('/').filter(Boolean);
  if(x.length<4)return false;
  return urls.every(ad=>{
   const u=new URL(ad.url);
   if(u.protocol!=='https:'||!['www.webmotors.com.br','webmotors.com.br'].includes(u.hostname))return false;
   const seg=u.pathname.split('/').filter(Boolean);
   return seg[0]==='comprar'&&seg[1]===x[2]&&seg[2]===x[3]&&Number(ad.year)===expectedYear;
  });
 }catch{return false;}
}
