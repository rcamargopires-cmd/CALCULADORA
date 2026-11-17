/** Match a confirmed AutoAvaliar description with one FIPE model option.
 * No price/trim/year is selected automatically; a Mesa operator must click
 * to accept the unique exact equivalent. Ambiguous options return null.
 */
export type ExpressFipeCatalogOption={code:string;name:string};
/** Use distinctive models when OCR sees the vehicle title but misses the make.
 * Restrict inference to unequivocally known model names.
 */
export function resolvedExpressBrand(rawBrand:string,model:string):string{
 const recognized=String(rawBrand||'').trim();
 if(recognized)return recognized;
 return /^\s*TERA\b/i.test(String(model||''))?'VOLKSWAGEN':'';
}
const foldedBrand=(v:string)=>String(v||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
/** FIPE providers call the same manufacturer VW, Volkswagen or VW-Volkswagen.
 * A match MUST be unique and cannot refer to the model or a related group.
 */
export function uniqueExpressFipeBrand(
 extractedBrand:string,brands:readonly ExpressFipeCatalogOption[]
):ExpressFipeCatalogOption|null{
 const expected=foldedBrand(extractedBrand);
 if(!expected||!Array.isArray(brands))return null;
 const aliases=expected==='VOLKSWAGEN'||expected==='VW'?
  new Set(['VOLKSWAGEN','VW','VWVOLKSWAGEN','VOLKSWAGENVW']):
  new Set([expected]);
 const matches=brands.filter(item=>String(item.code||'').trim()&&aliases.has(foldedBrand(item.name)));
 return matches.length===1?matches[0]:null;
}

const tokens=(value:string):string[]=>{
 const normalized=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toUpperCase().replace(/(\d)[.,](\d)/g,'$1DOT$2')
  .replace(/\b(?:AUTOMATICO|AUTOMATICA|AUTOMAT|AUT|AT)\b/g,'AUTO')
  .replace(/\b(?:PORTAS|PORTA)\b/g,'')
  .replace(/[^A-Z0-9]+/g,' ')
  .trim().split(/\s+/).filter(t=>t&&t!=='4P'&&t!=='5P');
 return [...new Set(normalized)].sort();
};
/** AutoAvaliar uses the marketing engine name Firefly and says Manual,
 * whereas FIPE calls this specific model "ARGO DRIVE 1.0 6V Flex".
 * This explicit alias is restricted to that trim and engine. Never apply
 * the same removal of transmission/valve terms across unrelated vehicles.
 */
function isVerifiedArgoDrive10Alias(extracted:string,option:string):boolean{
 const source=tokens(extracted),candidate=tokens(option);
 const expectedOption=tokens('ARGO DRIVE 1.0 6V FLEX');
 if(candidate.join('|')!==expectedOption.join('|'))return false;
 const required=tokens('ARGO DRIVE 1.0 FLEX MANUAL');
 const allowed=new Set([...required,'FIREFLY']);
 return required.every(t=>source.includes(t))&&source.every(t=>allowed.has(t));
}

/** On AutoAvaliar: "POLO 1.0 MPI TRACK MANUAL"; FIPE catalog:
 * "Polo Track 1.0 Flex 12V 5p" (FIPE 005540-9). Strictly require Polo,
 * Track, 1.0, MPI and a manual transmission in the original heading.
 * FIPE years and fuel still require operator confirmation.
 */
function isVerifiedPoloTrack10Alias(extracted:string,option:string):boolean{
 const source=tokens(extracted),candidate=tokens(option);
 const target=tokens('POLO TRACK 1.0 FLEX 12V 5P');
 if(candidate.join('|')!==target.join('|'))return false;
 const required=tokens('POLO TRACK 1.0 MPI MANUAL');
 const allowed=new Set([...required,'FLEX']);
 return required.every(t=>source.includes(t))&&source.every(t=>allowed.has(t));
}

export function suggestUniqueExpressFipeModel(
 extractedModel:string,options:readonly ExpressFipeCatalogOption[]
):ExpressFipeCatalogOption|null{
 const desired=tokens(extractedModel);
 if(desired.length<3||!Array.isArray(options)||!options.length)return null;
 const signature=desired.join('|');
 const matching=options.filter(item=>String(item.code||'').trim()&&tokens(item.name).join('|')===signature);
 if(matching.length===1)return matching[0];
 if(matching.length>1)return null;
 const aliasMatches=options.filter(item=>String(item.code||'').trim()&&
  (isVerifiedArgoDrive10Alias(extractedModel,item.name)||
   isVerifiedPoloTrack10Alias(extractedModel,item.name)));
 // Even a verified model-name alias is a *suggestion*. The operator chooses
 // the FIPE model and then its year/fuel before any FIPE value can be used.
 return aliasMatches.length===1?aliasMatches[0]:null;
}
