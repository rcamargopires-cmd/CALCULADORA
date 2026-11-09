import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User } from '../types';
import { EVANDRO_IQ_ONLY_EMAIL, iqExclusiveUser } from '../services/marketIqExclusiveAccess';
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
    <ModuleErrorBoundary name="App" critical><App resolvedUser={user}/></ModuleErrorBoundary>
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
  const [profileError,setProfileError]=useState<''|'quota'|'temporarily_unavailable'|'inactive'>('');
  const [authAccountPresent,setAuthAccountPresent]=useState(false);
  const [retryAfter,setRetryAfter]=useState(0);
  const [retryNonce,setRetryNonce]=useState(0);
  const [retryNotice,setRetryNotice]=useState('');
  // 5 minute circuit breaker for quota-limited session profile lookups.
  // It stores only the next request time, never credentials or a cached role.
  const quotaKey=(uid:string)=>'motyq-profile-cooldown-v1:'+uid;

  useEffect(() => {
    let alive=true;
    let profileUnsubscribe: (()=>void) | null = null;
    const authUnsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      if(!alive)return;
      setAuthAccountPresent(Boolean(firebaseUser?.email));
      setRetryNotice('');
      setProfileError('');
      profileUnsubscribe?.();
      profileUnsubscribe = null;
      if (!firebaseUser?.email) {
        setProfile(null);
        setLoading(false);
        return;
      }
      // Reloading the page does not bypass the cooldown and hammer Firestore.
      try{
        const until=Number(sessionStorage.getItem(quotaKey(firebaseUser.uid))||0);
        if(Number.isFinite(until)&&until>Date.now()){
          setProfile(null);setProfileError('quota');
          setRetryAfter(until);setLoading(false);return;
        }
      }catch{ /* Private mode may restrict sessionStorage. */ }
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

          let user = await userService.getUser(normalizedEmail);
          if(!alive)return;
          const evandroNeedsSync=normalizedEmail===EVANDRO_IQ_ONLY_EMAIL&&
            (user?.role==='manager'||user?.role==='pricing')&&user.pricingDeskOnly!==true;
          const reinaldoNeedsSync=normalizedEmail==='reinaldo.ribas@abraoreze.com.br'&&
            user?.pricingDeskAccess!==true;
          // Already granted desk permissions never trigger the extra server
          // profile lookup on every sign-in.
          if(user?.status==='active'&&(evandroNeedsSync||reinaldoNeedsSync)){
            try{
              const token=await firebaseUser.getIdToken();
              const response=await fetch('/api/analyze-deal?action=current-user',{
                method:'GET',cache:'no-store',
                headers:{Authorization:'Bearer '+token},
                signal:AbortSignal.timeout(15000)
              });
              const payload=await response.json().catch(()=>({}));
              if(response.ok&&payload.user&&(normalizedEmail===EVANDRO_IQ_ONLY_EMAIL?
                 payload.user.pricingDeskOnly===true:payload.user.pricingDeskAccess===true))
                 user=payload.user as User;
              else console.warn('Motyq IQ: atualização de permissão da Mesa ainda não confirmada no servidor.');
            }catch(error){console.warn('Motyq IQ: sincronização de perfil indisponível.',error);}
          }
          const active = user?.status === 'active' ? iqExclusiveUser({...user,email:normalizedEmail}) : null;
          if(!active)setProfileError('inactive');
          if (active?.role === 'admin') {
            companyScopeService.enterAdminHome();
            setAdminScope(ADMIN_HOME_SCOPE);
          }
          if(!alive)return;
          setProfile(active);
          try{sessionStorage.removeItem(quotaKey(firebaseUser.uid));}catch{}
          if(active)profileUnsubscribe = onSnapshot(doc(db,'users',normalizedEmail), snapshot => {
            const next = snapshot.exists() ? snapshot.data() as User : null;
            setProfile(next?.status === 'active' ? iqExclusiveUser({...next,email:normalizedEmail}) : null);
          }, error => {
            console.warn('Motyq: atualização do perfil em tempo real indisponível.',String(error?.code||''));
          });
        }
      } catch(error:any) {
        if(!alive)return;
        const code=String(error?.code||'')+' '+String(error?.message||'');
        const quota=/resource-exhausted|quota|429|MOTYQ_FIRESTORE_QUOTA_EXCEEDED/i.test(code);
        setProfile(null);
        setProfileError(quota?'quota':'temporarily_unavailable');
        if(quota){
          const until=Date.now()+5*60*1000;
          setRetryAfter(until);
          try{sessionStorage.setItem(quotaKey(firebaseUser.uid),String(until));}catch{}
        }
      } finally {
        if(alive)setLoading(false);
      }
    });
    return () => {
      alive=false;
      authUnsubscribe();
      profileUnsubscribe?.();
    };
  }, [retryNonce]);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = String((event as CustomEvent<{ companyId?: string }>).detail?.companyId || '');
      if (next) setAdminScope(next);
    };
    window.addEventListener(COMPANY_SCOPE_EVENT, sync);
    return () => window.removeEventListener(COMPANY_SCOPE_EVENT, sync);
  }, []);

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f6f8fb] text-sm font-semibold text-slate-500">Carregando MOTYQ...</div>;

  // Firebase Authentication succeeded, but authorization cannot be verified.
  // Never render the password form again or silently reuse unverified privileges.
  if(authAccountPresent&&!profile&&profileError)return (
    <main className="grid min-h-screen place-items-center bg-[#f6f8fb] p-5">
      <section role="alert" className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wider text-slate-600">Motyq · verificação de acesso</p>
        <h1 className="mt-2 text-xl font-black text-slate-900">
          {profileError==='quota'?'Banco de dados temporariamente limitado':
            profileError==='inactive'?'Perfil sem acesso ativo':'Não foi possível conferir seu perfil'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          {profileError==='quota'?
            'O Firestore atingiu um limite de consultas. Sua senha não está incorreta e os dados salvos não foram apagados. Evite recarregar ou entrar repetidamente, pois isso aumenta as consultas.':
            profileError==='inactive'?
            'A conta foi autenticada, mas o perfil não consta como ativo. Um administrador deve conferir as permissões.':
            'O serviço de perfis está indisponível no momento. Não é possível liberar o acesso sem confirmar as permissões.'}
        </p>
        {profileError==='quota'&&<p className="mt-2 text-xs font-semibold text-amber-900">
          Nova verificação manual permitida após {new Date(retryAfter).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}.
        </p>}
        {retryNotice&&<p role="status" className="mt-2 text-xs text-amber-900">{retryNotice}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={()=>{
            if(Date.now()<retryAfter){
              setRetryNotice('Aguarde até o horário indicado. Repetir a tentativa agora não restabelece a cota.');return;
            }
            setLoading(true);setProfileError('');setRetryNonce(n=>n+1);
          }} className="rounded-xl bg-[#18475a] px-4 py-2.5 text-sm font-bold text-white">
            Verificar novamente
          </button>
          <button type="button" onClick={()=>void signOut(auth)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">
            Sair da conta
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-500">O Motyq não modifica perfis nem aprova ações enquanto o acesso não estiver verificado.</p>
      </section>
    </main>
  );

  // Standalone Motyq IQ, without seller docks, voice controls or operational overlays.
  const iqEmail=String(profile?.email||'').trim().toLowerCase();
  // A signed-out or not-yet-resolved profile must never dereference profile.role.
  // This guard also keeps the sign-in screen functional when ?iq=1 is supplied.
  const iqAllowed=Boolean(profile) && (profile?.companyId||'abrao-reze')==='abrao-reze' &&
    (['pricing','manager','admin'].includes(String(profile.role))||
      Boolean(profile.pricingDeskOnly)||Boolean(profile.pricingDeskAccess)||
      iqEmail==='reinaldo.ribas@abraoreze.com.br');
  const iqSelected=new URLSearchParams(window.location.search).get('iq')==='1';
  const goSelected=new URLSearchParams(window.location.search).get('go')==='1';
  if(profile&&iqAllowed&&(iqSelected||profile.role==='pricing'||profile.pricingDeskOnly||(iqEmail==='reinaldo.ribas@abraoreze.com.br'&&!goSelected)))
    return <><ErrorMonitoringBridge user={profile}/><PerformanceMonitoringBridge user={profile}/>
      <BillingGate user={profile}><ModuleErrorBoundary name="Motyq IQ" critical><App resolvedUser={profile}/></ModuleErrorBoundary></BillingGate></>;
  if (profile?.role === 'evaluator') return <><ErrorMonitoringBridge user={profile}/><PerformanceMonitoringBridge user={profile}/><BillingGate user={profile}><EvaluatorMotyq user={profile}/></BillingGate></>;
  if (profile?.role === 'manager' && profile.pricingDeskOnly) return <><ErrorMonitoringBridge user={profile}/><PerformanceMonitoringBridge user={profile}/><BillingGate user={profile}><PricingMotyq user={profile}/></BillingGate></>;
  if (profile?.role === 'admin' && adminScope === ADMIN_HOME_SCOPE) return <><ErrorMonitoringBridge user={profile}/><PerformanceMonitoringBridge user={profile}/><AdminControlCenter currentUser={profile}/></>;
  if (profile) return <><ErrorMonitoringBridge user={profile}/><PerformanceMonitoringBridge user={profile}/><BillingGate user={profile}><StandardMotyq user={profile}/></BillingGate></>;
  return <StandardMotyq user={null}/>;
};

export default RoleAwareRoot;
