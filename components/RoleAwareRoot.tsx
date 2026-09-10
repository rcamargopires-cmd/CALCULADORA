import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import App from '../App';
import ManagerTopNav from './ManagerTopNav';
import OperationalTools from './OperationalTools';
import TradeCheckShell from './TradeCheckShell';
import MarketPresenceCorrectionShell from './MarketPresenceCorrectionShell';
import UnifiedStockAuditNotice from './UnifiedStockAuditNotice';
import EnvironmentHeaderBadge from './EnvironmentHeaderBadge';
import SellerShowroomSoundAlert from './SellerShowroomSoundAlert';
import ShowroomDealLinkBridge from './ShowroomDealLinkBridge';
import GroupStockModule from './GroupStockModule';
import GroupStockHostRepair from './GroupStockHostRepair';
import ManagerShowroomProposalsShell from './ManagerShowroomProposalsShell';
import SellerShowroomAutoReset from './SellerShowroomAutoReset';
import SellerDeliveryAgendaShortcut from './SellerDeliveryAgendaShortcut';
import MarketIQShell from './MarketIQShell';
import MarketIQLookupBridge from './MarketIQLookupBridge';
import MarketIQSessionReset from './MarketIQSessionReset';
import ModuleErrorBoundary from './ModuleErrorBoundary';
import EvaluationCenter from './EvaluationCenter';
import EvaluationDecisionBridge from './EvaluationDecisionBridge';
import EvaluatorWorkspace from './EvaluatorWorkspace';

const Safe = ({ name, children }: { name: string; children: React.ReactNode }) => (
  <ModuleErrorBoundary name={name}>{children}</ModuleErrorBoundary>
);

const StandardMotyq = ({ user }: { user: User | null }) => <>
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
  {user && ['seller', 'user'].includes(String(user.role)) && <Safe name="SellerDeliveryAgendaShortcut"><SellerDeliveryAgendaShortcut /></Safe>}
  <Safe name="EvaluationDecisionBridge"><EvaluationDecisionBridge /></Safe>
  <Safe name="EvaluationCenter"><EvaluationCenter /></Safe>
  <Safe name="MarketIQShell"><MarketIQShell /></Safe>
  <Safe name="MarketIQLookupBridge"><MarketIQLookupBridge /></Safe>
  <Safe name="MarketIQSessionReset"><MarketIQSessionReset /></Safe>
</>;

const EvaluatorMotyq = ({ user }: { user: User }) => <>
  <ModuleErrorBoundary name="EvaluatorWorkspace" critical><EvaluatorWorkspace user={user}/></ModuleErrorBoundary>
  <Safe name="EvaluationDecisionBridge"><EvaluationDecisionBridge /></Safe>
  <Safe name="MarketIQShell"><MarketIQShell /></Safe>
  <Safe name="MarketIQLookupBridge"><MarketIQLookupBridge /></Safe>
  <Safe name="MarketIQSessionReset"><MarketIQSessionReset /></Safe>
</>;

const RoleAwareRoot: React.FC = () => {
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const user = await userService.getUser(firebaseUser.email);
      setProfile(user?.status === 'active' ? user : null);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }), []);

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f6f8fb] text-sm font-semibold text-slate-500">Carregando MOTYQ...</div>;
  if (profile?.role === 'evaluator') return <EvaluatorMotyq user={profile}/>;
  return <StandardMotyq user={profile}/>;
};

export default RoleAwareRoot;
