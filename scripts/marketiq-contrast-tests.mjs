import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(path)=>readFileSync(path,'utf8');
const css=source('motyq-iq-contrast.css');
const html=source('index.html');
const app=source('App.tsx');
const management=source('components/MarketIqManagementDashboard.tsx');
const consulted=source('components/MarketIqConsultedRepasse.tsx');
const approvals=source('components/MarketIqApprovalCenter.tsx');
const tabs=source('components/ManualPricingWorkspace.tsx');
assert.ok(html.includes('/motyq-iq-contrast.css'),'Missing high contrast stylesheet');
assert.ok(html.indexOf('/motyq-iq-contrast.css')>html.indexOf('/motyq-theme.css'),'High contrast must load after Graphite');
assert.equal((app.match(/motyq-iq-workspace min-h-screen/g)||[]).length,2,'Only IQ roots must use the override');
for(const [name,src] of [['Management',management],['Repasse',consulted],['Approvals',approvals]]){
 for(const cls of ['motyq-iq-hero','motyq-iq-hero-eyebrow','motyq-iq-hero-title','motyq-iq-hero-description'])
   assert.ok(src.includes(cls),name+' missing '+cls);
}
assert.ok(tabs.includes('motyq-iq-tabs'),'IQ nav needs dedicated contrast scope');
for(const selector of ['motyq-iq-tabs button[aria-current="page"]','motyq-iq-hero-title','motyq-iq-hero-description','motyq-iq-hero-status'])
  assert.ok(css.includes(selector),'Missing '+selector);
const luminance=(hex)=>{
 const channel=(n)=>{const c=n/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4};
 const c=hex.match(/[0-9a-f]{2}/gi).map(n=>channel(parseInt(n,16)));
 return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;
};
const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
const checks=[
 ['hero title', '#ffffff','#153e54'],
 ['hero description','#e5f0f8','#153e54'],
 ['hero eyebrow','#97efff','#153e54'],
 ['selected nav','#ffffff','#153f51'],
 ['inactive nav','#3a4d64','#ffffff'],
 ['test caption','#4b6078','#ffffff'],
 ['muted card copy','#52647b','#ffffff'],
 ['form field','#152d40','#ffffff'],
 ['status badge','#103c51','#effbff'],
];
for(const [name,text,bg] of checks){
 const measured=ratio(text,bg);
 assert.ok(measured>=4.5,name+' contrast '+measured.toFixed(2)+' is below 4.5:1');
}
console.log('MarketIQ contrast: styles scoped and '+checks.length+' color pairs pass 4.5:1 WCAG AA contrast.');
