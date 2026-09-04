const providers=[
  {name:'fipeonline',url:'https://fipeonline.com.br/placa/'},
  {name:'puxaplaca',url:'https://puxaplaca.com.br/placa'},
  {name:'fipeplaca',url:'https://www.fipeplaca.com.br/'},
];

const extractScripts=(html:string)=>[...html.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).filter(Boolean);
const interesting=(text:string)=>Array.from(new Set([
  ...[...text.matchAll(/https?:\/\/[^"'`\s)]+/gi)].map(m=>m[0]),
  ...[...text.matchAll(/\/(?:api|placa|consulta|vehicle|veiculo|fipe)[A-Za-z0-9_?&=\/.\-{}:${}]+/gi)].map(m=>m[0]),
])).filter(value=>/api|placa|consulta|vehicle|veiculo|fipe/i.test(value)).slice(0,120);
const snippets=(text:string,needle:string)=>{
  const lower=text.toLowerCase(), target=needle.toLowerCase();
  const out:string[]=[]; let i=0;
  while((i=lower.indexOf(target,i))>=0&&out.length<12){out.push(text.slice(Math.max(0,i-220),Math.min(text.length,i+420)));i+=target.length;}
  return out;
};

export default async function handler(req:any,res:any){
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
  const results:any[]=[];
  for(const provider of providers){
    try{
      const response=await fetch(provider.url,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; Motyq-MarketIQ/1.0)','Accept':'text/html,application/xhtml+xml'}});
      const html=await response.text();
      const scripts=extractScripts(html);
      const row:any={name:provider.name,status:response.status,url:response.url,length:html.length,scripts:scripts.slice(-30),pageInteresting:interesting(html),scriptInteresting:[]};
      if(provider.name==='fipeplaca'&&response.ok){
        const test=await fetch('https://www.fipeplaca.com.br/?placa=BZR3B06',{headers:{'User-Agent':'Mozilla/5.0 (compatible; Motyq-MarketIQ/1.0)','Accept':'text/html,application/xhtml+xml'}});
        const testHtml=await test.text();
        row.testPlate={status:test.status,url:test.url,length:testHtml.length,containsPlate:testHtml.includes('BZR3B06'),tCross:snippets(testHtml,'T-Cross'),fipe:snippets(testHtml,'FIPE'),plate:snippets(testHtml,'BZR3B06')};
        const origin=new URL(response.url).origin;
        const candidates=scripts.filter(src=>src.includes('/_next/static/chunks/app/')||src.includes('/_next/static/chunks/')).slice(-12);
        for(const src of candidates){
          try{
            const scriptUrl=new URL(src,origin).toString();
            const sr=await fetch(scriptUrl,{headers:{'User-Agent':'Mozilla/5.0 (compatible; Motyq-MarketIQ/1.0)'}});
            const js=await sr.text();
            const hits=interesting(js);
            const sn=[...snippets(js,'fetch('),...snippets(js,'axios'),...snippets(js,'plate'),...snippets(js,'placa')].slice(0,12);
            if(hits.length||sn.length) row.scriptInteresting.push({src,status:sr.status,hits,snippets:sn});
          }catch{}
        }
      }
      results.push(row);
    }catch(error:any){
      results.push({name:provider.name,status:0,error:String(error?.message||error)});
    }
  }
  return res.status(200).json({results});
}
