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
 // Normalize the AutoAvaliar manufacturer to the FIPE label used by Mesa.
 if(/^(?:GM\s*[-/]?\s*)?CHEVROLET$/i.test(recognized)||/^GM$/i.test(recognized))return 'GM - Chevrolet';
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
  (expected==='CHEVROLET'||expected==='GM'||expected==='GMCHEVROLET'||expected==='CHEVROLETGM')?
  new Set(['CHEVROLET','GM','GMCHEVROLET','CHEVROLETGM']):
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

/** AutoAvaliar calls the manual Polo "1.6 MSI TOTAL FLEX MANUAL".
 * FIPE calls the same non-automatic trim "Polo 1.6 MSI Flex 16V 5p",
 * code 005478-0. Its automatic sibling has a different code.
 *
 * This is a deliberately narrow alias, not a fuzzy match: all engine,
 * powertrain and model tokens must be present, and the candidate may
 * contain only the known FIPE version names. The operator still confirms.
 */
function isVerifiedPoloMsi16ManualAlias(extracted:string,option:string):boolean{
 const source=tokens(extracted),candidate=tokens(option);
 const acceptedCandidates=[
  tokens('POLO 1.6 MSI FLEX 16V 5P').join('|'),
  tokens('POLO 1.6 MSI TOTAL FLEX 16V 5P').join('|')
 ];
 if(!acceptedCandidates.includes(candidate.join('|')))return false;
 const required=tokens('POLO 1.6 MSI FLEX MANUAL');
 const allowed=new Set([...required,'TOTAL']);
 return required.every(t=>source.includes(t))&&source.every(t=>allowed.has(t));
}

/** The AutoAvaliar 2024/2025 Creta heading describes the 1.0 TGDI
 * Limited Flex AUTOMÁTICO. FIPE labels that variant "Creta Limited
 * 1.0 TB 12V Flex Aut." (015203-0). Allow only this exact equivalence,
 * never Platinum, Ultimate, Comfort, N Line or other displacements.
 * Year and fuel still require explicit user confirmation.
 */
function isVerifiedCretaLimited10TgdiAutoAlias(extracted:string,option:string):boolean{
 const source=tokens(extracted),candidate=tokens(option);
 const targetNames=[
  'CRETA LIMITED 1.0 TB 12V FLEX AUT',
  'CRETA LIMITED 1.0 TGDI 12V FLEX AUT'
 ];
 if(!targetNames.some(name=>candidate.join('|')===tokens(name).join('|')))return false;
 const required=tokens('CRETA 1.0 TGDI FLEX LIMITED AUTOMATICO');
 const allowed=new Set(required);
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
   isVerifiedPoloTrack10Alias(extractedModel,item.name)||
   isVerifiedPoloMsi16ManualAlias(extractedModel,item.name)||
   isVerifiedCretaLimited10TgdiAutoAlias(extractedModel,item.name)));
 // Even a verified model-name alias is a *suggestion*. The operator chooses
 // the FIPE model and then its year/fuel before any FIPE value can be used.
 return aliasMatches.length===1?aliasMatches[0]:null;
}
