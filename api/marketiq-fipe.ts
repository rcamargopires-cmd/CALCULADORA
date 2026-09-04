import { marketIqFipeResolver } from '../services/marketIqFipeResolver';

export default async function handler(req:any,res:any){
  if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
  const brand=String(req.body?.brand||'').trim();
  const model=String(req.body?.model||'').trim();
  const year=String(req.body?.year||'').trim();
  const fuel=String(req.body?.fuel||'').trim();
  if(!brand||!model||!year) return res.status(400).json({error:'missing_vehicle_data'});
  try{
    const result=await marketIqFipeResolver.resolve({brand,model,year,fuel});
    if(!result?.value) return res.status(404).json({error:'fipe_not_found'});
    return res.status(200).json(result);
  }catch(error){
    console.error('MarketIQ FIPE server lookup failed',error);
    return res.status(500).json({error:'lookup_failed'});
  }
}
