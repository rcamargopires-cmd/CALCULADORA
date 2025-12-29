
import React, { useState, useEffect } from 'react';
import { Calculator, Calendar, Percent, Wallet, Settings2, Info } from 'lucide-react';
import CurrencyInput from './CurrencyInput';
import SectionHeader from './SectionHeader';
import { calculatePMT, calculateEstimatedIOF } from '../utils/finance';
import { formatCurrency } from '../utils/currency';

interface FinancingSimulatorProps {
  initialVehicleValue: number;
}

const FinancingSimulator: React.FC<FinancingSimulatorProps> = ({ initialVehicleValue }) => {
  const [vehicleValue, setVehicleValue] = useState(initialVehicleValue);
  const [entryValue, setEntryValue] = useState(0);
  const [entryPercent, setEntryPercent] = useState(0);
  const [monthlyRate, setMonthlyRate] = useState(2.39); // Default baseado nas imagens (aprox)
  const [term, setTerm] = useState(48);
  
  // Novos estados para Custos Bancários
  const [showBankCosts, setShowBankCosts] = useState(true); // Aberto por padrão para mostrar pq a conta não batia
  const [tacValue, setTacValue] = useState(950); // Média de mercado para TAC
  const [includeIOF, setIncludeIOF] = useState(true);

  // Sincroniza valor inicial se vier do pai (apenas na primeira carga ou se for 0)
  useEffect(() => {
    if (initialVehicleValue > 0 && vehicleValue === 0) {
      setVehicleValue(initialVehicleValue);
    }
  }, [initialVehicleValue]);

  // Atualiza % quando valor muda
  const handleEntryValueChange = (val: number) => {
    setEntryValue(val);
    if (vehicleValue > 0) {
      setEntryPercent((val / vehicleValue) * 100);
    }
  };

  // Atualiza Valor quando % muda
  const handleEntryPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseFloat(e.target.value) || 0;
    setEntryPercent(pct);
    setVehicleValue(prev => {
      setEntryValue(prev * (pct / 100));
      return prev;
    });
  };

  // Cálculos Financeiros Completos
  const netBalance = Math.max(0, vehicleValue - entryValue); // Saldo Devedor (Lataria)
  
  // IOF é calculado sobre (Saldo + TAC)
  const baseForIOF = netBalance + tacValue;
  const iofValue = includeIOF ? calculateEstimatedIOF(baseForIOF, term) : 0;
  
  // O banco financia TUDO: Saldo + TAC + IOF
  const totalFinancedAmount = netBalance + tacValue + iofValue;
  
  const installment = calculatePMT(totalFinancedAmount, monthlyRate / 100, term);
  
  // Coeficiente real (Parcela / Saldo Líquido) para o vendedor saber
  const coefficient = netBalance > 0 ? installment / netBalance : 0;

  return (
    <div className="mt-8 border-t-2 border-zinc-800 pt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-blue-400">
          <Wallet className="w-6 h-6" />
          <h2 className="text-xl font-black uppercase tracking-wide">Simulador de Parcela (Cliente)</h2>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg p-6 border border-blue-900/30 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-bl">
          VISÃO DO CLIENTE
        </div>

        {/* Linha 1: Veículo e Entrada */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <CurrencyInput
            label="Valor do Veículo"
            value={vehicleValue}
            onChange={(v) => {
              setVehicleValue(v);
              setEntryValue(v * (entryPercent / 100));
            }}
          />
          
          <div className="flex gap-2 items-end">
             <div className="flex-1">
               <CurrencyInput
                label="Entrada (R$)"
                value={entryValue}
                onChange={handleEntryValueChange}
              />
             </div>
             <div className="w-24 flex flex-col mb-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase mb-1 text-right">%</label>
                <input 
                  type="number" 
                  value={entryPercent.toFixed(0)}
                  onChange={handleEntryPercentChange}
                  className="bg-zinc-800 border border-zinc-700 rounded p-1 text-center text-white font-mono text-sm h-[38px]"
                />
             </div>
          </div>
        </div>

        {/* Toggle Custos Bancários */}
        <div className="mb-4">
          <button 
            onClick={() => setShowBankCosts(!showBankCosts)}
            className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-blue-400 transition-colors"
          >
            <Settings2 size={14} />
            {showBankCosts ? 'Ocultar Taxas Bancárias (TAC/IOF)' : 'Configurar Taxas Bancárias (TAC/IOF)'}
          </button>

          {showBankCosts && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-950/50 p-4 rounded border border-zinc-800 animate-fade-in">
               <CurrencyInput
                label="TAC / Taxas (R$)"
                value={tacValue}
                onChange={setTacValue}
                placeholder="Ex: 950,00"
              />
              <div className="flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={includeIOF}
                    onChange={(e) => setIncludeIOF(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-900"
                  />
                  <span className="text-sm text-zinc-300">Incluir IOF Automático</span>
                </label>
                <span className="text-xs text-zinc-500 ml-6 mt-1">Est. {formatCurrency(iofValue)}</span>
              </div>
              <div className="flex flex-col justify-center border-l border-zinc-800 pl-4">
                 <span className="text-[10px] uppercase font-bold text-zinc-500">Valor Total Financiado</span>
                 <span className="font-mono font-bold text-blue-200 text-lg">
                   {formatCurrency(totalFinancedAmount)}
                 </span>
                 <span className="text-[10px] text-zinc-600">Base para cálculo de juros</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-end">
           <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">
                Prazo (Meses)
              </label>
              <div className="flex gap-2">
                {[24, 36, 48, 60].map(t => (
                  <button
                    key={t}
                    onClick={() => setTerm(t)}
                    className={`flex-1 py-2 rounded font-bold text-sm transition-all ${term === t ? 'bg-blue-600 text-white shadow-lg scale-105' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                  >
                    {t}x
                  </button>
                ))}
              </div>
           </div>

           <div className="flex flex-col">
             <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
               <Percent size={12} /> Taxa Mensal (%)
             </label>
             <input
                type="number"
                step="0.01"
                value={monthlyRate}
                onChange={(e) => setMonthlyRate(parseFloat(e.target.value) || 0)}
                className="w-full border border-zinc-700 bg-zinc-800 rounded px-3 py-2 text-right font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <span className="text-[10px] text-zinc-500 text-right mt-1" title="Fator multiplicador sobre o valor líquido">
                Coeficiente Real: {coefficient.toFixed(5)}
              </span>
           </div>
        </div>

        {/* Result Display */}
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 flex flex-col items-center justify-center relative">
           <span className="text-blue-300 text-xs uppercase font-bold mb-1">Valor Estimado da Parcela</span>
           <div className="text-4xl font-black text-white font-mono tracking-tight">
             {term}x {formatCurrency(installment)}
           </div>
           <div className="mt-2 flex items-center gap-4 text-xs text-blue-400/60">
             <span>Líquido: {formatCurrency(netBalance)}</span>
             <span className="w-px h-3 bg-blue-800"></span>
             <span>Total Financiado: {formatCurrency(totalFinancedAmount)}</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default FinancingSimulator;
