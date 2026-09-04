type NamedCode={code?:string|number;name?:string;codigo?:string|number;nome?:string};

const BASE='https://fipe.parallelum.com.br/api/v2/cars';
const clean=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const canonicalBrand=(value:string)=>clean(value)
 .replace(/^vw\s+volkswagen$/,'volkswagen')
 .replace(/^vw$/,'volkswagen')
 .replace(/^gm\s+chevrolet$/,'chevrolet')
 .replace(/^mercedes\s+benz$/,'mercedes benz');
const ignored=new Set(['flex','gasolina','alcool','diesel','automatico','aut','mec','manual','cv','16v','8v','4p','5p','tsi','mpi','mi','total']);
const tokens=(value:string)=>clean(value).split(' ').filter(Boolean).filter(t=>!ignored.has(t));
const scoreText=(target:string,candidate:string)=>{
 const a=tokens(target),b=tokens(candidate);if(!a.length||!b.length)return 0;
 let score=0;for(const t of a){if(b.includes(t))score+=/^\d/.test(t)?1.4:1;else if(b.some(x=>x.includes(t)||t.includes(x)))score+=0.4;}
 const denom=a.reduce((s,t)=>s+( /^\d/.test(t)?1.4:1),0);return Math.min(1,score/Math.max(1,denom));
};
const getJson=async(url:string)=>{
 const token=process.env.FIPE_API_TOKEN||process.env.FIPE_SUBSCRIPTION_TOKEN||'';
 const headers:Record<string,string>={'Accept':'application/json','User-Agent':'Motyq-MarketIQ/1.0'};
 if(token)headers['X-Subscription-Token']=token;
 const response=await fetch(url,{headers});
 if(!response.ok)throw new Error(`FIPE HTTP ${response.status} ${url}`);
 return response.json();
};
const parseValue=(value:string)=>Number(String(value||'').replace(/[^0-9,]/g,'').replace(',','.'))||0;
const yearsFrom=(value:string)=>((String(value||'').match(/(?:19|20)\d{2}/g)||[]).map(Number));
const getCode=(item:NamedCode)=>String(item.code??item.codigo??'');
const getName=(item:NamedCode)=>String(item.name??item.nome??'');

async function resolveFipe(input:{brand:string;model:string;year:string;fuel?:string}){
 const brands=await getJson(`${BASE}/brands`) as NamedCode[];
 const wantedBrand=canonicalBrand(input.brand);
 let brand=brands.find(item=>canonicalBrand(getName(item))===wantedBrand);
 if(!brand)brand=[...brands].sort((a,b)=>scoreText(input.brand,getName(b))-scoreText(input.brand,getName(a)))[0];
 if(!brand||scoreText(input.brand,getName(brand))<0.4)return null;

 const brandCode=getCode(brand);
 const models=await getJson(`${BASE}/brands/${brandCode}/models`) as NamedCode[];
 const inputTokens=tokens(input.model);
 const family=inputTokens[0]||'';
 const ranked=models.map(item=>{
   const name=getName(item);
   const base=scoreText(input.model,name);
   const familyBonus=family&&tokens(name).includes(family)?0.18:0;
   const exactPhrase=clean(name).includes(clean(input.model))?0.16:0;
   return {item,name,total:base+familyBonus+exactPhrase,base};
 }).sort((a,b)=>b.total-a.total);
 const candidates=ranked.filter(row=>row.total>=0.45).slice(0,8);
 if(!candidates.length)return null;

 const requestedYears=yearsFrom(input.year);
 const targetYear=requestedYears.length?requestedYears[requestedYears.length-1]:0;
 const fuelWanted=clean(input.fuel||'');
 let best:any=null;
 for(const candidate of candidates){
   const modelCode=getCode(candidate.item);
   const years=await getJson(`${BASE}/brands/${brandCode}/models/${modelCode}/years`) as NamedCode[];
   let chosen=years.filter(y=>!targetYear||String(getCode(y)).startsWith(`${targetYear}-`)||getName(y).includes(String(targetYear)));
   if(!chosen.length&&requestedYears.length)chosen=years.filter(y=>requestedYears.some(ry=>String(getCode(y)).startsWith(`${ry}-`)||getName(y).includes(String(ry))));
   if(!chosen.length)chosen=years.slice(0,4);
   for(const y of chosen.slice(0,6)){
     const yearCode=getCode(y);
     const detail:any=await getJson(`${BASE}/brands/${brandCode}/models/${modelCode}/years/${yearCode}`);
     const detailModel=String(detail?.model||detail?.Modelo||candidate.name);
     const detailFuel=String(detail?.fuel||detail?.Combustivel||'');
     const detailYear=Number(detail?.modelYear||detail?.AnoModelo||0);
     const modelScore=scoreText(input.model,detailModel);
     const fuelScore=fuelWanted&&clean(detailFuel).includes(fuelWanted.split(' ')[0])?0.08:0;
     const yearScore=targetYear&&detailYear===targetYear?0.10:0;
     const exactBonus=clean(detailModel).includes(clean(input.model))?0.15:0;
     const total=modelScore+fuelScore+yearScore+exactBonus;
     if(!best||total>best.total)best={detail,total,modelScore};
   }
 }
 if(!best?.detail)return null;
 const value=parseValue(best.detail.price||best.detail.Valor);
 if(!value)return null;
 return {
   value,
   brand:String(best.detail.brand||best.detail.Marca||getName(brand)),
   model:String(best.detail.model||best.detail.Modelo||''),
   year:Number(best.detail.modelYear||best.detail.AnoModelo||targetYear||0),
   fuel:String(best.detail.fuel||best.detail.Combustivel||''),
   referenceMonth:String(best.detail.referenceMonth||best.detail.MesReferencia||''),
   fipeCode:String(best.detail.codeFipe||best.detail.CodigoFipe||''),
   confidence:Math.min(1,best.modelScore),
 };
}

export default async function handler(req:any,res:any){
 const source=req.method==='GET'?req.query:req.body;
 if(!['POST','GET'].includes(req.method))return res.status(405).json({error:'method_not_allowed'});
 const brand=String(source?.brand||'').trim(),model=String(source?.model||'').trim(),year=String(source?.year||'').trim(),fuel=String(source?.fuel||'').trim();
 if(!brand||!model||!year)return res.status(400).json({error:'missing_vehicle_data'});
 try{const result=await resolveFipe({brand,model,year,fuel});if(!result?.value)return res.status(404).json({error:'fipe_not_found'});return res.status(200).json(result);}catch(error:any){console.error('MarketIQ FIPE lookup failed',error);return res.status(500).json({error:'lookup_failed',detail:String(error?.message||error)});}
}
