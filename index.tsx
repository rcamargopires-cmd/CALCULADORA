import React from 'react';
import ReactDOM from 'react-dom/client';
import './services/storeScopeAdapter';
import './services/stockBatchAdapter';
import './services/monthCycleAdapter';
import App from './App';
import ManagerTopNav from './components/ManagerTopNav';
import OperationalTools from './components/OperationalTools';
import TradeCheckShell from './components/TradeCheckShell';
import MarketPresenceCorrectionShell from './components/MarketPresenceCorrectionShell';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
    <ManagerTopNav />
    <OperationalTools />
    <TradeCheckShell />
    <MarketPresenceCorrectionShell />
  </React.StrictMode>
);