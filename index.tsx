import React from 'react';
import ReactDOM from 'react-dom/client';
import './marketiq-header-layout.css';
import './marketiq-lookup-light.css';
import './motyq-light.css';
import './motyq-light-refinements.css';
import './motyq-light-dashboard.css';
import './services/storeScopeAdapter';
import './services/stockBatchAdapter';
import './services/unifiedStockAuditAdapter';
import './services/monthCycleAdapter';
import RoleAwareRoot from './components/RoleAwareRoot';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RoleAwareRoot />
  </React.StrictMode>
);