import {parseAutoAvaliarOcrText,plateAnchorFromVehicleTsv,normalizePlateFromIsolatedCrop,plateFromLabelledVehicleText} from './marketIqExpressOcrParser';
import type {ExpressVehicleExtract} from './marketIqExpress';
import {isMotyqInterfaceScreenshot} from './marketIqExpressScreenshotGuard';

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
 detail:string;reference:string;rating:string;plateContext:string;
 plateAt:(anchor:{top:number;height:number})=>string;
 plateValueAt:(anchor:{top:number;height:number;left?:number;width?:number})=>string;
 plateContextAt:(anchor:{top:number;height:number})=>string;
 plateContextValueAt:(anchor:{top:number;height:number;left?:number;width?:number})=>string;
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
  const contextRect={x:0.50,y:0.06,w:0.27,h:0.22};
  const contextScale=Math.min(6,2000/(width*contextRect.w));
  return {
   detail:crop(detailRect.x,detailRect.y,detailRect.w,detailRect.h),
   reference:crop(0.775,0.59,0.21,0.41),
   // Blue/green condition score card is separate from vehicle table.
   rating:crop(0.765,0.18,0.23,0.49),
   // If OCR misses the label, show a wider context rather than the WRONG row.
   plateContext:crop(contextRect.x,contextRect.y,contextRect.w,contextRect.h,6),
   plateAt:(anchor)=>{
    const center=height*detailRect.y+(anchor.top+anchor.height/2)/detailScale;
    const labelHeight=Math.max(7,anchor.height/detailScale);
    const margin=Math.max(5,labelHeight*0.7);
    const top=Math.max(0,center-margin);
    const bottom=Math.min(height,center+margin);
    return crop(0.50,top/height,0.27,(bottom-top)/height,8);
   },
   // OCR only the right-aligned value; a combined "Placa URC6A47"
   // single-line recognition often includes the label and is rejected.
   plateValueAt:(anchor)=>{
    const center=height*detailRect.y+(anchor.top+anchor.height/2)/detailScale;
    const rowHeight=Math.max(7,anchor.height/detailScale);
    const top=Math.max(0,center-rowHeight*0.80-2);
    const bottom=Math.min(height,center+rowHeight*0.85+2);
    const cardLeft=width*detailRect.x,cardRight=width*(detailRect.x+detailRect.w);
    const labelRight=(anchor.left!==undefined&&anchor.width!==undefined)?
      cardLeft+(anchor.left+anchor.width+12)/detailScale:cardLeft+detailRect.w*width*0.50;
    const valueStart=Math.max(cardLeft+detailRect.w*width*0.50,labelRight);
    const valueRight=cardRight-3;
    return crop(valueStart/width,top/height,Math.max(0.01,(valueRight-valueStart)/width),
      Math.max(0.01,(bottom-top)/height),9);
   },
   // Separate high-resolution pass around the origin/plate/year rows.
   // Anchors here are measured relative to the *context* crop, not detail.
   plateContextAt:(anchor)=>{
    const center=height*contextRect.y+(anchor.top+anchor.height/2)/contextScale;
    const rowHeight=Math.max(7,anchor.height/contextScale);
    const top=Math.max(0,center-rowHeight*0.95-2);
    const bottom=Math.min(height,center+rowHeight*0.95+2);
    return crop(contextRect.x,top/height,contextRect.w,
      Math.max(0.01,(bottom-top)/height),8);
   },
   plateContextValueAt:(anchor)=>{
    const center=height*contextRect.y+(anchor.top+anchor.height/2)/contextScale;
    const rowHeight=Math.max(7,anchor.height/contextScale);
    const top=Math.max(0,center-rowHeight*0.95-2);
    const bottom=Math.min(height,center+rowHeight*0.95+2);
    const cardLeft=width*contextRect.x,cardRight=width*(contextRect.x+contextRect.w);
    const labelRight=cardLeft+(anchor.left+anchor.width+12)/contextScale;
    const valueStart=Math.max(cardLeft+width*contextRect.w*0.49,labelRight);
    return crop(valueStart/width,top/height,
      Math.max(0.01,(cardRight-valueStart-3)/width),
      Math.max(0.01,(bottom-top)/height),9);
   }
  };
 }finally{URL.revokeObjectURL(url);}
}
/** One extra local pass for low-contrast plate characters. Kept in memory. */
async function enhancePlateContrast(source:string):Promise<string>{
 const image=new Image();
 await new Promise<void>((resolve,reject)=>{
  image.onload=()=>resolve();image.onerror=()=>reject(new Error('Falha na ampliação da placa.'));
  image.src=source;
 });
 const canvas=document.createElement('canvas');
 canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)return source;
 ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 for(let i=0;i<pixels.data.length;i+=4){
  const gray=pixels.data[i]*0.299+pixels.data[i+1]*0.587+pixels.data[i+2]*0.114;
  const boosted=Math.max(0,Math.min(255,Math.round((gray-140)*2+140)));
  pixels.data[i]=boosted;pixels.data[i+1]=boosted;pixels.data[i+2]=boosted;
 }
 ctx.putImageData(pixels,0,0);
 return canvas.toDataURL('image/png');
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
 if(isMotyqInterfaceScreenshot(output.data.text))
  throw new Error('Este print parece ser da tela do Motyq, e não da ficha do AutoAvaliar. Volte ao AutoAvaliar, capture a ficha com placa, ano e KM usando Win+Shift+S, depois cole aqui.');
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
   const plateAnchor=plateAnchorFromVehicleTsv(detailTsv);
   // Never label an arbitrary cropped area as the plate if the row
   // itself was not located. The fallback remains OCR-only.
   onPlateZoom?.(plateAnchor?regions.plateAt(plateAnchor):null);
   onStatus('Conferindo FIPE e referências no painel direito…');
   const ref=await worker.recognize(regions.reference,{}, {tsv:true});
   referenceText=ref.data.text;referenceTsv=ref.data.tsv||'';
 }
 let extracted=parseAutoAvaliarOcrText(output.data.text,output.data.tsv,detailText,detailTsv,referenceText,referenceTsv);
 let ratingText='';
 if(extracted.conditionScore===null&&regions){
  onStatus('Lendo a nota de avaliação no quadro lateral…');
  try{
   const scoreResult=await worker.recognize(regions.rating);
   ratingText=scoreResult.data.text||'';
   if(ratingText.trim())extracted=parseAutoAvaliarOcrText(
    output.data.text,output.data.tsv,detailText,detailTsv,referenceText,referenceTsv,undefined,ratingText);
  }catch{/* Rating is optional; never discard vehicle data. */}
 }
 // A full-image OCR can read a small plate like SVP0A03 as SVPGAG3, and then
 // discard it. Only when that happens, analyze its narrow value row at high scale.
 if(!extracted.plate&&regions){
  onStatus('Conferindo a placa em um recorte maior do AutoAvaliar…');
  let contextAnchor:ReturnType<typeof plateAnchorFromVehicleTsv>=null;
  try{
   // The small original may keep TERA/year/KM legible while losing the tiny
   // Placa label or the seven-character value. Reread the original card
   // context in high resolution, with OCR positions instead of fixed rows.
   const context=await worker.recognize(regions.plateContext,{}, {tsv:true});
   const contextText=context.data.text||'',contextTsv=context.data.tsv||'';
   contextAnchor=plateAnchorFromVehicleTsv(contextTsv);
   const contextPlate=plateFromLabelledVehicleText(contextText,contextTsv);
   if(contextPlate){
    extracted=parseAutoAvaliarOcrText(
     output.data.text,output.data.tsv,detailText,detailTsv,
     referenceText,referenceTsv,contextPlate.plate,ratingText);
    if(contextPlate.corrected&&!extracted.warnings.some(w=>w.includes('caracteres possivelmente confundidos')))
     extracted.warnings.push('Placa lida com correção de caracteres. Confira visualmente com o AutoAvaliar.');
   }
  }catch{/* The original OCR data remain available for manual review. */}
  if(extracted.plate)return extracted;
  const label=plateAnchorFromVehicleTsv(detailTsv);
  // Never perform single-line plate OCR on an arbitrary multi-row panel.
  // Only use an image explicitly anchored by Placa or by Origem/Ano geometry.
  const plateImage=label?regions.plateValueAt(label):
   contextAnchor?regions.plateContextValueAt(contextAnchor):'';
  if(!label&&contextAnchor)onPlateZoom?.(regions.plateContextAt(contextAnchor));
  if(!plateImage)return extracted;
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
  // Retry with high contrast when single-line OCR misses the seven characters.
  // These extra reads run only on the user's device, with no paid AI.
  if(!normalizePlateFromIsolatedCrop(isolatedPlateText)){
   try{
    onStatus('Conferindo a placa com contraste ampliado…');
    const enhanced=await enhancePlateContrast(plateImage);
    let configuredContrast=false;
    try{
     await worker.setParameters({tessedit_pageseg_mode:'8',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
     configuredContrast=true;
    }catch{}
    try{
     const contrastResult=await worker.recognize(enhanced);
     if(normalizePlateFromIsolatedCrop(contrastResult.data.text||''))isolatedPlateText=contrastResult.data.text;
    }finally{
     if(configuredContrast)await worker.setParameters({tessedit_pageseg_mode:'3',tessedit_char_whitelist:''}).catch(()=>{});
    }
   }catch{/* OCR fallback cannot invalidate other recognized vehicle details. */}
  }
  // One final contextual pass helps when the value crop clipped a character.
  // The wider crop is allowed only when anchored to the vehicle-card label.
  if(!normalizePlateFromIsolatedCrop(isolatedPlateText)&&label){
   try{
    let configuredContext=false;
    try{await worker.setParameters({tessedit_pageseg_mode:'6'});configuredContext=true;}catch{}
    try{
     const contextual=await worker.recognize(regions.plateAt(label));
     if(normalizePlateFromIsolatedCrop(contextual.data.text||''))isolatedPlateText=contextual.data.text;
    }finally{
     if(configuredContext)await worker.setParameters({tessedit_pageseg_mode:'3',tessedit_char_whitelist:''}).catch(()=>{});
    }
   }catch{}
  }
  // Reject cropped text unless it normalizes to an exact Brazilian plate
  // shape; otherwise keep the manual plate review.
  if(normalizePlateFromIsolatedCrop(isolatedPlateText))
   extracted=parseAutoAvaliarOcrText(output.data.text,output.data.tsv,detailText,detailTsv,referenceText,referenceTsv,isolatedPlateText,ratingText);
 }
 return extracted;
}
