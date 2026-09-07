import { GoogleGenAI } from '@google/genai';

const FIREBASE_API_KEY = 'AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';
const CRLV_PARSER_VERSION = 2;

type IncomingFile = { name:string; mimeType:string; data:string };
type Payload = { file?: IncomingFile };

const cleanJson=(raw:string)=>{
  const cleaned=raw.trim().replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```$/i,'').trim();
  const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');
  return start>=0&&end>start?cleaned.slice(start,end+1):cleaned;
};
const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const cleanYear=(value:unknown)=>{
  const match=String(value||'').match(/\b(19|20)\d{2}\b/);
  return match?.[0]||'';
};
const plausibleYear=(value:string)=>{
  const year=Number(value);
  const max=new Date().getFullYear()+1;
  return Number.isInteger(year)&&year>=1950&&year<=max;
};

const verifyFirebaseToken=async(idToken:string)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken}),
  });
  if(!response.ok)return null;
  const data=await response.json() as any;
  return data?.users?.[0]||null;
};

export default async function handler(req:any,res:any){
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  try{
    const authHeader=String(req.headers?.authorization||'');
    const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
    if(!token)return res.status(401).json({error:'Sessão do Motyq não encontrada.'});
    const firebaseUser=await verifyFirebaseToken(token);
    if(!firebaseUser?.email)return res.status(401).json({error:'Sessão inválida ou expirada.'});

    const apiKey=process.env.GEMINI_API_KEY;
    if(!apiKey)return res.status(503).json({error:'Leitura automática não configurada.'});

    const file=(req.body||{} as Payload).file;
    if(!file?.data)return res.status(400).json({error:'Envie o CRLV-e do veículo.'});

    const ai=new GoogleGenAI({apiKey});
    const prompt=`Leia SOMENTE o CRLV-e fornecido e extraia os dados do veículo claramente visíveis. Não invente e não complete por contexto.

ATENÇÃO ESPECIAL AOS ANOS:
- yearFab deve vir EXCLUSIVAMENTE do campo rotulado "ANO FABRICAÇÃO".
- yearModel deve vir EXCLUSIVAMENTE do campo rotulado "ANO MODELO" ou "ANO/MODELO".
- IGNORE completamente "EXERCÍCIO", ano de licenciamento, data de emissão, data do documento, validade, datas de assinatura e qualquer outro ano.
- Não transforme EXERCÍCIO em ano/modelo.
- Se os campos de ano não estiverem legíveis, retorne string vazia em vez de adivinhar.

Retorne APENAS JSON válido com exatamente estas chaves, todas string: brand, model, yearFab, yearModel, fuel, color, plate, chassis, renavam. Em model preserve a descrição/versão mais completa disponível no documento. Placa e chassi em maiúsculas. Se algo não estiver legível, use string vazia.`;
    const response=await ai.models.generateContent({
      model:'gemini-2.5-flash',
      contents:[{role:'user',parts:[
        {text:prompt},
        {text:`ARQUIVO: CRLV-E DO VEÍCULO | nome: ${file.name}`},
        {inlineData:{mimeType:file.mimeType||'application/octet-stream',data:file.data}},
      ]}] as any,
      config:{responseMimeType:'application/json'},
    });
    const raw=JSON.parse(cleanJson(String(response.text||'{}'))) as Record<string,unknown>;
    const yearFab=cleanYear(raw.yearFab);
    const yearModel=cleanYear(raw.yearModel);
    const data={
      brand:String(raw.brand||'').trim(),
      model:String(raw.model||'').trim(),
      yearFab,
      yearModel,
      fuel:String(raw.fuel||'').trim(),
      color:String(raw.color||'').trim(),
      plate:cleanPlate(String(raw.plate||'')),
      chassis:String(raw.chassis||'').trim().toUpperCase(),
      renavam:String(raw.renavam||'').replace(/\D/g,'').slice(0,11),
      parserVersion:CRLV_PARSER_VERSION,
    };
    if(!data.model||!data.yearModel)return res.status(422).json({error:'Não consegui ler modelo e ano/modelo no CRLV-e.'});
    if(!plausibleYear(data.yearModel)||(data.yearFab&&!plausibleYear(data.yearFab)))return res.status(422).json({error:'Os anos do CRLV-e não ficaram confiáveis. Envie uma imagem mais nítida.'});
    if(data.yearFab&&Math.abs(Number(data.yearModel)-Number(data.yearFab))>2)return res.status(422).json({error:'Ano fabricação e ano/modelo ficaram inconsistentes. O Motyq não vai salvar essa leitura.'});
    return res.status(200).json({data});
  }catch(error:any){
    console.error('MarketIQ CRLV extraction error:',error?.message||error);
    return res.status(500).json({error:'Não foi possível ler o CRLV-e agora.'});
  }
}
