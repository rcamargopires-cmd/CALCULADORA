import React from 'react';
import ReactDOM from 'react-dom/client';
import './marketiq-header-layout.css';
import './marketiq-lookup-light.css';
import './motyq-light.css';
import './motyq-light-refinements.css';
import './motyq-light-dashboard.css';
import './evaluation-request-position.css';
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
import MarketIQShell from './components/MarketIQShell';
import MarketIQLookupBridge from './components/MarketIQLookupBridge';
import MarketIQSessionReset from './components/MarketIQSessionReset';
import EvaluationRequestMarketIQBridge from './components/EvaluationRequestMarketIQBridge';
import EvaluationRequestFlowShell from './components/EvaluationRequestFlowShell';
import EvaluationRequestVehicleLookupBridge from './components/EvaluationRequestVehicleLookupBridge';

// Stable pre-theme baseline. This comment intentionally triggers a clean production deploy.
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
    <EvaluationRequestMarketIQBridge />
    <EvaluationRequestFlowShell />
    <EvaluationRequestVehicleLookupBridge />
    <MarketIQShell />
    <MarketIQLookupBridge />
    <MarketIQSessionReset />
  </React.StrictMode>
);