import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const src=readFileSync('services/marketIqMesaPricePattern.ts','utf8');
const panel=readFileSync('components/MarketIqIntelligentHistoryPanel.tsx','utf8');
const mobile=readFileSync('components/MarketIqMobileExperience.tsx','utf8');
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
assert.equal(js.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const {deriveMesaPricePattern}=await import('data:text/javascript;base64,'+Buffer.from(js.outputText).toString('base64'));
const row=(id,plate,price,extra={})=>({
 id,source:'AutoAvaliar',date:'2026-10-22',plate,brand:'JEEP',model:'COMPASS',
 version:'1.3 T270 FLEX LONGITUDE AT6',year:2025,km:28000,status:'AVALIADO',
 assessed:price,paid:null,fipe:138930,grade:'exato',eligible:true,paidBasis:'none',...extra
});
const events=[
 row('a1','FLA9J14',98000,{date:'2026-10-20'}),
 row('a2','FLA9J14',98000,{date:'2026-10-22'}),
 row('b','ABC1D23',98000),row('c','DEF2G34',98000),
 row('d1','STN3A34',98000,{source:'Motyq IQ',paid:98000,assessed:null,paidBasis:'approved'}),
 row('d2','STN3A34',98000,{date:'2026-10-21'}),
 row('e','XYZ4H56',105000),
 row('f','HJK5M67',105000,{source:'Motyq IQ',paid:108000,assessed:null,paidBasis:'approved'})
];
const p=deriveMesaPricePattern(events,25000);
assert.equal(p.assessmentEvents,8);
assert.equal(p.uniqueVehicles,6,'Repeated plates count once as unique vehicles');
assert.equal(p.repeatedPlateEvents,2);
assert.equal(p.typicalQuote,98000);
assert.equal(p.typicalCount,4,'Four independent vehicles support 98k, not six separate events');
assert.equal(p.typicalShare,4/6);
assert.equal(p.operationalSuggestion,98000);
assert.equal(p.paidVehicles,2);
assert.equal(p.confirmedPaidMedian,103000,'Paid median remains distinct from assessed-value mode');
assert.equal(p.maxPaid,108000,'Maximum paid only comes from actual paid records');
assert.equal(p.maxPaidPlate,'HJK5M67');
assert.equal(p.exceptions,1,'Unusually high paid outcomes flagged as exceptional candidates');
const onlyRepeated=[
 row('x1','AAA1B11',98000),row('x2','AAA1B11',98000),row('x3','AAA1B11',98000),
 row('x4','AAA1B11',98000),row('x5','AAA1B11',98000),row('x6','AAA1B11',98000),
 row('y','BBB2C22',105000),row('z','CCC3D33',105000)
];
const dup=deriveMesaPricePattern(onlyRepeated,25000);
assert.equal(dup.uniqueVehicles,3);
assert.equal(dup.typicalQuote,105000,'6 repeated quotes for same plate never overwhelm 2 different vehicles');
assert.equal(dup.operationalSuggestion,105000);
assert.equal(dup.maxPaid,null,'No purchases => no claimed historical paid maximum');
const one=deriveMesaPricePattern([row('one','DDD4E44',98000)],25000);
assert.equal(one.operationalSuggestion,null,'Single car not sufficient for buying recommendation');
assert.equal(one.confidence,'sem_amostra');
const two=deriveMesaPricePattern([row('one','DDD4E44',98000),row('two','EEE5F55',98000)],25000);
assert.equal(two.operationalSuggestion,98000);
assert.equal(two.confidence,'baixa','Warn when suggestion only has two unique cars');
const off=deriveMesaPricePattern([...events,row('other','QWE5G55',50000,{grade:'relacionado'})],25000);
assert.equal(off.assessmentEvents,8,'Other versions never enter the operational reference');
const distant=deriveMesaPricePattern([...events,row('far','QWE5G55',50000,{km:200000})],25000);
assert.equal(distant.assessmentEvents,8,'Distant odometer values never affect typical purchase estimate');
assert.ok(panel.includes('deriveMesaPricePattern'));
assert.ok(panel.includes('pattern.operationalSuggestion'));
assert.ok(panel.includes('pattern.maxPaid'));
assert.ok(panel.includes('pattern.repeatedPlateEvents'));
assert.ok(mobile.includes('Modelo estatístico · não calibrado pela Mesa'));
console.log('Motyq IQ Mesa pattern: repeat plates, typical 98k, exceptional paid 108k, independent evidence passed.');
