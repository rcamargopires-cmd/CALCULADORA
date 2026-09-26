type NamedCode={code?:string|number;name?:string;codigo?:string|number;nome?:string};

const BASE='https://fipe.parallelum.com.br/api/v2/cars';
const cleanBase=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const clean=(value:string)=>cleanBase(value)
 .replace(/\bt[ -]?cross\b/g,'tcross')
 .replace(/\bhl\b/g,'highline')
 .replace(/\bhig\b/g,'highline')
 .replace(/\bcomfort\b/g,'comfortline')
 .replace(/\bcomf\b/g,'comfortline')
 .replace(/\btitnat\b/g,'titanium')
 .replace(/\btitan\b/g,'titanium')
 .replace(/\bfrestyle\b/g,'freestyle')
 .replace(/\bimpet\b/g,'impetus')
 .replace(/\baudac\b/g,'audace')
 .replace(/\blgtd\b/g,'longitude')
 .replace(/\bltd\b/g,'limited');
const canonicalBrand=(value:string)=>clean(value)
 .replace(/^vw\s+volkswagen$/,'volkswagen')
 .replace(/^vw$/,'volkswagen')
 .replace(/^gm\s+chevrolet$/,'chevrolet')
 .replace(/^mercedes\s+benz$/,'mercedes benz');
const ignored=new Set(['flex','gasolina','alcool','diesel','automatico','aut','mec','manual','cv','16v','8v','4p','5p','tsi','mpi','mi','total']);
const trimTokens=new Set(['titanium','storm','freestyle','se','sel','trend','xls','xlt','limited','longitude','sport','wildtrak','highline','comfortline','sense','exclusive','premier','lt','ltz','rs','platinum','touring','advance','audace','impetus','drive','precision','volcano','ranch','endurance','trekking']);
const tokens=(value:string)=>clean(value).split(' ').filter(Boolean).filter(t=>!ignored.has(t));
const scoreText=(target:string,candidate:string)=>{
 const a=tokens(target),b=tokens(candidate);if(!a.length||!b.length)return 0;
 let score=0;for(const t of a){if(b.includes(t))score+=/^\d/.test(t)?1.4:1;else if(b.some(x=>x.includes(t)||t.includes(x)))score+=0.4;}
 const denom=a.reduce((s,t)=>s+( /^\d/.test(t)?1.4:1),0);return Math.min(1,score/Math.max(1,denom));
};
const targetTrimOf=(value:string)=>tokens(value).find(t=>trimTokens.has(t))||'';
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
const normalizeFipeCode=(value:string)=>String(value||'').trim().replace(/[^0-9-]/g,'');
const turboOf=(value:string)=>{
 const normalized=' '+cleanBase(value)+' ';
 return /\b(tb|turbo)\b/.test(normalized);
};
const manualHintOf=(value:string)=>/\b\d[\.,]\d\s*m\b/i.test(String(value||''))||/\bmec\b|\bmanual\b/i.test(String(value||''));
const engineOf=(value:string)=>{
 const match=String(value||'').toLowerCase().replace(',','.').match(/(\d)\.(\d)/);
 return match?Number(match[1]+'.'+match[2]):0;
};
const comfortFamilyOf=(value:string)=>{
 const normalized=' '+cleanBase(value)+' ';
 return /\bcomf(?:ort)?\b/.test(normalized)||/\bc\s+plus\b/.test(normalized)||/\bc\s+style\b/.test(normalized)||/\bcomfort\s+plus\b/.test(normalized);
};
const alphaNumFamilyOf=(value:string)=>cleanBase(value).split(' ').find(token=>/[a-z]/.test(token)&&/\d/.test(token))||'';

async function resolveByFipeCode(fipeCode:string,year:string){
 const code=normalizeFipeCode(fipeCode);
 if(!/^\d{6}-\d$/.test(code))return null;
 const requestedYears=yearsFrom(year);
 const targetYear=requestedYears.length?requestedYears[requestedYears.length-1]:0;
 const years=await getJson(`${BASE}/${encodeURIComponent(code)}/years`) as NamedCode[];
 let chosen=years.filter(item=>!targetYear||String(getCode(item)).startsWith(`${targetYear}-`)||getName(item).includes(String(targetYear)));
 if(!chosen.length&&requestedYears.length)chosen=years.filter(item=>requestedYears.some(ry=>String(getCode(item)).startsWith(`${ry}-`)||getName(item).includes(String(ry))));
 for(const item of chosen.slice(0,6)){
   const detail:any=await getJson(`${BASE}/${encodeURIComponent(code)}/years/${encodeURIComponent(getCode(item))}`);
   const detailYear=Number(detail?.modelYear||detail?.AnoModelo||0);
   if(targetYear&&detailYear!==targetYear)continue;
   const value=parseValue(detail?.price||detail?.Valor);
   if(!value||value<10000)continue;
   return {
     value,
     brand:String(detail?.brand||detail?.Marca||''),
     model:String(detail?.model||detail?.Modelo||''),
     year:detailYear||targetYear,
     fuel:String(detail?.fuel||detail?.Combustivel||''),
     referenceMonth:String(detail?.referenceMonth||detail?.MesReferencia||''),
     fipeCode:String(detail?.codeFipe||detail?.CodigoFipe||code),
     confidence:1,
   };
 }
 return null;
};

async function resolveFipe(input:{brand:string;model:string;year:string;fuel?:string;fipeCode?:string}){
 if(input.fipeCode){
   try{
     const exact=await resolveByFipeCode(input.fipeCode,input.year);
     if(exact?.value)return exact;
   }catch(error){console.warn('MarketIQ FIPE: código informado não resolveu; seguindo por metadados.',error);}
 }
 const brands=await getJson(`${BASE}/brands`) as NamedCode[];
 const wantedBrand=canonicalBrand(input.brand);
 let brand=brands.find(item=>canonicalBrand(getName(item))===wantedBrand);
 if(!brand)brand=[...brands].sort((a,b)=>scoreText(input.brand,getName(b))-scoreText(input.brand,getName(a)))[0];
 if(!brand||scoreText(input.brand,getName(brand))<0.4)return null;

 const brandCode=getCode(brand);
 const models=await getJson(`${BASE}/brands/${brandCode}/models`) as NamedCode[];
 const inputTokens=tokens(input.model);
 const family=inputTokens[0]||'';
 const targetTrim=targetTrimOf(input.model);
 const targetTurbo=turboOf(input.model);
 const targetManual=manualHintOf(input.model);
 const targetEngine=engineOf(input.model);
 const targetComfort=comfortFamilyOf(input.model);
 const targetAlphaNumFamily=alphaNumFamilyOf(input.model);
 const ranked=models.map(item=>{
   const name=getName(item);
   const candidateTokens=tokens(name);
   const candidateTrim=targetTrimOf(name);
   const base=scoreText(input.model,name);
   const familyBonus=family&&candidateTokens.includes(family)?0.18:0;
   const exactPhrase=clean(name).includes(clean(input.model))?0.16:0;
   const trimBonus=targetTrim&&candidateTrim===targetTrim?0.45:0;
   const trimPenalty=targetTrim&&candidateTrim&&candidateTrim!==targetTrim?-0.65:targetTrim&&!candidateTokens.includes(targetTrim)?-0.45:0;
   const candidateTurbo=turboOf(name);
   const turboScore=targetTurbo===candidateTurbo?0.18:(candidateTurbo&&!targetTurbo?-0.85:-0.45);
   const manualPenalty=targetManual&&/\baut\b|\bautomatico\b/.test(clean(name))?-0.75:0;
   const candidateEngine=engineOf(name);
   const engineScore=targetEngine&&candidateEngine?(Math.abs(targetEngine-candidateEngine)<0.01?0.95:-1.35):0;
   const candidateComfort=comfortFamilyOf(name);
   const comfortScore=targetComfort?(candidateComfort?0.55:-0.45):0;
   const candidateAlphaNumFamily=alphaNumFamilyOf(name);
   const familyExactScore=targetAlphaNumFamily&&candidateAlphaNumFamily
     ? (targetAlphaNumFamily===candidateAlphaNumFamily?1.20:-1.60)
     : 0;
   return {item,name,total:base+familyBonus+exactPhrase+trimBonus+trimPenalty+turboScore+manualPenalty+engineScore+comfortScore+familyExactScore,base,candidateTrim};
 }).sort((a,b)=>b.total-a.total);
 const candidates=ranked.filter(row=>row.total>=0.45&&(!targetTrim||tokens(row.name).includes(targetTrim))).slice(0,8);
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
   if(!chosen.length)continue;
   for(const y of chosen.slice(0,6)){
     const yearCode=getCode(y);
     const detail:any=await getJson(`${BASE}/brands/${brandCode}/models/${modelCode}/years/${yearCode}`);
     const detailModel=String(detail?.model||detail?.Modelo||candidate.name);
     const detailFuel=String(detail?.fuel||detail?.Combustivel||'');
     const detailYear=Number(detail?.modelYear||detail?.AnoModelo||0);
     if(targetYear&&detailYear!==targetYear)continue;
     if(targetTrim&&!tokens(detailModel).includes(targetTrim))continue;
     const modelScore=scoreText(input.model,detailModel);
     const fuelScore=fuelWanted&&clean(detailFuel).includes(fuelWanted.split(' ')[0])?0.08:0;
     const yearScore=targetYear&&detailYear===targetYear?0.10:0;
     const exactBonus=clean(detailModel).includes(clean(input.model))?0.15:0;
     const trimScore=targetTrim&&tokens(detailModel).includes(targetTrim)?0.35:0;
     const detailTurbo=turboOf(detailModel);
     const turboScore=targetTurbo===detailTurbo?0.18:(detailTurbo&&!targetTurbo?-0.85:-0.45);
     const manualPenalty=targetManual&&/\baut\b|\bautomatico\b/.test(clean(detailModel))?-0.75:0;
     const detailEngine=engineOf(detailModel);
     const engineScore=targetEngine&&detailEngine?(Math.abs(targetEngine-detailEngine)<0.01?0.95:-1.35):0;
     const detailComfort=comfortFamilyOf(detailModel);
     const comfortScore=targetComfort?(detailComfort?0.55:-0.45):0;
     const detailAlphaNumFamily=alphaNumFamilyOf(detailModel);
     const familyExactScore=targetAlphaNumFamily&&detailAlphaNumFamily
       ? (targetAlphaNumFamily===detailAlphaNumFamily?1.20:-1.60)
       : 0;
     const total=modelScore+fuelScore+yearScore+exactBonus+trimScore+turboScore+manualPenalty+engineScore+comfortScore+familyExactScore;
     if(!best||total>best.total)best={detail,total,modelScore};
   }
 }
 if(!best?.detail)return null;
 const value=parseValue(best.detail.price||best.detail.Valor);
 if(!value||value<10000)return null;
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
 const brand=String(source?.brand||'').trim(),model=String(source?.model||'').trim(),year=String(source?.year||'').trim(),fuel=String(source?.fuel||'').trim(),fipeCode=String(source?.fipeCode||'').trim();
 if(!brand||!model||!year)return res.status(400).json({error:'missing_vehicle_data'});
 try{const result=await resolveFipe({brand,model,year,fuel,fipeCode});if(!result?.value)return res.status(404).json({error:'fipe_not_found'});return res.status(200).json(result);}catch(error:any){console.error('MarketIQ FIPE lookup failed',error);return res.status(500).json({error:'lookup_failed',detail:String(error?.message||error)});}
}