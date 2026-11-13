/** FCM sender used only from the server after verifying buyer entitlement.
 * Uses the existing Firebase service account, never exposes it to clients.
 */
import {createSign} from 'node:crypto';
let cachedToken='',validUntil=0;
const b64=(s:string|Buffer)=>Buffer.from(s).toString('base64url');
async function messagingAccess(){
 if(cachedToken&&Date.now()<validUntil-60000)return cachedToken;
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 if(!raw)throw Error('firebase_service_account_missing');
 const account=JSON.parse(raw);
 if(!account.private_key||!account.client_email)throw Error('firebase_service_account_invalid');
 const now=Math.floor(Date.now()/1000),endpoint=account.token_uri||'https://oauth2.googleapis.com/token';
 const prefix=b64(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64(JSON.stringify({
  iss:account.client_email,sub:account.client_email,aud:endpoint,iat:now,exp:now+3600,
  scope:'https://www.googleapis.com/auth/firebase.messaging'
 }));
 const signer=createSign('RSA-SHA256');signer.update(prefix);signer.end();
 const assertion=prefix+'.'+signer.sign(String(account.private_key).replace(/\\n/g,'\n')).toString('base64url');
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 const result:any=await response.json().catch(()=>({}));
 if(!response.ok||!result.access_token)throw Error('fcm_oauth_'+response.status);
 cachedToken=result.access_token;
 validUntil=Date.now()+Number(result.expires_in||3600)*1000;
 return cachedToken;
}
export async function sendAquaPush(token:string,car:{brand:string;model:string;year:string},link:string){
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 if(!raw)throw Error('firebase_service_account_missing');
 const account=JSON.parse(raw);
 const projectId=String(process.env.FIREBASE_PROJECT_ID||account.project_id||'');
 if(!projectId)throw Error('firebase_project_missing');
 const access=await messagingAccess();
 const response=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(projectId)+'/messages:send',{
  method:'POST',headers:{authorization:'Bearer '+access,'Content-Type':'application/json'},
  body:JSON.stringify({message:{
   token,
   notification:{title:'Motyq AQUA · Novo carro para sua loja',body:[car.brand,car.model,car.year].join(' ')},
   webpush:{headers:{Urgency:'high'},fcm_options:{link}}
  }})
 });
 if(!response.ok)throw Error('fcm_send_'+response.status);
 return true;
}
