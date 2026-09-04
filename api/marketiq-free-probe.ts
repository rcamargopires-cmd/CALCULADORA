import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
  try{
    const response=await fetch('https://fipeonline.com.br/placa/',{headers:{'User-Agent':'Mozilla/5.0 (compatible; Motyq-MarketIQ/1.0)'}});
    const html=await response.text();
    const forms=[...html.matchAll(/<form[^>]*action=["']([^"']*)["'][^>]*>/gi)].map(m=>m[1]);
    const scripts=[...html.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).filter(Boolean);
    const fetches=[...html.matchAll(/fetch\s*\(\s*["']([^"']+)["']/gi)].map(m=>m[1]);
    const apiLike=[...html.matchAll(/(?:https?:\/\/[^"'\s<]+|\/(?:wp-json|api|ajax)[^"'\s<]*)/gi)].map(m=>m[0]);
    return res.status(200).json({status:response.status,forms,scripts:scripts.slice(-20),fetches,apiLike:Array.from(new Set(apiLike)).slice(0,50)});
  }catch(error:any){
    return res.status(500).json({error:'probe_failed',message:String(error?.message||error)});
  }
}
