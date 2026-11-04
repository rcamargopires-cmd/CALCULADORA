import React,{useMemo,useState} from 'react';
import {
 getWebmotorsCaptureBookmarklet,parseVisibleWebmotorsText,inspectWebmotorsPaste,
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
 const pasteKind=useMemo(()=>inspectWebmotorsPaste(text),[text]);
 const pastedOnlyAddress=pasteKind==='search-url-only';
 const pastedCaptureCode=pasteKind==='bookmarklet-code';
 const invalidPaste=pastedOnlyAddress||pastedCaptureCode;
 const report=useMemo(()=>hasAnalyzed?parseVisibleWebmotorsText(text,target):null,[hasAnalyzed,text,target.brand,target.model,target.year,target.km,target.vehicleType,target.versionLabel]);
 const enabled=Boolean(target.brand&&target.model&&target.year>=1990&&target.km>0);
 const copyShortcut=async()=>{
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Clipboard indisponível');
   await navigator.clipboard.writeText(getWebmotorsCaptureBookmarklet());
   setNotice('Atalho copiado! Ele NÃO deve ser colado no campo da opção 2. No Chrome, crie um favorito chamado Capturar Webmotors, edite o endereço desse favorito, cole o código e clique nele quando estiver na página da Webmotors.');
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
    A versão, o ano, a região e a ordem por menor preço já vêm da pesquisa.
    Para trazer preço e KM, o Motyq precisa ler os cartões dos anúncios, não apenas o endereço da página.
    As ofertas entram pendentes de conferência, nunca como compra aprovada.
   </p>
   <div className="grid gap-3 lg:grid-cols-2">
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
     <p className="text-sm font-bold">Opção 1 · Capturar anúncios com um favorito do navegador</p>
     <p className="mt-1 text-xs font-black text-cyan-900">O código copiado vai no endereço de um FAVORITO do Chrome, não no formulário do Motyq.</p>
     <p className="mt-1 text-xs leading-5 text-slate-700">
      Mais confiável quando o site só permite copiar o link da pesquisa.
      Configure o atalho uma única vez e, com os anúncios abertos na Webmotors, clique no favorito.
      Ele tentará transferir até 12 anúncios visíveis com link individual, preço, KM e ano.
     </p>
     <button type="button" onClick={()=>void copyShortcut()}
      className="mt-3 rounded-lg border border-cyan-700 bg-white px-4 py-2.5 text-xs font-bold text-cyan-900 hover:bg-cyan-50">
      Copiar atalho de captura
     </button>
     <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800">
      <summary className="cursor-pointer font-bold text-cyan-900">Como criar o favorito no Chrome (uma vez)</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 leading-5">
       <li>Clique em <strong>Copiar atalho de captura</strong> aqui no Motyq.</li>
       <li>Pressione <strong>Ctrl+D</strong> e salve um favorito chamado Capturar Webmotors.</li>
       <li>Abra o gerenciador de favoritos com <strong>Ctrl+Shift+O</strong>, localize o favorito e escolha <strong>Editar</strong>.</li>
       <li>No campo URL/endereço do favorito, substitua o endereço pelo código copiado e salve.</li>
       <li>Volte à página dos anúncios na Webmotors e clique no favorito.</li>
      </ol>
     </details>
     <p className="mt-2 text-[11px] text-slate-600">
      Funciona somente após seu clique e sua confirmação, sem consulta oculta.
      Se a Webmotors não expuser anúncios individuais, a captura pode retornar zero.
     </p>
    </div>
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
     <p className="text-sm font-bold">Opção 2 · Colar lista de ofertas</p>
     <p className="mt-1 text-xs leading-5 text-slate-700">
      Na Webmotors, clique <strong>dentro da página, sobre a área dos veículos</strong>, não na barra de endereços.
      Selecione o texto dos anúncios e copie com <strong>Ctrl+C</strong>. Cole com <strong>Ctrl+V</strong> abaixo.
      A cópia precisa conter valores em R$, quilometragem e ano, não apenas um link.
     </p>
     <label className="mt-3 block text-xs font-bold text-slate-800">
      Texto copiado da página
      <textarea rows={3} value={text} maxLength={160000}
       onChange={e=>{setText(e.target.value);setHasAnalyzed(false);setNotice('');}}
       placeholder="Cole aqui a lista copiada da Webmotors"
       className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-900"/>
     </label>
     {pastedOnlyAddress&&<div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
      <strong>Você colou somente o endereço da Webmotors.</strong> O link abre a pesquisa, mas não contém os preços e KM
      dos carros. Volte à Webmotors e selecione os cartões dos anúncios com o mouse, copie o texto e cole aqui.
      Se o navegador continuar copiando só o endereço, use a opção 1 para capturar os cartões visíveis.
     </div>}
     {pastedCaptureCode&&<div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
      <strong>Você colou o código de captura, não os anúncios.</strong>
      Esse texto começa com JavaScript ou contém instruções do atalho.
      O lugar dele é no campo <strong>URL/endereço do favorito do Chrome</strong> (opção 1).
      Depois, abra os resultados na Webmotors e clique no favorito para capturar os anúncios visíveis.
      <div className="mt-2">
       <button type="button" onClick={()=>{setText('');setHasAnalyzed(false);setNotice('');}}
        className="rounded-md border border-amber-500 bg-white px-3 py-1.5 text-xs font-bold text-amber-950">
        Limpar o código colado
       </button>
      </div>
     </div>}
     {pasteKind==='other-text'&&text.trim()&&<p role="status" className="mt-2 text-xs font-semibold text-amber-900">
      Ainda não há preço em R$ e KM suficientes no texto copiado. Confira se você selecionou os anúncios.
     </p>}
     <button type="button" disabled={!enabled||!text.trim()||invalidPaste}
      onClick={()=>{setHasAnalyzed(true);setNotice('');}}
      className="mt-2 rounded-lg bg-cyan-800 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
      {pastedCaptureCode?'Código do favorito não é anúncio':pastedOnlyAddress?'Cole os anúncios, não o link':'Identificar ofertas'}
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
