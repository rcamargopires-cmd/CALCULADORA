
import { FieldVisibility, CommissionConfig, BankRates } from '../types';

const CONFIG_STORAGE_KEY = 'app_field_config';
const COMMISSION_STORAGE_KEY = 'app_commission_config';
const BANK_RATES_STORAGE_KEY = 'app_bank_rates_config';

const DEFAULT_VISIBILITY: FieldVisibility = {
  licensePlate: true,
  stockDays: true,
  invoiceValue: true,
  vehicleCost: true,
  entry: true,
  financing: true,
  tradeIn: true,
  documentation: true,
  accessories: true,
  payoff: true,
  debts: true,
  others: true,
};

const DEFAULT_COMMISSION: CommissionConfig = {
  enabled: true,
  type: 'percent', // Padrão: Porcentagem
  fixedValue: 200, // Ex: 200 reais fixos
  percentage: 5,   // Ex: 5% do lucro
  minProfitThreshold: 1000, // Só paga comissão se der pelo menos 1000 de lucro
  invoicePercentage: 0.5, // 0.5% sobre a NF
  stockPrizeConfig: {
    enabled: true,
    thresholds: [
      { days: 120, value: 1000 },
      { days: 90, value: 350, valueWithTradeIn: 500 }
    ]
  },
  docPrizeConfig: {
    enabled: true,
    thresholds: [
      { min: 1300, value: 150 },
      { min: 1000, max: 1200, value: 100 }
    ]
  }
};

const DEFAULT_BANK_RATES: BankRates = {
  volks: 10, // 10%
  others: 3.6 // 3.6%
};

export const configService = {
  // --- Field Visibility ---
  getVisibility: (): FieldVisibility => {
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_VISIBILITY, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Erro ao carregar configurações de campo", e);
    }
    return DEFAULT_VISIBILITY;
  },

  saveVisibility: (config: FieldVisibility) => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  },
  
  // --- Commission Config ---
  getCommission: (): CommissionConfig => {
    try {
      const stored = localStorage.getItem(COMMISSION_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_COMMISSION, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Erro ao carregar configurações de comissão", e);
    }
    return DEFAULT_COMMISSION;
  },

  saveCommission: (config: CommissionConfig) => {
    localStorage.setItem(COMMISSION_STORAGE_KEY, JSON.stringify(config));
  },

  // --- Bank Rates ---
  getBankRates: (): BankRates => {
    try {
      const stored = localStorage.getItem(BANK_RATES_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_BANK_RATES, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Erro ao carregar configurações de taxas bancárias", e);
    }
    return DEFAULT_BANK_RATES;
  },

  saveBankRates: (config: BankRates) => {
    localStorage.setItem(BANK_RATES_STORAGE_KEY, JSON.stringify(config));
  },

  // Reset Geral
  reset: () => {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
    localStorage.removeItem(COMMISSION_STORAGE_KEY);
    localStorage.removeItem(BANK_RATES_STORAGE_KEY);
    return {
      visibility: DEFAULT_VISIBILITY,
      commission: DEFAULT_COMMISSION,
      bankRates: DEFAULT_BANK_RATES
    };
  }
};
