import { BankType, BankRates } from '../types';

/**
 * Calcula o retorno bancário baseado no valor financiado e no tipo de banco.
 * 
 * @param financingValue Valor total financiado
 * @param type Tipo do banco ('volks' ou 'others')
 * @param rates Taxas configuradas
 * @returns Valor do retorno calculado
 */
export const calculateBankReturn = (financingValue: number, type: BankType, rates: BankRates): number => {
  const rate = type === 'volks' ? (rates.volks / 100) : (rates.others / 100);
  return financingValue * rate;
};