

export type BankType = 'volks' | 'others';
export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'inactive';

export interface User {
  id: string;
  username: string;
  password?: string; // Opcional apenas na visualização, obrigatório no cadastro
  role: UserRole;
  name: string;
  status: UserStatus;
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
  fixedValue: number;      // Valor fixo em R$ (se type for fixed ou mixed)
  percentage: number;      // Porcentagem sobre o LUCRO (se type for percent ou mixed)
  minProfitThreshold: number; // Lucro mínimo para ativar a comissão
}

export interface PaymentMethods {
  entry: number;
  financing: number;
  tradeIn: number;
}

export interface AdditionalCosts {
  documentation: number;
  accessories: number;
  payoff: number; // Quitação
  debts: number;  // Débitos
  others: number;
}

export interface DealData {
  licensePlate: string; // Placa do veículo
  fipeValue: number;    // Valor da Tabela FIPE
  stockDays: number;    // Dias de estoque
  invoiceValue: number; // Valor NF
  vehicleCost: number;  // Custo do carro
  bankReturn: number;   // Retorno bancário (Bonus) - Optional enhancement
  payments: PaymentMethods;
  costs: AdditionalCosts;
  dealStatus?: 'open' | 'closed';
  closingType: 'standard' | 'banking'; // Qual opção foi escolhida para fechar o negócio
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
  summary: {
    profit: number;
    marginPercent: number;
  };
  userId?: string;
  userName?: string;
}
