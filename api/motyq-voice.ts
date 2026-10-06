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

const fallbackIntent=(transcript:string,contextCustomerName='')=>{
  const raw=clean(transcript);
  const t=normalize(raw).replace(/[?!.,;:]+/g,' ').replace(/\s+/g,' ').trim();
  const base={intent:'unknown',confidence:0.45,reply:'Não entendi o comando. Você pode pedir para consultar o estoque, abrir o CRM, cadastrar um lead, anotar um contato ou agendar um retorno.',params:{} as any,needsConfirmation:false};

  if(/^(ajuda|me ajuda|o que voce faz|o que você faz|quais comandos|comandos|como funciona)/.test(t))
    return{...base,intent:'help',confidence:1,reply:'Posso consultar estoque, localizar veículos, mostrar o carro mais antigo, cadastrar lead, anotar contato, agendar follow-up, localizar cliente e abrir o CRM.'};

  if((t.includes('abr')||t.includes('entra')||t.includes('ir para'))&&t.includes('crm'))
    return{...base,intent:'open_crm',confidence:.97,reply:'Abrindo o CRM.'};

  if(t.includes('clientes quentes')||t.includes('cliente quente')||t.includes('leads quentes')||t.includes('lead quente'))
    return{...base,intent:'crm_hot_leads',confidence:.95,reply:'Vou listar seus leads mais quentes.'};

  const customerLookup=t.match(/(?:procura|procure|buscar|busca|localiza|localize|encontra|encontre|consulta|consultar)\s+(?:o cliente|a cliente|cliente|lead)\s+(.+)/i);
  if(customerLookup)
    return{...base,intent:'crm_find_customer',confidence:.86,reply:'Vou procurar esse cliente no CRM.',params:{customerName:customerLookup[1].trim()}};

  if((t.includes('mais antigo')||t.includes('mais tempo')||t.includes('mais parado')||t.includes('maior aging')||t.includes('maior giro parado'))&&(t.includes('estoque')||t.includes('carro')||t.includes('veiculo')))
    return{...base,intent:'stock_oldest',confidence:.96,reply:'Vou localizar o veículo mais antigo do estoque.'};

  const countModel=t.match(/(?:quantos?|quantas?)\s+(.+?)\s+(?:tem|temos|ha|há|existem)(?:\s+(?:no|na)\s+estoque)?$/i)
    || t.match(/(?:quantos?|quantas?)\s+(.+?)(?:\s+(?:no|na)\s+estoque)$/i);
  if(countModel){
    const query=countModel[1].replace(/\b(carros?|veiculos?|veículos?|modelos?)\b/gi,'').trim();
    if(query && !['carro','carros','veiculo','veiculos','veículo','veículos','estoque'].includes(query))
      return{...base,intent:'stock_count',confidence:.97,reply:'Vou contar esse modelo no estoque.',params:{query}};
  }

  const summaryPhrases=[
    'consultar estoque','consulta estoque','consultar o estoque','consulta o estoque','ver estoque','ver o estoque',
    'mostrar estoque','mostra estoque','mostra o estoque','me mostra o estoque','me mostre o estoque',
    'resumo do estoque','resumo estoque','como esta o estoque','como está o estoque','quantos carros no estoque','quantos veiculos no estoque','quantos veículos no estoque'
  ];
  if(summaryPhrases.some(phrase=>t.includes(normalize(phrase))) || (t==='estoque') || (t.includes('estoque')&&/(consult|mostr|resum|quant|ver|como esta)/.test(t)))
    return{...base,intent:'stock_summary',confidence:.94,reply:'Vou resumir o estoque atual.'};

  const priceMatch=t.match(/(?:ate|até|no maximo|no máximo)\s*(?:r\$\s*)?([0-9]+(?:[.,][0-9]+)?)\s*(mil|k)?/i);
  const kmMatch=t.match(/(?:ate|até|no maximo|no máximo|menos de)\s*([0-9]+(?:[.,][0-9]+)?)\s*(mil|k)?\s*km/i);
  const toNumber=(match:any)=>{
    if(!match)return null;
    const base=Number(String(match[1]||'').replace('.','').replace(',','.'))||0;
    return match[2]?Math.round(base*1000):Math.round(base);
  };
  const wantsVehicleOptions=/(suv|utilitario|utilitário|automatic|automático|automatica|automática|opcoes|opções|carros?\s+ate|veiculos?\s+ate|veículos?\s+ate|menos de .*km)/i.test(t);
  if(wantsVehicleOptions){
    const category=/\bsuv\b|utilitari/.test(t)?'suv':null;
    const transmission=/automatic/.test(t)?'automatico':/manual/.test(t)?'manual':null;
    return{...base,intent:'stock_search',confidence:.91,reply:'Vou procurar as melhores opções no estoque.',params:{category,maxPrice:toNumber(priceMatch),maxKm:toNumber(kmMatch),transmission,query:null}};
  }

  const plate=(raw.match(/\b[A-Z]{3}[0-9A-Z][0-9A-Z][0-9]{2}\b/i)||[])[0];
  if(plate&&(t.includes('estoque')||t.includes('fipe')||t.includes('dias')||t.includes('carro')||t.includes('veiculo')||t.includes('placa')))
    return{...base,intent:'stock_find_vehicle',confidence:.95,reply:'Vou consultar esse veículo no estoque.',params:{query:plate.toUpperCase()}};

  const stockModel=t.match(/(?:consulta|consultar|procura|procurar|buscar|busca|localiza|localizar|encontra|encontrar|ver|mostrar|mostra)\s+(?:no estoque\s+|o carro\s+|o veiculo\s+|o veículo\s+|a placa\s+)?(.+)/i);
  if(stockModel&&!stockModel[1].includes('cliente')&&!stockModel[1].includes('lead')&&!stockModel[1].includes('crm')){
    const query=stockModel[1].replace(/^(do|da|de|o|a)\s+/,'').trim();
    if(query&&query!=='estoque'&&query.length>1)
      return{...base,intent:'stock_find_vehicle',confidence:.78,reply:'Vou procurar esse veículo no estoque.',params:{query}};
  }

  const note=t.match(/(?:anota|anote|registrar|registre|observacao|observação)(?: no atendimento| no crm| para| que)?\s+(?:do|da)?\s*([^,]+?)(?:\s+que\s+|,\s*)(.+)$/i);
  if(note)
    return{...base,intent:'crm_add_note',confidence:.88,reply:'Vou adicionar essa observação ao CRM.',params:{customerName:note[1].trim(),note:note[2].trim()}};

  const contactAndFollow=/(tentei falar|tentei ligar|liguei|chamei|mandei mensagem|nao consegui falar|não consegui falar|sem sucesso)/i.test(t)
    && /(agenda|agende|agendar|reagenda|reagende|reagente|retorno|follow[- ]?up|amanha|amanhã|depois)/i.test(t);
  if(contactAndFollow){
    const explicitCustomer=
      t.match(/(?:cliente|com|para|pro|pra)\s+([a-záàâãéèêíïóôõöúç]+)(?=\s+(?:e|mas|nao|não|amanha|amanhã|hoje|agenda|agende|agendar|reagenda|reagende|reagente|retorno)|,|$)/i)?.[1]
      || t.match(/(?:falar|ligar|liguei|chamei)\s+(?:com|para)?\s*([a-záàâãéèêíïóôõöúç]+)(?=\s+(?:e|mas|nao|não|amanha|amanhã|hoje|agenda|agende|agendar|reagenda|reagende|reagente|retorno)|,|$)/i)?.[1]
      || '';
    return{...base,intent:'crm_contact_note_followup',confidence:.95,reply:'Vou registrar a tentativa de contato e agendar o próximo retorno.',params:{customerName:explicitCustomer||contextCustomerName||'',note:raw,followUpText:raw}};
  }
  const follow=t.match(/(?:agenda|agende|marque|programa|programe)(?: um)?\s+(?:retorno|follow[- ]?up|ligacao|ligação)(?: com| para)?\s+([^,]+?)(?:\s+(amanha|amanhã|hoje|dia|as|às)\b|,|$)/i);
  if(follow)
    return{...base,intent:'crm_schedule_followup',confidence:.84,reply:'Vou preparar esse follow-up.',params:{customerName:follow[1].trim(),followUpText:raw}};

  const create=t.match(/(?:cadastre|cadastra|crie|criar|novo|nova)(?: um| uma)?\s+(?:cliente|lead)\s+(?:chamado|chamada|nome)?\s*([^,]+)(?:,|$)/i);
  if(create)
    return{...base,intent:'crm_create_lead',confidence:.82,reply:'Vou cadastrar esse lead.',params:{customerName:create[1].trim(),raw}};

  const move=t.match(/(?:mova|move|coloca|coloque|passa|passe)\s+(?:o cliente|a cliente|cliente)?\s*([^,]+?)\s+(?:para|pra)\s+(proposta|follow[- ]?up|atendimento|novo lead)/i);
  if(move){
    const stageRaw=move[2];
    const stage=stageRaw.includes('proposta')?'proposal':stageRaw.includes('follow')?'follow_up':stageRaw.includes('atendimento')?'in_service':'waiting';
    return{...base,intent:'crm_move_stage',confidence:.86,reply:'Vou atualizar a etapa desse cliente.',params:{customerName:move[1].trim(),stage}};
  }

  return base;
};

const findGeminiAudio=(payload:any)=>{
  for(const candidate of payload?.candidates||[]){
    for(const part of candidate?.content?.parts||[]){
      const inline=part?.inlineData||part?.inline_data;
      if(inline?.data)return{data:String(inline.data),mimeType:String(inline.mimeType||inline.mime_type||'audio/wav')};
    }
  }
  return null;
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

  if(req.body?.action==='tts'){
    const text=clean(req.body?.text,1200);
    if(!text)return res.status(400).json({error:'empty_text'});
    const geminiKey=String(process.env.GEMINI_API_KEY||process.env.GOOGLE_GENAI_API_KEY||'').trim();
    if(!geminiKey)return res.status(503).json({error:'gemini_tts_not_configured'});
    const voice=clean(process.env.GEMINI_TTS_VOICE||req.body?.voice||'Aoede',80);
    const ttsModel=clean(process.env.GEMINI_TTS_MODEL||'gemini-3.8-flash-tts',100);
    try{
      const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ttsModel)}:generateContent`,{
        method:'POST',
        headers:{'x-goog-api-key':geminiKey,'content-type':'application/json'},
        body:JSON.stringify({
          contents:[{role:'user',parts:[{text,speech_metadata:{style:'Brazilian Portuguese female virtual assistant. Natural, warm, confident, conversational, concise, never theatrical, medium-soft energy, clear diction.'}}]}],
          generationConfig:{responseModalities:['AUDIO'],speechConfig:{languageCode:'pt-BR',voiceConfig:{voice}}},
        }),
      });
      const payload:any=await response.json().catch(()=>({}));
      if(!response.ok)return res.status(502).json({error:'gemini_tts_failed',detail:String(payload?.error?.message||'').slice(0,300)});
      const audio=findGeminiAudio(payload);
      if(!audio)return res.status(502).json({error:'gemini_tts_empty_audio'});
      const buffer=Buffer.from(audio.data,'base64');
      res.setHeader('content-type',audio.mimeType.includes('audio')?audio.mimeType:'audio/wav');
      res.setHeader('cache-control','no-store');
      res.setHeader('x-motyq-voice','gemini-neural');
      return res.status(200).send(buffer);
    }catch(error:any){
      return res.status(502).json({error:'gemini_tts_exception',detail:String(error?.message||error||'').slice(0,300)});
    }
  }

  const transcript=clean(req.body?.transcript,600);
  if(!transcript)return res.status(400).json({error:'empty_transcript'});
  const contextCustomerName=clean(req.body?.contextCustomerName,120);
  const fallback=fallbackIntent(transcript,contextCustomerName);
  const gatewayKey=String(process.env.AI_GATEWAY_API_KEY||'').trim();
  const openaiKey=String(process.env.OPENAI_API_KEY||'').trim();
  const apiKey=gatewayKey||openaiKey;
  const baseUrl=gatewayKey?'https://ai-gateway.vercel.sh/v1':'https://api.openai.com/v1';
  const model=gatewayKey?'openai/gpt-6-luna':'gpt-6-luna';
  const geminiKey=String(process.env.GEMINI_API_KEY||process.env.GOOGLE_GENAI_API_KEY||'').trim();

  const now=clean(req.body?.now,80)||new Date().toISOString();
  const schema={
    type:'object',
    additionalProperties:false,
    required:['intent','confidence','reply','needsConfirmation','params'],
    properties:{
      intent:{type:'string',enum:['crm_create_lead','crm_add_note','crm_schedule_followup','crm_contact_note_followup','crm_move_stage','crm_find_customer','crm_hot_leads','stock_find_vehicle','stock_count','stock_search','stock_oldest','stock_summary','open_crm','help','unknown']},
      confidence:{type:'number'},
      reply:{type:'string'},
      needsConfirmation:{type:'boolean'},
      params:{
        type:'object',additionalProperties:false,
        required:['customerName','phone','interestModel','note','followUpAt','stage','query','sellerName','category','maxPrice','maxKm','transmission'],
        properties:{
          customerName:{type:['string','null']},phone:{type:['string','null']},interestModel:{type:['string','null']},note:{type:['string','null']},
          followUpAt:{type:['string','null']},stage:{type:['string','null'],enum:['waiting','in_service','proposal','follow_up',null]},
          query:{type:['string','null']},sellerName:{type:['string','null']},category:{type:['string','null']},maxPrice:{type:['number','null']},maxKm:{type:['number','null']},transmission:{type:['string','null']},
        }
      }
    }
  };

  const parseGeminiJson=(payload:any)=>{
    const text=String(payload?.candidates?.[0]?.content?.parts?.map((part:any)=>part?.text||'').join('')||'').trim();
    if(!text)return null;
    const cleanJson=text.replace(/^\`\`\`(?:json)?/i,'').replace(/\`\`\`$/,'').trim();
    try{return JSON.parse(cleanJson);}catch{return null;}
  };

  try{
    const prompt=`Você interpreta comandos de voz em português do Brasil para um DMS/CRM de concessionária chamado MOTYQ.
Apenas escolha uma intenção permitida. Nunca invente cliente, placa, telefone, data ou veículo.
Comandos destrutivos, venda concluída, perda definitiva, preço, aprovação, financeiro ou exclusão devem retornar unknown.
Datas relativas devem ser convertidas para ISO usando como referência ${now}.\nCliente em contexto recente: ${contextCustomerName||'nenhum'}. Se o usuário disser ele, ela ou esse cliente sem repetir o nome, use esse contexto somente quando existir.
crm_move_stage só pode usar waiting, in_service, proposal ou follow_up.\nSe o usuário disser que tentou contato e na mesma frase pedir agendamento de retorno, use crm_contact_note_followup.
Para perguntas como 'quantos Creta tem no estoque' ou 'quantos Corolla temos', use stock_count e coloque o modelo/marca em query. Para pedidos como SUV, automático, até determinado preço/KM ou opções de veículos, use stock_search e preencha category, maxPrice, maxKm, transmission e query quando houver.
Responda curto em português no campo reply.`;
    if(!apiKey&&geminiKey){
      const geminiModel=String(process.env.GEMINI_INTENT_MODEL||'gemini-2.5-flash').trim();
      const geminiResponse=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,{
        method:'POST',
        headers:{'x-goog-api-key':geminiKey,'content-type':'application/json'},
        body:JSON.stringify({
          contents:[{role:'user',parts:[{text:prompt+'\n\nComando do vendedor: '+transcript+'\nResponda SOMENTE JSON válido com intent, confidence, reply, needsConfirmation e params.'}]}],
          generationConfig:{temperature:0.1,responseMimeType:'application/json'}
        })
      });
      const geminiPayload:any=await geminiResponse.json().catch(()=>({}));
      if(geminiResponse.ok){
        const parsed=parseGeminiJson(geminiPayload);
        if(parsed&&parsed.intent)return res.status(200).json({...fallback,...parsed,mode:'ai',provider:'gemini'});
      }
      return res.status(200).json({...fallback,mode:'basic'});
    }
    if(!apiKey)return res.status(200).json({...fallback,mode:'basic'});

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
