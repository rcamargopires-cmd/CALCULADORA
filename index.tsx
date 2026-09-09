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
import ModuleErrorBoundary from './components/ModuleErrorBoundary';
import EvaluationCenter from './components/EvaluationCenter';
import EvaluationDecisionBridge from './components/EvaluationDecisionBridge';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const Safe = ({ name, children }: { name: string; children: React.ReactNode }) => (
  <ModuleErrorBoundary name={name}>{children}</ModuleErrorBoundary>
);

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ModuleErrorBoundary name="App" critical><App /></ModuleErrorBoundary>
    <Safe name="ManagerTopNav"><ManagerTopNav /></Safe>
    <Safe name="OperationalTools"><OperationalTools /></Safe>
    <Safe name="TradeCheckShell"><TradeCheckShell /></Safe>
    <Safe name="MarketPresenceCorrectionShell"><MarketPresenceCorrectionShell /></Safe>
    <Safe name="UnifiedStockAuditNotice"><UnifiedStockAuditNotice /></Safe>
    <Safe name="EnvironmentHeaderBadge"><EnvironmentHeaderBadge /></Safe>
    <Safe name="SellerShowroomSoundAlert"><SellerShowroomSoundAlert /></Safe>
    <Safe name="ShowroomDealLinkBridge"><ShowroomDealLinkBridge /></Safe>
    <Safe name="GroupStockModule"><GroupStockModule /></Safe>
    <Safe name="GroupStockHostRepair"><GroupStockHostRepair /></Safe>
    <Safe name="ManagerShowroomProposalsShell"><ManagerShowroomProposalsShell /></Safe>
    <Safe name="SellerShowroomAutoReset"><SellerShowroomAutoReset /></Safe>
    <Safe name="EvaluationDecisionBridge"><EvaluationDecisionBridge /></Safe>
    <Safe name="EvaluationCenter"><EvaluationCenter /></Safe>
    <Safe name="MarketIQShell"><MarketIQShell /></Safe>
    <Safe name="MarketIQLookupBridge"><MarketIQLookupBridge /></Safe>
    <Safe name="MarketIQSessionReset"><MarketIQSessionReset /></Safe>
  </React.StrictMode>
);