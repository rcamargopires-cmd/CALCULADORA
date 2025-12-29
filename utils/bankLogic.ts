import { BankType } from '../types';

/**
 * Calcula o retorno bancário baseado no valor financiado e no tipo de banco.
 * 
 * @param financingValue Valor total financiado
 * @param type Tipo do banco ('volks' ou 'others')
 * @returns Valor do retorno calculado
 */
export const calculateBankReturn = (financingValue: number, type: BankType): number => {
  const rate = type === 'volks' ? 0.13 : 0.036;
  return financingValue * rate;
};