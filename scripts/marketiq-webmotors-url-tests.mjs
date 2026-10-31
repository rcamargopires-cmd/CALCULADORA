import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const src=readFileSync('services/marketIqWebmotorsUrl.ts','utf8');
const output=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
assert.equal((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {buildWebmotorsSearchUrl,validateWebmotorsSearchUrl}=await import(
 'data:text/javascript;base64,'+Buffer.from(output.outputText).toString('base64')
);
const exact='https://www.webmotors.com.br/carros/sp/fiat/titano/22-turbo-diesel-ranch-4x4-at6/de.2025/ate.2025?tipoveiculo=carros&estadocidade=S%C3%A3o%20Paulo&marca1=fiat&modelo1=titano&versao1=22-turbo-diesel-ranch-4x4-at6&o=5&page=1&anode=2025&anoate=2025';
assert.equal(validateWebmotorsSearchUrl(exact).valid,true);
const mobi='https://www.webmotors.com.br/carros/sp/fiat/mobi/10-firefly-flex-drive-gsr/de.2020?tipoveiculo=carros&estadocidade=S%C3%A3o%20Paulo&marca1=fiat';
assert.equal(validateWebmotorsSearchUrl(mobi).valid,true,'Real user URL with only de.2020 must be accepted');

assert.equal(new URL(validateWebmotorsSearchUrl(exact).url).searchParams.get('versao1'),'22-turbo-diesel-ranch-4x4-at6');
assert.equal(validateWebmotorsSearchUrl('http://www.webmotors.com.br/carros/sp/fiat/titano').valid,false);
assert.equal(validateWebmotorsSearchUrl('https://webmotors.com.br.evil.com/carros/sp/fiat/titano').valid,false);
assert.equal(validateWebmotorsSearchUrl('https://example.com/carros/sp/fiat/titano').valid,false);
assert.equal(validateWebmotorsSearchUrl('https://www.webmotors.com.br/comprar/fiat/titano/ranch/2025/12345678').valid,false);
const generated=buildWebmotorsSearchUrl({brand:'Fiat',model:'Titano Ranch 2.2 Diesel',year:2025,state:'sp'});
assert.equal(validateWebmotorsSearchUrl(generated).valid,true);
assert.match(generated,/\/fiat\/titano\/de\.2025\/ate\.2025/);
assert.equal(new URL(generated).searchParams.get('page'),'1');
assert.equal(buildWebmotorsSearchUrl({brand:'Fiat',model:'Titano',year:0}), '');
const screen=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
assert.ok(screen.includes('desk_webmotors_url_scan'));
assert.ok(screen.includes('Pesquisar na Webmotors'));
assert.ok(screen.includes('Opção avançada: usar um link específico da Webmotors'));
assert.ok(screen.includes('void scanExactWebmotorsUrl();'));
assert.ok(!screen.includes('Piloto: pesquisar pela URL exata da Webmotors'));
assert.ok(screen.includes('Nenhum preço foi inventado'));
const backend=readFileSync('api/marketiq-market-scan.ts','utf8');
assert.ok(backend.includes("if (req.body?.action === 'desk_webmotors_url_scan')"));
assert.ok(backend.includes("redirect:'manual'"));
assert.ok(backend.includes("application\\/ld\\+json"));
console.log('MarketIQ Webmotors simplified pilot: URL validation and one-click integration checks passed.');
