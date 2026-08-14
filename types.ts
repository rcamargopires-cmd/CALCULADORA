export type BankType = 'volks' | 'others';
export type UserRole = 'admin' | 'manager' | 'seller' | 'user';
export type UserStatus = 'active' | 'inactive';
export type CompanyPlan = 'starter' | 'pro' | 'enterprise';
export type CompanyStatus = 'trial' | 'active' | 'suspended';
export type DealMasterModule =
  | 'dealGuard'
  | 'goalTrack'
  | 'myPerformance'
  | 'commandCenter'
  | 'stockIntelligence'
  | 'trends'
  | 'smartAlerts'
  | 'executiveInsights'
  | 'aiManager'
  | 'assetGuard'
  | 'multiStore'
  | 'groupOverview'
  | 'dmsConnect';

export interface Company {
  id: string;
  slug: string;
  name: string;
  plan: CompanyPlan;
  status: CompanyStatus;
  createdAt?: string;
  trialEndsAt?: string;
  moduleOverrides?: Partial<Record<DealMasterModule, boolean>>;
}

export interface Store {
  id: string;
  code: string;
  name: string;
  active: boolean;
  companyId?: string;
}

export interface SellerGoals {
  monthly: number;
  firstHalf: number;
  capture: number;
  margin: number;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  status: UserStatus;
  createdAt?: string;
  goals?: SellerGoals;
  storeId?: string;
  companyId?: string;
  companyPlan?: CompanyPlan;
  companyStatus?: CompanyStatus;
  companyModuleOverrides?: Partial<Record<DealMasterModule, boolean>>;
}

export interface OperationalStockItem {
  id: string;
  snapshotDate: string;
  plate: string;
  vehicle: string;
  stockDays: number;
  cost: number;
  fipe: number;
  askingPrice: number;
  location?: string;
  status?: string;
  storeId?: string;
  companyId?: string;
}

export interface OperationalSaleItem {
  id: string;
  saleDate: string;
  plate: string;
  vehicle: string;
  seller: string;
  invoiceValue: number;
  marginValue: number;
  marginPercent: number;
  hasTradeIn?: boolean;
  storeId?: string;
  companyId?: string;
}

export interface OperationalPerformanceSeller {
  seller: string;
  sellerKey: string;
  passages: number;
  orders: number;
  flowTotal: number;
  orderPercent: number;
  workInPeriod: number;
  avgContactsPerDay: number;
  evaluations: number;
  evaluationRate: number;
  closing: number;
  syonetSales: number;
  closingPercent: number;
  marginPerCar: number;
  marginTotal: number;
  marginPercent: number;
  captureQty: number;
  capturePercent: number;
  pipeline: number;
  projection: number;
  additionalPurchase: number;
}

export interface OperationalPerformanceSnapshot {
  referenceDate: string;
  sheetName: string;
  sellers: OperationalPerformanceSeller[];
  total?: OperationalPerformanceSeller;
  storeMetrics: Record<string, number | string>;
  sourceFile?: string;
  importedBy?: string;
  storeId?: string;
  companyId?: string;
}

export interface OperationalImportLog {
  id: string;
  type: 'stock' | 'sales' | 'performance';
  importedAt: string;
  referenceDate: string;
  rows: number;
  fileName: string;
  importedBy?: string;
  storeId?: string;
  companyId?: string;
}

export interface FieldVisibility {
  licensePlate: boolean;
  stockDays: boolean;
  invoiceValue: boolean;
  vehicleCost: boolean;
  entry: boolean;
  financing: boolean;
  tradeIn: boolean;
  documentation: boolean;
  accessories: boolean;
  payoff: boolean;
  debts: boolean;
  others: boolean;
}

export type CommissionType = 'fixed' | 'percent' | 'mixed';

export interface CommissionConfig {
  enabled: boolean;
  type: CommissionType;
  fixedValue: number;
  percentage: number;
  minProfitThreshold: number;
  invoicePercentage: number;
  financingPercentage: number;
  stockPrizeConfig: {
    enabled: boolean;
    thresholds: { days: number; value: number; valueWithTradeIn?: number; }[];
  };
  docPrizeConfig: {
    enabled: boolean;
    thresholds: { min: number; max?: number; value: number; }[];
  };
}

export interface BankRates { volks: number; others: number; }
export interface PaymentMethods { entry: number; financing: number; tradeIn: number; }
export interface AdditionalCosts { documentation: number; accessories: number; payoff: number; debts: number; others: number; }

export interface DealData {
  licensePlate: string;
  fipeValue: number;
  stockDays: number;
  invoiceValue: number;
  vehicleCost: number;
  bankReturn: number;
  payments: PaymentMethods;
  costs: AdditionalCosts;
  dealStatus?: 'open' | 'closed';
  closingType: 'standard' | 'banking';
  isWebLead?: boolean;
  splitWithUserId?: string;
  splitWithUserName?: string;
}

export interface CalculationResult {
  totalPayment: number;
  totalCosts: number;
  netRevenue: number;
  profit: number;
  marginPercent: number;
  profitWithBank: number;
  marginPercentWithBank: number;
}

export interface SavedCalculation {
  id: string;
  timestamp: string;
  data: DealData;
  bankType: BankType;
  summary: { profit: number; marginPercent: number; };
  userId?: string;
  userName?: string;
  companyId?: string;
  storeId?: string;
}