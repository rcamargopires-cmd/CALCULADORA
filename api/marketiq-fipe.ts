type FipeBrand={codigo:string|number;nome:string};
type FipeModel={codigo:string|number;nome:string};
type FipeYear={codigo:string;nome:string};

const BASE='https://parallelum.com.br/fipe/api/v1/carros';
const clean=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const canonicalBrand=(value:string)=>clean(value)
 .replace(/^vw\s+volkswagen$/,'volkswagen')
 .replace(/^gm\s+chevrolet$/,'chevrolet')
 .replace(/^mercedes\s+benz$/,'mercedes benz');
const ignored=new Set(['flex','gasolina','alcool','diesel','automatico','aut','mec','manual','cv','16v','8v','4p','5p','tsi','mpi','mi','total']);
const tokens=(value:string)=>clean(value).split(' ').filter(Boolean).filter(t=>!ignored.has(t));
const scoreText=(target:string,candidate:string)=>{
 const a=tokens(target),b=tokens(candidate);if(!a.length||!b.length)return 0;
 let score=0;for(const t of a){if(b.includes(t))score+=/^\d/.test(t)?1.4:1;else if(b.some(x=>x.includes(t)||t.includes(x)))score+=0.4;}
 const denom=a.reduce((s,t)=>s+( /^\d/.test(t)?1.4:1),0);return Math.min(1,score/Math.max(1,denom));
};
const getJson=async(url:string)=>{const response=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'Motyq-MarketIQ/1.0'}});if(!response.ok)throw new Error(`FIPE HTTP ${response.status}`);return response.json();};
const parseValue=(value:string)=>Number(String(value||'').replace(/[^0-9,]/g,'').replace(',','.'))||0;
const yearsFrom=(value:string)=>((String(value||'').match(/(?:19|20)\d{2}/g)||[]).map(Number));

async function resolveFipe(input:{brand:string;model:string;year:string;fuel?:string}){
 const brands=await getJson(`${BASE}/marcas`) as FipeBrand[];
 const wantedBrand=canonicalBrand(input.brand);
 let brand=brands.find(item=>canonicalBrand(item.nome)===wantedBrand);
 if(!brand){brand=[...brands].sort((a,b)=>scoreText(input.brand,b.nome)-scoreText(input.brand,a.nome))[0];}
 if(!brand||scoreText(input.brand,brand.nome)<0.4)return null;

 const payload:any=await getJson(`${BASE}/marcas/${brand.codigo}/modelos`);
 const models=(payload?.modelos||[]) as FipeModel[];
 const ranked=models.map(item=>({item,score:scoreText(input.model,item.nome),family:tokens(input.model)[0]&&tokens(item.nome).includes(tokens(input.model)[0])?0.15:0}))
   .map(row=>({...row,total:row.score+row.family})).sort((a,b)=>b.total-a.total);
 const candidates=ranked.filter(row=>row.total>=0.55).slice(0,5);
 if(!candidates.length)return null;

 const requestedYears=yearsFrom(input.year);
 const targetYear=requestedYears.length?requestedYears[requestedYears.length-1]:0;
 const fuelWanted=clean(input.fuel||'');
 let best:any=null;
 for(const candidate of candidates){
   const years=await getJson(`${BASE}/marcas/${brand.codigo}/modelos/${candidate.item.codigo}/anos`) as FipeYear[];
   const exact=years.filter(y=>!targetYear||String(y.codigo).startsWith(`${targetYear}-`)||String(y.nome).includes(String(targetYear)));
   const chosen=(exact.length?exact:years.filter(y=>requestedYears.some(ry=>String(y.codigo).startsWith(`${ry}-`)||String(y.nome).includes(String(ry))))).slice(0,4);
   for(const y of chosen){
     const detail:any=await getJson(`${BASE}/marcas/${brand.codigo}/modelos/${candidate.item.codigo}/anos/${y.codigo}`);
     const fuelScore=fuelWanted&&clean(detail?.Combustivel||'').includes(fuelWanted.split(' ')[0])?0.08:0;
     const yearScore=targetYear&&Number(detail?.AnoModelo)===targetYear?0.08:0;
     const total=candidate.total+fuelScore+yearScore;
     if(!best||total>best.total)best={detail,total,modelScore:candidate.score};
   }
 }
 if(!best?.detail)return null;
 return {value:parseValue(best.detail.Valor),brand:String(best.detail.Marca||brand.nome),model:String(best.detail.Modelo||''),year:Number(best.detail.AnoModelo||targetYear||0),fuel:String(best.detail.Combustivel||''),referenceMonth:String(best.detail.MesReferencia||''),fipeCode:String(best.detail.CodigoFipe||''),confidence:Math.min(1,best.modelScore)};
}

export default async function handler(req:any,res:any){
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 const brand=String(req.body?.brand||'').trim(),model=String(req.body?.model||'').trim(),year=String(req.body?.year||'').trim(),fuel=String(req.body?.fuel||'').trim();
 if(!brand||!model||!year)return res.status(400).json({error:'missing_vehicle_data'});
 try{const result=await resolveFipe({brand,model,year,fuel});if(!result?.value)return res.status(404).json({error:'fipe_not_found'});return res.status(200).json(result);}catch(error){console.error('MarketIQ FIPE lookup failed',error);return res.status(500).json({error:'lookup_failed'});}
}
