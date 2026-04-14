
import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Cell, PieChart, Pie
} from 'recharts';
import { 
  TrendingUp, Users, CarFront, Coins, ArrowUpRight, ArrowDownRight, 
  Clock, AlertCircle, CheckCircle2, LayoutDashboard, Calculator as CalcIcon,
  Percent, History
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
}

const Dashboard: React.FC<DashboardProps> = ({ 
  history, 
  users, 
  currentUser, 
  commissionConfig,
  onStartNewCalculation
}) => {
  // --- Data Processing ---
  const currentMonthHistory = useMemo(() => {
    const now = new Date();
    const monthStr = format(now, 'yyyy-MM');
    return history.filter(item => item.timestamp.startsWith(monthStr));
  }, [history]);

  const stats = useMemo(() => {
    const closedDeals = currentMonthHistory.filter(h => h.data.dealStatus === 'closed');
    const totalProfit = closedDeals.reduce((acc, deal) => {
      const baseProfit = deal.summary.profit;
      return acc + (deal.data.closingType === 'banking' ? baseProfit + deal.data.bankReturn : baseProfit);
    }, 0);

    const totalCommission = closedDeals.reduce((acc, deal) => {
      if (!commissionConfig) return acc;
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
  }, [currentMonthHistory, commissionConfig]);

  const chartData = useMemo(() => {
    const now = new Date();
    const days = eachDayOfInterval({
      start: startOfMonth(now),
      end: endOfMonth(now)
    });

    return days.map(day => {
      const dayDeals = currentMonthHistory.filter(h => isSameDay(parseISO(h.timestamp), day));
      const profit = dayDeals.reduce((acc, deal) => {
        if (deal.data.dealStatus !== 'closed') return acc;
        const baseProfit = deal.summary.profit;
        return acc + (deal.data.closingType === 'banking' ? baseProfit + deal.data.bankReturn : baseProfit);
      }, 0);

      return {
        day: format(day, 'dd'),
        profit,
        count: dayDeals.length
      };
    });
  }, [currentMonthHistory]);

  const stockAlerts = useMemo(() => {
    return history
      .filter(h => h.data.dealStatus === 'open' && h.data.stockDays >= 60)
      .sort((a, b) => b.data.stockDays - a.data.stockDays)
      .slice(0, 5);
  }, [history]);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            Olá, {currentUser.name.split(' ')[0]}! 👋
          </h2>
          <p className="text-zinc-400 text-sm">Aqui está o resumo de performance da loja este mês.</p>
        </div>
        <button 
          onClick={onStartNewCalculation}
          className="flex items-center gap-2 px-6 py-3 bg-amber-400 text-black font-black rounded-lg shadow-lg hover:bg-amber-500 transition-all active:scale-95 uppercase tracking-wider text-sm"
        >
          <CalcIcon size={18} />
          Nova Negociação
        </button>
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
          title="Lucro Total (Mês)" 
          value={formatCurrency(stats.totalProfit)} 
          icon={<TrendingUp className="text-blue-400" />}
          trend={stats.totalProfit > 0 ? 'up' : 'neutral'}
        />
        <StatCard 
          title="Minha Comissão" 
          value={formatCurrency(stats.totalCommission)} 
          icon={<Coins className="text-amber-400" />}
          subtitle="Estimativa do mês"
        />
        <StatCard 
          title="Margem Média" 
          value={`${stats.avgMargin.toFixed(1)}%`} 
          icon={<Percent className="text-purple-400" />}
          subtitle="Sobre vendas fechadas"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-400" />
              Evolução de Lucro Diário
            </h3>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Mês Atual</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis 
                  dataKey="day" 
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
                  labelFormatter={(label) => `Dia ${label}`}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {history.slice(0, 5).map((item) => (
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
