import { motyqFirestore } from '../server/motyqFirestore.js';
import { encryptWhatsAppToken } from '../server/whatsappTokenCrypto.js';

const FIREBASE_API_KEY='AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';

const cleanEmail=(value:unknown)=>String(value||'').trim().toLowerCase();
const safeId=(value:string)=>value.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,180);
const nowIso=()=>new Date().toISOString();

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

const graphJson=async(url:string,token:string,init?:RequestInit)=>{
  const response=await fetch(url,{
    ...init,
    headers:{
      authorization:`Bearer ${token}`,
      'content-type':'application/json',
      ...(init?.headers||{}),
    },
  });
  const data:any=await response.json().catch(()=>({}));
  if(!response.ok){
    const error:any=new Error(String(data?.error?.message||`meta_graph_${response.status}`));
    error.status=response.status;
    error.metaCode=data?.error?.code;
    error.metaSubcode=data?.error?.error_subcode;
    throw error;
  }
  return data;
};

const exchangeCode=async(code:string)=>{
  const appId=String(process.env.WHATSAPP_APP_ID||'').trim();
  const appSecret=String(process.env.WHATSAPP_APP_SECRET||'').trim();
  const version=String(process.env.WHATSAPP_GRAPH_VERSION||'v24.0').trim();
  if(!appId||!appSecret)throw new Error('whatsapp_app_not_configured');

  const params=new URLSearchParams({
    client_id:appId,
    client_secret:appSecret,
    code,
  });
  const redirectUri=String(process.env.WHATSAPP_OAUTH_REDIRECT_URI||'').trim();
  if(redirectUri)params.set('redirect_uri',redirectUri);

  const response=await fetch(`https://graph.facebook.com/${version}/oauth/access_token`,{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:params,
  });
  const data:any=await response.json().catch(()=>({}));
  if(!response.ok||!data?.access_token){
    const error:any=new Error(String(data?.error?.message||`meta_code_exchange_${response.status}`));
    error.status=response.status;
    error.metaCode=data?.error?.code;
    error.metaSubcode=data?.error?.error_subcode;
    throw error;
  }
  return String(data.access_token);
};

const resolvePhone=async(input:{token:string;wabaId:string;phoneNumberId:string})=>{
  const version=String(process.env.WHATSAPP_GRAPH_VERSION||'v24.0').trim();
  let phoneNumberId=String(input.phoneNumberId||'').trim();
  const wabaId=String(input.wabaId||'').trim();

  if(!phoneNumberId){
    if(!wabaId)throw new Error('embedded_signup_missing_waba');
    const list=await graphJson(
      `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status`,
      input.token,
    );
    const phones=Array.isArray(list?.data)?list.data:[];
    if(phones.length===0)throw new Error('embedded_signup_no_phone_found');
    if(phones.length>1){
      const error:any=new Error('embedded_signup_multiple_phones');
      error.phones=phones.map((item:any)=>({
        id:String(item?.id||''),
        displayPhoneNumber:String(item?.display_phone_number||''),
        verifiedName:String(item?.verified_name||''),
      }));
      throw error;
    }
    phoneNumberId=String(phones[0]?.id||'');
  }

  const phone=await graphJson(
    `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,status`,
    input.token,
  );

  return {
    phoneNumberId:String(phone?.id||phoneNumberId),
    displayPhoneNumber:String(phone?.display_phone_number||''),
    verifiedName:String(phone?.verified_name||''),
    qualityRating:String(phone?.quality_rating||''),
    status:String(phone?.status||''),
  };
};

export default async function handler(req:any,res:any){
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  try{
    if(!motyqFirestore.configured())return res.status(503).json({error:'firebase_service_account_not_configured'});
    if(!String(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY||'').trim())return res.status(503).json({error:'whatsapp_token_encryption_key_not_configured'});

    const authHeader=String(req.headers?.authorization||'');
    const idToken=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
    const firebaseUser=idToken?await verifyFirebaseToken(idToken).catch(()=>null):null;
    const email=cleanEmail(firebaseUser?.email);
    if(!email)return res.status(401).json({error:'not_authenticated'});

    const me:any=await motyqFirestore.get('users',email);
    if(!me)return res.status(403).json({error:'motyq_user_not_found'});
    if(!['seller','user'].includes(String(me.role||'')))return res.status(403).json({error:'seller_only'});

    const code=String(req.body?.code||'').trim();
    const wabaId=String(req.body?.wabaId||'').trim();
    const suppliedPhoneId=String(req.body?.phoneNumberId||'').trim();
    if(!code)return res.status(400).json({error:'authorization_code_missing'});

    const businessToken=await exchangeCode(code);
    const phone=await resolvePhone({token:businessToken,wabaId,phoneNumberId:suppliedPhoneId});

    const conflicts=await motyqFirestore.query('whatsapp_connections',[
      {field:'phoneNumberId',value:phone.phoneNumberId},
    ],20).catch(()=>[]);
    const conflict=conflicts.find((item:any)=>item?.active!==false&&cleanEmail(item?.sellerEmail)!==email);
    if(conflict)return res.status(409).json({error:'phone_already_connected_to_another_seller'});

    if(wabaId){
      const version=String(process.env.WHATSAPP_GRAPH_VERSION||'v24.0').trim();
      await graphJson(
        `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/subscribed_apps`,
        businessToken,
        {method:'POST',body:JSON.stringify({})},
      );
    }

    const connectionId=safeId(email);
    const timestamp=nowIso();
    const payload={
      id:connectionId,
      sellerId:String(me.id||email),
      sellerEmail:email,
      sellerName:String(me.name||email),
      companyId:String(me.companyId||''),
      storeId:String(me.storeId||''),
      wabaId,
      phoneNumberId:phone.phoneNumberId,
      displayPhoneNumber:phone.displayPhoneNumber,
      verifiedName:phone.verifiedName,
      qualityRating:phone.qualityRating,
      metaStatus:phone.status,
      active:true,
      connectedAt:timestamp,
      updatedAt:timestamp,
      tokenEncrypted:encryptWhatsAppToken(businessToken),
      tokenType:'business_integration_system_user',
    };
    await motyqFirestore.patch('whatsapp_connections',connectionId,payload);

    return res.status(200).json({
      connected:true,
      connection:{
        displayPhoneNumber:phone.displayPhoneNumber,
        verifiedName:phone.verifiedName,
        qualityRating:phone.qualityRating,
        status:phone.status,
        phoneNumberId:phone.phoneNumberId,
        wabaId,
        connectedAt:timestamp,
      },
    });
  }catch(error:any){
    console.error('MOTYQ WhatsApp connect error',{
      message:error?.message||String(error),
      status:error?.status,
      metaCode:error?.metaCode,
      metaSubcode:error?.metaSubcode,
    });
    if(error?.message==='embedded_signup_multiple_phones'){
      return res.status(409).json({error:'multiple_phone_numbers_found',phones:error.phones||[]});
    }
    const status=Number(error?.status||0);
    return res.status(status>=400&&status<500?400:500).json({
      error:'whatsapp_connection_failed',
      reason:String(error?.message||'unknown_error'),
    });
  }
}
