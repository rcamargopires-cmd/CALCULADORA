import React,{useMemo,useState} from 'react';
import {
 getWebmotorsCaptureBookmarklet,parseVisibleWebmotorsText,
 type VisibleOffer,type OfferTarget
} from '../services/marketIqAssistedOffers';

const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const number=(n:number)=>n.toLocaleString('pt-BR');
export default function MarketIqAssistedCapturePanel({
 target,onImport
}:{target:OfferTarget;onImport:(offers:VisibleOffer[])=>void}){
 const [text,setText]=useState('');
 const [hasAnalyzed,setHasAnalyzed]=useState(false);
 const [notice,setNotice]=useState('');
 const report=useMemo(()=>hasAnalyzed?parseVisibleWebmotorsText(text,target):null,[hasAnalyzed,text,target.brand,target.model,target.year,target.km,target.vehicleType,target.versionLabel]);
 const enabled=Boolean(target.brand&&target.model&&target.year>=1990&&target.km>0);
 const copyShortcut=async()=>{
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Clipboard indisponível');
   await navigator.clipboard.writeText(getWebmotorsCaptureBookmarklet());
   setNotice('Código do atalho copiado. Crie um favorito chamado “Capturar Webmotors” e cole o código no endereço desse favorito.');
  }catch{
   setNotice('Seu navegador impediu a cópia automática. Use a opção Colar lista logo abaixo, que não precisa de extensão nem atalho.');
  }
 };
 const importDraft=()=>{
  if(!enabled||!report?.offers.length)return;
  onImport(report.offers);
  setNotice(report.offers.length+' oferta(s) adicionada(s) como PENDENTES. Abra cada anúncio individual e informe seu link antes de confirmar o preço.');
  setHasAnalyzed(false);setText('');
 };
 return <details className="mb-4 rounded-xl border border-slate-200 bg-white text-slate-950" aria-label="Captura assistida de ofertas da Webmotors">
  <summary className="cursor-pointer px-4 py-3 text-sm font-black text-cyan-900">
   Capturar preços e KM da Webmotors <span className="ml-2 text-xs font-normal text-slate-600">Sem API paga ou instalação de extensão</span>
  </summary>
  <div className="space-y-4 border-t border-slate-200 p-4">
   <p className="text-sm leading-6 text-slate-700">
    Use a página de resultados já filtrada por versão, ano, região e menor preço.
    Aqui, os anúncios entram para conferência, não como compras ou preços aprovados.
   </p>
   <div className="grid gap-3 lg:grid-cols-2">
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
     <p className="text-sm font-bold">Opção 1 · Capturar com um favorito do navegador</p>
     <p className="mt-1 text-xs leading-5 text-slate-700">
      Configure uma vez: copie o atalho, crie um favorito no navegador e cole o código copiado no
      campo de endereço do favorito. Quando estiver vendo os carros na Webmotors, clique nesse favorito.
      Ele tentará transferir até 12 anúncios visíveis, incluindo link, preço, KM e ano.
     </p>
     <button type="button" onClick={()=>void copyShortcut()}
      className="mt-3 rounded-lg border border-cyan-700 bg-white px-4 py-2.5 text-xs font-bold text-cyan-900 hover:bg-cyan-50">
      Copiar atalho de captura
     </button>
     <p className="mt-2 text-[11px] text-slate-600">
      Somente página pública da Webmotors, ativação manual e confirmação antes de enviar.
      Se o site não expuser os links individuais, use a opção 2.
     </p>
    </div>
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
     <p className="text-sm font-bold">Opção 2 · Colar lista de ofertas</p>
     <p className="mt-1 text-xs leading-5 text-slate-700">
      Na lista da Webmotors pressione <strong>Ctrl+A, Ctrl+C</strong>. Volte ao Motyq
      e use <strong>Ctrl+V</strong> abaixo. O Motyq separará preço, KM, ano e versão,
      sem precisar cadastrar cada linha.
     </p>
     <label className="mt-3 block text-xs font-bold text-slate-800">
      Texto copiado da página
      <textarea rows={3} value={text} maxLength={160000}
       onChange={e=>{setText(e.target.value);setHasAnalyzed(false);setNotice('');}}
       placeholder="Cole aqui a lista copiada da Webmotors"
       className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-900"/>
     </label>
     <button type="button" disabled={!enabled||!text.trim()}
      onClick={()=>{setHasAnalyzed(true);setNotice('');}}
      className="mt-2 rounded-lg bg-cyan-800 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
      Identificar ofertas
     </button>
    </div>
   </div>
   {notice&&<p role="status" className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs font-semibold text-cyan-950">{notice}</p>}
   {report&&<div className="rounded-lg border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <p className="text-sm font-bold">{report.offers.length} oferta(s) aproveitável(is) · {report.found} cartão(ões) localizado(s)</p>
     {report.meanLowestFive!==null&&<p className="text-sm font-black">Média dos menores: {money(report.meanLowestFive)}</p>}
    </div>
    {!report.offers.length&&<p className="mt-2 text-xs font-semibold text-amber-900">
     Não foi possível identificar ofertas compatíveis na cópia. Confira se ela contém anúncios,
     com marca/modelo, ano, preço e KM, e se a versão selecionada é a mesma da avaliação.
    </p>}
    {report.offers.length>0&&<>
     <p className="mt-2 text-xs text-amber-900">
      Leitura preliminar da página copiada. Sem URL individual, não é possível confirmar a
      existência, preço atual ou procedência de cada veículo.
     </p>
     <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
       <thead className="bg-slate-50 text-slate-700">
        <tr><th className="px-2 py-2">Preço</th><th className="px-2 py-2">KM</th>
         <th className="px-2 py-2">Ano-modelo</th><th className="px-2 py-2">Versão/local</th></tr>
       </thead>
       <tbody>{report.offers.slice(0,10).map((ad,i)=><tr key={ad.index} className="border-t border-slate-100">
        <td className="px-2 py-2 font-bold">{money(ad.price)}</td>
        <td className="px-2 py-2">{number(ad.km)} km</td>
        <td className="px-2 py-2">{ad.modelYear}</td>
        <td className="px-2 py-2">{ad.version||'Não identificada'} · {ad.location||'Local não informado'}</td>
       </tr>)}</tbody>
      </table>
     </div>
     <button type="button" onClick={importDraft}
      className="mt-3 rounded-lg bg-slate-800 px-4 py-2.5 text-xs font-bold text-white">
      Adicionar como pendentes à comparação
     </button>
    </>}
    {report.rejected.length>0&&<p className="mt-3 text-[11px] text-slate-600">
     Descartados: {report.rejected.map(x=>x.reason+' ('+x.count+')').join(' · ')}
    </p>}
   </div>}
   <p className="text-[11px] leading-5 text-slate-600">
    Importante: a captura não faz consulta automática ao catálogo privado da Webmotors,
    não contorna bloqueios e não substitui a verificação de anúncio, versão ou histórico.
    Só anúncios individuais revisados e marcados como válidos entram na precificação definitiva.
   </p>
  </div>
 </details>;
}
