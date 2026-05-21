import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Banknote,
  CreditCard
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
import { TransactionType, PaymentMethod, type Transaction, type Expense, type CXCAccount } from '../types';
import { formatCurrency } from '../lib/utils';
import { startOfMonth, endOfMonth, format, subMonths, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Dashboard({ exchangeRate = 1 }: { exchangeRate?: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cxcAccounts, setCXCAccounts] = useState<CXCAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const defaultStartDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const defaultEndDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

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

  const filterByDate = (dateStr: string) => {
    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    return true;
  };

  let totalBsBanco = 0;
  let totalBsEfectivo = 0;
  let totalUsdBanco = 0;
  let totalUsdEfectivo = 0;
  let totalVentas = 0;
  let periodCxcCharges = 0;
  let periodCxcPayments = 0;
  
  transactions
    .filter(t => filterByDate(t.date))
    .forEach(t => {
       const dest = (t.destinationBank || '').toUpperCase();
       
       // 1. SALES VOLUME: Sum all sales within period (Cash and Bank; excluding Credit/CXC)
       if (t.type === TransactionType.SALE && !t.isCXC && t.paymentMethod !== PaymentMethod.CXC) {
          totalVentas += t.amountUsd;
       }

       // Track CXC movements for the period
       if (t.isCXC && t.type === TransactionType.SALE) {
          periodCxcCharges += t.amountUsd;
       }
       if (t.type === TransactionType.INCOME && t.concept?.includes('ABONO CUENTAS POR COBRAR')) {
          periodCxcPayments += t.amountUsd;
       }

       // 2. CASH FLOW: Sum actual money entering (Cash Sales + All Incomes/Payments)
       // We ignore credit sales (CXC charges) for the inflow counters as they represent debt, not received money.
       if (t.type === TransactionType.INCOME || t.type === TransactionType.SALE) {
          if (t.paymentMethod === PaymentMethod.CXC) return;

          const destClean = (t.destinationBank || '').trim().toUpperCase();
          const isCashDest = destClean.includes('EFECTIVO') || destClean.includes('CAJA') || destClean === '';
          const isBankDest = destClean.length > 0 && !isCashDest && !destClean.includes('CXC') && !destClean.includes('COBRAR');

          const isBank = isBankDest || t.paymentMethod === PaymentMethod.BS || t.paymentMethod === PaymentMethod.ZELLE || t.paymentMethod === PaymentMethod.BINANCE;

          // Determine if it is a Bolívares (BS) transaction or USD ($) transaction
          const isBs = t.paymentMethod === 'Transferencia Bs / Pago Móvil' || 
                       t.paymentMethod === 'Bs' || 
                       t.paymentMethod === 'Bolivares' || 
                       t.paymentMethod === 'Bs Efectivo' || 
                       (t.currency && t.currency.toUpperCase().includes('BOLÍVARES')) || 
                       (t.amountBs && t.amountBs > 0);

          if (isBs) {
             const amountBsVal = t.amountBs && t.amountBs > 0 ? t.amountBs : (t.amountUsd * (t.exchangeRate || 1));
             const eqUsd = t.exchangeRate && t.exchangeRate > 0 ? amountBsVal / t.exchangeRate : t.amountUsd;

             if (isBank) {
                totalBsBanco += eqUsd;
             } else {
                totalBsEfectivo += eqUsd;
             }
          } else {
             // USD Transaction
             const usdAmount = t.amountUsd;
             if (isBank) {
                totalUsdBanco += usdAmount;
             } else {
                totalUsdEfectivo += usdAmount;
             }
          }
       }
    });

  // User requested CXC to only show gross sales (charges) without abonos
  const isFiltered = !!(startDate || endDate);
  
  // Calculate total gross CXC charges across all time for non-filtered view
  const totalGlobalGrossCxc = transactions
    .filter(t => t.isCXC && t.type === TransactionType.SALE)
    .reduce((sum, t) => sum + t.amountUsd, 0);

  const displayCXCValue = isFiltered ? periodCxcCharges : totalGlobalGrossCxc;

  // We still calculate period expenses and withdrawals for the charts
  const periodWithdrawals = transactions
    .filter(t => t.type === 'withdrawal' && filterByDate(t.date))
    .reduce((sum, t) => sum + t.amountUsd, 0);

  const periodExpenses = expenses
    .filter(e => filterByDate(e.date))
    .reduce((sum, e) => sum + e.amountUsd, 0);

  const cashBalance = (totalUsdEfectivo + totalBsEfectivo) - periodWithdrawals - periodExpenses;

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
    { label: 'TOTAL VENTAS', value: totalVentas, icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'TOTAL INGRESO BOLIVARES BANCO', value: totalBsBanco, icon: CreditCard, color: 'text-sky-600', bg: 'bg-sky-50' },
    { label: 'TOTAL INGRESO BOLIVARES EFECTIVO', value: totalBsEfectivo, icon: Banknote, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'TOTAL INGRESO DOLARES BANCO', value: totalUsdBanco, icon: CreditCard, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'TOTAL INGRESO DOLARES EFECTIVO', value: totalUsdEfectivo, icon: Banknote, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando datos...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Panel General</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Resumen del estado financiero del negocio.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
          <div className="flex items-center gap-2 px-2 w-full sm:w-auto">
            <Calendar size={16} className="text-slate-400 shrink-0" />
            <div className="flex flex-col w-full">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Desde</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-900 outline-none w-full sm:w-28 cursor-pointer"
              />
            </div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1"></div>
          <div className="w-full h-px sm:hidden bg-slate-200 my-1"></div>
          <div className="flex items-center gap-2 px-2 w-full sm:w-auto">
            <div className="flex flex-col w-full">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Hasta</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-900 outline-none w-full sm:w-28 cursor-pointer"
              />
            </div>
          </div>
          {(startDate || endDate) && (
            <button 
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="mt-2 sm:mt-0 sm:ml-2 text-xs font-bold text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors w-full sm:w-auto text-center border border-transparent sm:border-slate-200 bg-white sm:bg-transparent shadow-sm sm:shadow-none"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {stats.map((stat, i) => (
          <div key={i} className="card p-6 border-slate-200/60 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{stat.label}</p>
                <h3 className={`text-3xl font-black mt-2 tracking-tight ${stat.color}`}>{formatCurrency(stat.value)}</h3>
                <p className={`text-xs mt-1 font-bold ${stat.color} opacity-70`}>Bs. {new Intl.NumberFormat('es-VE').format(stat.value * exchangeRate)}</p>
              </div>
              <div className={`p-3.5 rounded-2xl ${stat.bg} ${stat.color}`}>
                <stat.icon size={22} strokeWidth={2.5} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 card p-6 border-slate-200/60">
          <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2 uppercase tracking-widest border-b border-slate-100 pb-4">
            Desempeño Últimos 6 Meses
          </h3>
          <div className="h-80 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="ingresos" name="Ingresos" fill="#0f172a" radius={[6, 6, 0, 0]} barSize={28} />
                <Bar dataKey="egresos" name="Egresos" fill="#94a3b8" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Debtors */}
        <div className="card p-6 border-slate-200/60">
          <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2 uppercase tracking-widest border-b border-slate-100 pb-4">
            Mayores Saldos Cuentas por Cobrar (CXC)
          </h3>
          <div className="space-y-3 mt-4">
            {cxcAccounts
              .filter(acc => acc.totalBalance > 0)
              .sort((a, b) => b.totalBalance - a.totalBalance)
              .slice(0, 5)
              .map((acc, i) => (
                <div key={i} className="flex items-center justify-between p-3.5 rounded-[16px] bg-slate-50 border border-slate-100/50 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-200/60 flex items-center justify-center text-slate-800 font-bold text-sm">
                      {acc.clientName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-slate-900 leading-tight">{acc.clientName}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest mt-0.5">ID: {acc.id?.slice(-6)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[15px] block font-black tracking-tight text-slate-900">{formatCurrency(acc.totalBalance)}</span>
                    <span className="text-[11px] block font-bold text-slate-500">Bs. {new Intl.NumberFormat('es-VE').format(acc.totalBalance * exchangeRate)}</span>
                  </div>
                </div>
              ))}
            {cxcAccounts.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-10 flex flex-col items-center justify-center gap-2">
                <Users className="text-slate-300" size={32} />
                <span>No hay saldos pendientes.</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
