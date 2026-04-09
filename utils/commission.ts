
import { CommissionConfig, DealData } from '../types';

export interface CommissionBreakdown {
  base: number;       // % sobre o Lucro
  fixed: number;      // Valor fixo
  invoice: number;    // % sobre Nota Fiscal
  financing: number;  // % sobre Financiamento
  stockPrize: number; // Prêmio de Estoque
  docPrize: number;   // Prêmio de Documentação
  isSplit: boolean;   // Se houve divisão
  splitValue: number; // Valor da divisão (40%)
  total: number;      // Soma total (já descontada a divisão se houver)
}

/**
 * Calcula a comissão detalhada com base nos dados da venda, lucro obtido e configurações ativas.
 */
export const calculateCommission = (
  deal: DealData,
  profit: number,
  config: CommissionConfig
): CommissionBreakdown => {
  if (!config.enabled) {
    return { base: 0, fixed: 0, invoice: 0, financing: 0, stockPrize: 0, docPrize: 0, isSplit: false, splitValue: 0, total: 0 };
  }

  let base = 0;
  let fixed = 0;
  let invoice = 0;
  let financing = 0;

  // Regras de Comissão Base (Lucro Mínimo)
  if (profit >= config.minProfitThreshold) {
    if (config.type === 'fixed' || config.type === 'mixed') {
      fixed = config.fixedValue;
    }

    if (config.type === 'percent' || config.type === 'mixed') {
      const profitBase = profit > 0 ? profit : 0;
      base = (profitBase * config.percentage) / 100;
    }

    // Revenue Share (Comissão sobre NF)
    if (config.invoicePercentage > 0 && deal.invoiceValue > 0) {
      invoice = (deal.invoiceValue * config.invoicePercentage) / 100;
    }

    // Comissão sobre Financiamento
    if (config.financingPercentage > 0 && deal.payments.financing > 0) {
      financing = (deal.payments.financing * config.financingPercentage) / 100;
    }
  }

  // --- Bônus de Estoque (Spiff) ---
  let stockPrize = 0;
  if (config.stockPrizeConfig.enabled) {
    const days = deal.stockDays || 0;
    const hasTradeIn = deal.payments.tradeIn > 0;
    
    const sortedThresholds = [...config.stockPrizeConfig.thresholds].sort((a, b) => b.days - a.days);
    
    for (const threshold of sortedThresholds) {
      if (days >= threshold.days) {
        stockPrize = (hasTradeIn && threshold.valueWithTradeIn !== undefined) 
          ? threshold.valueWithTradeIn 
          : threshold.value;
        break;
      }
    }
  }

  // --- Bônus de Documentação ---
  let docPrize = 0;
  if (config.docPrizeConfig.enabled) {
    const docValue = deal.costs.documentation || 0;
    
    for (const threshold of config.docPrizeConfig.thresholds) {
      const minOk = docValue >= threshold.min;
      const maxOk = threshold.max === undefined || docValue <= threshold.max;
      
      if (minOk && maxOk) {
        docPrize = threshold.value;
        break;
      }
    }
  }

  const subtotal = base + fixed + invoice + financing + stockPrize + docPrize;
  let splitValue = 0;
  const isSplit = !!(deal.isWebLead && deal.splitWithUserId);

  if (isSplit) {
    // Divisão de 40% para o outro vendedor, o atual fica com 60%
    splitValue = subtotal * 0.4;
  }

  return {
    base,
    fixed,
    invoice,
    financing,
    stockPrize,
    docPrize,
    isSplit,
    splitValue,
    total: subtotal - splitValue
  };
};
