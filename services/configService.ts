import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { FieldVisibility, CommissionConfig, BankRates } from '../types';

const CONFIG_DOC = 'config/main';

export const DEFAULT_VISIBILITY: FieldVisibility = {
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

export const DEFAULT_COMMISSION: CommissionConfig = {
  enabled: true,
  type: 'percent', // Padrão: Porcentagem
  fixedValue: 200, // Ex: 200 reais fixos
  percentage: 5,   // Ex: 5% do lucro
  minProfitThreshold: 1000, // Só paga comissão se der pelo menos 1000 de lucro
  invoicePercentage: 0.5, // 0.5% sobre a NF
  financingPercentage: 1, // 1% sobre o Financiamento
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

export const DEFAULT_BANK_RATES: BankRates = {
  volks: 10, // 10%
  others: 3.6 // 3.6%
};

export const configService = {
  // --- Load Config ---
  loadConfig: async () => {
    const docRef = doc(db, CONFIG_DOC);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        visibility: { ...DEFAULT_VISIBILITY, ...data.visibility },
        commission: { ...DEFAULT_COMMISSION, ...data.commission },
        bankRates: { ...DEFAULT_BANK_RATES, ...data.bankRates }
      };
    } else {
      const defaults = {
        visibility: DEFAULT_VISIBILITY,
        commission: DEFAULT_COMMISSION,
        bankRates: DEFAULT_BANK_RATES
      };
      return defaults;
    }
  },

  // --- Save Configs ---
  saveVisibility: async (visibility: FieldVisibility) => {
    const docRef = doc(db, CONFIG_DOC);
    await setDoc(docRef, { visibility }, { merge: true });
  },
  
  saveCommission: async (commission: CommissionConfig) => {
    const docRef = doc(db, CONFIG_DOC);
    await setDoc(docRef, { commission }, { merge: true });
  },

  saveBankRates: async (bankRates: BankRates) => {
    const docRef = doc(db, CONFIG_DOC);
    await setDoc(docRef, { bankRates }, { merge: true });
  },

  // Reset Geral
  reset: async () => {
    const defaults = {
      visibility: DEFAULT_VISIBILITY,
      commission: DEFAULT_COMMISSION,
      bankRates: DEFAULT_BANK_RATES
    };
    const docRef = doc(db, CONFIG_DOC);
    await setDoc(docRef, defaults);
    return defaults;
  }
};
