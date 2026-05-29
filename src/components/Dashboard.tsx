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
  Cell,
  PieChart,
  Pie
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

  let totalBsBancoUsd = 0;
  let totalBsBancoBs = 0;
  let totalBsEfectivoUsd = 0;
  let totalBsEfectivoBs = 0;
  let totalUsdBancoUsd = 0;
  let totalUsdBancoBs = 0;
  let totalUsdEfectivoUsd = 0;
  let totalUsdEfectivoBs = 0;
  let totalVentasUsd = 0;
  let totalVentasBs = 0;
  let periodCxcCharges = 0;
  let periodCxcPayments = 0;
  
  transactions
    .filter(t => filterByDate(t.date))
    .forEach(t => {
       const dest = (t.destinationBank || '').toUpperCase();
       const rate = t.exchangeRate || exchangeRate || 1;
       
       // 1. SALES VOLUME: Sum all sales within period (Cash and Bank; excluding Credit/CXC)
       if (t.type === TransactionType.SALE && !t.isCXC && t.paymentMethod !== PaymentMethod.CXC) {
          totalVentasUsd += t.amountUsd;
          
          const isBsMethod = t.paymentMethod === 'Transferencia Bs / Pago Móvil' || 
                             t.paymentMethod === 'Bs' || 
                             t.paymentMethod === 'Bolivares' || 
                             t.paymentMethod === 'Bs Efectivo' || 
                             (t.currency && t.currency.toUpperCase().includes('BOLÍVARES'));

          const isUsdMethod = t.paymentMethod === '$' || 
                              t.paymentMethod === 'Zelle' || 
                              t.paymentMethod === 'Binance' ||
                              t.paymentMethod === PaymentMethod.USD_CASH ||
                              t.paymentMethod === PaymentMethod.ZELLE ||
                              t.paymentMethod === PaymentMethod.BINANCE ||
                              (t.currency && (t.currency.toUpperCase().includes('DÓLARES') || t.currency.toUpperCase().includes('DOLAR') || t.currency.toUpperCase().includes('$')));

          const isBs = isBsMethod || (!isUsdMethod && t.amountBs && t.amountBs > 0);

          if (isBs) {
             const amountBsVal = t.amountBs && t.amountBs > 0 ? t.amountBs : (t.amountUsd * rate);
             totalVentasBs += amountBsVal;
          } else {
             totalVentasBs += t.amountUsd * rate;
          }
       }

       // Track CXC movements for the period
       if (t.isCXC && t.type === TransactionType.SALE) {
          periodCxcCharges += t.amountUsd;
       }
       if (t.type === TransactionType.INCOME && t.concept?.includes('ABONO CUENTAS POR COBRAR')) {
          const conceptUpper = (t.concept || '').toUpperCase();
          const destUpper = (t.destinationBank || '').toUpperCase();
          const pMethodUpper = (t.paymentMethod || '').toUpperCase();
          const isWarranty = conceptUpper.includes('GARANT') || destUpper.includes('GARANT') || pMethodUpper.includes('GARANT');
          const isDonation = conceptUpper.includes('DONAC') || destUpper.includes('DONAC') || pMethodUpper.includes('DONAC') ||
                             conceptUpper.includes('EXENC') || destUpper.includes('EXENC') || pMethodUpper.includes('EXENC') ||
                             conceptUpper.includes('EXCENC') || destUpper.includes('EXCENC') || pMethodUpper.includes('EXCENC') ||
                             conceptUpper.includes('EXENT') || destUpper.includes('EXENT') || pMethodUpper.includes('EXENT') ||
                             conceptUpper.includes('EXCENT') || destUpper.includes('EXCENT') || pMethodUpper.includes('EXCENT');
          
          if (!isWarranty && !isDonation) {
             periodCxcPayments += t.amountUsd;
          }
       }

       // 2. CASH FLOW: Sum actual money entering (Cash Sales + All Incomes/Payments)
       // We ignore credit sales (CXC charges) for the inflow counters as they represent debt, not received money.
       if (t.type === TransactionType.INCOME || t.type === TransactionType.SALE) {
          const destClean = (t.destinationBank || '').trim().toUpperCase();
           const conceptUpper = (t.concept || '').toUpperCase();
           const isCXCPayment = conceptUpper.includes('ABONO CUENTAS POR COBRAR') || conceptUpper.includes('(CXC)');

          // Skip credit sale transactions (charges/CXC) from physical Cash Flow as they represent debt, not received money
          const isCXCField = t.isCXC || t.paymentMethod === PaymentMethod.CXC || isCXCPayment || 
                             (t.type === TransactionType.SALE && (destClean.includes('CXC') || destClean.includes('COBRAR')));
          if (isCXCField) return;
          const isCashDest = destClean.includes('EFECTIVO') || destClean.includes('CAJA') || destClean === '';
          const isBankDest = destClean.length > 0 && !isCashDest;

          const isBank = isBankDest || t.paymentMethod === PaymentMethod.BS || t.paymentMethod === PaymentMethod.ZELLE || t.paymentMethod === PaymentMethod.BINANCE;

          // Determine if it is a Bolívares (BS) transaction or USD ($) transaction
          const isBsMethod = t.paymentMethod === 'Transferencia Bs / Pago Móvil' || 
                             t.paymentMethod === 'Bs' || 
                             t.paymentMethod === 'Bolivares' || 
                             t.paymentMethod === 'Bs Efectivo' || 
                             (t.currency && t.currency.toUpperCase().includes('BOLÍVARES'));

          const isUsdMethod = t.paymentMethod === '$' || 
                              t.paymentMethod === 'Zelle' || 
                              t.paymentMethod === 'Binance' ||
                              t.paymentMethod === PaymentMethod.USD_CASH ||
                              t.paymentMethod === PaymentMethod.ZELLE ||
                              t.paymentMethod === PaymentMethod.BINANCE ||
                              (t.currency && (t.currency.toUpperCase().includes('DÓLARES') || t.currency.toUpperCase().includes('DOLAR') || t.currency.toUpperCase().includes('$')));

          const isBs = isBsMethod || (!isUsdMethod && t.amountBs && t.amountBs > 0);

          if (isBs) {
             const amountBsVal = t.amountBs && t.amountBs > 0 ? t.amountBs : (t.amountUsd * rate);
             const eqUsd = rate > 0 ? amountBsVal / rate : t.amountUsd;

             if (isBank) {
                totalBsBancoUsd += eqUsd;
                totalBsBancoBs += amountBsVal;
             } else {
                totalBsEfectivoUsd += eqUsd;
                totalBsEfectivoBs += amountBsVal;
             }
          } else {
             // USD Transaction
             const usdAmount = t.amountUsd;
             if (isBank) {
                totalUsdBancoUsd += usdAmount;
                totalUsdBancoBs += usdAmount * rate;
             } else {
                totalUsdEfectivoUsd += usdAmount;
                totalUsdEfectivoBs += usdAmount * rate;
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

  const cashBalance = (totalUsdEfectivoUsd + totalBsEfectivoUsd) - periodWithdrawals - periodExpenses;

  // Chart data Preparation
  const getLast6MonthsData = () => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i);
      const interval = { start: startOfMonth(monthDate), end: endOfMonth(monthDate) };
      
      const income = transactions
        .filter(t => {
          if (t.type === TransactionType.INCOME && (t.concept?.includes('ABONO CUENTAS POR COBRAR') || t.concept?.includes('(CXC)'))) {
            return false;
          }
          if (t.paymentMethod === PaymentMethod.CXC) {
            return false;
          }
          return (t.type === TransactionType.INCOME || t.type === TransactionType.SALE) && isWithinInterval(new Date(t.date), interval);
        })
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

  // PieChart CXC balance distribution calculations
  const totalCxcBalance = cxcAccounts.reduce((sum, acc) => sum + (acc.totalBalance || 0), 0);
  const PIE_COLORS = ['#0f172a', '#2563eb', '#0d9488', '#e11d48', '#ea580c', '#64748b'];

  const processedCxcChartData = (() => {
    const activeAccounts = cxcAccounts
      .filter(acc => (acc.totalBalance || 0) > 0)
      .sort((a, b) => b.totalBalance - a.totalBalance);

    if (activeAccounts.length <= 5) {
      return activeAccounts.map(acc => ({
        name: acc.clientName,
        value: acc.totalBalance,
        percentage: totalCxcBalance > 0 ? (acc.totalBalance / totalCxcBalance) * 100 : 0
      }));
    }

    const top4 = activeAccounts.slice(0, 4).map(acc => ({
      name: acc.clientName,
      value: acc.totalBalance,
      percentage: totalCxcBalance > 0 ? (acc.totalBalance / totalCxcBalance) * 100 : 0
    }));

    const othersValue = activeAccounts.slice(4).reduce((sum, acc) => sum + acc.totalBalance, 0);
    const othersPercentage = totalCxcBalance > 0 ? (othersValue / totalCxcBalance) * 100 : 0;

    return [
      ...top4,
      { name: 'Otros Clientes', value: othersValue, percentage: othersPercentage }
    ];
  })();

  const stats = [
    { label: 'TOTAL VENTAS', value: totalVentasUsd, valueBs: totalVentasBs, icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'TOTAL INGRESO BOLIVARES BANCO', value: totalBsBancoUsd, valueBs: totalBsBancoBs, icon: CreditCard, color: 'text-sky-600', bg: 'bg-sky-50' },
    { label: 'TOTAL INGRESO BOLIVARES EFECTIVO', value: totalBsEfectivoUsd, valueBs: totalBsEfectivoBs, icon: Banknote, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'TOTAL INGRESO DOLARES BANCO', value: totalUsdBancoUsd, valueBs: totalUsdBancoBs, icon: CreditCard, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'TOTAL INGRESO DOLARES EFECTIVO', value: totalUsdEfectivoUsd, valueBs: totalUsdEfectivoBs, icon: Banknote, color: 'text-green-600', bg: 'bg-green-50' },
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
                <p className={`text-xs mt-1 font-bold ${stat.color} opacity-70`}>Bs. {new Intl.NumberFormat('es-VE').format(stat.valueBs)}</p>
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

      {/* Distribución de Cuentas por Cobrar */}
      <div className="card p-6 border-slate-200/60">
        <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2 uppercase tracking-widest border-b border-slate-100 pb-4">
          Distribución de Cuentas por Cobrar por Cliente
        </h3>
        {totalCxcBalance > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mt-4">
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={processedCxcChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {processedCxcChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any) => [formatCurrency(Number(value)), 'Saldo Pendiente']}
                    contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Participación en la Deuda Total</h4>
              <div className="grid grid-cols-1 gap-3">
                {processedCxcChartData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200/50 hover:bg-slate-100/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}></div>
                      <span className="text-xs font-bold text-slate-800">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-900 block">{formatCurrency(item.value)}</span>
                      <span className="text-[10px] font-bold text-slate-500 block">{item.percentage.toFixed(1)}% del total</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-slate-150 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Deuda Total Consolidada</span>
                <div className="text-right">
                  <span className="text-sm font-black text-slate-900 block">{formatCurrency(totalCxcBalance)}</span>
                  <span className="text-[11px] font-bold text-slate-500 block text-slate-400">Bs. {new Intl.NumberFormat('es-VE').format(totalCxcBalance * exchangeRate)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-12 flex flex-col items-center justify-center gap-2">
            <Users className="text-slate-300 animate-pulse" size={36} />
            <span>No hay saldos pendientes para graficar.</span>
          </p>
        )}
      </div>
    </div>
  );
}
