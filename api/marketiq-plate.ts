import firebaseConfig from '../firebase-applet-config.json';
const FIREBASE_API_KEY=String((firebaseConfig as any).apiKey||'');
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

const plausibleVehicleValue=(value:any)=>{
  const parsed=num(value);
  return parsed>=10000&&parsed<=2000000?parsed:0;
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

const matchClean=(value:any)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const matchTokens=(value:any)=>matchClean(value).split(' ').filter(Boolean).filter(token=>!new Set(['flex','flexone','gasolina','alcool','diesel','16v','8v','4p','5p']).has(token));
const transmissionOf=(value:any)=>{
  const text=' '+matchClean(value)+' ';
  if(/\b(aut|automatico|cvt)\b/.test(text))return 'auto';
  if(/\b(mec|mecanico|manual)\b/.test(text))return 'manual';
  return '';
};
const engineLitersOf=(value:any)=>{
  const text=String(value||'').toLowerCase().replace(',','.');
  const direct=text.match(/\b([1-6])\.(\d)\b/);
  if(direct)return Number(direct[1]+'.'+direct[2]);
  const cc=Number(String(value||'').replace(/\D/g,''));
  if(cc>=600&&cc<=7000)return Math.round((cc/1000)*10)/10;
  return 0;
};
const vehicleTrimOf=(value:any)=>{
  const known=new Set(['exl','ex','exs','lx','lxl','dx','cx','personal','highline','comfortline','limited','platinum','premier','touring','sense','advance','audace','impetus','drive','precision','volcano','ranch','endurance','trekking','titanium','freestyle','wildtrak']);
  return matchTokens(value).find(token=>known.has(token))||'';
};
const overlapScore=(target:any,candidate:any)=>{
  const a=matchTokens(target),b=matchTokens(candidate);
  if(!a.length||!b.length)return 0;
  const matched=a.filter(token=>b.includes(token)).length;
  return matched/Math.max(a.length,1);
};
const selectDadosApiFipe=(data:any,extra:any,rows:any[],targetYear:number)=>{
  if(!rows.length)return {};
  const rootCode=String(data.codigo_fipe||data.codigoFipe||'').trim();
  const listModel=Array.isArray(data.listamodelo)?data.listamodelo.join(' '):'';
  const identity=[
    data.MODELO,data.modelo,data.marcaModelo,data.VERSAO,data.versao,data.SUBMODELO,data.submodelo,
    listModel,extra.modelo,extra.grupo,extra.caixa_cambio,extra.cambio,
  ].filter(Boolean).join(' ');
  const targetTransmission=transmissionOf(identity);
  const targetEngine=engineLitersOf(extra.cilindradas)||engineLitersOf(identity);
  const targetTrim=vehicleTrimOf(identity);
  const ranked=rows.map((row:any,index:number)=>{
    const candidate=String(row?.texto_modelo||row?.modelo||'');
    const candidateYear=Number(row?.ano_modelo||row?.anoModelo||0)||0;
    const candidateTransmission=transmissionOf(candidate);
    const candidateEngine=engineLitersOf(candidate);
    const candidateTrim=vehicleTrimOf(candidate);
    let score=overlapScore(identity,candidate)*8;
    if(targetYear&&candidateYear===targetYear)score+=6;
    else if(targetYear&&candidateYear&&candidateYear!==targetYear)score-=12;
    if(rootCode&&String(row?.codigo_fipe||'').trim()===rootCode)score+=20;
    if(targetTrim)score+=candidateTrim===targetTrim?7:(candidateTrim?-10:-4);
    if(targetTransmission)score+=candidateTransmission===targetTransmission?8:(candidateTransmission?-14:-5);
    if(targetEngine&&candidateEngine)score+=Math.abs(targetEngine-candidateEngine)<0.11?7:-12;
    return {row,index,score,candidateTransmission,candidateEngine,candidateTrim};
  }).sort((a:any,b:any)=>b.score-a.score||a.index-b.index);
  const best=ranked[0];
  const second=ranked[1];
  const ambiguous=Boolean(
    best&&second&&
    Math.abs(best.score-second.score)<1.25&&
    (
      (best.candidateTransmission&&second.candidateTransmission&&best.candidateTransmission!==second.candidateTransmission)||
      (best.candidateEngine&&second.candidateEngine&&Math.abs(best.candidateEngine-second.candidateEngine)>0.11)||
      (best.candidateTrim&&second.candidateTrim&&best.candidateTrim!==second.candidateTrim)
    )
  );
  if(ambiguous&&!rootCode&&!targetTransmission&&!targetEngine)return {};
  return best?.row||{};
};

const normalizeDadosApiBrand=(rawBrand:any,...vehicleTexts:any[])=>{
  const original=String(rawBrand||'').trim();
  const corpus=[original,...vehicleTexts].map(value=>String(value||'')).join(' ').toUpperCase();
  // Bases de placa usam abreviações de importador como I/LR. Para FIPE precisamos do fabricante canônico.
  if(/\bLAND\s*ROVER\b|\bRANGE\s*ROVER\b|(^|[\/\s])LR([\/\s]|$)/i.test(corpus))return 'Land Rover';
  if(/\bJAGUAR\b/i.test(corpus))return 'Jaguar';
  return original.replace(/^I\//i,'').trim();
};

const normalizeDadosApi=(raw:any,plate:string)=>{
  const data=raw?.data&&typeof raw.data==='object'?raw.data:raw||{};
  const extra=data.extra||{};
  const targetYear=Number(data.anoModelo||extra.ano_modelo||data.ano_modelo||data.ano||0)||0;
  const fipeRows=Array.isArray(data?.fipe?.dados)?data.fipe.dados:[];
  const fipe=selectDadosApiFipe(data,extra,fipeRows,targetYear);
  const restrictions=[
    extra.restricao_1,extra.restricao_2,extra.restricao_3,extra.restricao_4,
    data.restricoes,data.restricao,data.situacao,
  ].flatMap((value:any)=>Array.isArray(value)?value:[value])
    .map((value:any)=>String(value||'').trim())
    .filter((value:string)=>value&&!/^sem restri[cç][aã]o$/i.test(value));

  const corpus=stringsFrom(data).join(' | ').toUpperCase();
  const auctionOrClaim=/(RECUPERAD[OA]\s+DE\s+SINISTRO|SINISTRO|LEIL[AÃ]O)/i.test(corpus);
  const armored=/BLINDAD[OA]/i.test(corpus);

  // A DadosAPI pode devolver campos auxiliares que não são preço FIPE completo.
  // Nunca deixamos valor muito baixo (ex.: 626) alimentar a avaliação como se fosse FIPE.
  const fipeValue=
    plausibleVehicleValue(fipe.texto_valor)||
    plausibleVehicleValue(data.valorFipe)||
    plausibleVehicleValue(data.valor_fipe)||
    plausibleVehicleValue(extra.media_preco)||
    0;

  const model=String(data.MODELO||data.modelo||data.marcaModelo||extra.modelo||fipe.texto_modelo||'').trim();
  const registryModel=String(data.marcaModelo||extra.modelo||model).trim();
  const rawBrand=String(data.MARCA||data.marca||String(data.marcaModelo||'').split('/')[0]||'').trim();
  const brand=normalizeDadosApiBrand(rawBrand,registryModel,model,fipe.texto_modelo);
  const year=String(data.anoModelo||extra.ano_modelo||fipe.ano_modelo||data.ano_modelo||data.ano||'').trim();
  const manufactureYear=String(data.ano||extra.ano_fabricacao||data.anoFabricacao||'').trim();
  const fuel=String(extra.combustivel||data.combustivel||fipe.combustivel||'').trim();

  return {
    plate:cleanPlate(data.placa||plate)||plate,
    brand,
    model,
    registryModel,
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
    fipeCode:String(data.codigo_fipe||data.codigoFipe||fipe.codigo_fipe||'').trim(),
    referenceMonth:String(fipe.mes_referencia||data.mes_referencia||'').trim(),
    confidence:model&&year?100:70,
    flags:{auctionOrClaim,armored},
    provider:'dadosapi',
  };
};

const queryDadosApi=async(plate:string,token:string)=>{
  const documented='https://api.dadosapi.com/dados-publicos/consulta-veiculo-por-placa';
  const legacyEndpoint='https://api.dadosapi.com/v1/veiculo-placa-unica';
  const custom=String(process.env.DADOSAPI_VEHICLE_ENDPOINT||'').trim();
  const endpoints=Array.from(new Set([custom,documented,legacyEndpoint].filter(Boolean)));
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
          console.info('MarketIQ DadosAPI lookup ok',{endpoint,status:response.status,plate,hasValidFipe:Boolean(normalized.fipeValue)});
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
    fipeValue:plausibleVehicleValue(best?.valor),
    fipeCode:String(best?.codigo_fipe||''),
    referenceMonth:String(best?.mes_referencia||''),
    confidence:best?Math.round(best._score):0,
    flags:{auctionOrClaim:false,armored:false},
    provider:'placafipe',
    alternatives:ranked.slice(0,3).map((item:any)=>({model:String(item.modelo||''),year:Number(item.ano_modelo||0),value:plausibleVehicleValue(item.valor),fipeCode:String(item.codigo_fipe||''),score:Math.round(item._score)})),
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

  const dadosApiTokens=Array.from(new Set([
    String(process.env.DADOS_API_KEY||'').trim(),
    String(process.env.DADOSAPI_TOKEN||'').trim(),
  ].filter(Boolean)));
  const legacyToken=String(process.env.PLACA_FIPE_TOKEN||'').trim();
  if(!dadosApiTokens.length&&!legacyToken){
    console.warn('MarketIQ plate lookup blocked: provider not configured',{plate});
    return res.status(503).json({error:'provider_not_configured'});
  }

  try{
    let lastDadosApiError:any=null;
    for(let index=0;index<dadosApiTokens.length;index++){
      try{
        const result=await queryDadosApi(plate,dadosApiTokens[index]);
        return res.status(200).json(result);
      }catch(error:any){
        lastDadosApiError=error;
        console.warn('MarketIQ DadosAPI lookup failed',{
          status:Number(error?.status)||0,
          providerMessage:String(error?.body?.message||error?.body?.mensagem||error?.body?.error||''),
          plate,
          credentialSlot:index+1,
        });
      }
    }

    if(legacyToken){
      const result=await queryLegacy(plate,legacyToken);
      return res.status(200).json(result);
    }

    if(lastDadosApiError){
      const status=Number(lastDadosApiError?.status)||502;
      return res.status(status===401||status===403?502:status).json({
        error:'dadosapi_provider_error',
        providerStatus:status,
        providerMessage:String(lastDadosApiError?.body?.message||lastDadosApiError?.body?.mensagem||lastDadosApiError?.body?.error||''),
      });
    }

    return res.status(503).json({error:'provider_not_configured'});
  }catch(error){
    console.error('MarketIQ plate lookup failed',error);
    return res.status(502).json({error:'lookup_failed'});
  }
}
