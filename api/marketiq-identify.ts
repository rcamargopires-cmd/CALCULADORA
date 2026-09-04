const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const cleanRenavam=(value:string)=>String(value||'').replace(/\D/g,'').slice(0,11);
const num=(value:any)=>Number(String(value??'').replace(/[^0-9,.-]/g,'').replace(',','.'))||0;

export default async function handler(req:any,res:any){
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const plate=cleanPlate(req.body?.plate);
  const renavam=cleanRenavam(req.body?.renavam);
  if(!/^[A-Z0-9]{7}$/.test(plate)||renavam.length<9)return res.status(400).json({error:'invalid_vehicle_keys'});

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
        const vehicle=raw.veiculo||raw.data||raw;
        return res.status(200).json({
          plate,
          renavam,
          brand:String(vehicle.marca||vehicle.brand||''),
          model:String(vehicle.modelo||vehicle.model||''),
          registryModel:String(vehicle.modelo||vehicle.model||''),
          year:String(vehicle.ano_modelo||vehicle.anoModelo||vehicle.modelYear||vehicle.ano||''),
          manufactureYear:String(vehicle.ano_fabricacao||vehicle.anoFabricacao||vehicle.manufactureYear||''),
          color:String(vehicle.cor||vehicle.color||''),
          fuel:String(vehicle.combustivel||vehicle.fuel||''),
          fipeValue:num(vehicle.valor_fipe||vehicle.valorFipe||vehicle.fipe||vehicle.fipeValue),
          fipeCode:String(vehicle.codigo_fipe||vehicle.codigoFipe||vehicle.fipeCode||''),
          referenceMonth:String(vehicle.mes_referencia||vehicle.mesReferencia||vehicle.referenceMonth||''),
          source:'dadosapi',
        });
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

  return res.status(503).json({error:'vehicle_provider_not_configured'});
}
