const clean=(v:unknown,max=500)=>String(v||'').trim().slice(0,max);
export const interpretStockIntent=async(req:any,res:any)=>{
 const key=String(process.env.GEMINI_API_KEY||'').trim();
 if(!key)return res.status(503).json({error:'gemini_not_configured'});
 const transcript=clean(req.body?.transcript,400);
 if(!transcript)return res.status(400).json({error:'empty_transcript'});
 const history=Array.isArray(req.body?.history)?req.body.history.slice(-8).map((turn:any)=>({
  speaker:turn?.speaker==='motyq'?'motyq':'user',message:clean(turn?.message,200)
 })):[];
 const lastModel=clean(req.body?.lastModel,80);
 const prompt=`Você é o interpretador de pedidos do MOTYQ VOICE, um assistente automotivo brasileiro.
Retorne APENAS JSON válido. Sua função é classificar o pedido, NÃO responder nem inventar dados.
O sistema local tem estoque Dealer; só ele calcula valores, contagens e dias.
Considere o histórico da conversa para resolver "desse", "desses", "esse carro".
Use intent="stock" APENAS para consulta de estoque (quantidade, capital, dias, veículos parados, relatório/resumo ou risco de capital imobilizado).
Use intent="other" para FIPE, valor de mercado, preço de compra, cotação, diálogo comum, dúvidas e perguntas não relacionadas a estoque.
metric: "count", "capital", "aging", "oldest", "analysis" ou "list".
scope: "all" quando o usuário pedir literalmente todo o estoque, independente do modelo; caso contrário, "model".
model: somente a família do veículo mencionada no pedido ou no histórico; se não souber, null. Não infira marca/modelo do nada.
year: ano-modelo numérico solicitado explicitamente nesta mensagem; caso contrário null.
clearYear: true quando usuário pedir "todos os anos" ou "sem filtrar ano"; caso contrário false.
Caso o usuário faça pergunta de seguimento sobre estoque, ainda é intent="stock" mesmo que não diga "estoque".
Não transforme consultas FIPE em estoque.
Retorne objeto com exatamente intent, metric, scope, model, year e clearYear.
Modelo em contexto na UI: ${JSON.stringify(lastModel||null)}.
Histórico: ${JSON.stringify(history)}
Pergunta atual: ${JSON.stringify(transcript)}`;
 try{
  const model=String(process.env.GEMINI_INTENT_MODEL||'gemini-2.5-flash-lite').trim();
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
   method:'POST',
   headers:{'x-goog-api-key':key,'content-type':'application/json'},
   body:JSON.stringify({
    contents:[{role:'user',parts:[{text:prompt}]}],
    generationConfig:{temperature:0,responseMimeType:'application/json'}
   }),
   signal:AbortSignal.timeout(8500)
  });
  if(!response.ok)return res.status(502).json({error:'gemini_unavailable'});
  const payload:any=await response.json();
  const raw=String(payload?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('')||'');
  const data=JSON.parse(raw);
  const intent=data?.intent==='stock'?'stock':'other';
  const metrics=['count','capital','aging','oldest','analysis','list'];
  const metric=metrics.includes(data?.metric)?data.metric:'count';
  const scope=data?.scope==='all'?'all':'model';
  const modelName=typeof data?.model==='string'?clean(data.model,60):null;
  const year=Number.isInteger(data?.year)&&data.year>=1950&&data.year<=2100?data.year:null;
  res.setHeader('cache-control','no-store');
  return res.status(200).json({intent,metric,scope,model:modelName,year,clearYear:data?.clearYear===true,provider:'gemini'});
 }catch{return res.status(502).json({error:'gemini_parse_unavailable'});}
};
