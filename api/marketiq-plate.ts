const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const num=(value:any)=>Number(String(value??'').replace(',','.'))||0;

export default async function handler(req:any,res:any){
  if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
  const plate=cleanPlate(req.body?.plate);
  if(!/^[A-Z0-9]{7}$/.test(plate)) return res.status(400).json({error:'invalid_plate'});
  const token=process.env.PLACA_FIPE_TOKEN;
  if(!token) return res.status(503).json({error:'provider_not_configured'});
  try{
    const response=await fetch('https://api.placafipe.com.br/getplacafipe',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({placa:plate,token}),
    });
    const raw:any=await response.json().catch(()=>null);
    if(!response.ok||!raw||Number(raw.codigo)!==1) return res.status(502).json({error:'provider_error'});
    const info=raw.informacoes_veiculo||{};
    const options=Array.isArray(raw.fipe)?raw.fipe:[];
    const ranked=options.map((item:any)=>({...item,_score:(num(item.similaridade)*0.55)+(num(item.correspondencia)*0.45)})).sort((a:any,b:any)=>b._score-a._score);
    const best=ranked[0]||null;
    return res.status(200).json({
      plate,
      brand:String(info.marca||best?.marca||''),
      model:String(best?.modelo||info.modelo||''),
      registryModel:String(info.modelo||''),
      year:String(info.ano_modelo||info.ano||best?.ano_modelo||''),
      manufactureYear:String(info.ano||''),
      color:String(info.cor||''),
      fuel:String(info.combustivel||best?.combustivel||''),
      fipeValue:num(best?.valor),
      fipeCode:String(best?.codigo_fipe||''),
      referenceMonth:String(best?.mes_referencia||''),
      confidence:best?Math.round(best._score):0,
      alternatives:ranked.slice(0,3).map((item:any)=>({model:String(item.modelo||''),year:Number(item.ano_modelo||0),value:num(item.valor),fipeCode:String(item.codigo_fipe||''),score:Math.round(item._score)})),
    });
  }catch(error){
    console.error('MarketIQ plate lookup failed',error);
    return res.status(500).json({error:'lookup_failed'});
  }
}
