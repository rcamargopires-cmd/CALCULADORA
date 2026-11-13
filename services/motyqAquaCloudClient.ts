/** Same-origin client for authenticated AQUA gateway.
 * Never call Firestore directly or persist buyer tokens.
 */
import {auth} from '../firebase';
const base='/api/analyze-deal?action=aqua-';
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
 if(!response.ok)throw new Error(String(data.error||(
  response.status>=500?'Servidor do AQUA temporariamente indisponível. Tente novamente.':
  response.status===401?'Sessão expirada. Entre novamente no aplicativo.':
  'A consulta ao AQUA não foi concluída.'
 )));
 return data as T;
}
