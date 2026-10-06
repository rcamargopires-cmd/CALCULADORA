const FIREBASE_API_KEY='AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';

const clean=(value:any,max=500)=>String(value||'').trim().slice(0,max);
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

const verifyFirebaseToken=async(idToken:string)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken}),
  });
  if(!response.ok)return null;
  const data:any=await response.json().catch(()=>({}));
  return data?.users?.[0]||null;
};

const fallbackIntent=(transcript:string)=>{
  const raw=clean(transcript);
  const t=normalize(raw);
  const base={intent:'unknown',confidence:0.45,reply:'Não entendi o comando. Tente pedir para cadastrar um lead, anotar um contato, agendar follow-up ou consultar estoque.',params:{} as any,needsConfirmation:false};

  if(/^(ajuda|o que voce faz|o que você faz|comandos)/.test(t))return{...base,intent:'help',confidence:1,reply:'Posso cadastrar lead, adicionar observação, agendar follow-up, mover etapas seguras do CRM e consultar estoque.'};
  if(t.includes('abr')&&t.includes('crm'))return{...base,intent:'open_crm',confidence:.95,reply:'Abrindo o CRM.'};
  if((t.includes('mais antigo')||t.includes('mais tempo'))&&t.includes('estoque'))return{...base,intent:'stock_oldest',confidence:.9,reply:'Vou localizar o veículo mais antigo do estoque.'};
  if((t.includes('quantos')||t.includes('resumo'))&&t.includes('estoque'))return{...base,intent:'stock_summary',confidence:.85,reply:'Vou resumir o estoque atual.'};

  const plate=(raw.match(/\b[A-Z]{3}[0-9A-Z][0-9A-Z][0-9]{2}\b/i)||[])[0];
  if((t.includes('estoque')||t.includes('fipe')||t.includes('dias'))&&plate)return{...base,intent:'stock_find_vehicle',confidence:.9,reply:'Vou consultar esse veículo no estoque.',params:{query:plate.toUpperCase()}};

  const note=t.match(/(?:anota|anote|observacao|observação)(?: no atendimento| para| que)?\s+(?:do|da)?\s*([^,]+?)(?:\s+que\s+|,\s*)(.+)$/i);
  if(note)return{...base,intent:'crm_add_note',confidence:.82,reply:'Vou adicionar essa observação ao CRM.',params:{customerName:note[1].trim(),note:note[2].trim()}};

  const follow=t.match(/(?:agenda|agende|marque|programa|programe)(?: um)?\s+(?:retorno|follow[- ]?up)(?: com| para)?\s+([^,]+?)(?:\s+(amanha|amanhã|hoje|dia|as|às)\b|,|$)/i);
  if(follow)return{...base,intent:'crm_schedule_followup',confidence:.7,reply:'Vou preparar esse follow-up.',params:{customerName:follow[1].trim(),followUpText:raw}};

  const create=t.match(/(?:cadastre|cadastra|crie|criar)(?: um)?\s+(?:cliente|lead)\s+(?:chamado|chamada|nome)?\s*([^,]+)(?:,|$)/i);
  if(create)return{...base,intent:'crm_create_lead',confidence:.72,reply:'Vou cadastrar esse lead.',params:{customerName:create[1].trim(),raw}};

  if(t.includes('clientes quentes')||t.includes('leads quentes'))return{...base,intent:'crm_hot_leads',confidence:.9,reply:'Vou listar seus leads mais quentes.'};

  return base;
};

const extractText=(data:any)=>{
  if(typeof data?.output_text==='string')return data.output_text;
  const chunks:any[]=[];
  for(const item of data?.output||[])for(const part of item?.content||[])if(typeof part?.text==='string')chunks.push(part.text);
  return chunks.join('');
};

export default async function handler(req:any,res:any){
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const authHeader=String(req.headers?.authorization||'');
  const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
  const firebaseUser=token?await verifyFirebaseToken(token):null;
  if(!firebaseUser)return res.status(401).json({error:'unauthorized'});

  const transcript=clean(req.body?.transcript,600);
  if(!transcript)return res.status(400).json({error:'empty_transcript'});
  const fallback=fallbackIntent(transcript);
  const gatewayKey=String(process.env.AI_GATEWAY_API_KEY||'').trim();
  const openaiKey=String(process.env.OPENAI_API_KEY||'').trim();
  const apiKey=gatewayKey||openaiKey;
  const baseUrl=gatewayKey?'https://ai-gateway.vercel.sh/v1':'https://api.openai.com/v1';
  const model=gatewayKey?'openai/gpt-6-luna':'gpt-6-luna';
  if(!apiKey)return res.status(200).json({...fallback,mode:'basic'});

  const now=clean(req.body?.now,80)||new Date().toISOString();
  const schema={
    type:'object',
    additionalProperties:false,
    required:['intent','confidence','reply','needsConfirmation','params'],
    properties:{
      intent:{type:'string',enum:['crm_create_lead','crm_add_note','crm_schedule_followup','crm_move_stage','crm_find_customer','crm_hot_leads','stock_find_vehicle','stock_oldest','stock_summary','open_crm','help','unknown']},
      confidence:{type:'number'},
      reply:{type:'string'},
      needsConfirmation:{type:'boolean'},
      params:{
        type:'object',additionalProperties:false,
        required:['customerName','phone','interestModel','note','followUpAt','stage','query','sellerName'],
        properties:{
          customerName:{type:['string','null']},phone:{type:['string','null']},interestModel:{type:['string','null']},note:{type:['string','null']},
          followUpAt:{type:['string','null']},stage:{type:['string','null'],enum:['waiting','in_service','proposal','follow_up',null]},
          query:{type:['string','null']},sellerName:{type:['string','null']},
        }
      }
    }
  };

  try{
    const prompt=`Você interpreta comandos de voz em português do Brasil para um DMS/CRM de concessionária chamado MOTYQ.
Apenas escolha uma intenção permitida. Nunca invente cliente, placa, telefone, data ou veículo.
Comandos destrutivos, venda concluída, perda definitiva, preço, aprovação, financeiro ou exclusão devem retornar unknown.
Datas relativas devem ser convertidas para ISO usando como referência ${now}.
crm_move_stage só pode usar waiting, in_service, proposal ou follow_up.
Responda curto em português no campo reply.`;
    const response=await fetch(`${baseUrl}/responses`,{
      method:'POST',
      headers:{'authorization':`Bearer ${apiKey}`,'content-type':'application/json'},
      body:JSON.stringify({
        model,
        reasoning:{effort:'none'},
        input:[{role:'system',content:prompt},{role:'user',content:transcript}],
        text:{format:{type:'json_schema',name:'motyq_voice_intent',strict:true,schema}},
      }),
    });
    if(!response.ok)return res.status(200).json({...fallback,mode:'basic'});
    const data:any=await response.json();
    const text=extractText(data);
    const parsed=JSON.parse(text);
    return res.status(200).json({...parsed,mode:'ai'});
  }catch{
    return res.status(200).json({...fallback,mode:'basic'});
  }
}
