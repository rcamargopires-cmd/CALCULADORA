const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const cleanRenavam=(value:string)=>String(value||'').replace(/\D/g,'').slice(0,11);
const num=(value:any)=>Number(String(value??'').replace(/[^0-9,.-]/g,'').replace(',','.'))||0;
const first=(...values:any[])=>values.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');

const normalizedVehicle=(raw:any)=>{
  const root=raw?.veiculo||raw?.vehicle||raw?.data?.veiculo||raw?.data?.vehicle||raw?.data||raw||{};
  return {
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
  const plate=cleanPlate(req.body?.plate);
  const renavam=cleanRenavam(req.body?.renavam);
  if(!/^[A-Z0-9]{7}$/.test(plate)||renavam.length<9)return res.status(400).json({error:'invalid_vehicle_keys'});

  // Official DETRAN-SP / PRODESP provider. The production URL and token are supplied
  // only after the company is formally enabled by PRODESP, so nothing is hard-coded.
  const prodespUrl=String(process.env.PRODESP_CRLVE_URL||'').trim();
  const prodespToken=String(process.env.PRODESP_ACCESS_TOKEN||'').trim();
  if(prodespUrl&&prodespToken){
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
          return res.status(200).json({plate,renavam,...vehicle,source:'prodesp-detran-sp'});
        }
      } else {
        console.error('MarketIQ PRODESP identify failed',response.status);
      }
    }catch(error){console.error('MarketIQ PRODESP identify failed',error);}
  }

  const dadosApiKey=process.env.DADOS_API_KEY;
  if(dadosApiKey){
    try{
      const response=await fetch('https://api.dadosapi.com/dados-publicos/consulta-veiculo-por-placa',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${dadosApiKey}`},
        body:JSON.stringify({placa:plate,renavam}),
      });
      const raw:any=await response.json().catch(()=>null);
      if(response.ok&&raw){
        const vehicle=normalizedVehicle(raw);
        return res.status(200).json({plate,renavam,...vehicle,source:'dadosapi'});
      }
    }catch(error){console.error('MarketIQ DadosAPI identify failed',error);}
  }

  const placaFipeToken=process.env.PLACA_FIPE_TOKEN;
  if(placaFipeToken){
    try{
      const response=await fetch('https://api.placafipe.com.br/getplacafipe',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({placa:plate,token:placaFipeToken}),
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
        });
      }
    }catch(error){console.error('MarketIQ PlacaFIPE identify failed',error);}
  }

  return res.status(503).json({
    error:'vehicle_provider_not_configured',
    configured:{prodesp:Boolean(prodespUrl&&prodespToken),dadosapi:Boolean(dadosApiKey),placafipe:Boolean(placaFipeToken)},
  });
}
