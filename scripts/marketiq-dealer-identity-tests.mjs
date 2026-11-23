import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('services/marketIqDealerModelIdentity.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
assert.equal(js.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length||0,0);
const m=await import('data:text/javascript;base64,'+Buffer.from(js.outputText).toString('base64'));
const family=(brand,model)=>m.dealerModelFamily(brand,model);
const groups=[
 // Dealer V44 categories and counts, using only model/brand fixtures, never actual plates.
 {brand:'TOYOTA',expected:'COROLLA CROSS',items:[
  ['CCROSS XRE 20',3],['CCROSS XRX HYBRID',1],['COROLLA / CCROSS XRE 2.0',1],['Corolla Cross XRV Hibrido',1]]},
 {brand:'TOYOTA',expected:'COROLLA',items:[['COROLLA XEI20FLEX',7]]},
 {brand:'GM',expected:'ONIX',items:[['ONIX 10MT HB',11]]},
 {brand:'GM',expected:'ONIX PLUS',items:[['ONIX PLUS 10MT LT2',3]]},
 {brand:'CHERY',expected:'TIGGO 5X',items:[['TIGGO 5X TXS',2]]},
 {brand:'CHERY',expected:'TIGGO 7',items:[['TIGGO 7 SPORT',7]]},
 {brand:'CHERY',expected:'TIGGO 8',items:[['TIGGO 8 PHEV',4]]},
 {brand:'OMODA',expected:'OMODA 5',items:[['OMODA 5 LUXURY HEV',3]]},
 {brand:'OMODA',expected:'OMODA 7',items:[['OMODA 7 PRESTIGE PHEV',2]]},
 {brand:'OMODA',expected:'OMODA E5',items:[['OMODA E5 EV',1]]},
 {brand:'HYUNDAI',expected:'HB20',items:[
  ['HB20 1.0M COMFOR',12],['NEW HB20 1.0M LIMITED',1],['HB2010TA S.E.',1]]},
 {brand:'HYUNDAI',expected:'HB20S',items:[['HB20S 10TA FE COM',2],['NEW HB20S 1.0 LIMITED',2]]},
 {brand:'HYUNDAI',expected:'HB20X',items:[['HB20X STYLE 1.6',2]]},
 {brand:'VOLKSWAGEN',expected:'SAVEIRO',items:[['VW/SAVEIRO CS RB MF',5],['SAVEIRO ROBUST CS',1],['NOVA SAVEIRO RB MBVS',1]]},
 {brand:'AUDI',expected:'Q3',items:[['Q3 SPB PERFOR 2.0 TFSI',3],['AUDI SPB Q3 2.0 TFSI',1]]},
 {brand:'AUDI',expected:'Q5',items:[['Q5 SB P-HIBRIDO',5],['AUDI Q5 SB 2.0 TFSI',1]]},
 {brand:'AUDI',expected:'A5',items:[['A5 SPB 2.0TFSI S',2],['AUDI A5 2.0 TFSI',1]]},
 {brand:'NISSAN',expected:'SENTRA',items:[['SENTRA',1],['NISSAN SENTRA ADV CVT',1]]},
 {brand:'HONDA',expected:'CITY HATCH',items:[['CITY HATCH EXL',2]]},
 {brand:'HONDA',expected:'CITY',items:[['CITY TOURING',1]]},
 {brand:'CITROEN',expected:'C3',items:[['C3 FEEL PK AT',4]]},
 {brand:'CITROEN',expected:'C3 AIRCROSS',items:[['C3 AIRCROSS 1.0 TURBO',1]]},
 {brand:'CITROEN',expected:'C4 CACTUS',items:[['C4 CACTUS 1.6 THP',1]]},
 {brand:'CITROEN',expected:'C4 LOUNGE',items:[['C4 LOUNGE THP EXCLUSIVE',1]]},
 {brand:'FORD',expected:'TERRITORY',items:[['FORD TERRITORY TIT',2]]},
 {brand:'VOLKSWAGEN',expected:'T-CROSS',items:[
  ['VW/T CROSS HL TSI',10],['T CROSS SENSE TSI',8],
  ['T-CROSS COMFORT TSI',4],['VW/T-CROSS TSI',1]]},
 {brand:'HYUNDAI',expected:'CRETA',items:[
  ['CRETA 1.0 TGDI LIMITED AT',17],['NEW CRETA 1.0L TGDI AT LIMITED',12],
  ['NOVO CRETA 1.0L TGDI COMFORT AT',5],['CRETA1TA COMFORT',1]]}
];
const flat=groups.flatMap(group=>group.items.flatMap(([model,count])=>
 Array.from({length:count},()=>({brand:group.brand,model,expected:group.expected}))));
for(const row of flat)assert.equal(family(row.brand,row.model),row.expected,row.brand+' '+row.model);
const count=(brand,fam)=>flat.filter(v=>m.dealerCanonicalBrand(v.brand)===m.dealerCanonicalBrand(brand)&&
 family(v.brand,v.model)===fam).length;
for(const group of groups)assert.equal(count(group.brand,group.expected),
 group.items.reduce((sum,[,n])=>sum+n,0),group.brand+' '+group.expected);
assert.equal(count('TOYOTA','COROLLA CROSS'),6);
assert.equal(count('TOYOTA','COROLLA'),7);
assert.equal(count('GM','ONIX'),11);
assert.equal(count('GM','ONIX PLUS'),3);
assert.deepEqual(['TIGGO 5X','TIGGO 7','TIGGO 8'].map(f=>count('CHERY',f)),[2,7,4]);
assert.deepEqual(['OMODA 5','OMODA 7','OMODA E5'].map(f=>count('OMODA',f)),[3,2,1]);
assert.deepEqual(['HB20','HB20S','HB20X'].map(f=>count('HYUNDAI',f)),[14,4,2]);
assert.equal(count('VOLKSWAGEN','T-CROSS'),23);
assert.equal(count('HYUNDAI','CRETA'),35);
assert.equal(m.dealerCanonicalBrand('GM - Chevrolet'),'CHEVROLET');
assert.equal(m.dealerCanonicalBrand('VW - Volkswagen'),'VOLKSWAGEN');
assert.notEqual(m.dealerCanonicalBrand('GMC'),'CHEVROLET');
assert.equal(family('VOLKSWAGEN','T-ROC 1.4 TSI'),'T-ROC');
assert.equal(family('VOLKSWAGEN','TCROSS 200 TSI'),'T-CROSS');
assert.equal(family('VOLKSWAGEN','I/VW TAOS HL TSI'),'TAOS');
assert.equal(family('VOLKSWAGEN','NEW BEETLE 2.0'),'NEW');
assert.equal(family('VOLKSWAGEN','NIVUS HL'),'NIVUS');
assert.equal(family('TOYOTA','HILUX 2.8'),'HILUX');
assert.equal(family('FORD','KA SE 1.0'),'KA');
assert.equal(family('VOLKSWAGEN','UP! MOVE'),'UP');
assert.equal(family('AUDI','A3 SPORTBACK'),'A3');
assert.equal(family('AUDI','Q8 E-TRON'),'Q8');
assert.equal(m.dealerModelReviewReason('OMODA','GS3/GS3 ELITE').length>0,true,
 'Inconsistent make must warn, never remap to GAC');
assert.equal(m.dealerCanonicalBrand('OMODA'),'OMODA');
assert.equal(family('OMODA','GS3/GS3 ELITE'),'GS3');
assert.ok(m.dealerModelReviewReason('HYUNDAI','HB2010TA S.E.'));
assert.ok(m.dealerModelReviewReason('HYUNDAI','CRETA1TA COMFORT'));
assert.equal(m.dealerModelReviewReason('HYUNDAI','HB20 1.0M COMFOR'),'');
console.log('Dealer V44 model identity: '+flat.length+
 ' synthetic rows, 27 groups, aliases and 14 audit findings verified.');
