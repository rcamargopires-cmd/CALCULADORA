import { motyqFirestore } from '../server/motyqFirestore';

const FIREBASE_API_KEY='AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';

const verifyFirebaseToken=async(idToken:string)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({idToken}),
  });
  if(!response.ok)return null;
  const data:any=await response.json().catch(()=>null);
  return data?.users?.[0]||null;
};

export default async function handler(req:any,res:any){
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});

  const authHeader=String(req.headers?.authorization||'');
  const idToken=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
  const firebaseUser=idToken?await verifyFirebaseToken(idToken).catch(()=>null):null;
  const email=String(firebaseUser?.email||'').trim().toLowerCase();
  if(!email)return res.status(401).json({error:'not_authenticated'});

  const flags={
    appId:Boolean(String(process.env.WHATSAPP_APP_ID||'').trim()),
    configId:Boolean(String(process.env.WHATSAPP_CONFIG_ID||'').trim()),
    systemUserToken:Boolean(String(process.env.WHATSAPP_SYSTEM_USER_TOKEN||'').trim()),
    verifyToken:Boolean(String(process.env.WHATSAPP_VERIFY_TOKEN||'').trim()),
    appSecret:Boolean(String(process.env.WHATSAPP_APP_SECRET||'').trim()),
    firebaseServiceAccount:Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'').trim()),
    gemini:Boolean(String(process.env.GEMINI_API_KEY||'').trim()),
  };
  const missing=Object.keys(flags).filter(key=>!(flags as any)[key]);

  let connection:any=null;
  if(flags.firebaseServiceAccount){
    const rows=await motyqFirestore.query('whatsapp_connections',[
      {field:'sellerEmail',value:email},
    ],10).catch(()=>[]);
    connection=rows.find((item:any)=>item?.active!==false)||null;
  }

  const proto=String(req.headers?.['x-forwarded-proto']||'https');
  const host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'').trim();

  return res.status(200).json({
    connected:Boolean(connection?.phoneNumberId),
    platformReady:missing.length===0,
    flags,
    missing,
    webhookUrl:host?`${proto}://${host}/api/whatsapp-webhook`:'/api/whatsapp-webhook',
    graphVersion:String(process.env.WHATSAPP_GRAPH_VERSION||'v24.0'),
    sellerEmail:email,
    connection:connection?{
      displayPhoneNumber:String(connection.displayPhoneNumber||''),
      phoneNumberId:String(connection.phoneNumberId||''),
      wabaId:String(connection.wabaId||''),
      connectedAt:String(connection.connectedAt||''),
      sellerName:String(connection.sellerName||''),
    }:null,
  });
}
