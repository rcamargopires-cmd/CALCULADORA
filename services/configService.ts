import { doc, getDoc, setDoc } from 'firebase/firestore';
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
  type: 'percent',
  fixedValue: 200,
  percentage: 5,
  minProfitThreshold: 1000,
  invoicePercentage: 0.5,
  financingPercentage: 1,
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
  volks: 10,
  others: 3.6
};

const defaults = () => ({
  visibility: { ...DEFAULT_VISIBILITY },
  commission: { ...DEFAULT_COMMISSION },
  bankRates: { ...DEFAULT_BANK_RATES }
});

export const configService = {
  loadConfig: async () => {
    try {
      const docRef = doc(db, CONFIG_DOC);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return defaults();

      const data = docSnap.data();
      return {
        visibility: { ...DEFAULT_VISIBILITY, ...(data.visibility || {}) },
        commission: { ...DEFAULT_COMMISSION, ...(data.commission || {}) },
        bankRates: { ...DEFAULT_BANK_RATES, ...(data.bankRates || {}) }
      };
    } catch (error) {
      console.error('Erro ao carregar configurações; usando padrões seguros:', error);
      return defaults();
    }
  },

  saveVisibility: async (visibility: FieldVisibility) => {
    await setDoc(doc(db, CONFIG_DOC), { visibility }, { merge: true });
  },

  saveCommission: async (commission: CommissionConfig) => {
    await setDoc(doc(db, CONFIG_DOC), { commission }, { merge: true });
  },

  saveBankRates: async (bankRates: BankRates) => {
    await setDoc(doc(db, CONFIG_DOC), { bankRates }, { merge: true });
  },

  reset: async () => {
    const value = defaults();
    await setDoc(doc(db, CONFIG_DOC), value);
    return value;
  }
};