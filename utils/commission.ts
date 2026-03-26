
import { CommissionConfig, DealData } from '../types';

export interface CommissionBreakdown {
  base: number;       // % sobre o Lucro
  fixed: number;      // Valor fixo
  invoice: number;    // % sobre Nota Fiscal
  stockPrize: number; // Prêmio de Estoque
  docPrize: number;   // Prêmio de Documentação
  total: number;      // Soma total
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
    return { base: 0, fixed: 0, invoice: 0, stockPrize: 0, docPrize: 0, total: 0 };
  }

  let base = 0;
  let fixed = 0;
  let invoice = 0;

  // Regras de Comissão Base (Lucro Mínimo)
  // Só paga comissão base se atingir o lucro mínimo. Bônus (spiffs) geralmente pagam independente.
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
  }

  // --- Bônus de Estoque (Spiff) ---
  let stockPrize = 0;
  if (config.stockPrizeConfig.enabled) {
    const days = deal.stockDays || 0;
    const hasTradeIn = deal.payments.tradeIn > 0;
    
    // Ordena por dias decrescente para pegar o maior threshold atingido
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

  return {
    base,
    fixed,
    invoice,
    stockPrize,
    docPrize,
    total: base + fixed + invoice + stockPrize + docPrize
  };
};
