import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
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
import SellerShowroomHistory from './SellerShowroomHistory';
import SellerAgendaDock from './SellerAgendaDock';
import ManagerShowroomHistory from './ManagerShowroomHistory';
import MarketIQShell from './MarketIQShell';
import MarketIQLookupBridge from './MarketIQLookupBridge';
import MarketIQSessionReset from './MarketIQSessionReset';
import MarketIQFinalDecisionBridge from './MarketIQFinalDecisionBridge';
import ModuleErrorBoundary from './ModuleErrorBoundary';
import EvaluationCenter from './EvaluationCenter';
import EvaluationDecisionBridge from './EvaluationDecisionBridge';
import EvaluatorMobileInspection from './EvaluatorMobileInspection';
import PricingDesk from './PricingDesk';
import MotyqCRM from './MotyqCRM';
import MotyqVoiceAssistant from './MotyqVoiceAssistant';
import MobileSellerQuickActions from './MobileSellerQuickActions';
import SellerMobileHome from './SellerMobileHome';
import AdminControlCenter from './AdminControlCenter';
import BillingGate from './BillingGate';
import { ADMIN_HOME_SCOPE, COMPANY_SCOPE_EVENT, companyScopeService } from '../services/companyScopeService';
import { CurrentStockProvider } from '../contexts/CurrentStockContext';
import DmsRoleHome from './DmsRoleHome';
import { dmsPermissions } from '../services/dmsPermissions';
import ErrorMonitoringBridge from './ErrorMonitoringBridge';
import PerformanceMonitoringBridge from './PerformanceMonitoringBridge';

const Safe = ({ name, children }: { name: string; children: React.ReactNode }) => (
  <ModuleErrorBoundary name={name}>{children}</ModuleErrorBoundary>
);

const StandardMotyq = ({ user }: { user: User | null }) => {
  const permissions=dmsPermissions(user);
  const restrictedDms = user?.role==='manager' && ['preparation','finance'].includes(String(user.dmsAccessProfile||''));
  if(restrictedDms&&user){
    return <CurrentStockProvider user={user}>
      <ModuleErrorBoundary name="DmsRoleHome" critical><DmsRoleHome user={user}/></ModuleErrorBoundary>
      <Safe name="ManagerTopNav"><ManagerTopNav /></Safe>
      <Safe name="OperationalTools"><OperationalTools /></Safe>
      <Safe name="EnvironmentHeaderBadge"><EnvironmentHeaderBadge /></Safe>
    </CurrentStockProvider>;
  }
  return <CurrentStockProvider user={user}>
    <ModuleErrorBoundary name="App" critical><App /></ModuleErrorBoundary>
    <Safe name="ManagerTopNav"><ManagerTopNav /></Safe>
    {user && permissions.crmView && <Safe name="MotyqCRM"><MotyqCRM user={user}/></Safe>}
    {user && <Safe name="MotyqVoice"><MotyqVoiceAssistant user={user}/></Safe>}
    <Safe name="OperationalTools"><OperationalTools /></Safe>
    {permissions.evaluationsView&&<Safe name="TradeCheckShell"><TradeCheckShell /></Safe>}
    {permissions.stockView&&<Safe name="MarketPresenceCorrectionShell"><MarketPresenceCorrectionShell /></Safe>}
    <Safe name="UnifiedStockAuditNotice"><UnifiedStockAuditNotice /></Safe>
    <Safe name="EnvironmentHeaderBadge"><EnvironmentHeaderBadge /></Safe>
    <Safe name="SellerShowroomSoundAlert"><SellerShowroomSoundAlert /></Safe>
    <Safe name="ShowroomDealLinkBridge"><ShowroomDealLinkBridge /></Safe>
    {permissions.stockView&&<Safe name="GroupStockModule"><GroupStockModule /></Safe>}
    {permissions.stockView&&<Safe name="GroupStockHostRepair"><GroupStockHostRepair /></Safe>}
    {permissions.proposalsView&&<Safe name="ManagerShowroomProposalsShell"><ManagerShowroomProposalsShell /></Safe>}
    <Safe name="SellerShowroomAutoReset"><SellerShowroomAutoReset /></Safe>
    {user && ['seller', 'user'].includes(String(user.role)) && <>
      <Safe name="SellerAgendaDock"><SellerAgendaDock /></Safe>
      <Safe name="MobileSellerQuickActions"><MobileSellerQuickActions /></Safe>
      <Safe name="SellerMobileHome"><SellerMobileHome /></Safe>
      <Safe name="SellerDeliveryAgendaShortcut"><SellerDeliveryAgendaShortcut /></Safe>
      <Safe name="SellerShowroomHistory"><SellerShowroomHistory user={user}/></Safe>
    </>}
    {user && ['manager', 'admin'].includes(String(user.role)) &&
      <Safe name="ManagerShowroomHistory"><ManagerShowroomHistory user={user}/></Safe>}
    {permissions.evaluationsView&&<>
      {user && ['manager','admin'].includes(String(user.role)) && <Safe name="PricingDesk"><PricingDesk user={user}/></Safe>}
      <Safe name="EvaluationDecisionBridge"><EvaluationDecisionBridge /></Safe>
      <Safe name="EvaluationCenter"><EvaluationCenter /></Safe>
      <Safe name="MarketIQShell"><MarketIQShell /></Safe>
      {user && ['manager','admin'].includes(String(user.role)) && <Safe name="MarketIQFinalDecisionBridge"><MarketIQFinalDecisionBridge currentUser={user}/></Safe>}
      <Safe name="MarketIQLookupBridge"><MarketIQLookupBridge /></Safe>
      <Safe name="MarketIQSessionReset"><MarketIQSessionReset /></Safe>
    </>}
  </CurrentStockProvider>;
};

const EvaluatorMotyq = ({ user }: { user: User }) => <>
  <ModuleErrorBoundary name="EvaluatorMobileInspection" critical><EvaluatorMobileInspection user={user}/></ModuleErrorBoundary>
</>;

const PricingMotyq = ({ user }: { user: User }) => <CurrentStockProvider user={user}>
  <div className="min-h-screen bg-[#f4f7fb]">
    <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 p-5 md:p-8">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.16em] text-violet-600">MOTYQ IQ · ETAPA 3 DE 3</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Mesa de Precificação</h1>
        <p className="mt-1 text-sm text-slate-500">Avaliações concluídas pela vistoria chegam aqui para análise e decisão.</p>
      </div>
      <button onClick={()=>void signOut(auth)} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"><LogOut size={15}/>SAIR</button>
    </div>
  </div>
  <Safe name="PricingDesk"><PricingDesk user={user} defaultOpen/></Safe>
  <Safe name="EvaluationDecisionBridge"><EvaluationDecisionBridge /></Safe>
  <Safe name="MarketIQShell"><MarketIQShell /></Safe>
  <Safe name="MarketIQLookupBridge"><MarketIQLookupBridge /></Safe>
  <Safe name="MarketIQSessionReset"><MarketIQSessionReset /></Safe>
  <Safe name="MarketIQFinalDecisionBridge"><MarketIQFinalDecisionBridge currentUser={user}/></Safe>
  <Safe name="EnvironmentHeaderBadge"><EnvironmentHeaderBadge /></Safe>
</CurrentStockProvider>;

const RoleAwareRoot: React.FC = () => {
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminScope, setAdminScope] = useState(ADMIN_HOME_SCOPE);

  useEffect(() => {
    let profileUnsubscribe: (()=>void) | null = null;
    const authUnsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      profileUnsubscribe?.();
      profileUnsubscribe = null;
      if (!firebaseUser?.email) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const normalizedEmail=String(firebaseUser.email||'').trim().toLowerCase();
        if(normalizedEmail==='r.camargo.pires@gmail.com'){
          const active:User={
            id:normalizedEmail,
            email:normalizedEmail,
            name:firebaseUser.displayName||'Reinaldo',
            role:'admin',
            status:'active',
            createdAt:new Date().toISOString(),
            companyId:'abrao-reze',
            storeId:'outlet-sorocaba',
          };
          companyScopeService.enterAdminHome();
          setAdminScope(ADMIN_HOME_SCOPE);
          setProfile(active);
        }else{
          const user = await userService.getUser(normalizedEmail);
          const active = user?.status === 'active' ? user : null;
          if (active?.role === 'admin') {
            companyScopeService.enterAdminHome();
            setAdminScope(ADMIN_HOME_SCOPE);
          }
          setProfile(active);
          profileUnsubscribe = onSnapshot(doc(db,'users',normalizedEmail), snapshot => {
            const next = snapshot.exists() ? snapshot.data() as User : null;
            setProfile(next?.status === 'active' ? next : null);
          }, () => undefined);
        }
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return () => {
      authUnsubscribe();
      profileUnsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = String((event as CustomEvent<{ companyId?: string }>).detail?.companyId || '');
      if (next) setAdminScope(next);
    };
    window.addEventListener(COMPANY_SCOPE_EVENT, sync);
    return () => window.removeEventListener(COMPANY_SCOPE_EVENT, sync);
  }, []);

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f6f8fb] text-sm font-semibold text-slate-500">Carregando MOTYQ...</div>;
  if (profile?.role === 'evaluator') return <><ErrorMonitoringBridge user={profile}/><PerformanceMonitoringBridge user={profile}/><BillingGate user={profile}><EvaluatorMotyq user={profile}/></BillingGate></>;
  if (profile?.role === 'manager' && profile.pricingDeskOnly) return <><ErrorMonitoringBridge user={profile}/><PerformanceMonitoringBridge user={profile}/><BillingGate user={profile}><PricingMotyq user={profile}/></BillingGate></>;
  if (profile?.role === 'admin' && adminScope === ADMIN_HOME_SCOPE) return <><ErrorMonitoringBridge user={profile}/><PerformanceMonitoringBridge user={profile}/><AdminControlCenter currentUser={profile}/></>;
  if (profile) return <><ErrorMonitoringBridge user={profile}/><PerformanceMonitoringBridge user={profile}/><BillingGate user={profile}><StandardMotyq user={profile}/></BillingGate></>;
  return <StandardMotyq user={null}/>;
};

export default RoleAwareRoot;
