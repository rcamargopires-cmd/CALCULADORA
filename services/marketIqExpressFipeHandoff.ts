/** Match a confirmed AutoAvaliar description with one FIPE model option.
 * No price/trim/year is selected automatically; a Mesa operator must click
 * to accept the unique exact equivalent. Ambiguous options return null.
 */
export type ExpressFipeCatalogOption={code:string;name:string};
const tokens=(value:string):string[]=>{
 const normalized=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toUpperCase().replace(/(\d)[.,](\d)/g,'$1DOT$2')
  .replace(/\b(?:AUTOMATICO|AUTOMATICA|AUTOMAT|AUT|AT)\b/g,'AUTO')
  .replace(/\b(?:PORTAS|PORTA)\b/g,'')
  .replace(/[^A-Z0-9]+/g,' ')
  .trim().split(/\s+/).filter(t=>t&&t!=='4P'&&t!=='5P');
 return [...new Set(normalized)].sort();
};
export function suggestUniqueExpressFipeModel(
 extractedModel:string,options:readonly ExpressFipeCatalogOption[]
):ExpressFipeCatalogOption|null{
 const desired=tokens(extractedModel);
 if(desired.length<3||!Array.isArray(options)||!options.length)return null;
 const signature=desired.join('|');
 const matching=options.filter(item=>String(item.code||'').trim()&&tokens(item.name).join('|')===signature);
 // A suggestion is valid only if exactly one FIPE code matches this model
 // and trim. Never guess between Flex/Gasolina, XEi/Altis or motor variants.
 return matching.length===1?matching[0]:null;
}
