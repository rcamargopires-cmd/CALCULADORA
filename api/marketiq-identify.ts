const FIREBASE_API_KEY='AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';

const verifyFirebaseToken=async(idToken:string)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({idToken}),
  });
  if(!response.ok)return null;
  const data:any=await response.json().catch(()=>null);
  return data?.users?.[0]||null;
};

const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const cleanRenavam=(value:string)=>String(value||'').replace(/\D/g,'').slice(0,11);
const num=(value:any)=>Number(String(value??'').replace(/[^0-9,.-]/g,'').replace(',','.'))||0;
const first=(...values:any[])=>values.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');

const normalizedVehicle=(raw:any)=>{
  const root=raw?.veiculo||raw?.vehicle||raw?.data?.veiculo||raw?.data?.vehicle||raw?.data||raw||{};
  return {
    plate:cleanPlate(first(root.placa,root.plate,root.placaVeiculo,root.placa_veiculo)||''),
    renavam:cleanRenavam(first(root.renavam,root.renavamVeiculo,root.renavam_veiculo)||''),
    brand:String(first(root.marca,root.brand,root.marcaModeloVersao?.marca,root.marca_modelo_versao?.marca)||''),
    model:String(first(root.versao,root.modeloVersao,root.modelo_versao,root.modelo,root.model,root.marcaModeloVersao?.versao,root.marca_modelo_versao?.versao)||''),
    registryModel:String(first(root.modelo,root.model,root.marcaModeloVersao?.modelo,root.marca_modelo_versao?.modelo)||''),
    year:String(first(root.anoModelo,root.ano_modelo,root.modelYear,root.ano)||''),
    manufactureYear:String(first(root.anoFabricacao,root.ano_fabricacao,root.manufactureYear)||''),
    color:String(first(root.cor,root.color)||''),
    fuel:String(first(root.combustivel,root.fuel)||''),
    fipeValue:num(first(root.valorFipe,root.valor_fipe,root.fipe,root.fipeValue)),
    fipeCode:String(first(root.codigoFipe,root.codigo_fipe,root.fipeCode)||''),
    referenceMonth:String(first(root.mesReferencia,root.mes_referencia,root.referenceMonth)||''),
  };
};

export default async function handler(req:any,res:any){
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});

  const authHeader=String(req.headers?.authorization||'');
  const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
  if(!token)return res.status(401).json({error:'missing_session'});
  const firebaseUser=await verifyFirebaseToken(token);
  if(!firebaseUser?.email)return res.status(401).json({error:'invalid_session'});

  const plate=cleanPlate(req.body?.plate);
  const renavam=cleanRenavam(req.body?.renavam);
  const hasPlate=/^[A-Z0-9]{7}$/.test(plate);
  const hasRenavam=renavam.length>=9;
  if(!hasPlate&&!hasRenavam)return res.status(400).json({error:'invalid_vehicle_key'});

  const prodespUrl=String(process.env.PRODESP_CRLVE_URL||'').trim();
  const prodespToken=String(process.env.PRODESP_ACCESS_TOKEN||'').trim();
  const dadosApiKey=String(process.env.DADOS_API_KEY||'').trim();
  const placaFipeToken=String(process.env.PLACA_FIPE_TOKEN||'').trim();

  let attempted=false;

  if(hasPlate&&hasRenavam&&prodespUrl&&prodespToken){
    attempted=true;
    try{
      const response=await fetch(prodespUrl,{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':`Bearer ${prodespToken}`},
        body:JSON.stringify({placa:plate,renavam}),
      });
      const raw:any=await response.json().catch(()=>null);
      if(response.ok&&raw){
        const vehicle=normalizedVehicle(raw);
        if(vehicle.model||vehicle.registryModel){
          return res.status(200).json({
            ...vehicle,
            plate:vehicle.plate||plate,
            renavam:vehicle.renavam||renavam,
            source:'prodesp-detran-sp',
            lookupMode:'plate+renavam',
          });
        }
      }
    }catch(error){console.error('MarketIQ PRODESP identify failed',error);}
  }

  // DadosAPI v1 plate-only lookup. Preview redeploys pick up the protected DADOS_API_KEY variable.
  if(dadosApiKey&&hasPlate){
    attempted=true;
    try{
      const response=await fetch('https://api.dadosapi.com/v1/veiculo-placa-unica',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${dadosApiKey}`},
        body:JSON.stringify({placa:plate}),
      });
      const raw:any=await response.json().catch(()=>null);
      if(response.ok&&raw){
        const vehicle=normalizedVehicle(raw);
        if(vehicle.model||vehicle.registryModel){
          return res.status(200).json({
            ...vehicle,
            plate:vehicle.plate||plate,
            renavam:vehicle.renavam||renavam,
            source:'dadosapi-v1',
            lookupMode:'plate',
          });
        }
      }else{
        console.error('MarketIQ DadosAPI identify failed',response.status,raw?.error||raw?.message||'unknown_error');
      }
    }catch(error){console.error('MarketIQ DadosAPI identify failed',error);}
  }

  // Keep the flexible endpoint only as a RENAVAM fallback while we validate provider support.
  if(dadosApiKey&&!hasPlate&&hasRenavam){
    attempted=true;
    try{
      const response=await fetch('https://api.dadosapi.com/dados-publicos/consulta-veiculo-por-placa',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${dadosApiKey}`},
        body:JSON.stringify({renavam}),
      });
      const raw:any=await response.json().catch(()=>null);
      if(response.ok&&raw){
        const vehicle=normalizedVehicle(raw);
        if(vehicle.model||vehicle.registryModel){
          return res.status(200).json({
            ...vehicle,
            plate:vehicle.plate||plate,
            renavam:vehicle.renavam||renavam,
            source:'dadosapi',
            lookupMode:'renavam',
          });
        }
      }
    }catch(error){console.error('MarketIQ DadosAPI RENAVAM identify failed',error);}
  }

  if(hasPlate&&placaFipeToken){
    attempted=true;
    try{
      const response=await fetch('https://api.placafipe.com.br/getplacafipe',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({placa:plate,token:placaFipeToken}),
      });
      const raw:any=await response.json().catch(()=>null);
      if(response.ok&&raw&&Number(raw.codigo)===1){
        const info=raw.informacoes_veiculo||{};
        const options=Array.isArray(raw.fipe)?raw.fipe:[];
        const best=options[0]||{};
        return res.status(200).json({
          plate,
          renavam,
          brand:String(info.marca||best.marca||''),
          model:String(best.modelo||info.modelo||''),
          registryModel:String(info.modelo||''),
          year:String(info.ano_modelo||info.ano||best.ano_modelo||''),
          manufactureYear:String(info.ano||''),
          color:String(info.cor||''),
          fuel:String(info.combustivel||best.combustivel||''),
          fipeValue:num(best.valor),
          fipeCode:String(best.codigo_fipe||''),
          referenceMonth:String(best.mes_referencia||''),
          source:'placafipe',
          lookupMode:'plate',
        });
      }
    }catch(error){console.error('MarketIQ PlacaFIPE identify failed',error);}
  }

  if(!attempted){
    return res.status(503).json({
      error:'vehicle_provider_not_configured',
      configured:{prodesp:Boolean(prodespUrl&&prodespToken),dadosapi:Boolean(dadosApiKey),placafipe:Boolean(placaFipeToken)},
      accepted:{plate:true,renavam:true,both:true},
    });
  }

  return res.status(404).json({
    error:'vehicle_not_found',
    lookupMode:hasPlate&&hasRenavam?'plate+renavam':hasPlate?'plate':'renavam',
  });
}
