import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Company, OperationalPerformanceSeller, Store, User } from '../types';
import { companyService } from './companyService';
import { companyScopeService } from './companyScopeService';
import { storeCompanyId, storeService } from './storeService';
import { storeScopeService } from './storeScopeService';
import { userService } from './userService';

export const DEMO_COMPANY_ID = 'motyq-demo';
export const DEMO_STORE_ID = 'motyq-demo-principal';

export const DEMO_COMPANY: Company = {
  id: DEMO_COMPANY_ID,
  slug: DEMO_COMPANY_ID,
  name: 'Motyq Demo Motors',
  plan: 'enterprise',
  status: 'active',
  createdAt: '2026-08-01T00:00:00.000Z',
};

export const DEMO_STORE: Store = {
  id: DEMO_STORE_ID,
  code: 'DEMO',
  name: 'Motyq Demo Motors · Matriz',
  active: true,
  companyId: DEMO_COMPANY_ID,
};

const safeId = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 140);

const localDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const dateAtDay = (day: number) => {
  const now = new Date();
  return localDate(new Date(now.getFullYear(), now.getMonth(), Math.max(1, Math.min(day, now.getDate()))));
};

const seller = (
  name: string,
  sellerKey: string,
  sales: number,
  flow: number,
  marginPercent: number,
  captureQty: number,
  projection: number,
  evaluations: number,
  passages: number,
): OperationalPerformanceSeller => {
  const marginPerCar = 6100 + marginPercent * 170;
  return {
    seller: name,
    sellerKey,
    passages,
    orders: Math.max(Math.round(flow * 0.58), sales),
    flowTotal: flow,
    orderPercent: flow ? Math.max(Math.round(flow * 0.58), sales) / flow * 100 : 0,
    workInPeriod: 22,
    avgContactsPerDay: Number((flow / 22).toFixed(1)),
    evaluations,
    evaluationRate: passages ? evaluations / passages * 100 : 0,
    closing: sales,
    syonetSales: sales,
    closingPercent: flow ? sales / flow * 100 : 0,
    marginPerCar,
    marginTotal: marginPerCar * sales,
    marginPercent,
    captureQty,
    capturePercent: sales ? captureQty / sales * 100 : 0,
    pipeline: Math.max(Math.round(projection - sales), 0),
    projection,
    additionalPurchase: Math.max(Math.round(sales * 0.2), 0),
  };
};

const performanceSnapshots = () => {
  const today = localDate(new Date());
  const baselineDate = dateAtDay(3);
  const middleDate = dateAtDay(15);

  const baseline = [
    seller('Ana Costa', 'ana-costa', 6, 42, 6.8, 3, 12, 14, 31),
    seller('Bruno Lima', 'bruno-lima', 5, 38, 6.4, 2, 11, 12, 29),
    seller('Carla Mendes', 'carla-mendes', 6, 40, 7.2, 3, 13, 15, 30),
    seller('Diego Rocha', 'diego-rocha', 4, 35, 5.9, 1, 10, 8, 27),
  ];

  const middle = [
    seller('Ana Costa', 'ana-costa', 9, 48, 8.1, 6, 15, 20, 35),
    seller('Bruno Lima', 'bruno-lima', 7, 44, 7.0, 4, 13, 17, 33),
    seller('Carla Mendes', 'carla-mendes', 8, 46, 8.0, 5, 15, 19, 34),
    seller('Diego Rocha', 'diego-rocha', 5, 40, 6.5, 2, 11, 12, 31),
  ];

  const current = [
    seller('Ana Costa', 'ana-costa', 13, 55, 9.4, 10, 18, 26, 40),
    seller('Bruno Lima', 'bruno-lima', 10, 51, 7.6, 6, 15, 22, 38),
    seller('Carla Mendes', 'carla-mendes', 11, 52, 8.8, 8, 17, 24, 39),
    seller('Diego Rocha', 'diego-rocha', 8, 47, 7.1, 4, 14, 18, 36),
  ];

  return [
    { referenceDate: baselineDate, sheetName: 'Demo · início do mês', sellers: baseline },
    { referenceDate: middleDate, sheetName: 'Demo · acompanhamento', sellers: middle },
    { referenceDate: today, sheetName: 'Demo · hoje', sellers: current },
  ].filter((item, index, items) => items.findIndex(other => other.referenceDate === item.referenceDate) === index);
};

const stockRows = () => {
  const snapshotDate = localDate(new Date());
  const raw = [
    ['DMO1A11', 'VW Nivus Highline 2023', 118, 104000, 116500, 109900],
    ['DMO2B22', 'Jeep Renegade Longitude 2022', 103, 82500, 94500, 87900],
    ['DMO3C33', 'Hyundai Creta Limited 2022', 97, 101500, 118000, 109900],
    ['DMO4D44', 'Toyota Corolla XEi 2021', 92, 112000, 126500, 119900],
    ['DMO5E55', 'Fiat Strada Freedom 2024', 84, 79000, 89500, 82900],
    ['DMO6F66', 'Chevrolet Tracker LT 2023', 73, 87500, 99000, 92900],
    ['DMO7G77', 'VW T-Cross Comfortline 2023', 66, 96500, 109000, 102900],
    ['DMO8H88', 'Hyundai HB20 Comfort 2025', 48, 65500, 73500, 69900],
    ['DMO9J99', 'Fiat Pulse Audace 2024', 39, 84500, 95500, 89900],
    ['DMO0K10', 'Honda City EX 2023', 31, 97500, 108500, 103900],
    ['DMO1L21', 'VW Polo Highline 2024', 22, 82500, 92500, 87900],
    ['DMO2M32', 'Chevrolet Onix LT 2025', 14, 68000, 75500, 71900],
  ] as const;
  return raw.map(([plate, vehicle, stockDays, cost, fipe, askingPrice], index) => ({
    id: safeId(`${DEMO_COMPANY_ID}_${DEMO_STORE_ID}_${snapshotDate}_${plate}`),
    snapshotDate,
    plate,
    vehicle,
    stockDays,
    cost,
    fipe,
    askingPrice,
    location: index < 7 ? 'Pátio principal' : 'Showroom',
    status: 'available',
    companyId: DEMO_COMPANY_ID,
    storeId: DEMO_STORE_ID,
  }));
};

const demoUsers: User[] = [
  { id: 'ana.costa@demo.motyq', email: 'ana.costa@demo.motyq', name: 'Ana Costa', role: 'seller', status: 'active', companyId: DEMO_COMPANY_ID, storeId: DEMO_STORE_ID, companyPlan: 'enterprise', companyStatus: 'active', goals: { monthly: 15, firstHalf: 6, capture: 60, margin: 8 } },
  { id: 'bruno.lima@demo.motyq', email: 'bruno.lima@demo.motyq', name: 'Bruno Lima', role: 'seller', status: 'active', companyId: DEMO_COMPANY_ID, storeId: DEMO_STORE_ID, companyPlan: 'enterprise', companyStatus: 'active', goals: { monthly: 15, firstHalf: 6, capture: 60, margin: 8 } },
  { id: 'carla.mendes@demo.motyq', email: 'carla.mendes@demo.motyq', name: 'Carla Mendes', role: 'seller', status: 'active', companyId: DEMO_COMPANY_ID, storeId: DEMO_STORE_ID, companyPlan: 'enterprise', companyStatus: 'active', goals: { monthly: 15, firstHalf: 6, capture: 60, margin: 8 } },
  { id: 'diego.rocha@demo.motyq', email: 'diego.rocha@demo.motyq', name: 'Diego Rocha', role: 'seller', status: 'active', companyId: DEMO_COMPANY_ID, storeId: DEMO_STORE_ID, companyPlan: 'enterprise', companyStatus: 'active', goals: { monthly: 15, firstHalf: 6, capture: 60, margin: 8 } },
];

const seedCompaniesAndStores = async () => {
  const companies = await companyService.getAll();
  const nextCompanies = [...companies.filter(item => item.id !== DEMO_COMPANY_ID), DEMO_COMPANY];
  await companyService.saveAll(nextCompanies);

  const stores = await storeService.getAll();
  const nextStores = [...stores.filter(item => item.id !== DEMO_STORE_ID), DEMO_STORE];
  await storeService.saveAll(nextStores);
};

const seedUsers = async () => {
  await Promise.all(demoUsers.map(user => userService.save({ ...user, createdAt: user.createdAt || new Date().toISOString() })));
};

const seedPerformance = async () => {
  const snapshots = performanceSnapshots();
  for (const snapshot of snapshots) {
    const id = `performance_${safeId(DEMO_STORE_ID)}_${safeId(snapshot.referenceDate)}`;
    await setDoc(doc(db, 'operational_meta', id), {
      ...snapshot,
      companyId: DEMO_COMPANY_ID,
      storeId: DEMO_STORE_ID,
      sourceFile: 'Motyq Demo Dataset',
      importedBy: 'demo@motyq.com.br',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  const latest = snapshots[snapshots.length - 1];
  await setDoc(doc(db, 'operational_meta', `current_${safeId(DEMO_STORE_ID)}`), {
    companyId: DEMO_COMPANY_ID,
    storeId: DEMO_STORE_ID,
    latestPerformanceDate: latest.referenceDate,
    performanceRowsLastImport: latest.sellers.length,
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

const seedStock = async () => {
  const stock = stockRows();
  for (const item of stock) await setDoc(doc(db, 'operational_stock', item.id), item, { merge: true });
  const currentDate = stock[0].snapshotDate;
  const currentValue = stock.reduce((sum, item) => sum + item.cost, 0);
  const aged = stock.filter(item => item.stockDays > 60);
  const critical = stock.filter(item => item.stockDays > 90);
  const criticalValue = critical.reduce((sum, item) => sum + item.cost, 0);
  const baselineDate = dateAtDay(3);

  await setDoc(doc(db, 'operational_meta', `stock_summary_${safeId(DEMO_STORE_ID)}_${safeId(baselineDate)}`), {
    referenceDate: baselineDate,
    companyId: DEMO_COMPANY_ID,
    storeId: DEMO_STORE_ID,
    stockCount: 16,
    stockValue: 1519000,
    aged60: 10,
    critical90: 7,
    critical90Value: 741000,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await setDoc(doc(db, 'operational_meta', `stock_summary_${safeId(DEMO_STORE_ID)}_${safeId(currentDate)}`), {
    referenceDate: currentDate,
    companyId: DEMO_COMPANY_ID,
    storeId: DEMO_STORE_ID,
    stockCount: stock.length,
    stockValue: currentValue,
    aged60: aged.length,
    critical90: critical.length,
    critical90Value: criticalValue,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await setDoc(doc(db, 'operational_meta', `current_${safeId(DEMO_STORE_ID)}`), {
    companyId: DEMO_COMPANY_ID,
    storeId: DEMO_STORE_ID,
    latestStockDate: currentDate,
    stockRows: stock.length,
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

const seedDeals = async () => {
  const now = new Date();
  const stamp = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
  const rows = [
    ['demo_deal_1', 'Ana Costa', 'ana.costa@demo.motyq', 'DMO1A11', 'open', 109900, 97000, 7600, 6.9],
    ['demo_deal_2', 'Bruno Lima', 'bruno.lima@demo.motyq', 'DMO5E55', 'open', 82900, 72000, 6900, 8.3],
    ['demo_deal_3', 'Carla Mendes', 'carla.mendes@demo.motyq', 'DMO8H88', 'open', 69900, 61000, 5900, 8.4],
    ['demo_deal_4', 'Diego Rocha', 'diego.rocha@demo.motyq', 'DMO3C33', 'open', 109900, 101500, 5200, 4.7],
    ['demo_deal_5', 'Ana Costa', 'ana.costa@demo.motyq', 'DMO9J99', 'closed', 89900, 84500, 7900, 8.8],
    ['demo_deal_6', 'Carla Mendes', 'carla.mendes@demo.motyq', 'DMO2M32', 'closed', 71900, 68000, 6100, 8.5],
  ] as const;

  let index = 0;
  for (const [id, userName, userId, plate, status, invoiceValue, vehicleCost, profit, marginPercent] of rows) {
    const data = {
      licensePlate: plate,
      fipeValue: invoiceValue + 6000,
      stockDays: stockRows().find(item => item.plate === plate)?.stockDays || 25,
      invoiceValue,
      vehicleCost,
      bankReturn: 0,
      payments: { entry: invoiceValue, financing: 0, tradeIn: 0 },
      costs: { documentation: 0, accessories: 0, payoff: 0, debts: 0, others: Math.max(invoiceValue - vehicleCost - profit, 0) },
      dealStatus: status,
      closingType: 'standard' as const,
    };
    await setDoc(doc(db, 'deals', id), {
      id,
      timestamp: stamp(index + 1),
      data,
      bankType: 'volks',
      summary: { profit, marginPercent },
      userId,
      userName,
      companyId: DEMO_COMPANY_ID,
      storeId: DEMO_STORE_ID,
      createdAt: stamp(index + 1),
      updatedAt: stamp(index),
    }, { merge: true });
    index += 1;
  }
};

const seedTasks = async (currentUser: User) => {
  const today = localDate(new Date());
  const tomorrow = localDate(new Date(Date.now() + 86400000));
  const yesterday = localDate(new Date(Date.now() - 86400000));
  const tasks = [
    {
      id: 'demo_action_capture', assignedToEmail: 'ana.costa@demo.motyq', assignedToName: 'Ana Costa', status: 'done',
      title: 'Recuperar captura', evidence: 'Captura iniciou o mês abaixo da meta.', recommendedAction: 'Reativar clientes com veículo na troca e priorizar avaliações.',
      result: '12 clientes reativados, 7 avaliações realizadas e 3 novos negócios com troca.', metricKey: 'capture', baselineValue: 42.9, targetValue: 60, dueDate: yesterday,
    },
    {
      id: 'demo_action_stock', assignedToEmail: 'bruno.lima@demo.motyq', assignedToName: 'Bruno Lima', status: 'done',
      title: 'Atacar estoque +90 dias', evidence: 'A unidade começou o mês com 7 veículos acima de 90 dias.', recommendedAction: 'Criar campanha de giro e reativar leads compatíveis.',
      result: '2 veículos críticos vendidos e 1 unidade transferida para canal de maior giro.', metricKey: 'criticalStock', baselineValue: 7, targetValue: 4, dueDate: yesterday,
    },
    {
      id: 'demo_action_margin', assignedToEmail: 'carla.mendes@demo.motyq', assignedToName: 'Carla Mendes', status: 'in_progress',
      title: 'Proteger margem nas propostas', evidence: 'Margem de algumas negociações ficou abaixo de 8%.', recommendedAction: 'Revisar custos e retorno bancário antes da autorização final.',
      result: 'Revisão aplicada nas propostas em andamento.', metricKey: 'margin', baselineValue: 7.2, targetValue: 8, dueDate: tomorrow,
    },
    {
      id: 'demo_action_projection', assignedToEmail: 'diego.rocha@demo.motyq', assignedToName: 'Diego Rocha', status: 'open',
      title: 'Recuperar projeção individual', evidence: 'Projeção abaixo da meta individual.', recommendedAction: 'Atacar pipeline e leads sem retorno nas últimas 72 horas.',
      result: '', metricKey: 'projection', baselineValue: 10, targetValue: 15, dueDate: tomorrow,
    },
  ] as const;

  for (const task of tasks) {
    await setDoc(doc(db, 'operational_meta', task.id), {
      ...task,
      kind: 'action_task',
      companyId: DEMO_COMPANY_ID,
      storeId: DEMO_STORE_ID,
      storeName: DEMO_STORE.name,
      sourceActionId: task.id,
      sourceDate: today,
      scope: 'Motyq Demo Motors · Matriz',
      tone: task.status === 'open' ? 'critical' : 'warning',
      metric: task.metricKey,
      createdByEmail: currentUser.email,
      createdByName: currentUser.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(task.status === 'done' ? { completedAt: serverTimestamp() } : {}),
    }, { merge: true });
  }
};

export const demoSeedService = {
  seed: async (currentUser: User) => {
    if (currentUser.role !== 'admin') throw new Error('Somente o administrador pode preparar o ambiente demo.');
    await seedCompaniesAndStores();
    await seedUsers();
    await seedStock();
    await seedPerformance();
    await seedDeals();
    await seedTasks(currentUser);

    companyScopeService.set(DEMO_COMPANY_ID);
    storeScopeService.set(DEMO_STORE_ID);
    window.dispatchEvent(new Event('dealmaster:company-entitlements-updated'));
    window.dispatchEvent(new Event('dealmaster:operational-data-updated'));
    window.dispatchEvent(new Event('motyq:operational-data-updated'));
  },

  isDemoCompany: (companyId?: string) => companyId === DEMO_COMPANY_ID,
};
