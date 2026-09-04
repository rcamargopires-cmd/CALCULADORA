const providers=[
  {name:'fipeonline',url:'https://fipeonline.com.br/placa/'},
  {name:'puxaplaca',url:'https://puxaplaca.com.br/placa'},
  {name:'fipeplaca',url:'https://www.fipeplaca.com.br/'},
];

const inspect=(html:string)=>({
  forms:[...html.matchAll(/<form[^>]*action=["']([^"']*)["'][^>]*>/gi)].map(m=>m[1]),
  scripts:[...html.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).filter(Boolean).slice(-30),
  fetches:[...html.matchAll(/fetch\s*\(\s*["']([^"']+)["']/gi)].map(m=>m[1]),
  apiLike:Array.from(new Set([...html.matchAll(/(?:https?:\/\/[^"'\s<]+|\/(?:wp-json|api|ajax)[^"'\s<]*)/gi)].map(m=>m[0]))).slice(0,60),
  inputs:[...html.matchAll(/<input[^>]*name=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).slice(0,30),
});

export default async function handler(req:any,res:any){
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
  const results=[];
  for(const provider of providers){
    try{
      const response=await fetch(provider.url,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; Motyq-MarketIQ/1.0)','Accept':'text/html,application/xhtml+xml'}});
      const html=await response.text();
      results.push({name:provider.name,status:response.status,url:response.url,length:html.length,...inspect(html)});
    }catch(error:any){
      results.push({name:provider.name,status:0,error:String(error?.message||error)});
    }
  }
  return res.status(200).json({results});
}
