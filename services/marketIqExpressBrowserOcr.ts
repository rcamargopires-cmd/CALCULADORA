import {parseAutoAvaliarOcrText,plateLabelFromTsv} from './marketIqExpressOcrParser';
import type {ExpressVehicleExtract} from './marketIqExpress';

/** OCR stays on the buyer's browser/device. No screenshots are sent to Motyq servers.
 * Downloaded Tesseract engine and Portuguese/English language files are cached by the browser.
 */
type OcrWorker={recognize:(source:string,options?:object,output?:{tsv?:boolean})=>Promise<{data:{text:string;tsv?:string;confidence?:number}}>;setParameters:(params:Record<string,string>)=>Promise<void>;terminate:()=>Promise<void>};
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
/** The full AutoAvaliar screenshot uses tiny text. Recover the vehicle table and
 * the reference card separately at higher pixel density, instead of assuming
 * that text read in page order remains adjacent to its label.
 */
type ScreenshotRegions={
 detail:string;reference:string;plateContext:string;
 plateAt:(anchor:{top:number;height:number})=>string;
};
async function screenshotRegions(file:File):Promise<ScreenshotRegions|null>{
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();
   image.onerror=()=>reject(new Error('Não foi possível abrir a imagem.'));
   image.src=url;
  });
  const width=image.naturalWidth,height=image.naturalHeight;
  if(width<1000||width/height<1.65||width/height>3.5)return null;
  const crop=(x:number,y:number,w:number,h:number,maxScale=4)=>{
   const scale=Math.min(maxScale,2000/(width*w));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(width*w*scale));
   canvas.height=Math.max(1,Math.round(height*h*scale));
   const ctx=canvas.getContext('2d');
   if(!ctx)throw new Error('Não consegui ampliar a ficha para leitura.');
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(image,width*x,height*y,width*w,height*h,0,0,canvas.width,canvas.height);
   return canvas.toDataURL('image/png');
  };
  // AutoAvaliar shifts the vehicle card horizontally when side menus and
  // screenshots are cropped. Read the left-hand "Placa" label plus the value.
  const detailRect={x:0.49,y:0.005,w:0.28,h:0.745};
  const detailScale=Math.min(4,2000/(width*detailRect.w));
  return {
   detail:crop(detailRect.x,detailRect.y,detailRect.w,detailRect.h),
   reference:crop(0.775,0.59,0.21,0.41),
   // If OCR misses the label, show a wider context rather than the WRONG row.
   plateContext:crop(0.50,0.06,0.27,0.22,6),
   plateAt:(anchor)=>{
    const center=height*detailRect.y+(anchor.top+anchor.height/2)/detailScale;
    const labelHeight=Math.max(7,anchor.height/detailScale);
    const top=Math.max(0,center-labelHeight-6);
    const bottom=Math.min(height,center+labelHeight*1.2+6);
    return crop(0.50,top/height,0.27,(bottom-top)/height,8);
   }
  };
 }finally{URL.revokeObjectURL(url);}
}
export async function readExpressPrintLocally(file:File,onStatus:(status:string)=>void,onPlateZoom?:(image:string|null)=>void):Promise<ExpressVehicleExtract>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Selecione um print PNG, JPG ou WebP.');
 if(file.size>12*1024*1024)throw new Error('Recorte uma imagem menor que 12 MB.');
 onPlateZoom?.(null);
 onStatus('Preparando a imagem no navegador…');
 const image=await toHighResolutionDataUrl(file);
 onStatus('Carregando reconhecimento local. Na primeira leitura, pode baixar os idiomas…');
 const worker=await getWorker(onStatus);
 const output=await worker.recognize(image,{}, {tsv:true});
 if(!output.data.text.trim())throw new Error('A imagem não contém texto reconhecível. Amplie a área do veículo e tente novamente.');
 let detailText='',detailTsv='',referenceText='',referenceTsv='';
 let regions:ScreenshotRegions|null=null;
 // In real screenshots the first OCR pass can miss "Fotos Lista" and
 // "Itens avaliados". Use the known geometric layout instead of gating all
 // enlarged reads on those tiny labels.
 regions=await screenshotRegions(file);
 if(regions){
   onStatus('Conferindo a ficha do veículo em tamanho ampliado…');
   const detail=await worker.recognize(regions.detail,{}, {tsv:true});
   detailText=detail.data.text;detailTsv=detail.data.tsv||'';
   const plateAnchor=plateLabelFromTsv(detailTsv);
   onPlateZoom?.(plateAnchor?regions.plateAt(plateAnchor):regions.plateContext);
   onStatus('Conferindo FIPE e referências no painel direito…');
   const ref=await worker.recognize(regions.reference,{}, {tsv:true});
   referenceText=ref.data.text;referenceTsv=ref.data.tsv||'';
 }
 let extracted=parseAutoAvaliarOcrText(output.data.text,output.data.tsv,detailText,detailTsv,referenceText,referenceTsv);
 // A full-image OCR can read a small plate like SVP0A03 as SVPGAG3, and then
 // discard it. Only when that happens, analyze its narrow value row at high scale.
 if(!extracted.plate&&regions){
  onStatus('Ampliando a linha da placa para uma última conferência…');
  const label=plateLabelFromTsv(detailTsv);
  const plateImage=label?regions.plateAt(label):regions.plateContext;
  let isolatedPlateText='';
  // Changing page segmentation can fail on some Tesseract.js workers.
  // OCR itself must STILL run with default settings if that happens.
  let configured=false;
  try{
   await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
   configured=true;
  }catch{ /* Retry recognition with the worker's current settings. */ }
  try{
   const plateResult=await worker.recognize(plateImage);
   isolatedPlateText=plateResult.data.text||'';
  }catch{
   // Optional plate recognition must not discard year, KM or FIPE.
  }finally{
   if(configured)await worker.setParameters({tessedit_pageseg_mode:'3',tessedit_char_whitelist:''}).catch(()=>{});
  }
  // OCR often adds whitespace or punctuation to the tiny plate, so try
  // a tightly normalized single value before treating it as missing.
  if(!isolatedPlateText.trim()){
   try{
    const basic=await worker.recognize(plateImage);
    isolatedPlateText=basic.data.text||'';
   }catch{}
  }
  if(isolatedPlateText.trim())
   extracted=parseAutoAvaliarOcrText(output.data.text,output.data.tsv,detailText,detailTsv,referenceText,referenceTsv,isolatedPlateText);
 }
 return extracted;
}
