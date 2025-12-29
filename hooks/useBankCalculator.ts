import { useState, useCallback } from 'react';
import { BankType } from '../types';
import { calculateBankReturn } from '../utils/bankLogic';

export const useBankCalculator = (initialType: BankType = 'others') => {
  const [bankType, setBankType] = useState<BankType>(initialType);

  /**
   * Calcula o retorno utilizando o tipo de banco atual do estado,
   * ou um tipo sobrescrito opcionalmente (útil para eventos de mudança instantânea).
   */
  const getReturnAmount = useCallback((financing: number, typeOverride?: BankType) => {
    return calculateBankReturn(financing, typeOverride ?? bankType);
  }, [bankType]);

  return {
    bankType,
    setBankType,
    getReturnAmount
  };
};