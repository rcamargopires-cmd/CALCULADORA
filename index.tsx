import React from 'react';
import ReactDOM from 'react-dom/client';
import './services/storeScopeAdapter';
import './services/stockBatchAdapter';
import './services/unifiedStockAuditAdapter';
import './services/monthCycleAdapter';
import App from './App';
import ManagerTopNav from './components/ManagerTopNav';
import OperationalTools from './components/OperationalTools';
import TradeCheckShell from './components/TradeCheckShell';
import MarketPresenceCorrectionShell from './components/MarketPresenceCorrectionShell';
import UnifiedStockAuditNotice from './components/UnifiedStockAuditNotice';
import EnvironmentHeaderBadge from './components/EnvironmentHeaderBadge';
import SellerShowroomSoundAlert from './components/SellerShowroomSoundAlert';
import ShowroomDealLinkBridge from './components/ShowroomDealLinkBridge';
import GroupStockModule from './components/GroupStockModule';
import GroupStockHostRepair from './components/GroupStockHostRepair';
import ManagerShowroomProposalsShell from './components/ManagerShowroomProposalsShell';
import SellerShowroomAutoReset from './components/SellerShowroomAutoReset';

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
    <UnifiedStockAuditNotice />
    <EnvironmentHeaderBadge />
    <SellerShowroomSoundAlert />
    <ShowroomDealLinkBridge />
    <GroupStockModule />
    <GroupStockHostRepair />
    <ManagerShowroomProposalsShell />
    <SellerShowroomAutoReset />
  </React.StrictMode>
);