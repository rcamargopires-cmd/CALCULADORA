
import { FieldVisibility, CommissionConfig } from '../types';

const CONFIG_STORAGE_KEY = 'app_field_config';
const COMMISSION_STORAGE_KEY = 'app_commission_config';

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
  minProfitThreshold: 1000 // Só paga comissão se der pelo menos 1000 de lucro
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

  // Reset Geral
  reset: () => {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
    localStorage.removeItem(COMMISSION_STORAGE_KEY);
    return {
      visibility: DEFAULT_VISIBILITY,
      commission: DEFAULT_COMMISSION
    };
  }
};
