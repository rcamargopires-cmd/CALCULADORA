import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const transpile=(source,jsx=false,label='source')=>{
 const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,
  module:ts.ModuleKind.ESNext,...(jsx?{jsx:ts.JsxEmit.ReactJSX}:{})},reportDiagnostics:true});
 const parseErrors=out.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)||[];
 if(parseErrors.length)console.error('PARSE ERRORS IN '+label+'\n'+ts.formatDiagnosticsWithColorAndContext(parseErrors,{
   getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'
 }));
 assert.equal(parseErrors.length,0,'Source must parse: '+label);
 return out.outputText;
};
const moduleUrl=(code)=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const buyerSource=readFileSync('services/marketIqCotacaoMesaBuyers.ts','utf8');
const serviceSource=readFileSync('services/marketIqBuyerRegistration.ts','utf8');
const publicSource=readFileSync('components/PublicCotacaoMesaBuyerForm.tsx','utf8');
const index=readFileSync('index.tsx','utf8');
const panel=readFileSync('components/MarketIqConsultedRepasse.tsx','utf8');
for(const [name,src,jsx] of [
 ['buyer',buyerSource,false],['registration',serviceSource,false],
 ['public-form',publicSource,true],['index',index,true],['internal-panel',panel,true]
])transpile(src,jsx,name);
const buyerModule=moduleUrl(transpile(buyerSource));
const serviceModule=moduleUrl(transpile(serviceSource).replaceAll("'./marketIqCotacaoMesaBuyers'","'"+buyerModule+"'"));
const api=await import(serviceModule);
const one={shop:'São Bento Veículos',contact:'João Pereira',whatsapp:'(15) 99999-1234',
 region:'Sorocaba-SP',email:'compras@empresa.com.br',brands:'Jeep, Toyota',
 models:'Compass, Hilux SRX',segments:'SUV, Picape',vehicleType:'car',
 yearFrom:'2019',yearTo:'2026',maxKm:'100000',budgetTo:'140000',optedIn:true};
const code=api.createPublicBuyerCode(one);
assert.ok(code.startsWith('MOTYQBUYER1.'));
const parsed=api.parsePublicBuyerCode('MENSAGEM PARA MESA\n'+api.buyerRegistrationMessage(one));
assert.equal(parsed.shop,one.shop,'UTF-8 names survive message');
assert.equal(parsed.contact,one.contact);
assert.equal(parsed.brands,one.brands);
assert.equal(parsed.segments,one.segments);
assert.equal(parsed.budgetTo,one.budgetTo);
assert.equal(parsed.whatsapp,'5515999991234');
assert.equal(parsed.optedIn,true);
assert.equal(api.publicBuyerFormUrl('https://app.motyq.com.br'), 'https://app.motyq.com.br/cotacao-mesa/cadastro');
assert.ok(api.validatePublicBuyer({...one,optedIn:false})?.includes('consentimento'));
assert.ok(api.validatePublicBuyer({...one,whatsapp:'123'})?.includes('WhatsApp'));
assert.ok(api.validatePublicBuyer({...one,shop:''})?.includes('loja'));
assert.ok(api.validatePublicBuyer({...one,brands:'',models:'',segments:''})?.includes('categoria'));
assert.ok(api.validatePublicBuyer({...one,yearFrom:'2027',yearTo:'2022'})?.includes('Ano mínimo maior'));
assert.throws(()=>api.parsePublicBuyerCode('MOTYQBUYER1.fake'),/Código de cadastro não encontrado/);
assert.throws(()=>api.parsePublicBuyerCode('MOTYQBUYER1.'+'A'.repeat(150)),/não pôde ser conferido/);
assert.ok(!serviceSource.includes('fetch('),'No anonymous public write endpoint');
assert.ok(!publicSource.includes('firebase'),'Public form bypasses login and Firestore');
assert.ok(!publicSource.includes('localStorage'),'Public page does not persist contact data');
assert.ok(publicSource.includes('Compartilhar pelo WhatsApp'));
assert.ok(publicSource.includes('Seus dados ainda não foram enviados nem cadastrados no Motyq.'));
assert.ok(publicSource.includes('Sem assinatura ou custo'));
assert.ok(index.includes('window.location.pathname')&&index.includes('PUBLIC_BUYER_PATH'));
assert.ok(index.includes('<PublicCotacaoMesaBuyerForm />'));
assert.ok(panel.includes('Copiar link do formulário'));
assert.ok(panel.includes('Conferir cadastro recebido'));
assert.ok(panel.includes('Confirmar e adicionar à carteira'));
assert.ok(panel.includes('parsePublicBuyerCode(registrationText)'));
assert.ok(panel.includes('saveCotacaoBuyers(buyerScope,next)'));
assert.ok(panel.includes('Não há novas leituras ou gravações no Firestore.'));
assert.ok(panel.includes('Código de importação')===false,'Import code label belongs to public page');
const heroCss=readFileSync('public-cotacao-mesa.css','utf8');
assert.ok(index.includes("import './public-cotacao-mesa.css';"),
 'Public theme override must be loaded after shared app styles');
assert.ok(publicSource.includes('motyq-buyer-public-page'));
for(const selector of ['motyq-buyer-public-hero','motyq-buyer-hero-heading',
 'motyq-buyer-hero-description','motyq-buyer-hero-eyebrow','motyq-buyer-hero-benefits']){
 assert.ok(publicSource.includes(selector),'Hero markup must expose '+selector);
 assert.ok(heroCss.includes(selector),'Hero override must be scoped to '+selector);
}
assert.ok(heroCss.includes('#root main.motyq-buyer-public-page'),'Hero styles must not leak into IQ');
const luminance=(hex)=>{
 const rgb=hex.replace('#','').match(/../g).map(n=>parseInt(n,16)/255);
 return rgb.map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4)
 .reduce((total,value,i)=>total+value*[0.2126,0.7152,0.0722][i],0);
};
const background=luminance('#153444');
for(const [role,hex] of [['heading','#ffffff'],['description','#e2e8f0'],
 ['eyebrow','#67e8f9'],['benefits','#cffafe']]){
 const lum=luminance(hex);
 const contrast=(Math.max(lum,background)+0.05)/(Math.min(lum,background)+0.05);
 assert.ok(contrast>=4.5,role+' must be WCAG AA readable on dark blue: '+contrast);
 assert.ok(heroCss.includes('color: '+hex+' !important;'),
  role+' needs a strong override to avoid dark-on-navy styles');
}
console.log('Cotação Mesa public buyer form: Unicode roundtrip, permissions, buyer interests, invalid inputs, manual WhatsApp share, operator review/import and no Firestore writes passed.');
