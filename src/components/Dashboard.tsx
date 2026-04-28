import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Cell
} from 'recharts';
import { dbService } from '../services/db';
import { TransactionType, type Transaction, type Expense, type CXCAccount } from '../types';
import { formatCurrency } from '../lib/utils';
import { startOfMonth, endOfMonth, format, subMonths, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cxcAccounts, setCXCAccounts] = useState<CXCAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubT = dbService.subscribeToTransactions(setTransactions);
    const unsubE = dbService.subscribeToExpenses(setExpenses);
    const unsubC = dbService.subscribeToCXCAccounts((accounts) => {
      setCXCAccounts(accounts);
      setLoading(false);
    });

    return () => {
      unsubT();
      unsubE();
      unsubC();
    };
  }, []);

  const currentMonthInterval = {
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date()),
  };

  const monthlyIncomes = transactions
    .filter(t => (t.type === TransactionType.INCOME || t.type === TransactionType.SALE) && isWithinInterval(new Date(t.date), currentMonthInterval))
    .reduce((sum, t) => sum + t.amountUsd, 0);

  const monthlyWithdrawals = transactions
    .filter(t => t.type === 'withdrawal' && isWithinInterval(new Date(t.date), currentMonthInterval))
    .reduce((sum, t) => sum + t.amountUsd, 0);

  const monthlyExpenses = expenses
    .filter(e => isWithinInterval(new Date(e.date), currentMonthInterval))
    .reduce((sum, e) => sum + e.amountUsd, 0);

  const totalPendingCXC = cxcAccounts.reduce((sum, acc) => sum + acc.totalBalance, 0);

  const cashBalance = monthlyIncomes - monthlyWithdrawals - monthlyExpenses;

  // Chart data Preparation
  const getLast6MonthsData = () => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i);
      const interval = { start: startOfMonth(monthDate), end: endOfMonth(monthDate) };
      
      const income = transactions
        .filter(t => (t.type === TransactionType.INCOME || t.type === TransactionType.SALE) && isWithinInterval(new Date(t.date), interval))
        .reduce((sum, t) => sum + t.amountUsd, 0);
        
      const withdrawal = transactions
        .filter(t => t.type === 'withdrawal' && isWithinInterval(new Date(t.date), interval))
        .reduce((sum, t) => sum + t.amountUsd, 0);

      const expense = expenses
        .filter(e => isWithinInterval(new Date(e.date), interval))
        .reduce((sum, e) => sum + e.amountUsd, 0);

      data.push({
        name: format(monthDate, 'MMM', { locale: es }),
        ingresos: income,
        egresos: expense + withdrawal,
      });
    }
    return data;
  };

  const chartData = getLast6MonthsData();

  const stats = [
    { label: 'Ingresos del Mes', value: monthlyIncomes, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Egresos + Retiros', value: monthlyExpenses + monthlyWithdrawals, icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Saldos Pendientes CXC', value: totalPendingCXC, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Balance de Caja', value: cashBalance, icon: DollarSign, color: cashBalance >= 0 ? 'text-emerald-600' : 'text-rose-600', bg: cashBalance >= 0 ? 'bg-emerald-50' : 'bg-rose-50' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando datos...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Panel General</h2>
        <p className="text-slate-500">Resumen del estado financiero del negocio.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="card p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{stat.label}</p>
                <h3 className={`text-2xl font-bold mt-1 ${stat.color}`}>{formatCurrency(stat.value)}</h3>
              </div>
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                <stat.icon size={24} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 card p-6">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            Desempeño Últimos 6 Meses
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar dataKey="egresos" name="Egresos" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Debtors */}
        <div className="card p-6">
          <h3 className="font-bold text-slate-800 mb-6">Mayores Saldos CXC</h3>
          <div className="space-y-4">
            {cxcAccounts
              .filter(acc => acc.totalBalance > 0)
              .sort((a, b) => b.totalBalance - a.totalBalance)
              .slice(0, 5)
              .map((acc, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                      {acc.clientName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{acc.clientName}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-mono">ID: {acc.id?.slice(-6)}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-rose-600">{formatCurrency(acc.totalBalance)}</span>
                </div>
              ))}
            {cxcAccounts.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-10 italic">No hay saldos pendientes.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
