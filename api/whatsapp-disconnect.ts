import { motyqFirestore } from '../server/motyqFirestore';

const FIREBASE_API_KEY='AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';
const cleanEmail=(value:unknown)=>String(value||'').trim().toLowerCase();
const safeId=(value:string)=>value.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,180);

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
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  try{
    if(!motyqFirestore.configured())return res.status(503).json({error:'firebase_service_account_not_configured'});
    const authHeader=String(req.headers?.authorization||'');
    const idToken=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
    const firebaseUser=idToken?await verifyFirebaseToken(idToken).catch(()=>null):null;
    const email=cleanEmail(firebaseUser?.email);
    if(!email)return res.status(401).json({error:'not_authenticated'});

    const id=safeId(email);
    const existing:any=await motyqFirestore.get('whatsapp_connections',id).catch(()=>null);
    if(!existing)return res.status(200).json({disconnected:true});

    await motyqFirestore.patch('whatsapp_connections',id,{
      active:false,
      disconnectedAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
    });
    return res.status(200).json({disconnected:true});
  }catch(error:any){
    console.error('MOTYQ WhatsApp disconnect error',error?.message||error);
    return res.status(500).json({error:'whatsapp_disconnect_failed'});
  }
}
