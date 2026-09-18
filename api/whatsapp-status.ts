export default async function handler(req:any,res:any){
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});

  const flags={
    accessToken:Boolean(String(process.env.WHATSAPP_ACCESS_TOKEN||'').trim()),
    phoneNumberId:Boolean(String(process.env.WHATSAPP_PHONE_NUMBER_ID||'').trim()),
    verifyToken:Boolean(String(process.env.WHATSAPP_VERIFY_TOKEN||'').trim()),
    appSecret:Boolean(String(process.env.WHATSAPP_APP_SECRET||'').trim()),
    firebaseServiceAccount:Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'').trim()),
    gemini:Boolean(String(process.env.GEMINI_API_KEY||'').trim()),
  };

  const missing=Object.keys(flags).filter(key=>!(flags as any)[key]);
  const proto=String(req.headers?.['x-forwarded-proto']||'https');
  const host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'').trim();

  return res.status(200).json({
    connected:missing.length===0,
    flags,
    missing,
    webhookUrl:host?`${proto}://${host}/api/whatsapp-webhook`:'/api/whatsapp-webhook',
    companyId:String(process.env.WHATSAPP_COMPANY_ID||'abrao-reze'),
    storeId:String(process.env.WHATSAPP_STORE_ID||'outlet-sorocaba'),
    graphVersion:String(process.env.WHATSAPP_GRAPH_VERSION||'v24.0'),
  });
}
