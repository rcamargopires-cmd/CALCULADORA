/**
 * Owner-initiated Drive import. Never store OAuth tokens, raw workbook bytes
 * or expose the source file to an unauthenticated endpoint.
 * Google OAuth consent is separate from ChatGPT's Drive connector.
 */
import {GoogleAuthProvider,reauthenticateWithPopup} from 'firebase/auth';
import {auth} from '../firebase';

const MAX_BYTES=42*1024*1024;
const ID=/^[a-zA-Z0-9_-]{20,128}$/;

export function dealerDriveFileId(source:string):string|null {
 const input=source.trim();
 if(ID.test(input))return input;
 try{
  const uri=new URL(input);
  if(uri.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(uri.hostname))return null;
  const id=uri.pathname.match(/\/(?:spreadsheets\/d|file\/d)\/([A-Za-z0-9_-]{20,128})(?:\/|$)/)?.[1]||'';
  return ID.test(id)?id:null;
 }catch{return null;}
}
export async function fetchDealerDriveWorkbook(source:string):Promise<File> {
 const id=dealerDriveFileId(source);
 if(!id)throw new Error('Informe um link válido do Google Drive para o estoque.');
 const user=auth.currentUser;
 if(!user)throw new Error('Entre no MOTYQ antes de conectar o Google Drive.');
 if(!user.providerData.some(p=>p.providerId==='google.com')){
  throw new Error('Para liberar o Drive, é necessário vincular o Google à conta MOTYQ. A conexão ainda não está disponível neste login.');
 }
 const provider=new GoogleAuthProvider();
 provider.addScope('https://www.googleapis.com/auth/drive.readonly');
 const result=await reauthenticateWithPopup(user,provider);
 const accessToken=GoogleAuthProvider.credentialFromResult(result)?.accessToken;
 if(!accessToken)throw new Error('O Google não autorizou acesso de leitura ao Drive.');
 // OAuth access stays in memory only for the duration of this operation.
 const endpoint='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id);
 const headers={Authorization:'Bearer '+accessToken};
 const metaResponse=await fetch(endpoint+'?fields=id,name,mimeType,size,modifiedTime',{headers,cache:'no-store'});
 if(!metaResponse.ok)throw new Error(metaResponse.status===403?'O Google não concedeu acesso a esse arquivo.':'Não foi possível consultar o arquivo no Drive.');
 const meta:any=await metaResponse.json();
 const accepted=['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel.sheet.macroEnabled.12'];
 if(!accepted.includes(meta.mimeType)){
  throw new Error('Este arquivo precisa estar no formato Excel XLSX ou XLSM, não convertido em Google Sheets.');
 }
 if(!Number.isFinite(Number(meta.size))||Number(meta.size)<=0||Number(meta.size)>MAX_BYTES){
  throw new Error('O arquivo de estoque excede 42 MB ou não informa o tamanho.');
 }
 const resultFile=await fetch(endpoint+'?alt=media',{headers,cache:'no-store'});
 if(!resultFile.ok)throw new Error('Não foi possível baixar o estoque autorizado pelo Drive.');
 const payload=await resultFile.blob();
 if(payload.size<=0||payload.size>MAX_BYTES)throw new Error('Arquivo vazio ou acima do limite de 42 MB.');
 const extension=meta.mimeType==='application/vnd.ms-excel.sheet.macroEnabled.12'?'.xlsm':'.xlsx';
 const original=String(meta.name||'Estoque Dealer').replace(/[\\/]+/g,'_').slice(0,120);
 const filename=/\.(xlsm|xlsx)$/i.test(original)?original:original+extension;
 return new File([payload],filename,{type:meta.mimeType});
}
