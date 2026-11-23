/**
 * Dealer V44 model identity, shared by Radar and the IQ pricing desk.
 * These conservative aliases group model families for inventory display ONLY:
 * never infer FIPE code, year, trim, market price or purchase approval.
 * Manufacturer name and the original Dealer model remain unchanged.
 */
export const dealerFold=(raw:string):string=>String(raw||'')
 .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
 .replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');

export const dealerCanonicalBrand=(raw:string):string=>{
 const brand=dealerFold(raw);
 if(/^(?:VOLKSWAGEN|VW|VW VOLKSWAGEN)$/.test(brand))return 'VOLKSWAGEN';
 if(/^(?:GM|CHEVROLET|GM CHEVROLET|CHEVROLET GM)$/.test(brand))return 'CHEVROLET';
 if(brand==='CAOA CHERY'||brand==='CHERY CAOA')return 'CHERY';
 return brand;
};

const ownBrandPrefix=(make:string):RegExp|null=>{
 switch(make){
  case 'VOLKSWAGEN':return /^(?:(?:I\s+)?VW|VOLKSWAGEN)\s+/;
  case 'CHEVROLET':return /^(?:GM(?:\s+CHEVROLET)?|CHEVROLET)\s+/;
  case 'AUDI':return /^AUDI\s+/;
  case 'NISSAN':return /^NISSAN\s+/;
  case 'FORD':return /^FORD\s+/;
  case 'TOYOTA':return /^TOYOTA\s+/;
  case 'HYUNDAI':return /^HYUNDAI\s+/;
  case 'CITROEN':return /^CITROEN\s+/;
  case 'OMODA':return /^OMODA\s+/;
  case 'JAECOO':return /^JAECOO\s+/;
  case 'HONDA':return /^HONDA\s+/;
  case 'FIAT':return /^FIAT\s+/;
  case 'RENAULT':return /^RENAULT\s+/;
  case 'CHERY':return /^(?:CAOA\s+)?CHERY\s+/;
  case 'JEEP':return /^JEEP\s+/;
  default:return null;
 }
};

/** A readable, search-safe model label after removing only well-known,
 * manufacturer-scoped Dealer prefixes. No trim/engine equivalence is claimed.
 */
export const dealerModelDescription=(brand:string,raw:string):string=>{
 const make=dealerCanonicalBrand(brand);
 let value=dealerFold(raw);
 const prefix=ownBrandPrefix(make);
 if(prefix)value=value.replace(prefix,'');
 if(make==='VOLKSWAGEN')value=value
  .replace(/^TCROSS(?:\s|$)/,'T CROSS ')
  .replace(/^TROC(?:\s|$)/,'T ROC ');
 if(make==='HYUNDAI')value=value
  .replace(/^(?:NEW|NOVO)\s+(?=CRETA(?:\s|$)|HB20(?:\s|$)|HB20S(?:\s|$))/,'');
 if(make==='VOLKSWAGEN')value=value.replace(/^NOVA\s+(?=SAVEIRO(?:\s|$))/,'');
 if(make==='AUDI')value=value.replace(/^SPB\s+(?=Q[358](?:\s|$))/,'');
 if(make==='TOYOTA')value=value
  .replace(/^(?:CCROSS|C CROSS|COROLLA CCROSS)(?:\s|$)/,'COROLLA CROSS ');
 value=value.replace(/^ECO SPORT(?:\s|$)/,'ECOSPORT ');
 return value.trim().replace(/\s+/g,' ');
};

/** Strict model family; trims and powertrains remain independent characteristics. */
export const dealerModelFamily=(brand:string,raw:string):string=>{
 const make=dealerCanonicalBrand(brand);
 const name=dealerModelDescription(brand,raw);
 if(!make||!name)return '';
 if(make==='VOLKSWAGEN'){
  if(/^T CROSS(?:\s|$)/.test(name))return 'T-CROSS';
  if(/^T ROC(?:\s|$)/.test(name))return 'T-ROC';
 }
 if(make==='HYUNDAI'){
  if(/^CRETA1TA(?:\s|$)/.test(name))return 'CRETA';
  if(/^HB2010TA(?:\s|$)/.test(name))return 'HB20';
  if(/^HB20S(?:\s|$)/.test(name))return 'HB20S';
  if(/^HB20X(?:\s|$)/.test(name))return 'HB20X';
  if(/^HB20(?:\s|$)/.test(name))return 'HB20';
 }
 if(make==='TOYOTA'){
  if(/^COROLLA CROSS(?:\s|$)/.test(name))return 'COROLLA CROSS';
  if(/^COROLLA(?:\s|$)/.test(name))return 'COROLLA';
 }
 if(make==='CHEVROLET'){
  if(/^ONIX PLUS(?:\s|$)/.test(name))return 'ONIX PLUS';
  if(/^ONIX(?:\s|$)/.test(name))return 'ONIX';
 }
 if(make==='CHERY'){
  const match=name.match(/^TIGGO\s+(5X|7|8)(?:\s|$)/);
  if(match)return 'TIGGO '+match[1];
 }
 if(make==='OMODA'){
  const match=name.match(/^(E5|5|7)(?:\s|$)/);
  if(match)return 'OMODA '+match[1];
 }
 if(make==='HONDA'){
  if(/^CITY HATCH(?:\s|$)/.test(name))return 'CITY HATCH';
  if(/^CITY(?:\s|$)/.test(name))return 'CITY';
  if(/^HR V(?:\s|$)/.test(name))return 'HR-V';
  if(/^WR V(?:\s|$)/.test(name))return 'WR-V';
 }
 if(make==='CITROEN'){
  if(/^C3 AIRCROSS(?:\s|$)/.test(name))return 'C3 AIRCROSS';
  if(/^C3(?:\s|$)/.test(name))return 'C3';
  if(/^C4 CACTUS(?:\s|$)/.test(name))return 'C4 CACTUS';
  if(/^C4 LOUNGE(?:\s|$)/.test(name))return 'C4 LOUNGE';
 }
 if(make==='FORD'&&/^ECOSPORT(?:\s|$)/.test(name))return 'ECOSPORT';
 if(make==='HONDA'&&/^CG\s+\d{2,4}(?:\s|$)/.test(name))return 'CG';
 const first=name.split(' ')[0]||'';
 // Preserve short official models: Ford Ka, VW Up!, Audi Q3/A5 etc.
 if(first.length>=3||/^[A-Z]\d$/.test(first)||
  (make==='FORD'&&first==='KA')||
  (make==='VOLKSWAGEN'&&first==='UP'))return first;
 return '';
};

/** Exceptional Dealer descriptions requiring human review, never auto-correct. */
export const dealerModelReviewReason=(brand:string,model:string):string=>{
 const make=dealerCanonicalBrand(brand),name=dealerModelDescription(brand,model);
 if(make==='OMODA'&&/^GS3(?:\s|$)/.test(name))
  return 'Marca OMODA com modelo GS3: conferir cadastro original no Dealer.';
 if(make==='HYUNDAI'&&/^HB2010TA(?:\s|$)/.test(name))
  return 'Descrição HB2010TA abreviada: confirmar família HB20 e versão no Dealer.';
 if(make==='HYUNDAI'&&/^CRETA1TA(?:\s|$)/.test(name))
  return 'Descrição CRETA1TA abreviada: confirmar versão no Dealer.';
 return '';
};
