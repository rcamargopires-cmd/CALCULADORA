import React, { useState, useEffect } from 'react';
import { X, Calculator, TrendingUp, AlertCircle } from 'lucide-react';
import CurrencyInput from './CurrencyInput';
import NumberInput from './NumberInput';
import { calculateInterestRate, calculateTotalInterest } from '../utils/finance';
import { formatCurrency, formatPercentage } from '../utils/currency';

interface RateCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFinancedAmount: number;
}

const RateCalculatorModal: React.FC<RateCalculatorModalProps> = ({ 
  isOpen, 
  onClose, 
  initialFinancedAmount 
}) => {
  const [financedAmount, setFinancedAmount] = useState(initialFinancedAmount);
  const [months, setMonths] = useState(48);
  const [installmentValue, setInstallmentValue] = useState(0);
  
  const [resultRate, setResultRate] = useState<number | null>(null);

  // Atualiza o valor financiado quando o modal abre
  useEffect(() => {
    if (isOpen) {
      setFinancedAmount(initialFinancedAmount);
    }
  }, [isOpen, initialFinancedAmount]);

  // Cálculo automático quando os valores mudam
  useEffect(() => {
    if (financedAmount > 0 && months > 0 && installmentValue > 0) {
      // Verifica se é matematicamente possível (Total pago deve ser maior que financiado)
      if (installmentValue * months <= financedAmount) {
        setResultRate(null);
        return;
      }
      const rate = calculateInterestRate(months, installmentValue, financedAmount);
      setResultRate(rate);
    } else {
      setResultRate(null);
    }
  }, [financedAmount, months, installmentValue]);

  if (!isOpen) return null;

  const totalPaid = months * installmentValue;
  const totalInterest = calculateTotalInterest(months, installmentValue, financedAmount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-zinc-800 p-4 flex justify-between items-center border-b border-zinc-700">
          <div className="flex items-center gap-2 text-amber-400">
            <Calculator size={20} />
            <h3 className="font-bold text-lg text-white">Calculadora de Taxa</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div className="bg-blue-900/20 border border-blue-800/50 p-3 rounded text-sm text-blue-200 mb-4">
            Preencha os dados da simulação (ex: imagem do banco) para descobrir a taxa de juros real.
          </div>

          <CurrencyInput
            label="Valor Financiado"
            value={financedAmount}
            onChange={setFinancedAmount}
          />

          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Prazo (Meses)"
              value={months}
              onChange={setMonths}
              placeholder="Ex: 48"
            />
            <CurrencyInput
              label="Valor da Parcela"
              value={installmentValue}
              onChange={setInstallmentValue}
              placeholder="R$ 0,00"
            />
          </div>

          {/* Results Box */}
          <div className="mt-6 bg-zinc-950 rounded-lg border border-zinc-800 p-4 relative overflow-hidden">
            {!resultRate && (installmentValue * months <= financedAmount) && installmentValue > 0 ? (
               <div className="flex items-center gap-2 text-red-400 text-sm">
                 <AlertCircle size={16} />
                 <span>Valor total das parcelas é menor que o financiado.</span>
               </div>
            ) : resultRate !== null ? (
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-zinc-400 text-sm">Taxa Mensal</span>
                  <span className="text-2xl font-mono font-bold text-green-400">
                    {formatPercentage(resultRate * 100)} a.m.
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-zinc-400 text-sm">Taxa Anual (Aprox)</span>
                  <span className="text-lg font-mono font-bold text-zinc-300">
                    {formatPercentage((Math.pow(1 + resultRate, 12) - 1) * 100)} a.a.
                  </span>
                </div>
                
                <div className="h-px bg-zinc-800 my-2"></div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Total Pago:</span>
                  <span className="font-mono text-zinc-300">{formatCurrency(totalPaid)}</span>
                </div>
                 <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Juros Totais:</span>
                  <span className="font-mono text-red-300">{formatCurrency(totalInterest)}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-600 py-4 gap-2">
                <TrendingUp size={24} />
                <span className="text-sm">Aguardando valores...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RateCalculatorModal;