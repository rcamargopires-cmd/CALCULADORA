const FIREBASE_API_KEY='AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';
const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);

const num=(value:any)=>{
  if(typeof value==='number') return Number.isFinite(value)?value:0;
  const raw=String(value??'').trim();
  if(!raw)return 0;
  const normalized=raw
    .replace(/R\$/gi,'')
    .replace(/\s/g,'')
    .replace(/\.(?=\d{3}(\D|$))/g,'')
    .replace(',','.')
    .replace(/[^0-9.-]/g,'');
  return Number(normalized)||0;
};

const verifyFirebaseToken=async(idToken:string)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken}),
  });
  if(!response.ok)return null;
  const data=await response.json() as any;
  return data?.users?.[0]||null;
};

const stringsFrom=(value:any,out:string[]=[],depth=0):string[]=>{
  if(depth>5||out.length>80||value==null)return out;
  if(typeof value==='string'){
    const text=value.trim();
    if(text)out.push(text);
    return out;
  }
  if(Array.isArray(value)){
    value.forEach(item=>stringsFrom(item,out,depth+1));
    return out;
  }
  if(typeof value==='object'){
    Object.values(value).forEach(item=>stringsFrom(item,out,depth+1));
  }
  return out;
};

const normalizeDadosApi=(raw:any,plate:string)=>{
  const data=raw?.data&&typeof raw.data==='object'?raw.data:raw||{};
  const extra=data.extra||{};
  const fipeRows=Array.isArray(data?.fipe?.dados)?data.fipe.dados:[];
  const fipe=fipeRows[0]||{};
  const restrictions=[
    extra.restricao_1,extra.restricao_2,extra.restricao_3,extra.restricao_4,
    data.restricoes,data.restricao,data.situacao,
  ].flatMap((value:any)=>Array.isArray(value)?value:[value])
    .map((value:any)=>String(value||'').trim())
    .filter((value:string)=>value&&!/^sem restri[cç][aã]o$/i.test(value));

  const corpus=stringsFrom(data).join(' | ').toUpperCase();
  const auctionOrClaim=/(RECUPERAD[OA]\s+DE\s+SINISTRO|SINISTRO|LEIL[AÃ]O)/i.test(corpus);
  const armored=/BLINDAD[OA]/i.test(corpus);
  const fipeValue=num(fipe.texto_valor||extra.media_preco||data.valorFipe||data.valor_fipe);
  const model=String(data.MODELO||data.modelo||data.marcaModelo||extra.modelo||fipe.texto_modelo||'').trim();
  const brand=String(data.MARCA||data.marca||String(data.marcaModelo||'').split('/')[0]||'').trim();
  const year=String(data.anoModelo||extra.ano_modelo||fipe.ano_modelo||data.ano_modelo||data.ano||'').trim();
  const manufactureYear=String(data.ano||extra.ano_fabricacao||data.anoFabricacao||'').trim();
  const fuel=String(extra.combustivel||data.combustivel||fipe.combustivel||'').trim();

  return {
    plate:cleanPlate(data.placa||plate)||plate,
    brand,
    model,
    registryModel:String(data.marcaModelo||extra.modelo||model).trim(),
    year,
    manufactureYear,
    color:String(data.cor||extra.cor||'').trim(),
    fuel,
    renavam:String(data.renavam||extra.renavam||'').replace(/\D/g,''),
    municipality:String(data.municipio||extra.municipio||'').trim(),
    uf:String(data.uf||extra.uf||extra.uf_placa||'').trim(),
    situation:String(data.situacao||extra.situacao_veiculo||'').trim(),
    restrictions:Array.from(new Set(restrictions)),
    fipeValue,
    fipeCode:String(fipe.codigo_fipe||data.codigo_fipe||'').trim(),
    referenceMonth:String(fipe.mes_referencia||data.mes_referencia||'').trim(),
    confidence:model&&year?100:70,
    flags:{auctionOrClaim,armored},
    provider:'dadosapi',
  };
};

const queryDadosApi=async(plate:string,token:string)=>{
  const working='https://api.dadosapi.com/v1/veiculo-placa-unica';
  const documented='https://api.dadosapi.com/dados-publicos/consulta-veiculo-por-placa';
  const custom=String(process.env.DADOSAPI_VEHICLE_ENDPOINT||'').trim();
  const endpoints=Array.from(new Set([custom,working,documented].filter(Boolean)));
  let lastStatus=0;
  let lastBody:any=null;

  for(const endpoint of endpoints){
    try{
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({placa:plate}),
      });
      lastStatus=response.status;
      lastBody=await response.json().catch(()=>null);

      if(response.ok&&lastBody){
        const normalized=normalizeDadosApi(lastBody,plate);
        if(normalized.model||normalized.year||normalized.fipeValue){
          console.info('MarketIQ DadosAPI lookup ok',{endpoint,status:response.status,plate});
          return normalized;
        }
      }

      if(response.status===429||response.status>=500)break;
    }catch(error:any){
      lastBody={message:String(error?.message||error)};
      lastStatus=0;
    }
  }

  const error:any=new Error('dadosapi_error');
  error.status=lastStatus;
  error.body=lastBody;
  throw error;
};

const queryLegacy=async(plate:string,token:string)=>{
  const response=await fetch('https://api.placafipe.com.br/getplacafipe',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({placa:plate,token}),
  });
  const raw:any=await response.json().catch(()=>null);
  if(!response.ok||!raw||Number(raw.codigo)!==1)throw new Error('legacy_provider_error');
  const info=raw.informacoes_veiculo||{};
  const options=Array.isArray(raw.fipe)?raw.fipe:[];
  const ranked=options.map((item:any)=>({...item,_score:(num(item.similaridade)*0.55)+(num(item.correspondencia)*0.45)})).sort((a:any,b:any)=>b._score-a._score);
  const best=ranked[0]||null;
  return {
    plate,
    brand:String(info.marca||best?.marca||''),
    model:String(best?.modelo||info.modelo||''),
    registryModel:String(info.modelo||''),
    year:String(info.ano_modelo||info.ano||best?.ano_modelo||''),
    manufactureYear:String(info.ano||''),
    color:String(info.cor||''),
    fuel:String(info.combustivel||best?.combustivel||''),
    renavam:'',municipality:'',uf:'',situation:'',restrictions:[],
    fipeValue:num(best?.valor),
    fipeCode:String(best?.codigo_fipe||''),
    referenceMonth:String(best?.mes_referencia||''),
    confidence:best?Math.round(best._score):0,
    flags:{auctionOrClaim:false,armored:false},
    provider:'placafipe',
    alternatives:ranked.slice(0,3).map((item:any)=>({model:String(item.modelo||''),year:Number(item.ano_modelo||0),value:num(item.valor),fipeCode:String(item.codigo_fipe||''),score:Math.round(item._score)})),
  };
};

export default async function handler(req:any,res:any){
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const plate=cleanPlate(req.body?.plate);
  if(!/^[A-Z0-9]{7}$/.test(plate))return res.status(400).json({error:'invalid_plate'});

  const authHeader=String(req.headers?.authorization||'');
  const idToken=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
  if(!idToken){
    console.warn('MarketIQ plate lookup blocked: no Firebase token',{plate});
    return res.status(401).json({error:'not_authenticated'});
  }
  const firebaseUser=await verifyFirebaseToken(idToken).catch(()=>null);
  if(!firebaseUser?.email){
    console.warn('MarketIQ plate lookup blocked: invalid Firebase session',{plate});
    return res.status(401).json({error:'invalid_session'});
  }

  const dadosApiToken=String(process.env.DADOSAPI_TOKEN||'').trim();
  const legacyToken=String(process.env.PLACA_FIPE_TOKEN||'').trim();
  if(!dadosApiToken&&!legacyToken){
    console.warn('MarketIQ plate lookup blocked: provider not configured',{plate});
    return res.status(503).json({error:'provider_not_configured'});
  }

  try{
    if(dadosApiToken){
      try{
        const result=await queryDadosApi(plate,dadosApiToken);
        return res.status(200).json(result);
      }catch(error:any){
        console.warn('MarketIQ DadosAPI lookup failed',{
          status:Number(error?.status)||0,
          providerMessage:String(error?.body?.message||error?.body?.mensagem||error?.body?.error||''),
          plate,
        });
        if(!legacyToken){
          const status=Number(error?.status)||502;
          return res.status(status===401||status===403?502:status).json({
            error:'dadosapi_provider_error',
            providerStatus:status,
            providerMessage:String(error?.body?.message||error?.body?.mensagem||error?.body?.error||''),
          });
        }
      }
    }

    const result=await queryLegacy(plate,legacyToken);
    return res.status(200).json(result);
  }catch(error){
    console.error('MarketIQ plate lookup failed',error);
    return res.status(502).json({error:'lookup_failed'});
  }
}