const FIREBASE_API_KEY='AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';

const clean=(value:any,max=1200)=>String(value||'').trim().slice(0,max);

const verifyFirebaseToken=async(idToken:string)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({idToken}),
  });
  if(!response.ok)return null;
  const data:any=await response.json().catch(()=>({}));
  return data?.users?.[0]||null;
};

const findAudio=(payload:any)=>{
  for(const candidate of payload?.candidates||[]){
    for(const part of candidate?.content?.parts||[]){
      const inline=part?.inlineData||part?.inline_data;
      if(inline?.data)return{data:String(inline.data),mimeType:String(inline.mimeType||inline.mime_type||'audio/wav')};
    }
  }
  return null;
};

export default async function handler(req:any,res:any){
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});

  const authHeader=String(req.headers?.authorization||'');
  const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
  const firebaseUser=token?await verifyFirebaseToken(token):null;
  if(!firebaseUser)return res.status(401).json({error:'unauthorized'});

  const text=clean(req.body?.text);
  if(!text)return res.status(400).json({error:'empty_text'});

  const apiKey=String(process.env.GEMINI_API_KEY||process.env.GOOGLE_GENAI_API_KEY||'').trim();
  if(!apiKey)return res.status(503).json({error:'gemini_tts_not_configured'});

  const voice=clean(process.env.GEMINI_TTS_VOICE||req.body?.voice||'Aoede',80);
  const model=clean(process.env.GEMINI_TTS_MODEL||'gemini-3.8-flash-tts',100);

  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',
      headers:{
        'x-goog-api-key':apiKey,
        'content-type':'application/json',
      },
      body:JSON.stringify({
        contents:[{
          role:'user',
          parts:[{
            text,
            speech_metadata:{
              style:'Brazilian Portuguese female virtual assistant. Natural, warm, confident, conversational, concise, never theatrical, medium-soft energy, clear diction.'
            }
          }]
        }],
        generationConfig:{
          responseModalities:['AUDIO'],
          responseFormat:{audio:{mimeType:'AUDIO_WAV',sampleRate:24000}},
          speechConfig:{
            languageCode:'pt-BR',
            voiceConfig:{voice}
          }
        }
      }),
    });

    const payload:any=await response.json().catch(()=>({}));
    if(!response.ok)return res.status(502).json({error:'gemini_tts_failed',detail:String(payload?.error?.message||'').slice(0,300)});

    const audio=findAudio(payload);
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
