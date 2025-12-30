
import React, { useState, useMemo, useEffect } from 'react';
import { Calculator, RefreshCw, Sparkles, AlertTriangle, Building2, Save, History, ArrowRight, CarFront, Clock, AlertOctagon, Percent, Info, LogOut, ShieldCheck, FolderOpen, Coins, Wallet, User as UserIcon, CheckCircle, Gift, FileText, Check } from 'lucide-react';
import CurrencyInput from './components/CurrencyInput';
import TextInput from './components/TextInput';
import NumberInput from './components/NumberInput';
import SectionHeader from './components/SectionHeader';
import RateCalculatorModal from './components/RateCalculatorModal';
import FinancingSimulator from './components/FinancingSimulator';
import LoginScreen from './components/LoginScreen';
import AdminPanel from './components/AdminPanel';
import CommissionModal from './components/CommissionModal';
import { DealData, CalculationResult, SavedCalculation, BankType, User, UserRole, FieldVisibility, CommissionConfig } from './types';
import { formatCurrency, formatPercentage } from './utils/currency';
import { analyzeDeal } from './services/geminiService';
import { useBankCalculator } from './hooks/useBankCalculator';
import { userService } from './services/userService';
import { configService } from './services/configService';
import { calculateCommission } from './utils/commission';

// Helper para garantir um estado inicial limpo e novo (sem referências compartilhadas)
const getInitialData = (): DealData => ({
  licensePlate: '',
  fipeValue: 0, 
  stockDays: 0,
  invoiceValue: 0,
  vehicleCost: 0,
  bankReturn: 0,
  payments: {
    entry: 0,
    financing: 0,
    tradeIn: 0,
  },
  costs: {
    documentation: 0,
    accessories: 0,
    payoff: 0,
    debts: 0,
    others: 0,
  },
  dealStatus: 'open' as const,
  closingType: 'standard' as const // Padrão inicia sem banco
});

const App: React.FC = () => {
  // Inicializa usuários padrão se necessário
  useEffect(() => {
    userService.initialize();
  }, []);

  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);

  // --- Config State ---
  const [fieldConfig, setFieldConfig] = useState<FieldVisibility>(configService.getVisibility());
  const [commissionConfig, setCommissionConfig] = useState<CommissionConfig>(configService.getCommission());

  // --- App State ---
  const [data, setData] = useState<DealData>(getInitialData());

  // Hook customizado para lógica bancária
  const { bankType, setBankType, getReturnAmount } = useBankCalculator('volks');

  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isCommissionModalOpen, setIsCommissionModalOpen] = useState(false); // Modal de Comissões
  
  // Estado do Histórico (Visualização)
  const [history, setHistory] = useState<SavedCalculation[]>([]);

  // Carrega e filtra histórico sempre que o usuário mudar
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    try {
      const savedRaw = localStorage.getItem('dealHistory');
      const allHistory: SavedCalculation[] = savedRaw ? JSON.parse(savedRaw) : [];
      
      if (user.role === 'admin') {
        // Admin vê tudo
        setHistory(allHistory);
      } else {
        // Vendedor vê apenas os seus
        const myHistory = allHistory.filter(item => item.userId === user.id);
        setHistory(myHistory);
      }
    } catch (e) {
      console.error("Erro ao carregar histórico", e);
      setHistory([]);
    }
  }, [user]);

  // Atualiza config quando o painel admin salva
  const handleConfigUpdate = () => {
    setFieldConfig(configService.getVisibility());
    setCommissionConfig(configService.getCommission());
  };

  // --- Calculations ---
  const results: CalculationResult = useMemo(() => {
    const totalPayment = 
      data.payments.entry + 
      data.payments.financing + 
      data.payments.tradeIn;

    const totalCosts = 
      data.costs.documentation + 
      data.costs.accessories + 
      data.costs.payoff + 
      data.costs.debts + 
      data.costs.others;

    // Net revenue is what stays in the house before paying for the car itself
    const netRevenue = totalPayment - totalCosts;

    // Base Profit
    const profit = netRevenue - data.vehicleCost;
    
    // Margin based on Invoice Value
    const marginPercent = data.invoiceValue > 0 
      ? (profit / data.invoiceValue) * 100 
      : 0;

    // Profit with Bank Return (Bonus)
    const profitWithBank = profit + data.bankReturn;
    const marginPercentWithBank = data.invoiceValue > 0
      ? (profitWithBank / data.invoiceValue) * 100
      : 0;

    return {
      totalPayment,
      totalCosts,
      netRevenue,
      profit,
      marginPercent,
      profitWithBank,
      marginPercentWithBank,
    };
  }, [data]);

  // --- Commission Breakdown (Cálculo dinâmico baseado na seleção) ---
  const commissionBreakdown = useMemo(() => {
    // Determina qual lucro usar com base na escolha do usuário (Standard ou Banking)
    const activeProfit = data.closingType === 'banking' ? results.profitWithBank : results.profit;
    return calculateCommission(data, activeProfit, commissionConfig);
  }, [data, results.profit, results.profitWithBank, commissionConfig]);

  // --- Validação de Placa em Tempo Real ---
  const isPlateValid = useMemo(() => {
    const plate = data.licensePlate;
    if (!plate) return null;
    
    const clean = plate.replace(/[^A-Z0-9]/g, '');
    if (clean.length < 7) return null;
    
    const oldFormat = /^[A-Z]{3}\d{4}$/;
    const mercosulFormat = /^[A-Z]{3}\d[A-Z]\d{2}$/;
    return oldFormat.test(clean) || mercosulFormat.test(clean);
  }, [data.licensePlate]);

  // --- Helpers for Stock Age ---
  const getStockStatus = (days: number) => {
    const safeDays = Number(days) || 0;

    if (safeDays >= 120) return { 
      label: 'SUPER VELHO', 
      color: 'bg-purple-600', 
      textColor: 'text-white',
      icon: <AlertOctagon size={16} className="animate-pulse" /> 
    };
    
    if (safeDays >= 90) return { 
      label: 'VELHO', 
      color: 'bg-red-600', 
      textColor: 'text-white',
      icon: <AlertTriangle size={16} /> 
    };

    if (safeDays >= 61) return { 
      label: 'ENVELHECIDO', 
      color: 'bg-orange-500', 
      textColor: 'text-white',
      icon: <AlertTriangle size={16} /> 
    };

    if (safeDays >= 31) return { 
      label: 'MÉDIO', 
      color: 'bg-yellow-500', 
      textColor: 'text-black',
      icon: <Clock size={16} /> 
    };

    return { 
      label: 'RECENTE', 
      color: 'bg-green-600', 
      textColor: 'text-white',
      icon: <Sparkles size={16} /> 
    };
  };

  const stockStatus = getStockStatus(data.stockDays);

  // --- Handlers ---
  const handleLogin = (authenticatedUser: User) => {
    setUser(authenticatedUser);
  };

  const handleLogout = () => {
    setUser(null);
    handleResetNoConfirm();
  };

  const updatePayment = (field: keyof typeof data.payments, value: number) => {
    setData(prev => {
      const newData = {
        ...prev,
        payments: { ...prev.payments, [field]: value }
      };
      if (field === 'financing') {
        newData.bankReturn = getReturnAmount(value);
      }
      return newData;
    });
  };

  const handleBankTypeChange = (type: BankType) => {
    setBankType(type);
    setData(prev => ({
      ...prev,
      bankReturn: getReturnAmount(prev.payments.financing, type)
    }));
  };

  const updateCost = (field: keyof typeof data.costs, value: number) => {
    setData(prev => ({
      ...prev,
      costs: { ...prev.costs, [field]: value }
    }));
  };

const handleAnalyze = async () => {
    // Ajustado para ler a chave que você salvou na Vercel
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      setAnalysis("⚠️ Chave de API não encontrada. Verifique as configurações na Vercel.");
      return;
    }
    setIsAnalyzing(true);
    setAnalysis(null);
    try {
      const result = await analyzeDeal(data, results);
      setAnalysis(result);
    } catch (error) {
      setAnalysis("❌ Erro técnico ao processar análise.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = (status: 'open' | 'closed' = 'open') => {
    if (!user) return;

    const dataSnapshot = JSON.parse(JSON.stringify(data));
    dataSnapshot.dealStatus = status;
    
    const newItem: SavedCalculation = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      data: dataSnapshot,
      bankType,
      summary: {
        // Salva o lucro padrão operacional na summary para listagem rápida, 
        // mas o cálculo real de histórico usará data.closingType para decidir
        profit: results.profit, 
        marginPercent: results.marginPercent
      },
      userId: user.id,
      userName: user.name
    };

    const savedRaw = localStorage.getItem('dealHistory');
    const allHistory: SavedCalculation[] = savedRaw ? JSON.parse(savedRaw) : [];
    const newAllHistory = [newItem, ...allHistory].slice(0, 50);
    
    localStorage.setItem('dealHistory', JSON.stringify(newAllHistory));

    if (user.role === 'admin') {
      setHistory(newAllHistory);
    } else {
      setHistory(newAllHistory.filter(h => h.userId === user.id));
    }

    if (status === 'closed') {
      alert("Parabéns! Venda FECHADA e registrada com sucesso.");
    }
  };

  const handleResetNoConfirm = () => {
    setData(getInitialData());
    setBankType('volks');
    setAnalysis(null);
  };

  const handleReset = () => {
    if (window.confirm('Tem certeza que deseja limpar todo o formulário?')) {
      handleResetNoConfirm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const restoreCalculation = (item: SavedCalculation) => {
    const restoredData: DealData = {
      ...getInitialData(),
      ...item.data,
      // Força conversão para número para evitar problemas com dados antigos
      stockDays: Number(item.data.stockDays) || 0,
      invoiceValue: Number(item.data.invoiceValue) || 0,
      vehicleCost: Number(item.data.vehicleCost) || 0,
      // Recupera o tipo de fechamento ou usa padrão
      closingType: item.data.closingType || 'standard',
    };

    setBankType(item.bankType || 'volks');
    setData(restoredData);
    setAnalysis(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8 font-sans text-white">
      {/* Modais Auxiliares */}
      <RateCalculatorModal 
        isOpen={isRateModalOpen} 
        onClose={() => setIsRateModalOpen(false)}
        initialFinancedAmount={data.payments.financing}
      />

      <AdminPanel 
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
        currentUser={user}
        onConfigUpdate={handleConfigUpdate}
      />

      {/* Novo Modal de Comissões */}
      <CommissionModal 
        isOpen={isCommissionModalOpen}
        onClose={() => setIsCommissionModalOpen(false)}
        currentDeal={data}
        // Passa o lucro correto baseado na seleção para o modal de detalhe atual
        currentProfit={data.closingType === 'banking' ? results.profitWithBank : results.profit}
        commissionConfig={commissionConfig}
        history={history}
      />

      <div className="max-w-6xl mx-auto">
        
        {/* Navbar */}
        <div className="bg-zinc-900 border-b border-zinc-800 -mx-4 -mt-8 px-8 py-3 mb-8 flex justify-between items-center shadow-lg">
           <div className="flex items-center gap-2">
             <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-black ${user.role === 'admin' ? 'bg-red-500' : 'bg-blue-500'}`}>
               {user.username.charAt(0).toUpperCase()}
             </div>
             <div className="flex flex-col">
               <span className="text-sm font-bold text-white leading-none">{user.name}</span>
               <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{user.role === 'admin' ? 'Administrador' : 'Vendedor'}</span>
             </div>
           </div>
           
           <div className="flex items-center gap-4">
              {user.role === 'admin' && (
                <button 
                  onClick={() => setIsAdminPanelOpen(true)}
                  className="flex items-center gap-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded transition-colors text-red-400"
                >
                  <ShieldCheck size={14} />
                  PAINEL ADMIN
                </button>
              )}
              <div className="h-6 w-px bg-zinc-700"></div>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-white transition-colors"
              >
                <LogOut size={14} />
                SAIR
              </button>
           </div>
        </div>

        {/* Top Header */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-2">
              <Calculator className="w-8 h-8 text-amber-400" />
              Calculadora de Margem
            </h1>
            <p className="text-zinc-400 mt-1">Ferramenta de estruturação de vendas de veículos</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {commissionConfig.enabled && (
               <button
                 className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-amber-500/30 text-amber-400 rounded hover:bg-zinc-700 hover:border-amber-400 transition-all shadow-sm font-bold active:scale-95"
                 onClick={() => setIsCommissionModalOpen(true)} 
               >
                 <Coins size={18} />
                 Minhas Comissões
               </button>
            )}
             <button 
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded hover:bg-zinc-700 transition-colors shadow-sm font-medium"
            >
              <RefreshCw size={18} />
              Limpar
            </button>
            <button 
              onClick={() => handleSave('open')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 border border-blue-500 text-white rounded hover:bg-blue-500 transition-colors shadow-sm font-bold"
            >
              <Save size={18} />
              Salvar
            </button>
            <button 
              onClick={() => handleSave('closed')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 border border-green-500 text-white rounded hover:bg-green-500 transition-colors shadow-sm font-bold"
            >
              <CheckCircle size={18} />
              FECHAR VENDA
            </button>
            <button 
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 bg-amber-400 text-black font-bold rounded shadow hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              <Sparkles size={18} />
              {isAnalyzing ? 'Analisando...' : 'Análise IA'}
            </button>
          </div>
        </header>

        {/* Top Inputs: Vehicle Data & Basics */}
        <div className="bg-zinc-900 p-6 rounded-lg shadow-sm border border-zinc-800 mb-6 relative overflow-hidden">
           {data.stockDays >= 31 && (
              <div className={`absolute top-0 left-0 right-0 h-1 ${stockStatus.color}`}></div>
           )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {fieldConfig.licensePlate && (
                <div className="md:col-span-1 relative">
                  <TextInput 
                    label="Placa do Veículo" 
                    value={data.licensePlate || ''} 
                    onChange={(v) => setData(prev => ({...prev, licensePlate: v.toUpperCase()}))}
                    placeholder="ABC-1234"
                    maxLength={8}
                    isValid={isPlateValid}
                  />
                </div>
              )}

              {fieldConfig.stockDays && (
                <div className="md:col-span-1 relative">
                  <NumberInput
                    label="Dias de Estoque"
                    value={data.stockDays || 0}
                    onChange={(v) => setData(prev => ({...prev, stockDays: v}))}
                    placeholder="0"
                  />
                  {(data.stockDays || 0) >= 0 && (
                    <div className={`absolute -top-2 right-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm ${stockStatus.color} ${stockStatus.textColor} transition-colors`}>
                        {stockStatus.icon}
                        {stockStatus.label}
                    </div>
                  )}
                </div>
              )}
              
             {fieldConfig.invoiceValue && (
               <CurrencyInput 
                  label="Valor da Nota Fiscal" 
                  value={data.invoiceValue} 
                  onChange={(v) => setData(prev => ({...prev, invoiceValue: v}))}
                  className="md:col-span-1"
                />
             )}
              
             {fieldConfig.vehicleCost && (
                <CurrencyInput 
                  label="Custo do Veículo" 
                  value={data.vehicleCost} 
                  onChange={(v) => setData(prev => ({...prev, vehicleCost: v}))}
                  className="md:col-span-1"
                />
             )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: Inputs */}
          <div className="lg:col-span-7 space-y-8">
            
            <section>
              <SectionHeader title="Forma de Pagamento" />
              <div className="bg-zinc-900 p-6 rounded-lg shadow-sm border border-zinc-800 space-y-4">
                {fieldConfig.entry && (
                  <CurrencyInput 
                    label="Entrada" 
                    value={data.payments.entry} 
                    onChange={(v) => updatePayment('entry', v)} 
                  />
                )}
                
                {fieldConfig.financing && (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                    <div className="sm:col-span-7 relative">
                      <CurrencyInput 
                        label="Financiamento" 
                        value={data.payments.financing} 
                        onChange={(v) => updatePayment('financing', v)} 
                      />
                      <button 
                        onClick={() => setIsRateModalOpen(true)}
                        className="absolute top-0 right-0 text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                        title="Calcular taxa de juros deste financiamento"
                      >
                        <Percent size={10} /> Calc. Taxa
                      </button>
                    </div>
                    <div className="sm:col-span-5 flex flex-col">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Building2 size={14} /> Instituição
                      </label>
                      <select 
                        value={bankType}
                        onChange={(e) => handleBankTypeChange(e.target.value as BankType)}
                        className="w-full h-[42px] border border-zinc-700 bg-zinc-800 rounded px-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="volks">Banco Volks (13.0%)</option>
                        <option value="others">Outros Bancos (3.6%)</option>
                      </select>
                    </div>
                  </div>
                )}

                {fieldConfig.tradeIn && (
                  <CurrencyInput 
                    label="Carro na Troca" 
                    value={data.payments.tradeIn} 
                    onChange={(v) => updatePayment('tradeIn', v)} 
                  />
                )}
                <div className="pt-4 mt-4 border-t border-zinc-800 flex justify-between items-end">
                  <span className="font-bold text-white text-lg">TOTAL RECEBIDO</span>
                  <span className="font-bold text-2xl text-blue-400 font-mono">
                    {formatCurrency(results.totalPayment)}
                  </span>
                </div>
              </div>
            </section>

            <section>
              <SectionHeader title="Custos da Operação" />
              <div className="bg-zinc-900 p-6 rounded-lg shadow-sm border border-zinc-800 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {fieldConfig.documentation && (
                    <CurrencyInput 
                      label="Documentação" 
                      value={data.costs.documentation} 
                      onChange={(v) => updateCost('documentation', v)} 
                    />
                  )}
                  {fieldConfig.accessories && (
                    <CurrencyInput 
                      label="Acessórios" 
                      value={data.costs.accessories} 
                      onChange={(v) => updateCost('accessories', v)} 
                    />
                  )}
                  {fieldConfig.payoff && (
                    <CurrencyInput 
                      label="Quitação (Troca)" 
                      value={data.costs.payoff} 
                      onChange={(v) => updateCost('payoff', v)} 
                    />
                  )}
                  {fieldConfig.debts && (
                    <CurrencyInput 
                      label="Débitos (Troca)" 
                      value={data.costs.debts} 
                      onChange={(v) => updateCost('debts', v)} 
                    />
                  )}
                  {fieldConfig.others && (
                    <CurrencyInput 
                      label="Outros / Despachante" 
                      value={data.costs.others} 
                      onChange={(v) => updateCost('others', v)} 
                    />
                  )}
                </div>
                <div className="pt-4 mt-4 border-t border-zinc-800 flex justify-between items-end">
                  <span className="font-bold text-white text-lg">TOTAL CUSTOS</span>
                  <span className="font-bold text-2xl text-red-400 font-mono">
                    {formatCurrency(results.totalCosts)}
                  </span>
                </div>
              </div>
            </section>

          </div>

          {/* RIGHT COLUMN: Results & Simulation */}
          <div className="lg:col-span-5 space-y-8">
            
             <section className="sticky top-8">
                <SectionHeader title="Margem & Resultados" />
                <div className="bg-zinc-900 rounded-lg shadow-lg border border-zinc-800 overflow-hidden">
                  
                  <div className="p-6 bg-zinc-950/50 border-b border-zinc-800">
                     <div className="flex justify-between mb-2">
                       <span className="text-zinc-400">Receita Líquida (Pagto - Custos)</span>
                       <span className="font-mono font-bold text-white">{formatCurrency(results.netRevenue)}</span>
                     </div>
                     <div className="flex justify-between mb-4">
                       <span className="text-zinc-400">(-) Custo Veículo</span>
                       <span className="font-mono text-red-400">{formatCurrency(data.vehicleCost)}</span>
                     </div>
                  </div>

                  {/* Resultados Selecionáveis */}
                  <div className="divide-y divide-zinc-800">
                    
                    {/* Opção 1: Sem Banco */}
                    <div 
                      onClick={() => setData(prev => ({...prev, closingType: 'standard'}))}
                      className={`p-4 flex items-stretch cursor-pointer transition-all hover:bg-zinc-800/50 relative border-l-4 ${data.closingType === 'standard' ? 'bg-zinc-800 border-l-amber-500' : 'border-l-transparent'}`}
                    >
                      {data.closingType === 'standard' && (
                        <div className="absolute right-2 top-2 text-amber-500">
                          <Check size={16} />
                        </div>
                      )}
                      <div className="flex-1 flex flex-col justify-center">
                        <span className={`font-bold uppercase text-sm ${data.closingType === 'standard' ? 'text-amber-400' : 'text-zinc-300'}`}>Sem Banco / Padrão</span>
                        <span className="text-2xl font-bold text-white font-mono mt-1">
                          {formatCurrency(results.profit)}
                        </span>
                      </div>
                      <div className={`w-32 flex items-center justify-center font-bold text-2xl font-mono rounded-lg ml-4 shadow-sm ${results.marginPercent > 8 ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                         {formatPercentage(results.marginPercent)}
                      </div>
                    </div>

                    {/* Opção 2: Com Banco */}
                    <div 
                      onClick={() => setData(prev => ({...prev, closingType: 'banking'}))}
                      className={`p-4 flex items-stretch cursor-pointer transition-all hover:bg-blue-900/30 relative border-l-4 ${data.closingType === 'banking' ? 'bg-blue-900/20 border-l-blue-500' : 'bg-blue-900/10 border-l-transparent'}`}
                    >
                      {data.closingType === 'banking' && (
                        <div className="absolute right-2 top-2 text-blue-500">
                          <Check size={16} />
                        </div>
                      )}
                      <div className="flex-1 flex flex-col justify-center">
                        <span className={`font-bold uppercase text-sm flex items-center gap-2 ${data.closingType === 'banking' ? 'text-blue-300' : 'text-zinc-400'}`}>
                           Com Banco (Bônus)
                        </span>
                        <span className="text-2xl font-bold text-blue-200 font-mono mt-1">
                          {formatCurrency(results.profitWithBank)}
                        </span>
                        <span className="text-xs text-blue-400/60 mt-1">
                          (+ {formatCurrency(data.bankReturn)} via {bankType === 'volks' ? 'Volks' : 'Outros'})
                        </span>
                      </div>
                       <div className={`w-32 flex items-center justify-center text-white font-bold text-2xl font-mono rounded-lg ml-4 shadow-sm ${results.marginPercentWithBank > 8 ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                         {formatPercentage(results.marginPercentWithBank)}
                      </div>
                    </div>
                    
                    {commissionConfig.enabled && (
                      <div className="p-4 flex flex-col gap-2 bg-amber-900/10 border-t border-amber-900/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                             <div className="p-2 rounded-full bg-amber-400/20 text-amber-400">
                               <Wallet size={20} />
                             </div>
                             <div className="flex flex-col">
                               <span className="font-bold text-amber-200 text-sm uppercase">Comissão Estimada</span>
                               <span className="text-xs text-amber-400/60">
                                 Sobre opção: <strong className="text-amber-200">{data.closingType === 'standard' ? 'Sem Banco' : 'Com Banco'}</strong>
                               </span>
                             </div>
                          </div>
                          <div className="text-xl font-bold font-mono text-amber-400">
                            {formatCurrency(commissionBreakdown.total)}
                          </div>
                        </div>

                        {commissionBreakdown.stockPrize > 0 && (
                          <div className="flex justify-between items-center text-xs text-purple-300 bg-purple-900/30 px-3 py-1.5 rounded border border-purple-500/30 mt-1 animate-fade-in">
                            <span className="flex items-center gap-1.5 font-bold">
                              <Gift size={12} className="text-purple-400" /> 
                              Premiação Estoque ({data.stockDays}d)
                            </span>
                            <span className="font-mono font-bold text-purple-200">+ {formatCurrency(commissionBreakdown.stockPrize)}</span>
                          </div>
                        )}

                        {commissionBreakdown.docPrize > 0 && (
                          <div className="flex justify-between items-center text-xs text-cyan-300 bg-cyan-900/30 px-3 py-1.5 rounded border border-cyan-500/30 mt-1 animate-fade-in">
                            <span className="flex items-center gap-1.5 font-bold">
                              <FileText size={12} className="text-cyan-400" /> 
                              Bônus Documentação
                            </span>
                            <span className="font-mono font-bold text-cyan-200">+ {formatCurrency(commissionBreakdown.docPrize)}</span>
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                  {results.profit < 0 && (
                    <div className="bg-red-900/20 border border-red-500/50 p-4 flex items-center gap-3 text-red-200 animate-fade-in rounded-md m-4 shadow-[0_0_15px_rgba(220,38,38,0.15)]">
                      <AlertTriangle className="w-6 h-6 text-red-500 animate-pulse flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-bold text-red-100">Atenção: Prejuízo Operacional!</span>
                        <span className="text-xs text-red-300/80">A venda depende do retorno bancário para ser positiva.</span>
                      </div>
                    </div>
                  )}
                </div>
                
                <FinancingSimulator initialVehicleValue={data.invoiceValue} />

                {analysis && (
                  <div className="mt-6 bg-indigo-900/20 border border-indigo-800/50 rounded-lg p-6 animate-fade-in">
                    <div className="flex items-center gap-2 mb-4 text-indigo-300">
                      <Sparkles className="w-5 h-5" />
                      <h3 className="font-bold text-lg">Análise Inteligente</h3>
                    </div>
                    <div className="prose prose-sm text-zinc-300 font-medium leading-relaxed">
                      <div dangerouslySetInnerHTML={{ __html: analysis.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
                    </div>
                  </div>
                )}

                {history.length > 0 && (
                  <div className="mt-8">
                    <div className="flex items-center gap-2 mb-4 text-zinc-400">
                      <History className="w-5 h-5" />
                      <h3 className="font-bold text-sm uppercase tracking-wider">Histórico Recente</h3>
                    </div>
                    <div className="space-y-3">
                      {history.map((item) => (
                        <div 
                          key={item.id}
                          className={`group bg-zinc-900 border ${item.data.dealStatus === 'closed' ? 'border-green-800/50 bg-green-900/10' : 'border-zinc-800'} rounded-lg p-3 flex justify-between items-center transition-all hover:border-amber-400/30`}
                        >
                          <div className="flex flex-col flex-1 mr-4">
                             <div className="flex justify-between items-baseline mb-1">
                               <span className="text-xs text-zinc-500 font-mono">{item.timestamp}</span>
                               <div className="flex items-center gap-2">
                                 {(item.data.dealStatus === 'closed') && (
                                   <span className="text-[9px] font-black uppercase bg-green-600 text-white px-1.5 py-0.5 rounded tracking-wide">
                                     FECHADA
                                   </span>
                                 )}
                                 {item.data.licensePlate ? (
                                   <span className="flex items-center gap-1 text-xs font-bold text-amber-300 bg-amber-900/30 px-1.5 py-0.5 rounded border border-amber-800/50">
                                     <CarFront size={10} />
                                     {item.data.licensePlate}
                                   </span>
                                 ) : <span className="text-[10px] text-zinc-700 uppercase">Sem placa</span>}
                               </div>
                             </div>

                             {user.role === 'admin' && item.userName && (
                               <div className="flex items-center gap-1 mt-0.5 mb-1 text-zinc-500">
                                 <UserIcon size={10} />
                                 <span className="text-[10px] font-bold uppercase">{item.userName}</span>
                               </div>
                             )}

                             <div className="flex items-center gap-2 mt-1">
                               {/* Mostra o lucro real baseado na seleção de fechamento, se disponível */}
                               <span className="text-zinc-300 font-bold font-mono text-lg">
                                 {formatCurrency(
                                   item.data.closingType === 'banking' 
                                    ? item.summary.profit + item.data.bankReturn 
                                    : item.summary.profit
                                 )}
                               </span>
                               {item.data.closingType === 'banking' && (
                                 <span className="text-[9px] font-bold text-blue-400 uppercase bg-blue-900/20 px-1 rounded">COM BANCO</span>
                               )}
                             </div>
                          </div>
                          
                          <button 
                            onClick={() => restoreCalculation(item)}
                            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-xs font-bold px-3 py-2 rounded transition-colors"
                          >
                             <FolderOpen size={14} className="text-amber-400" />
                             ABRIR
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
             </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
