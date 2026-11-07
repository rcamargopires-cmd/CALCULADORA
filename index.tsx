import React from 'react';
import ReactDOM from 'react-dom/client';
import './marketiq-header-layout.css';
import './marketiq-lookup-light.css';
import './motyq-light.css';
import './motyq-light-refinements.css';
import './motyq-light-dashboard.css';
import './motyq-seller-mobile.css';
import './motyq-executive-dashboard.css';
import './motyq-shell.css';
import './motyq-premium-light.css';
import './services/storeScopeAdapter';
import './services/stockBatchAdapter';
import './services/unifiedStockAuditAdapter';
import './services/monthCycleAdapter';
import RoleAwareRoot from './components/RoleAwareRoot';
import MarketIqDealerRadarPanel from './components/MarketIqDealerRadarPanel';
import { isPublicCatalogRoute, PublicCatalogPage } from './components/CrmPersonalizedCatalog';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const radarLocalPreview=
  /(^|\.)vercel\.app$/i.test(window.location.hostname)&&
  new URLSearchParams(window.location.search).get('radar-local')==='1';
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {radarLocalPreview ?
     <main className="min-h-screen bg-[#f4f7fb] p-4 text-slate-900 md:p-7">
       <div className="mx-auto max-w-7xl">
         <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-black tracking-[.18em] text-cyan-700">MOTYQ IQ</p>
           <h1 className="text-xl font-black text-slate-950">Laboratório Radar de Compra</h1>
           <p className="text-xs text-slate-600">Preview local, sem login, acesso ao Firebase ou salvamento de dados.</p>
          </div>
         </header>
         <MarketIqDealerRadarPanel/>
       </div>
     </main>
    :isPublicCatalogRoute() ? <PublicCatalogPage /> : <RoleAwareRoot />}
  </React.StrictMode>
);
if('serviceWorker' in navigator && window.isSecureContext){
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('/motyq-iq-sw.js',{scope:'/'})
   .catch(()=>{ /* Chrome menu still supports manual Add to Home Screen. */ });
 },{once:true});
}
