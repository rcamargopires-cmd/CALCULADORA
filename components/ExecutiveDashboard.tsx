import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, BellRing, CarFront, ChevronRight,
  CircleDollarSign, Clock3, Gauge, RefreshCw, Target, TrendingUp, UsersRound, X,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  CommissionConfig, OperationalPerformanceSeller, OperationalPerformanceSnapshot,
  OperationalStockItem, SavedCalculation, ShowroomPassage, User,
} from '../types';
import { normalize } from '../services/operationalDataService';
import { storeScopedOperationalService } from '../services/storeScopedOperationalService';
import { prepTrackService } from '../services/prepTrackService';
import { manualStockService } from '../services/manualStockService';
import { DEMO_COMPANY_ID, demoStockRows, demoPerformanceSnapshots } from '../services/demoSeedService';
import { evaluationQueueService, EvaluationQueueRequest } from '../services/evaluationQueueService';
import { showroomFlowService } from '../services/showroomFlowService';
import { companyScopeService, COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { storeScopeService, STORE_SCOPE_EVENT } from '../services/storeScopeService';

type Props = {
  history: SavedCalculation[];
  users: User[];
  currentUser: User;
  commissionConfig: CommissionConfig | null;
  onStartNewCalculation: () => void;
  onDelete?: (id: string) => void;
};

type FocusPanel = 'stock' | 'evaluations' | 'opportunities' | 'margin' | null;
type Tone = 'critical' | 'attention' | 'info' | 'good';

type Action = {
  tone: Tone;
  title: string;
  text: string;
  metric: string;
  focus?: Exclude<FocusPanel, null>;
};

const DEFAULT_MARGIN_GOAL = 8;
const DEFAULT_STORE_GOAL = 70;

const money = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const pct = (value: number) => `${Number(value || 0).toFixed(1)}%`;

const millis = (value: any) => {
  try {
    if (value?.toMillis) return value.toMillis();
    if (value?.seconds) return Number(value.seconds) * 1000;
    return value ? new Date(value).getTime() : 0;
  } catch {
    return 0;
  }
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

const officialClosingRate = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;
  const flow = Number(item.flowTotal || 0);
  const rawRate = Number(item.closingPercent || 0);
  const rawClosing = Number(item.closing || 0);
  if (flow > 0 && rawRate > 0 && rawRate <= 2 && Math.abs(rawRate - rawClosing) < 0.000001) return rawRate * 100;
  return rawRate;
};

const officialClosingCount = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;
  const flow = Number(item.flowTotal || 0);
  const rate = officialClosingRate(item);
  if (flow > 0 && Number.isFinite(rate)) {
    const derived = (rate / 100) * flow;
    const rounded = Math.round(derived);
    return Math.abs(derived - rounded) < 0.02 ? rounded : Number(derived.toFixed(2));
  }
  return Number(item.closing || 0);
};

const totalFromSnapshot = (snapshot: OperationalPerformanceSnapshot | null) => {
  if (!snapshot) return null;
  if (snapshot.total) return snapshot.total;
  const sellers = snapshot.sellers || [];
  if (!sellers.length) return null;
  const sum = (key: keyof OperationalPerformanceSeller) =>
    sellers.reduce((acc, item) => acc + Number(item[key] || 0), 0);
  const closingTotal = sellers.reduce((acc, item) => acc + officialClosingCount(item), 0);
  const flowTotal = sum('flowTotal');
  const marginBase = closingTotal || 1;
  return {
    seller: 'TOTAL',
    sellerKey: 'total',
    passages: sum('passages'),
    orders: sum('orders'),
    flowTotal,
    orderPercent: 0,
    workInPeriod: sum('workInPeriod'),
    avgContactsPerDay: 0,
    evaluations: sum('evaluations'),
    evaluationRate: 0,
    closing: closingTotal,
    syonetSales: sum('syonetSales'),
    closingPercent: flowTotal ? (closingTotal / flowTotal) * 100 : 0,
    marginPerCar: sum('marginTotal') / marginBase,
    marginTotal: sum('marginTotal'),
    marginPercent: closingTotal
      ? sellers.reduce((acc, item) => acc + Number(item.marginPercent || 0) * officialClosingCount(item), 0) / closingTotal
      : 0,
    captureQty: sum('captureQty'),
    capturePercent: closingTotal ? (sum('captureQty') / closingTotal) * 100 : 0,
    pipeline: sum('pipeline'),
    projection: sum('projection'),
    additionalPurchase: sum('additionalPurchase'),
  } as OperationalPerformanceSeller;
};

const StatusDot = ({ tone }: { tone: Tone }) => <span className={`mx-status-dot mx-status-dot--${tone}`} />;

const ExecutiveDashboard: React.FC<Props> = ({ history, users, currentUser, onStartNewCalculation }) => {
  const [stock, setStock] = useState<OperationalStockItem[]>([]);
  const [snapshot, setSnapshot] = useState<OperationalPerformanceSnapshot | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationQueueRequest[]>([]);
  const [leads, setLeads] = useState<ShowroomPassage[]>([]);
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<FocusPanel>(null);

  useEffect(() => {
    if (!focus) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarGap = Math.max(window.innerWidth - document.documentElement.clientWidth, 0);
    document.body.style.overflow = 'hidden';
    if (scrollbarGap > 0) document.body.style.paddingRight = `${scrollbarGap}px`;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocus(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [focus]);

  const [scope, setScope] = useState(() => ({
    companyId: companyScopeService.get(currentUser),
    storeId: storeScopeService.get(currentUser),
  }));
  const [goals, setGoals] = useState({ margin: DEFAULT_MARGIN_GOAL, store: DEFAULT_STORE_GOAL });

  const reloadOperational = async (
    companyId = companyScopeService.get(currentUser),
    storeId = storeScopeService.get(currentUser),
  ) => {
    setLoading(true);
    try {
      const [stockData, performanceData, perf, prepOrders] = await Promise.all([
        storeScopedOperationalService.getLatestStock(storeId, companyId),
        storeScopedOperationalService.getLatestPerformance(storeId, companyId),
        getDoc(doc(db, 'config/performance')),
        prepTrackService.getOrders(companyId, storeId).catch(() => []),
      ]);
      let effectiveStock = companyId===DEMO_COMPANY_ID && !(stockData||[]).length ? demoStockRows() : (stockData||[]);

      if(companyId!==DEMO_COMPANY_ID){
        const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
        const activePrepOrders=prepOrders.filter(order=>!order.sold&&!['delivery','delivered'].includes(order.status));
        for(const order of activePrepOrders){
          if(effectiveStock.some(item=>cleanPlate(item.plate)===cleanPlate(order.plate)))continue;
          try{
            effectiveStock=await manualStockService.syncPreparation(order,currentUser,storeId,companyId,effectiveStock);
          }catch(error){
            console.warn('MOTYQ dashboard could not restore active preparation vehicle',order.plate,error);
          }
        }
      }

      const effectivePerformance = companyId===DEMO_COMPANY_ID && !performanceData
        ? (demoPerformanceSnapshots().slice(-1)[0] as OperationalPerformanceSnapshot)
        : performanceData;
      setStock(effectiveStock);
      setSnapshot(effectivePerformance || null);
      if (perf.exists()) {
        const raw = perf.data() as any;
        setGoals({
          margin: Number(raw?.healthyMargin) || DEFAULT_MARGIN_GOAL,
          store: Number(raw?.monthlyGoal) || DEFAULT_STORE_GOAL,
        });
      }
    } catch (error) {
      console.error('MOTYQ executive dashboard load failed', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadOperational();
    const refresh = () => void reloadOperational();
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => window.removeEventListener('dealmaster:operational-data-updated', refresh);
  }, []);

  useEffect(() => {
    const sync = () => {
      const nextScope = {
        companyId: companyScopeService.get(currentUser),
        storeId: storeScopeService.get(currentUser),
      };
      setScope(nextScope);
      void reloadOperational(nextScope.companyId, nextScope.storeId);
    };
    window.addEventListener(COMPANY_SCOPE_EVENT, sync);
    window.addEventListener(STORE_SCOPE_EVENT, sync);
    return () => {
      window.removeEventListener(COMPANY_SCOPE_EVENT, sync);
      window.removeEventListener(STORE_SCOPE_EVENT, sync);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!scope.companyId || !scope.storeId) return;
    return evaluationQueueService.subscribe(
      currentUser,
      scope.companyId,
      scope.storeId,
      setEvaluations,
      error => console.warn('MOTYQ dashboard evaluation queue unavailable', error),
    );
  }, [currentUser, scope.companyId, scope.storeId]);

  useEffect(() => {
    if (!scope.companyId || !scope.storeId) return;
    return showroomFlowService.subscribeStorePassages(
      scope.companyId,
      scope.storeId,
      setLeads,
      error => console.warn('MOTYQ dashboard CRM unavailable', error),
    );
  }, [scope.companyId, scope.storeId]);

  const total = useMemo(() => totalFromSnapshot(snapshot), [snapshot]);
  const importedSellers = snapshot?.sellers || [];
  const sellers = useMemo(() => {
    const roster = users.filter(user =>
      user.status === 'active' &&
      (user.role === 'seller' || user.role === 'user') &&
      (!user.companyId || user.companyId === scope.companyId) &&
      (!user.storeId || user.storeId === scope.storeId)
    );

    const firstNameCounts = new Map<string, number>();
    roster.forEach(user => {
      const first = normalize(String(user.name || '')).split(' ')[0] || '';
      if (first) firstNameCounts.set(first, (firstNameCounts.get(first) || 0) + 1);
    });

    const matchesUser = (sellerName: string, userName: string) => {
      const seller = normalize(sellerName);
      const user = normalize(userName);
      if (!seller || !user) return false;
      if (seller === user) return true;
      const sellerParts = seller.split(' ').filter(Boolean);
      const userParts = user.split(' ').filter(Boolean);
      if (sellerParts.length === 1 && userParts[0] === sellerParts[0] && firstNameCounts.get(sellerParts[0]) === 1) return true;
      return false;
    };

    const representedUsers = new Set<string>();
    const cleanedImported = importedSellers.filter((seller, index, all) => {
      const matchingUser = roster.find(user => matchesUser(String(seller.seller || ''), String(user.name || '')));
      if (matchingUser) {
        const key = normalize(String(matchingUser.email || matchingUser.name || ''));
        const siblings = all.filter(row => matchesUser(String(row.seller || ''), String(matchingUser.name || '')));
        if (siblings.length > 1) {
          const hasData = (row: OperationalPerformanceSeller) =>
            Number(row.closing || 0) !== 0 ||
            Number(row.flowTotal || 0) !== 0 ||
            Number(row.marginPercent || 0) !== 0 ||
            Number(row.capturePercent || 0) !== 0 ||
            Number(row.projection || 0) !== 0;
          const dataRow = siblings.find(hasData);
          if (dataRow && dataRow !== seller && !hasData(seller)) return false;
        }
        representedUsers.add(key);
      }
      return true;
    });

    const missing: OperationalPerformanceSeller[] = roster
      .filter(user => !representedUsers.has(normalize(String(user.email || user.name || ''))))
      .map(user => ({
        seller: user.name || user.email,
        sellerKey: normalize(user.name || user.email),
        passages: 0,
        orders: 0,
        flowTotal: 0,
        orderPercent: 0,
        workInPeriod: 0,
        avgContactsPerDay: 0,
        evaluations: 0,
        evaluationRate: 0,
        closing: 0,
        syonetSales: 0,
        closingPercent: 0,
        marginPerCar: 0,
        marginTotal: 0,
        marginPercent: 0,
        captureQty: 0,
        capturePercent: 0,
        pipeline: 0,
        projection: 0,
        additionalPurchase: 0,
      }));
    return [...cleanedImported, ...missing];
  }, [importedSellers, users, scope.companyId, scope.storeId]);

  const stockValue = useMemo(() => stock.reduce((sum, item) => sum + Number(item.cost || 0), 0), [stock]);
  const investorCapitalRate = 1.5;
  const investorCapitalCharge = useMemo(() => stockValue * investorCapitalRate / 100, [stockValue]);
  const ageBands = useMemo(() => {
    const bands = [
      { key: '0-30', label: '0–30', min: 0, max: 30, count: 0, value: 0 },
      { key: '31-60', label: '31–60', min: 31, max: 60, count: 0, value: 0 },
      { key: '61-90', label: '61–90', min: 61, max: 90, count: 0, value: 0 },
      { key: '91-120', label: '91–120', min: 91, max: 120, count: 0, value: 0 },
      { key: '120+', label: '+120', min: 121, max: Infinity, count: 0, value: 0 },
    ];
    stock.forEach(item => {
      const days = Number(item.stockDays || 0);
      const band = bands.find(entry => days >= entry.min && days <= entry.max);
      if (!band) return;
      band.count += 1;
      band.value += Number(item.cost || 0);
    });
    return bands;
  }, [stock]);

  const stockOver120 = useMemo(() => stock.filter(item => Number(item.stockDays || 0) > 120), [stock]);
  const stockOver90 = useMemo(() => stock.filter(item => Number(item.stockDays || 0) > 90), [stock]);
  const pendingEvaluations = useMemo(
    () => evaluations.filter(item => item.status === 'requested' || item.status === 'in_progress'),
    [evaluations],
  );
  const staleEvaluations = useMemo(
    () => pendingEvaluations.filter(item => Date.now() - millis(item.createdAt) > 2 * 60 * 60 * 1000),
    [pendingEvaluations],
  );

  const openOpportunities = useMemo(
    () => leads.filter(item => item.status !== 'sale' && item.status !== 'no_deal'),
    [leads],
  );
  const hotOpportunities = useMemo(
    () => openOpportunities.filter(item =>
      item.leadTemperature === 'hot' || item.status === 'proposal' || item.status === 'evaluation'
    ),
    [openOpportunities],
  );
  const waitingLeads = useMemo(() => openOpportunities.filter(item => item.status === 'waiting'), [openOpportunities]);

  const margin = Number(total?.marginPercent || 0);
  const projection = Number(total?.projection || 0);
  const actualSales = officialClosingCount(total);

  const sellerRows = useMemo(() => sellers.map(seller => {
    const sellerName = normalize(String(seller.seller || ''));
    const exactUser = users.find(item => normalize(String(item.name || '')) === sellerName);
    const firstNameUser = sellerName && !sellerName.includes(' ')
      ? users.filter(item => (item.role === 'seller' || item.role === 'user') && normalize(String(item.name || '')).split(' ')[0] === sellerName)
      : [];
    const user = exactUser || (firstNameUser.length === 1 ? firstNameUser[0] : undefined);
    const sellerGoal = Number(user?.goals?.monthly || 15);
    const marginGoal = Number(user?.goals?.margin || goals.margin);
    const sales = officialClosingCount(seller);
    const sellerMargin = Number(seller.marginPercent || 0);
    const capture = Number(seller.capturePercent || 0);
    const needsAction = Number(seller.projection || 0) < sellerGoal || (sales > 0 && sellerMargin < marginGoal);
    return { seller, sellerGoal, marginGoal, sales, sellerMargin, capture, needsAction };
  }).sort((a, b) => Number(b.needsAction) - Number(a.needsAction) || a.sales - b.sales), [sellers, users, goals.margin]);

  const actions = useMemo<Action[]>(() => {
    const items: Action[] = [];
    if (stockOver120.length) {
      items.push({
        tone: 'critical',
        title: `${stockOver120.length} veículo(s) acima de 120 dias`,
        text: `${money(stockOver120.reduce((sum, item) => sum + Number(item.cost || 0), 0))} de capital precisa de decisão.`,
        metric: 'Estoque crítico',
        focus: 'stock',
      });
    } else if (stockOver90.length) {
      items.push({
        tone: 'attention',
        title: `${stockOver90.length} veículo(s) acima de 90 dias`,
        text: 'A faixa de envelhecimento merece ação antes de virar estoque crítico.',
        metric: 'Atenção',
        focus: 'stock',
      });
    }
    if (pendingEvaluations.length) {
      items.push({
        tone: staleEvaluations.length ? 'critical' : 'attention',
        title: `${pendingEvaluations.length} avaliação(ões) aguardando decisão`,
        text: staleEvaluations.length
          ? `${staleEvaluations.length} já esperam há mais de 2 horas.`
          : 'A fila está ativa e deve continuar girando.',
        metric: staleEvaluations.length ? `${staleEvaluations.length} atrasadas` : 'Fila ativa',
        focus: 'evaluations',
      });
    }
    if (hotOpportunities.length) {
      items.push({
        tone: 'info',
        title: `${hotOpportunities.length} oportunidade(s) quentes`,
        text: waitingLeads.length
          ? `${waitingLeads.length} lead(s) ainda aguardam início de atendimento.`
          : 'Existem clientes em negociação que merecem acompanhamento.',
        metric: 'Comercial',
        focus: 'opportunities',
      });
    }
    if (actualSales > 0 && margin < goals.margin) {
      items.push({
        tone: 'attention',
        title: 'Margem abaixo da meta',
        text: `A operação está em ${pct(margin)} para uma meta de ${pct(goals.margin)}.`,
        metric: `-${pct(goals.margin - margin)}`,
        focus: 'margin',
      });
    }
    if (projection > 0 && projection < goals.store) {
      items.push({
        tone: 'attention',
        title: 'Ritmo abaixo da meta mensal',
        text: `Projeção atual de ${projection.toFixed(1)} para meta de ${goals.store} veículos.`,
        metric: `${Math.max(goals.store - projection, 0).toFixed(0)} faltam`,
        focus: 'margin',
      });
    }
    if (!items.length) {
      items.push({
        tone: 'good',
        title: 'Operação equilibrada',
        text: 'Os principais sinais estão dentro das regras atuais. Mantenha ritmo e disciplina.',
        metric: 'No ritmo',
      });
    }
    return items.slice(0, 5);
  }, [
    stockOver120, stockOver90, pendingEvaluations, staleEvaluations, hotOpportunities, waitingLeads,
    actualSales, margin, goals.margin, projection, goals.store,
  ]);

  const maxBand = Math.max(...ageBands.map(item => item.count), 1);
  const completedEvaluations = evaluations.filter(item => item.status === 'completed').length;
  const rejectedEvaluations = evaluations.filter(item => item.status === 'rejected').length;
  const closedSales = leads.filter(item => item.status === 'sale').length;
  const proposals = leads.filter(item => item.status === 'proposal').length;

  const openCrm = () => window.dispatchEvent(new CustomEvent('motyq:open-crm', { detail: {} }));
  return (
    <main className="motyq-exec">
      <div className="motyq-exec__glow motyq-exec__glow--one" />
      <div className="motyq-exec__glow motyq-exec__glow--two" />

      <header className="mx-topbar">
        <div className="mx-brand-wrap">
          <div className="mx-brand-identity" aria-label="MOTYQ">
            <img src="/motyq-hero-mark.svg" alt="" className="mx-brand mx-brand--hero" />
            <span className="mx-brand-word">MOTYQ</span>
          </div>
          <div className="mx-topbar-copy">
            <span className="mx-eyebrow">CENTRAL DE INTELIGÊNCIA OPERACIONAL</span>
            <h1>{greeting()}, {String(currentUser.name || 'gestor').split(' ')[0]}.</h1>
            <p>Onde sua operação precisa agir hoje?</p>
          </div>
        </div>
        <div className="mx-topbar-actions">
          <button className="mx-icon-button" onClick={() => void reloadOperational()} title="Atualizar">
            <RefreshCw size={18} className={loading ? 'mx-spin' : ''} />
          </button>
        </div>
      </header>

      <section className="mx-kpi-grid">
        <button className="mx-kpi-card" onClick={() => setFocus('stock')}>
          <div className="mx-kpi-icon"><CarFront size={20} /></div>
          <div className="mx-kpi-label">Veículos em estoque</div>
          <strong>{stock.length}</strong>
          <span>{money(stockValue)} de custo atual</span>
          <ChevronRight className="mx-kpi-chevron" size={17} />
        </button>
        <button className="mx-kpi-card" onClick={() => setFocus('stock')}>
          <div className="mx-kpi-icon"><CircleDollarSign size={20} /></div>
          <div className="mx-kpi-label">Custo de capital</div>
          <strong>{money(investorCapitalCharge)}</strong>
          <span>1,5% sobre {money(stockValue)} · posição de hoje</span>
          <ChevronRight className="mx-kpi-chevron" size={17} />
        </button>
        <button className="mx-kpi-card" onClick={() => setFocus('margin')}>
          <div className="mx-kpi-icon"><TrendingUp size={20} /></div>
          <div className="mx-kpi-label">Margem média</div>
          <strong>{pct(margin)}</strong>
          <span>Meta operacional {pct(goals.margin)}</span>
          <ChevronRight className="mx-kpi-chevron" size={17} />
        </button>
        <button className="mx-kpi-card" onClick={() => setFocus('opportunities')}>
          <div className="mx-kpi-icon"><Target size={20} /></div>
          <div className="mx-kpi-label">Oportunidades</div>
          <strong>{openOpportunities.length}</strong>
          <span>{hotOpportunities.length} quentes agora</span>
          <ChevronRight className="mx-kpi-chevron" size={17} />
        </button>
        <button className="mx-kpi-card" onClick={() => setFocus('margin')}>
          <div className="mx-kpi-icon"><BarChart3 size={20} /></div>
          <div className="mx-kpi-label">Vendas no mês</div>
          <strong>{actualSales}</strong>
          <span>Projeção {projection.toFixed(1)} · meta {goals.store}</span>
          <ChevronRight className="mx-kpi-chevron" size={17} />
        </button>
      </section>

      <section className="mx-main-grid">
        <article className="mx-panel mx-stock-panel">
          <div className="mx-panel-head">
            <div>
              <span className="mx-eyebrow">CAPITAL & GIRO</span>
              <h2>Estoque por idade</h2>
            </div>
            <button className="mx-link-button" onClick={() => setFocus('stock')}>Ver veículos <ChevronRight size={14} /></button>
          </div>

          <div className="mx-stock-summary">
            <div><span>Até 60 dias</span><strong>{ageBands[0].count + ageBands[1].count}</strong></div>
            <div><span>Acima de 90</span><strong>{stockOver90.length}</strong></div>
            <div className={stockOver120.length ? 'mx-summary-critical' : ''}><span>Acima de 120</span><strong>{stockOver120.length}</strong></div>
          </div>

          <div className="mx-age-chart">
            {ageBands.map(band => (
              <button key={band.key} className={`mx-age-column ${band.key === '120+' && band.count ? 'mx-age-column--critical' : ''}`} onClick={() => setFocus('stock')}>
                <div className="mx-age-value">{band.count}</div>
                <div className="mx-age-track">
                  <div className="mx-age-fill" style={{ height: `${Math.max(10, Math.round((band.count / maxBand) * 100))}%` }} />
                </div>
                <div className="mx-age-label">{band.label}</div>
                <small>{money(band.value)}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="mx-panel mx-actions-panel">
          <div className="mx-panel-head">
            <div>
              <span className="mx-eyebrow">MOTYQ INSIGHTS</span>
              <h2>Ações prioritárias</h2>
            </div>
            <span className="mx-live-badge"><Activity size={13} /> ao vivo</span>
          </div>
          <p className="mx-panel-intro">O MOTYQ encontrou {actions.length} ponto(s) que merecem sua atenção agora.</p>
          <div className="mx-action-list">
            {actions.map((item, index) => (
              <button key={`${item.title}-${index}`} className="mx-action-row" onClick={() => item.focus && setFocus(item.focus)}>
                <StatusDot tone={item.tone} />
                <div className="mx-action-copy">
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </div>
                <em>{item.metric}</em>
                {item.focus && <ChevronRight size={16} />}
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="mx-lower-grid">
        <article className="mx-panel mx-mini-panel">
          <div className="mx-module-title">
            <div className="mx-module-icon"><Gauge size={18} /></div>
            <div><span className="mx-eyebrow">MARKETIQ</span><h3>Avaliações</h3></div>
          </div>
          <div className="mx-mini-metrics">
            <div><span>Pendentes</span><strong>{pendingEvaluations.length}</strong></div>
            <div><span>Concluídas</span><strong>{completedEvaluations}</strong></div>
            <div><span>Recusadas</span><strong>{rejectedEvaluations}</strong></div>
          </div>
          <button className="mx-module-action" onClick={() => setFocus('evaluations')}>Abrir fila <ArrowRight size={15} /></button>
        </article>

        <article className="mx-panel mx-mini-panel">
          <div className="mx-module-title">
            <div className="mx-module-icon"><Target size={18} /></div>
            <div><span className="mx-eyebrow">COMERCIAL</span><h3>Funil ativo</h3></div>
          </div>
          <div className="mx-mini-metrics">
            <div><span>Em aberto</span><strong>{openOpportunities.length}</strong></div>
            <div><span>Propostas</span><strong>{proposals}</strong></div>
            <div><span>Vendidos</span><strong>{closedSales}</strong></div>
          </div>
          <button className="mx-module-action" onClick={openCrm}>Abrir CRM <ArrowRight size={15} /></button>
        </article>

        <article className="mx-panel mx-mini-panel mx-team-panel">
          <div className="mx-module-title">
            <div className="mx-module-icon"><UsersRound size={18} /></div>
            <div><span className="mx-eyebrow">EQUIPE</span><h3>Leitura gerencial</h3></div>
          </div>
          <div className="mx-team-list">
            {sellerRows.length === 0 && <p className="mx-empty">Importe o Mapa de Performance para ativar esta leitura.</p>}
            {sellerRows.slice(0, 4).map(({ seller, sales, sellerGoal, sellerMargin, needsAction }) => (
              <div className="mx-team-row" key={seller.sellerKey}>
                <div><strong>{seller.seller}</strong><span>{sales}/{sellerGoal} vendas</span></div>
                <div className="mx-team-progress"><i style={{ width: `${Math.min(100, (sales / Math.max(sellerGoal, 1)) * 100)}%` }} /></div>
                <div className={needsAction ? 'mx-team-state mx-team-state--attention' : 'mx-team-state'}>{pct(sellerMargin)}</div>
              </div>
            ))}
          </div>
          <button className="mx-module-action" onClick={() => setFocus('margin')}>Ver desempenho <ArrowRight size={15} /></button>
        </article>
      </section>

      <section className="mx-intelligence-strip">
        <div className="mx-intelligence-icon"><BellRing size={20} /></div>
        <div>
          <span className="mx-eyebrow">MOTYQ INTELLIGENCE</span>
          <strong>
            {stockOver120.length
              ? `Prioridade de hoje: reduzir o estoque crítico de ${stockOver120.length} veículo(s).`
              : pendingEvaluations.length
                ? `Prioridade de hoje: destravar ${pendingEvaluations.length} avaliação(ões) pendentes.`
                : hotOpportunities.length
                  ? `Prioridade de hoje: agir sobre ${hotOpportunities.length} oportunidade(s) quentes.`
                  : 'A operação está equilibrada. Proteja ritmo, margem e velocidade de resposta.'}
          </strong>
        </div>
        <span className="mx-intelligence-signature">Seu sistema registra. <b>O MOTYQ interpreta.</b></span>
      </section>

      <footer className="mx-data-footer">
        <span>{snapshot ? `Mapa: ${snapshot.sheetName || 'Performance'} · ${snapshot.referenceDate || 'data n/i'}` : 'Mapa de performance ainda não importado'}</span>
        <span>{stock.length ? `${stock.length} veículos lidos` : 'Estoque aguardando importação'}</span>
        <span>{history.length} negociação(ões) registradas</span>
      </footer>

      {focus && createPortal(
        <div className="mx-drawer-backdrop" onClick={() => setFocus(null)} role="presentation">
          <aside className="mx-drawer" onClick={event => event.stopPropagation()}>
            <div className="mx-drawer-head">
              <div>
                <span className="mx-eyebrow">DETALHE OPERACIONAL</span>
                <h2>
                  {focus === 'stock' ? 'Estoque que exige atenção' :
                    focus === 'evaluations' ? 'Fila de avaliações' :
                      focus === 'opportunities' ? 'Oportunidades comerciais' : 'Margem & equipe'}
                </h2>
              </div>
              <button className="mx-icon-button" onClick={() => setFocus(null)}><X size={18} /></button>
            </div>

            {focus === 'stock' && (
              <div className="mx-detail-list">
                {(stockOver90.length ? stockOver90 : stock)
                  .slice()
                  .sort((a, b) => Number(b.stockDays || 0) - Number(a.stockDays || 0))
                  .slice(0, 20)
                  .map(item => (
                    <div className="mx-detail-row" key={item.plate || `${item.model}-${item.stockDays}`}>
                      <div><strong>{item.model || item.plate || 'Veículo'}</strong><span>{item.plate || 'sem placa'} · {Number(item.stockDays || 0)} dias</span></div>
                      <div><strong>{money(Number(item.cost || 0))}</strong><span>capital</span></div>
                    </div>
                  ))}
                {!stock.length && <p className="mx-empty">Nenhum estoque importado neste momento.</p>}
              </div>
            )}

            {focus === 'evaluations' && (
              <div className="mx-detail-list">
                {pendingEvaluations.slice(0, 20).map(item => (
                  <div className="mx-detail-row" key={item.id}>
                    <div><strong>{item.plate || item.vehicle || 'Avaliação'}</strong><span>{item.requesterName || 'Solicitante'} · {item.status === 'in_progress' ? 'em avaliação' : 'aguardando'}</span></div>
                    <div><strong>{item.evaluatorName || 'Sem avaliador'}</strong><span>{millis(item.createdAt) ? new Date(millis(item.createdAt)).toLocaleString('pt-BR') : 'horário n/i'}</span></div>
                  </div>
                ))}
                {!pendingEvaluations.length && <p className="mx-empty">Nenhuma avaliação pendente. Fila limpa.</p>}
              </div>
            )}

            {focus === 'opportunities' && (
              <>
                <div className="mx-detail-list">
                  {openOpportunities.slice(0, 20).map(item => (
                    <div className="mx-detail-row" key={item.id}>
                      <div><strong>{item.customerName || 'Cliente'}</strong><span>{item.interestModel || 'interesse não informado'} · {item.status}</span></div>
                      <div><strong>{item.assignedSellerName || 'Sem vendedor'}</strong><span>{item.leadTemperature || 'morno'}</span></div>
                    </div>
                  ))}
                  {!openOpportunities.length && <p className="mx-empty">Nenhuma oportunidade aberta neste momento.</p>}
                </div>
                <button className="mx-drawer-cta" onClick={openCrm}>Abrir CRM completo <ArrowRight size={16} /></button>
              </>
            )}

            {focus === 'margin' && (
              <div className="mx-detail-list">
                {sellerRows.slice(0, 20).map(({ seller, sales, sellerGoal, sellerMargin, capture }) => (
                  <div className="mx-detail-row" key={seller.sellerKey}>
                    <div><strong>{seller.seller}</strong><span>{sales}/{sellerGoal} vendas · captura {pct(capture)}</span></div>
                    <div><strong>{pct(sellerMargin)}</strong><span>margem</span></div>
                  </div>
                ))}
                {!sellerRows.length && <p className="mx-empty">Importe o Mapa de Performance para ver a equipe.</p>}
              </div>
            )}
          </aside>
        </div>,
        document.body,
      )}
    </main>
  );
};

export default ExecutiveDashboard;
