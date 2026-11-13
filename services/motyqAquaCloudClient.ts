/** Same-origin client for authenticated AQUA gateway.
 * Never call Firestore directly or persist buyer tokens.
 */
import {auth} from '../firebase';
const base='/api/aqua?action=';
export async function aquaCloudRequest<T=any>(action:string,payload?:Record<string,unknown>):Promise<T>{
 const user=auth.currentUser;
 if(!user||!user.emailVerified)throw new Error('Entre com seu e-mail confirmado para sincronizar o AQUA.');
 const token=await user.getIdToken();
 const response=await fetch(base+encodeURIComponent(action),{
  method:payload?'POST':'GET',cache:'no-store',
  headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(String(data.error||'Falha na sincronização.'));
 return data as T;
}
