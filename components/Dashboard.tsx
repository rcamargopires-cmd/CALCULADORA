
import React, { useMemo, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Cell, PieChart, Pie
} from 'recharts';
import { 
  TrendingUp, Users, CarFront, Coins, ArrowUpRight, ArrowDownRight, 
  Clock, AlertCircle, CheckCircle2, LayoutDashboard, Calculator as CalcIcon,
  Percent, History, Trash2
} from 'lucide-react';
import { SavedCalculation, User, CommissionConfig } from '../types';
import { formatCurrency } from '../utils/currency';
import { calculateCommission } from '../utils/commission';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashboardProps {
  history: SavedCalculation[];
  users: User[];
  currentUser: User;
  commissionConfig: CommissionConfig | null;
  onStartNewCalculation: () => void;
  onDelete?: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  history, 
  users, 
  currentUser, 
  commissionConfig,
  onStartNewCalculation,
  onDelete
}) => {
  // --- Dashboard Month State ---
  const [selectedDashboardMonth, setSelectedDashboardMonth] = useState<string>(() => {
    const now = new Date();
    return format(now, 'yyyy-MM');
  });
  const [selectedDashboardSeller, setSelectedDashboardSeller] = useState<string>('all');

  const availableSellers = useMemo(() => {
    const sellersMap = new Map<string, string>();
    history.forEach(item => {
      if (item.userId && item.userName) {
        sellersMap.set(item.userId, item.userName);
      }
    });
    return Array.from(sellersMap.entries()).map(([id, name]) => ({ id, name }));
  }, [history]);

  // Extract all available months in history to show in filter
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    
    // Always include current month
    const now = new Date();
    monthsSet.add(format(now, 'yyyy-MM'));

    // Include other months with deals
    history.forEach(item => {
      if (item.timestamp) {
        const monthPart = item.timestamp.substring(0, 7); // "yyyy-MM"
        if (/^\d{4}-\d{2}$/.test(monthPart)) {
          monthsSet.add(monthPart);
        }
      }
    });

    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [history]);

  // Format month string (e.g. 2026-07) into Brazilian Portuguese label
  const formatMonthLabel = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(Number(year), Number(month) - 1, 1);
      const formatted = format(date, 'MMMM yyyy', { locale: ptBR });
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    } catch (e) {
      return monthStr;
    }
  };

  // --- Data Processing filtered by selected month and seller ---
  const currentMonthHistory = useMemo(() => {
    let result = history;
    if (selectedDashboardMonth !== 'all') {
      result = result.filter(item => item.timestamp.startsWith(selectedDashboardMonth));
    }
    if (selectedDashboardSeller !== 'all') {
      result = result.filter(item => item.userId === selectedDashboardSeller);
    }
    return result;
  }, [history, selectedDashboardMonth, selectedDashboardSeller]);

  const stats = useMemo(() => {
    const closedDeals = currentMonthHistory.filter(h => h.data.dealStatus === 'closed');
    const totalProfit = closedDeals.reduce((acc, deal) => {
      const baseProfit = deal.summary.profit;
      return acc + (deal.data.closingType === 'banking' ? baseProfit + deal.data.bankReturn : baseProfit);
    }, 0);

    const totalCommission = closedDeals.reduce((acc, deal) => {
      if (!commissionConfig) return acc;
      // Only calculate commission for the logged in user
      if (deal.userId !== currentUser.id) return acc;
      const profit = deal.data.closingType === 'banking' ? deal.summary.profit + deal.data.bankReturn : deal.summary.profit;
      const breakdown = calculateCommission(deal.data, profit, commissionConfig);
      return acc + breakdown.total;
    }, 0);

    const avgMargin = closedDeals.length > 0 
      ? closedDeals.reduce((acc, deal) => acc + deal.summary.marginPercent, 0) / closedDeals.length 
      : 0;

    return {
      closedCount: closedDeals.length,
      openCount: currentMonthHistory.filter(h => h.data.dealStatus === 'open').length,
      totalProfit,
      totalCommission,
      avgMargin
    };
  }, [currentMonthHistory, commissionConfig, currentUser.id]);

  const isAllMonths = selectedDashboardMonth === 'all';

  const chartData = useMemo(() => {
    if (isAllMonths) {
      // Group by month chronologically
      const monthsAsc = [...availableMonths].reverse();
      return monthsAsc.map(monthStr => {
        let monthDeals = history.filter(h => h.timestamp.startsWith(monthStr));
        if (selectedDashboardSeller !== 'all') {
          monthDeals = monthDeals.filter(h => h.userId === selectedDashboardSeller);
        }
        const profit = monthDeals.reduce((acc, deal) => {
          if (deal.data.dealStatus !== 'closed') return acc;
          const baseProfit = deal.summary.profit;
          return acc + (deal.data.closingType === 'banking' ? baseProfit + deal.data.bankReturn : baseProfit);
        }, 0);

        return {
          label: formatMonthLabel(monthStr),
          profit,
          count: monthDeals.length
        };
      });
    } else {
      // Days of specific month
      const [year, month] = selectedDashboardMonth.split('-');
      const start = new Date(Number(year), Number(month) - 1, 1);
      const end = endOfMonth(start);
      const days = eachDayOfInterval({ start, end });

      return days.map(day => {
        const dayDeals = currentMonthHistory.filter(h => isSameDay(parseISO(h.timestamp), day));
        const profit = dayDeals.reduce((acc, deal) => {
          if (deal.data.dealStatus !== 'closed') return acc;
          const baseProfit = deal.summary.profit;
          return acc + (deal.data.closingType === 'banking' ? baseProfit + deal.data.bankReturn : baseProfit);
        }, 0);

        return {
          label: format(day, 'dd'),
          profit,
          count: dayDeals.length
        };
      });
    }
  }, [history, currentMonthHistory, selectedDashboardMonth, availableMonths, isAllMonths, selectedDashboardSeller]);

  const stockAlerts = useMemo(() => {
    let result = history.filter(h => h.data.dealStatus === 'open' && h.data.stockDays >= 60);
    if (selectedDashboardSeller !== 'all') {
      result = result.filter(h => h.userId === selectedDashboardSeller);
    }
    return result
      .sort((a, b) => b.data.stockDays - a.data.stockDays)
      .slice(0, 5);
  }, [history, selectedDashboardSeller]);

  const displayedHistory = useMemo(() => {
    let result = history;
    if (selectedDashboardSeller !== 'all') {
      result = result.filter(item => item.userId === selectedDashboardSeller);
    }
    return result;
  }, [history, selectedDashboardSeller]);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            Olá, {currentUser.name.split(' ')[0]}! 👋
          </h2>
          <p className="text-zinc-400 text-sm">
            {isAllMonths 
              ? 'Aqui está o resumo de performance geral da loja.' 
              : `Aqui está o resumo de performance da loja em ${formatMonthLabel(selectedDashboardMonth)}.`}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Vendedor Filter Dropdown */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Vendedor:</span>
            <select
              value={selectedDashboardSeller}
              onChange={(e) => setSelectedDashboardSeller(e.target.value)}
              className="bg-transparent text-xs font-black text-amber-400 focus:outline-none cursor-pointer uppercase border-none py-0.5 font-sans"
            >
              <option value="all" className="bg-zinc-900 text-white font-bold">Todos</option>
              {availableSellers.map(seller => (
                <option key={seller.id} value={seller.id} className="bg-zinc-900 text-white font-bold">
                  {seller.name}
                </option>
              ))}
            </select>
          </div>

          {/* Month Filter Dropdown */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Período:</span>
            <select
              value={selectedDashboardMonth}
              onChange={(e) => setSelectedDashboardMonth(e.target.value)}
              className="bg-transparent text-xs font-black text-amber-400 focus:outline-none cursor-pointer uppercase border-none py-0.5 font-sans"
            >
              <option value="all" className="bg-zinc-900 text-white font-bold">Todos os Meses</option>
              {availableMonths.map(monthStr => (
                <option key={monthStr} value={monthStr} className="bg-zinc-900 text-white font-bold">
                  {formatMonthLabel(monthStr)}
                </option>
              ))}
            </select>
          </div>

          <button 
            onClick={onStartNewCalculation}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-400 text-black font-black rounded-lg shadow-lg hover:bg-amber-500 transition-all active:scale-95 uppercase tracking-wider text-xs"
          >
            <CalcIcon size={16} />
            Nova Negociação
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Vendas Fechadas" 
          value={stats.closedCount} 
          icon={<CheckCircle2 className="text-green-400" />}
          subtitle={`${stats.openCount} em negociação`}
        />
        <StatCard 
          title={isAllMonths ? "Lucro Total (Acumulado)" : "Lucro Total"} 
          value={formatCurrency(stats.totalProfit)} 
          icon={<TrendingUp className="text-blue-400" />}
          trend={stats.totalProfit > 0 ? 'up' : 'neutral'}
        />
        <StatCard 
          title="Minha Comissão" 
          value={formatCurrency(stats.totalCommission)} 
          icon={<Coins className="text-amber-400" />}
          subtitle={isAllMonths ? "Acumulado histórico" : "Estimativa do período"}
        />
        <StatCard 
          title="Margem Média" 
          value={`${stats.avgMargin.toFixed(1)}%`} 
          icon={<Percent className="text-purple-400" />}
          subtitle={isAllMonths ? "Geral sobre fechadas" : "Sobre fechadas do período"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-400" />
              {isAllMonths ? 'Histórico de Lucro Mensal' : 'Evolução de Lucro Diário'}
            </h3>
            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded uppercase tracking-widest">
              {isAllMonths ? 'Todos os Meses' : formatMonthLabel(selectedDashboardMonth)}
            </span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  stroke="#71717a" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  stroke="#71717a" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(value) => `R$ ${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  itemStyle={{ color: '#fbbf24', fontSize: '12px', fontWeight: 'bold' }}
                  labelStyle={{ color: '#a1a1aa', fontSize: '10px', marginBottom: '4px' }}
                  formatter={(value: number) => [formatCurrency(value), 'Lucro']}
                  labelFormatter={(label) => isAllMonths ? label : `Dia ${label}`}
                />
                <Bar dataKey="profit" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stock Alerts */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Clock size={18} className="text-red-400" />
              Alertas de Estoque
            </h3>
            <span className="text-[10px] font-bold text-red-500/50 uppercase tracking-widest">+60 DIAS</span>
          </div>
          
          <div className="space-y-4">
            {stockAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 opacity-30">
                <CarFront size={40} className="mb-2" />
                <p className="text-xs font-bold">Tudo em dia!</p>
              </div>
            ) : (
              stockAlerts.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-zinc-800/50 group hover:border-red-500/30 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-white uppercase">{item.data.licensePlate || 'S/ PLACA'}</span>
                    <span className="text-[10px] text-zinc-500">{formatCurrency(item.data.vehicleCost)} custo</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-red-400">{item.data.stockDays} dias</span>
                    <AlertCircle size={14} className="text-red-500 animate-pulse" />
                  </div>
                </div>
              ))
            )}
          </div>

          {stockAlerts.length > 0 && (
            <p className="mt-4 text-[10px] text-zinc-500 italic text-center">
              Veículos com giro baixo. Considere revisar a margem ou criar promoções.
            </p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-white flex items-center gap-2">
            <History size={18} className="text-amber-400" />
            Atividade Recente
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-wider">Data</th>
                <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-wider">Veículo</th>
                <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-wider">Vendedor</th>
                <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-wider text-right">Lucro</th>
                {currentUser.role === 'admin' && onDelete && <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-wider text-right w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {displayedHistory.slice(0, 5).map((item) => (
                <tr key={item.id} className="group hover:bg-white/5 transition-colors">
                  <td className="py-4 text-xs text-zinc-400 font-mono">
                    {format(parseISO(item.timestamp), 'dd/MM HH:mm')}
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-zinc-800 rounded flex items-center justify-center text-zinc-500">
                        <CarFront size={14} />
                      </div>
                      <span className="text-xs font-bold text-white uppercase">{item.data.licensePlate || 'S/ PLACA'}</span>
                    </div>
                  </td>
                  <td className="py-4 text-xs text-zinc-400 uppercase font-bold">
                    {item.userName || 'Sistema'}
                  </td>
                  <td className="py-4">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                      item.data.dealStatus === 'closed' 
                        ? 'bg-green-900/30 text-green-400 border border-green-500/20' 
                        : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {item.data.dealStatus === 'closed' ? 'Fechado' : 'Aberto'}
                    </span>
                  </td>
                  <td className="py-4 text-xs font-mono font-bold text-white text-right">
                    {formatCurrency(item.summary.profit)}
                  </td>
                  {currentUser.role === 'admin' && onDelete && (
                    <td className="py-4 text-right">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(item.id);
                        }}
                        className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, subtitle, trend }) => (
  <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl relative overflow-hidden group hover:border-zinc-700 transition-all">
    <div className="flex justify-between items-start mb-2">
      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{title}</span>
      <div className="p-2 bg-zinc-800 rounded-lg group-hover:scale-110 transition-transform">
        {icon}
      </div>
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-black text-white font-mono tracking-tight">{value}</span>
      {trend && (
        <span className={`text-[10px] font-bold flex items-center ${
          trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-zinc-500'
        }`}>
          {trend === 'up' ? <ArrowUpRight size={12} /> : trend === 'down' ? <ArrowDownRight size={12} /> : null}
        </span>
      )}
    </div>
    {subtitle && <p className="text-[10px] text-zinc-500 mt-1 font-medium">{subtitle}</p>}
  </div>
);

export default Dashboard;
