
import React, { useMemo, useState } from 'react';
import { X, Coins, TrendingUp, AlertCircle, Calendar, DollarSign, Gift, FileText, Briefcase } from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { CommissionConfig, DealData, SavedCalculation } from '../types';
import { calculateCommission, CommissionBreakdown } from '../utils/commission';

interface CommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDeal: DealData;
  currentProfit: number;
  commissionConfig: CommissionConfig;
  history: SavedCalculation[];
}

const CommissionModal: React.FC<CommissionModalProps> = ({
  isOpen,
  onClose,
  currentDeal,
  currentProfit,
  commissionConfig,
  history
}) => {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  const currentBreakdown = useMemo(() => 
    calculateCommission(currentDeal, currentProfit, commissionConfig), 
  [currentDeal, currentProfit, commissionConfig]);

  // Filtra apenas vendas FECHADAS para o histórico de ganhos
  const closedDeals = useMemo(() => 
    history.filter(h => h.data.dealStatus === 'closed'), 
  [history]);

  // Calcula o total acumulado histórico (Estimado com as regras atuais)
  // Agora considera se a venda foi fechada "Com Banco" ou "Sem Banco" para calcular o lucro base da comissão
  const historyTotal = useMemo(() => {
    return closedDeals.reduce((acc, deal) => {
      // O item.summary.profit geralmente armazena o lucro operacional (standard).
      // Se foi fechado com banco, precisamos somar o bankReturn.
      const baseProfit = deal.summary.profit;
      const finalProfit = deal.data.closingType === 'banking' 
        ? baseProfit + deal.data.bankReturn 
        : baseProfit;

      const breakdown = calculateCommission(deal.data, finalProfit, commissionConfig);
      return acc + breakdown.total;
    }, 0);
  }, [closedDeals, commissionConfig]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-zinc-800 p-4 flex justify-between items-center border-b border-zinc-700">
          <div className="flex items-center gap-2 text-amber-400">
            <Coins size={24} />
            <div>
              <h3 className="font-bold text-lg text-white">Minhas Comissões</h3>
              <p className="text-xs text-zinc-400">Detalhamento de Ganhos</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors bg-zinc-700/50 p-2 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-700 bg-zinc-950">
          <button 
            onClick={() => setActiveTab('current')}
            className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${activeTab === 'current' ? 'bg-zinc-800 text-white border-b-2 border-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <TrendingUp size={16} /> Simulação Atual
          </button>
          <button 
             onClick={() => setActiveTab('history')}
             className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${activeTab === 'history' ? 'bg-zinc-800 text-white border-b-2 border-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Briefcase size={16} /> Extrato de Vendas
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-zinc-950">
          
          {activeTab === 'current' && (
            <div className="space-y-6">
              {/* Card Principal */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-1 rounded-bl">
                  POTENCIAL
                </div>
                <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-1">Comissão Total Estimada</span>
                <span className="text-4xl font-black text-white font-mono">{formatCurrency(currentBreakdown.total)}</span>
                <div className="mt-2 text-xs text-zinc-500 font-medium">
                  Baseado em: <strong className="text-zinc-300">{currentDeal.closingType === 'banking' ? 'COM BANCO' : 'SEM BANCO'}</strong>
                </div>
              </div>

              {/* Detalhamento */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-2">Composição do Valor</h4>
                
                {/* Base Profit */}
                <div className="flex justify-between items-center p-3 bg-zinc-900/50 rounded border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-900/20 text-blue-400 rounded-full"><DollarSign size={16} /></div>
                    <div className="flex flex-col">
                      <span className="font-bold text-zinc-300 text-sm">Comissão Base</span>
                      <span className="text-[10px] text-zinc-500">
                         {commissionConfig.type === 'fixed' ? 'Valor Fixo' : `${commissionConfig.percentage}% sobre Lucro`}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-white">{formatCurrency(currentBreakdown.base + currentBreakdown.fixed)}</span>
                </div>

                {/* Invoice Bonus */}
                {currentBreakdown.invoice > 0 && (
                   <div className="flex justify-between items-center p-3 bg-zinc-900/50 rounded border border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-900/20 text-emerald-400 rounded-full"><FileText size={16} /></div>
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-300 text-sm">Bônus NF</span>
                        <span className="text-[10px] text-zinc-500">% sobre Valor da Nota</span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-emerald-400">{formatCurrency(currentBreakdown.invoice)}</span>
                  </div>
                )}

                {/* Stock Prize */}
                 <div className={`flex justify-between items-center p-3 rounded border transition-colors ${currentBreakdown.stockPrize > 0 ? 'bg-purple-900/10 border-purple-500/30' : 'bg-zinc-900/30 border-zinc-800 opacity-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${currentBreakdown.stockPrize > 0 ? 'bg-purple-900/20 text-purple-400' : 'bg-zinc-800 text-zinc-600'}`}>
                      <Gift size={16} />
                    </div>
                    <div className="flex flex-col">
                      <span className={`font-bold text-sm ${currentBreakdown.stockPrize > 0 ? 'text-purple-200' : 'text-zinc-500'}`}>Prêmio de Estoque</span>
                      <span className="text-[10px] text-zinc-500">
                         {currentDeal.stockDays} dias {currentBreakdown.stockPrize > 0 ? '(Elegível)' : '(Não elegível)'}
                      </span>
                    </div>
                  </div>
                  <span className={`font-mono font-bold ${currentBreakdown.stockPrize > 0 ? 'text-purple-300' : 'text-zinc-600'}`}>
                    {formatCurrency(currentBreakdown.stockPrize)}
                  </span>
                </div>

                {/* Doc Prize */}
                <div className={`flex justify-between items-center p-3 rounded border transition-colors ${currentBreakdown.docPrize > 0 ? 'bg-cyan-900/10 border-cyan-500/30' : 'bg-zinc-900/30 border-zinc-800 opacity-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${currentBreakdown.docPrize > 0 ? 'bg-cyan-900/20 text-cyan-400' : 'bg-zinc-800 text-zinc-600'}`}>
                      <FileText size={16} />
                    </div>
                    <div className="flex flex-col">
                      <span className={`font-bold text-sm ${currentBreakdown.docPrize > 0 ? 'text-cyan-200' : 'text-zinc-500'}`}>Bônus Documentação</span>
                      <span className="text-[10px] text-zinc-500">
                         Sobre valor cobrado ({formatCurrency(currentDeal.costs.documentation)})
                      </span>
                    </div>
                  </div>
                  <span className={`font-mono font-bold ${currentBreakdown.docPrize > 0 ? 'text-cyan-300' : 'text-zinc-600'}`}>
                    {formatCurrency(currentBreakdown.docPrize)}
                  </span>
                </div>

              </div>

              {currentProfit < commissionConfig.minProfitThreshold && currentBreakdown.total > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-500 bg-amber-900/10 p-3 rounded border border-amber-900/30">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <p>O lucro operacional está abaixo do mínimo ({formatCurrency(commissionConfig.minProfitThreshold)}), portanto a comissão base é zero. Você está recebendo apenas os bônus.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-zinc-900 p-4 rounded border border-zinc-800">
                <span className="text-zinc-400 font-bold uppercase text-xs">Total Acumulado (Fechadas)</span>
                <span className="text-2xl font-bold text-green-400 font-mono">{formatCurrency(historyTotal)}</span>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-2">Vendas Realizadas</h4>
                
                {closedDeals.length === 0 ? (
                  <div className="text-center py-8 text-zinc-600">
                    <Briefcase size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhuma venda fechada registrada ainda.</p>
                  </div>
                ) : (
                  closedDeals.map((deal) => {
                     // Recalcula o lucro final do negócio com base na opção de fechamento
                     const baseProfit = deal.summary.profit;
                     const finalProfit = deal.data.closingType === 'banking' 
                        ? baseProfit + deal.data.bankReturn 
                        : baseProfit;

                     const dealBreakdown = calculateCommission(deal.data, finalProfit, commissionConfig);
                     
                     return (
                        <div key={deal.id} className="bg-zinc-900 p-3 rounded border border-zinc-800 flex justify-between items-center hover:bg-zinc-800 transition-colors">
                          <div className="flex flex-col">
                             <div className="flex items-center gap-2 mb-1">
                               <span className="text-xs text-zinc-500 font-mono">{deal.timestamp}</span>
                               <span className="text-xs font-bold text-white bg-zinc-700 px-1.5 rounded">{deal.data.licensePlate || 'S/ Placa'}</span>
                             </div>
                             <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                <span>Lucro: {formatCurrency(finalProfit)}</span>
                                <span className={`uppercase font-bold ${deal.data.closingType === 'banking' ? 'text-blue-400' : 'text-zinc-500'}`}>
                                  ({deal.data.closingType === 'banking' ? 'Com Banco' : 'Padrão'})
                                </span>
                             </div>
                          </div>
                          <div className="flex flex-col items-end">
                             <span className="text-green-400 font-bold font-mono">{formatCurrency(dealBreakdown.total)}</span>
                             <div className="flex gap-1">
                                {dealBreakdown.stockPrize > 0 && <span title="Prêmio Estoque" className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>}
                                {dealBreakdown.docPrize > 0 && <span title="Prêmio Doc" className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>}
                             </div>
                          </div>
                        </div>
                     );
                  })
                )}
              </div>
              
              <div className="text-[10px] text-zinc-600 text-center pt-4 border-t border-zinc-900">
                * Os valores históricos são estimados com base nas regras de comissão vigentes atualmente.
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default CommissionModal;
