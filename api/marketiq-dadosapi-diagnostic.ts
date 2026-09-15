const DIAG_KEY='motyq_diag_7e4d9c91b5f84c3ab2b81d4d8f1376e2';

const safeJson=async(response:Response)=>{
  const text=await response.text();
  try{return JSON.parse(text);}catch{return {raw:text.slice(0,800)};}
};

export default async function handler(req:any,res:any){
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  if(String(req.query?.k||'')!==DIAG_KEY)return res.status(404).json({error:'not_found'});

  const token=String(process.env.DADOSAPI_TOKEN||'').trim();
  if(!token)return res.status(200).json({hasToken:false});

  const plate='GIS0H92';
  const endpoints=[
    'https://api.dadosapi.com/v1/veiculo-placa-unica',
    'https://api.dadosapi.com/dados-publicos/consulta-veiculo-por-placa',
  ];

  const results:any[]=[];
  for(const endpoint of endpoints){
    try{
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({placa:plate}),
      });
      const body:any=await safeJson(response);
      results.push({
        endpoint,
        status:response.status,
        ok:response.ok,
        topLevelKeys:body&&typeof body==='object'?Object.keys(body).slice(0,30):[],
        message:String(body?.message||body?.mensagem||body?.mensagemRetorno||body?.error||''),
        model:String(body?.MODELO||body?.modelo||body?.data?.MODELO||body?.data?.modelo||''),
        year:String(body?.anoModelo||body?.ano_modelo||body?.data?.anoModelo||body?.data?.ano_modelo||''),
      });
    }catch(error:any){
      results.push({endpoint,status:0,ok:false,message:String(error?.message||error)});
    }
  }

  return res.status(200).json({hasToken:true,results});
}
