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
import './public-cotacao-mesa.css';
import './services/storeScopeAdapter';
import './services/stockBatchAdapter';
import './services/unifiedStockAuditAdapter';
import './services/monthCycleAdapter';
import RoleAwareRoot from './components/RoleAwareRoot';
import { isPublicCatalogRoute, PublicCatalogPage } from './components/CrmPersonalizedCatalog';
import PublicCotacaoMesaBuyerForm from './components/PublicCotacaoMesaBuyerForm';
import {PUBLIC_BUYER_PATH} from './services/marketIqBuyerRegistration';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {window.location.pathname.replace(/\/+$/,'')===PUBLIC_BUYER_PATH?
      <PublicCotacaoMesaBuyerForm />:
      isPublicCatalogRoute()?<PublicCatalogPage />:<RoleAwareRoot />}
  </React.StrictMode>
);
if('serviceWorker' in navigator && window.isSecureContext){
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('/motyq-iq-sw.js',{scope:'/'})
   .catch(()=>{ /* Chrome menu still supports manual Add to Home Screen. */ });
 },{once:true});
}
