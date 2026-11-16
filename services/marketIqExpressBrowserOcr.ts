import {parseAutoAvaliarOcrText} from './marketIqExpressOcrParser';
import type {ExpressVehicleExtract} from './marketIqExpress';

/** OCR stays on the buyer's browser/device. No screenshots are sent to Motyq servers.
 * Downloaded Tesseract engine and Portuguese/English language files are cached by the browser.
 */
type OcrWorker={recognize:(source:string,options?:object,output?:{tsv?:boolean})=>Promise<{data:{text:string;tsv?:string;confidence?:number}}>;terminate:()=>Promise<void>};
type Engine={createWorker:(langs:string|string[],mode?:number,opts?:{logger?:(event:any)=>void})=>Promise<OcrWorker>};
const SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
let loader:Promise<Engine>|null=null,workerPromise:Promise<OcrWorker>|null=null;
let progressListener:((status:string)=>void)|null=null;

async function loadEngine():Promise<Engine>{
 if(loader)return loader;
 loader=new Promise<Engine>((resolve,reject)=>{
  const existing=(window as Window&{Tesseract?:Engine}).Tesseract;
  if(existing){resolve(existing);return;}
  const script=document.createElement('script');
  script.src=SCRIPT;script.async=true;script.crossOrigin='anonymous';
  script.onload=()=>{
   const engine=(window as Window&{Tesseract?:Engine}).Tesseract;
   if(engine)resolve(engine);
   else reject(new Error('Biblioteca de leitura não carregou corretamente.'));
  };
  script.onerror=()=>reject(new Error('Não consegui carregar o leitor de imagens. Verifique a internet e tente novamente.'));
  document.head.appendChild(script);
 }).catch(err=>{loader=null;throw err;});
 return loader;
}
async function getWorker(onStatus:(status:string)=>void):Promise<OcrWorker>{
 progressListener=onStatus;
 if(!workerPromise){
  workerPromise=loadEngine().then(engine=>engine.createWorker(['por','eng'],1,{
   logger:(event:any)=>{
    if(event?.status==='recognizing text'&&typeof event.progress==='number'){
     progressListener?.('Lendo os campos: '+Math.round(event.progress*100)+'%');
    }else if(event?.status==='loading language traineddata')progressListener?.('Preparando o idioma do leitor…');
   }
  })).catch(err=>{workerPromise=null;throw err;});
 }
 return workerPromise;
}
async function toHighResolutionDataUrl(file:File):Promise<string>{
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise<void>((resolve,reject)=>{
   img.onload=()=>resolve();
   img.onerror=()=>reject(new Error('Não foi possível abrir o print.'));
   img.src=url;
  });
  const max=Math.max(img.naturalWidth,img.naturalHeight);
  const scale=Math.min(2,2900/max);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  if(canvas.width*canvas.height>18000000)throw new Error('Imagem muito grande. Recorte apenas a ficha do veículo.');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Não foi possível preparar a imagem no navegador.');
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/png');
 }finally{URL.revokeObjectURL(url);}
}
export async function readExpressPrintLocally(file:File,onStatus:(status:string)=>void):Promise<ExpressVehicleExtract>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Selecione um print PNG, JPG ou WebP.');
 if(file.size>12*1024*1024)throw new Error('Recorte uma imagem menor que 12 MB.');
 onStatus('Preparando a imagem no navegador…');
 const image=await toHighResolutionDataUrl(file);
 onStatus('Carregando reconhecimento local. Na primeira leitura, pode baixar os idiomas…');
 const worker=await getWorker(onStatus);
 const output=await worker.recognize(image,{}, {tsv:true});
 if(!output.data.text.trim())throw new Error('A imagem não contém texto reconhecível. Amplie a área do veículo e tente novamente.');
 return parseAutoAvaliarOcrText(output.data.text,output.data.tsv);
}
