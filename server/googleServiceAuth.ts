import { createSign } from 'node:crypto';

type ServiceAccount={
  project_id?:string;
  client_email?:string;
  private_key?:string;
  token_uri?:string;
};

let cachedToken='';
let cachedUntil=0;

const base64url=(value:string|Buffer)=>Buffer.from(value).toString('base64url');

const account=():ServiceAccount=>{
  const raw=String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'').trim();
  if(!raw)throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_missing');
  const parsed=JSON.parse(raw) as ServiceAccount;
  if(!parsed.project_id||!parsed.client_email||!parsed.private_key)throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_invalid');
  parsed.private_key=String(parsed.private_key).replace(/\\n/g,'\n');
  return parsed;
};

export const googleServiceAuth={
  configured:()=>Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'').trim()),

  projectId:()=>String(process.env.FIREBASE_PROJECT_ID||account().project_id||'').trim(),

  accessToken:async(scope='https://www.googleapis.com/auth/cloud-platform')=>{
    if(cachedToken&&Date.now()<cachedUntil-60_000)return cachedToken;
    const sa=account();
    const now=Math.floor(Date.now()/1000);
    const unsigned=`${base64url(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${base64url(JSON.stringify({
      iss:sa.client_email,sub:sa.client_email,aud:sa.token_uri||'https://oauth2.googleapis.com/token',
      iat:now,exp:now+3600,scope,
    }))}`;
    const signer=createSign('RSA-SHA256');
    signer.update(unsigned);signer.end();
    const assertion=`${unsigned}.${signer.sign(String(sa.private_key)).toString('base64url')}`;
    const response=await fetch(sa.token_uri||'https://oauth2.googleapis.com/token',{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
    });
    const body:any=await response.json().catch(()=>({}));
    if(!response.ok||!body?.access_token)throw new Error(`google_oauth_failed_${response.status}`);
    cachedToken=String(body.access_token);
    cachedUntil=Date.now()+Number(body.expires_in||3600)*1000;
    return cachedToken;
  },
};
