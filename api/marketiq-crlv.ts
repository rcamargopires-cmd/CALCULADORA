import { GoogleGenAI } from '@google/genai';

const FIREBASE_API_KEY = 'AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';
const CRLV_PARSER_VERSION = 3;

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
const coherentVehicleYears=(yearFab:string,yearModel:string)=>{
  if(!plausibleYear(yearFab)||!plausibleYear(yearModel))return false;
  const fab=Number(yearFab),model=Number(yearModel);
  return model===fab||model===fab+1;
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
    const filePart={inlineData:{mimeType:file.mimeType||'application/octet-stream',data:file.data}};

    const identityPrompt=`Leia SOMENTE o CRLV-e fornecido e extraia os dados claramente visíveis do veículo. Não invente e não complete por contexto.

Retorne APENAS JSON válido com exatamente estas chaves, todas string: brand, model, fuel, color, plate, chassis, renavam.
- Em model preserve a descrição/versão mais completa disponível no campo MARCA / MODELO / VERSÃO.
- Placa e chassi em maiúsculas.
- Se algo não estiver legível, use string vazia.
- NÃO retorne nem tente inferir ano neste passo.`;

    const identityResponse=await ai.models.generateContent({
      model:'gemini-2.5-flash',
      contents:[{role:'user',parts:[
        {text:identityPrompt},
        {text:`ARQUIVO: CRLV-E DO VEÍCULO | nome: ${file.name}`},
        filePart,
      ]}] as any,
      config:{responseMimeType:'application/json'},
    });
    const identityRaw=JSON.parse(cleanJson(String(identityResponse.text||'{}'))) as Record<string,unknown>;

    // Segunda leitura exclusiva dos anos. O objetivo é impedir que EXERCÍCIO, emissão ou licenciamento
    // sejam confundidos com ANO FABRICAÇÃO / ANO MODELO.
    const yearPrompt=`Observe SOMENTE os campos de identificação de ano do CRLV-e.
Retorne APENAS JSON válido com exatamente estas duas chaves string: yearFab, yearModel.

REGRAS OBRIGATÓRIAS:
1. yearFab = os 4 dígitos impressos ao lado/abaixo do rótulo "ANO FABRICAÇÃO".
2. yearModel = os 4 dígitos impressos ao lado/abaixo do rótulo "ANO MODELO" ou "ANO/MODELO".
3. IGNORE COMPLETAMENTE o campo "EXERCÍCIO", ano de licenciamento, data de emissão, data de assinatura, validade e qualquer outra data.
4. Em CRLV brasileiro, normalmente os campos aparecem próximos de "PLACA / EXERCÍCIO" e logo abaixo "ANO FABRICAÇÃO / ANO MODELO". Não troque as linhas.
5. Não use conhecimento do veículo nem ano atual para completar. Leia somente os números impressos nesses dois campos.
6. Se qualquer um dos dois não estiver legível, retorne string vazia.`;

    const yearResponse=await ai.models.generateContent({
      model:'gemini-2.5-flash',
      contents:[{role:'user',parts:[
        {text:yearPrompt},
        {text:`ARQUIVO: CRLV-E DO VEÍCULO | nome: ${file.name}`},
        filePart,
      ]}] as any,
      config:{responseMimeType:'application/json'},
    });
    const yearRaw=JSON.parse(cleanJson(String(yearResponse.text||'{}'))) as Record<string,unknown>;
    const yearFab=cleanYear(yearRaw.yearFab);
    const yearModel=cleanYear(yearRaw.yearModel);

    if(!yearFab||!yearModel){
      return res.status(422).json({error:'Não consegui ler com segurança ANO FABRICAÇÃO e ANO MODELO. Envie uma imagem/PDF mais nítido.'});
    }
    if(!coherentVehicleYears(yearFab,yearModel)){
      return res.status(422).json({error:`Leitura de ano inconsistente (${yearFab}/${yearModel}). O Motyq recusou salvar para não confundir EXERCÍCIO com ano/modelo.`});
    }

    const data={
      brand:String(identityRaw.brand||'').trim(),
      model:String(identityRaw.model||'').trim(),
      yearFab,
      yearModel,
      fuel:String(identityRaw.fuel||'').trim(),
      color:String(identityRaw.color||'').trim(),
      plate:cleanPlate(String(identityRaw.plate||'')),
      chassis:String(identityRaw.chassis||'').trim().toUpperCase(),
      renavam:String(identityRaw.renavam||'').replace(/\D/g,'').slice(0,11),
      parserVersion:CRLV_PARSER_VERSION,
    };

    if(!data.model)return res.status(422).json({error:'Não consegui ler o modelo do veículo no CRLV-e.'});
    return res.status(200).json({data});
  }catch(error:any){
    console.error('MarketIQ CRLV extraction error:',error?.message||error);
    return res.status(500).json({error:'Não foi possível ler o CRLV-e agora.'});
  }
}
