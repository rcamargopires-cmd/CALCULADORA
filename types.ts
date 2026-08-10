export type BankType = 'volks' | 'others';
export type UserRole = 'admin' | 'manager' | 'seller' | 'user';
export type UserStatus = 'active' | 'inactive';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  status: UserStatus;
  createdAt?: string;
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
}

export interface OperationalImportLog {
  id: string;
  type: 'stock' | 'sales';
  importedAt: string;
  referenceDate: string;
  rows: number;
  fileName: string;
  importedBy?: string;
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
}
