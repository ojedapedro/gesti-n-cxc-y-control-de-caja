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
import { TransactionType, PaymentMethod, type Transaction, type Expense, type CXCAccount, type CXCPayment } from '../types';
import { formatCurrency } from '../lib/utils';
import { startOfMonth, endOfMonth, format, subMonths, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';

const isBsTransaction = (t: Transaction): boolean => {
  const normalize = (str?: string) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const pMethod = normalize(t.paymentMethod);
  const currency = normalize(t.currency);

  const isBsMethod = 
    pMethod.includes("bs") ||
    pMethod.includes("bolivar") ||
    pMethod.includes("pago movil") ||
    pMethod.includes("transferencia") ||
    currency.includes("bs") ||
    currency.includes("bolivar");

  const isUsdMethod = 
    pMethod.includes("$") ||
    pMethod.includes("usd") ||
    pMethod.includes("dolar") ||
    pMethod.includes("zelle") ||
    pMethod.includes("binance") ||
    currency.includes("$") ||
    currency.includes("usd") ||
    currency.includes("dolar");

  return isBsMethod || (!isUsdMethod && !!t.amountBs && t.amountBs > 0);
};

export default function Dashboard({ exchangeRate = 1 }: { exchangeRate?: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cxcAccounts, setCXCAccounts] = useState<CXCAccount[]>([]);
  const [allPayments, setAllPayments] = useState<CXCPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const unsubT = dbService.subscribeToTransactions(setTransactions);
    const unsubE = dbService.subscribeToExpenses(setExpenses);
    const unsubP = dbService.subscribeToAllPayments(setAllPayments);
    const unsubC = dbService.subscribeToCXCAccounts((accounts) => {
      setCXCAccounts(accounts);
      setLoading(false);
    });

    return () => {
      unsubT();
      unsubE();
      unsubP();
      unsubC();
    };
  }, []);

  const filterByDate = (dateStr: string) => {
    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    return true;
  };

  // Filter transactions exactly like IncomesRegistro (the CRUD of Ingresos Caja Principal)
  const filteredTransactions = transactions.filter(t => {
    if (t.type !== TransactionType.SALE) return false;
    if (t.isCXC || t.paymentMethod === PaymentMethod.CXC) return false;
    if (startDate && t.date < startDate) return false;
    if (endDate && t.date > endDate) return false;
    return true;
  });

  // Calculate totals matching exactly the logic in IncomesRegistro
  const totals = filteredTransactions.reduce((acc, t) => {
    const destClean = (t.destinationBank || '').trim().toUpperCase();
    const isCashDest = destClean.includes('EFECTIVO') || destClean.includes('CAJA');
    const isBsTx = !!(t.amountBs && t.amountBs > 0);

    const rate = t.exchangeRate || exchangeRate || 1;

    if (isBsTx) {
      if (isCashDest) {
        acc.bsCash += t.amountBs || 0;
        acc.bsCashUsdEq += (t.amountBs || 0) / rate;
      } else {
        acc.bs += t.amountBs || 0;
        const convVal = (t.amountBs || 0) / rate;
        acc.usdConv += convVal;
      }
    }

    acc.usdCash += t.amountUsdCash || 0;
    acc.zelle += t.amountZelle || 0;
    acc.cxc += t.amountCXC || 0;

    const valueUsd = isBsTx ? ((t.amountUsdCash || 0) + (t.amountZelle || 0) + (t.amountCXC || 0)) : (t.totalDailySale || t.amountUsd || 0);
    acc.ventaDiaria += valueUsd;
    acc.ventaDiariaBs += valueUsd * rate;

    return acc;
  }, { 
    bs: 0, 
    usdConv: 0, 
    usdCash: 0, 
    zelle: 0, 
    cxc: 0, 
    bsCash: 0, 
    bsCashUsdEq: 0,
    ventaDiaria: 0, 
    ventaDiariaBs: 0 
  });

  // Map to dashboard card variables
  const totalUsdBancoUsd = totals.zelle; // Zelle / Binance / Bancos USD
  const totalUsdEfectivoUsd = totals.usdCash; // Efectivo $ en caja
  
  const totalBsBancoBs = totals.bs; // Bolívares Banco (pago movil, etc)
  const totalBsBancoUsd = totals.usdConv; // Convertido USD de Banco Bs

  const totalBsEfectivoBs = totals.bsCash; // Efectivo Bs en caja
  const totalBsEfectivoUsd = totals.bsCashUsdEq; // Convertido USD de Efectivo Bs

  // CXC accounts pending (Top Debtors cards and client distribution charts)
  const totalCxcBalance = cxcAccounts.reduce((sum, acc) => sum + (acc.totalBalance || 0), 0);

  // We still calculate period expenses and withdrawals for the charts
  const periodWithdrawals = transactions
    .filter(t => t.type === 'withdrawal' && filterByDate(t.date))
    .reduce((sum, t) => sum + t.amountUsd, 0);

  const periodExpenses = expenses
    .filter(e => filterByDate(e.date))
    .reduce((sum, e) => sum + e.amountUsd, 0);

  // Chart data Preparation matching exactly "Ingresos Caja Principal" CRUD
  const getLast6MonthsData = () => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i);
      const interval = { start: startOfMonth(monthDate), end: endOfMonth(monthDate) };
      
      const income = transactions
        .filter(t => {
          if (t.type !== TransactionType.SALE) return false;
          if (t.isCXC || t.paymentMethod === PaymentMethod.CXC) return false;
          return isWithinInterval(new Date(t.date), interval);
        })
        .reduce((sum, t) => {
          const isBsTx = !!(t.amountBs && t.amountBs > 0);
          const valueUsd = isBsTx ? ((t.amountUsdCash || 0) + (t.amountZelle || 0) + (t.amountCXC || 0)) : (t.totalDailySale || t.amountUsd || 0);
          return sum + valueUsd;
        }, 0);
        
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

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando datos...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight uppercase">dashboard caja principal (tienda)</h2>
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
        
        {/* Card 1: Banco $ */}
        <div className="card p-6 border-slate-200/60 hover:shadow-md transition-shadow duration-300 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Banco $</p>
              <h3 className="text-3xl font-black mt-2 tracking-tight text-blue-600">{formatCurrency(totalUsdBancoUsd)}</h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">Zelle / Binance / Bancos USD</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <CreditCard size={20} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Card 2: Efectivo $ */}
        <div className="card p-6 border-slate-200/60 hover:shadow-md transition-shadow duration-300 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Efectivo $</p>
              <h3 className="text-3xl font-black mt-2 tracking-tight text-emerald-600">{formatCurrency(totalUsdEfectivoUsd)}</h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">Divisas físicas en caja</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <DollarSign size={20} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Card 3: Total $ */}
        <div className="card p-6 border-slate-200/60 hover:shadow-md transition-shadow duration-300 flex flex-col justify-between bg-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total $</p>
              <h3 className="text-3xl font-black mt-2 tracking-tight text-slate-800">{formatCurrency(totalUsdBancoUsd + totalUsdEfectivoUsd)}</h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">Total fondos en dólares</p>
            </div>
            <div className="p-3 bg-slate-100 text-slate-700 rounded-2xl">
              <TrendingUp size={20} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Card 4: Banco Bs */}
        <div className="card p-6 border-slate-200/60 hover:shadow-md transition-shadow duration-300 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Banco Bs</p>
              <h3 className="text-2xl font-black mt-2 tracking-tight text-slate-800">
                Bs. {new Intl.NumberFormat('es-VE').format(totalBsBancoBs)}
              </h3>
              <div className="mt-3 pt-2.5 border-t border-slate-100">
                <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">Bs conv $</span>
                <span className="text-sm font-bold text-slate-700">{formatCurrency(totalBsBancoUsd)}</span>
              </div>
            </div>
            <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl">
              <CreditCard size={20} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Card 5: Efectivo Bs */}
        <div className="card p-6 border-slate-200/60 hover:shadow-md transition-shadow duration-300 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Efectivo Bs</p>
              <h3 className="text-2xl font-black mt-2 tracking-tight text-slate-800">
                Bs. {new Intl.NumberFormat('es-VE').format(totalBsEfectivoBs)}
              </h3>
              <div className="mt-3 pt-2.5 border-t border-slate-100">
                <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">Bs conv $</span>
                <span className="text-sm font-bold text-slate-700">{formatCurrency(totalBsEfectivoUsd)}</span>
              </div>
            </div>
            <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl">
              <Banknote size={20} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Card 6: Total Bs */}
        <div className="card p-6 border-slate-200/60 hover:shadow-md transition-shadow duration-300 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Bs</p>
              <h3 className="text-2xl font-black mt-2 tracking-tight text-slate-800">
                Bs. {new Intl.NumberFormat('es-VE').format(totalBsBancoBs + totalBsEfectivoBs)}
              </h3>
              <div className="mt-3 pt-2.5 border-t border-slate-100">
                <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">Bs conv $</span>
                <span className="text-sm font-bold text-slate-700">{formatCurrency(totalBsBancoUsd + totalBsEfectivoUsd)}</span>
              </div>
            </div>
            <div className="p-3 bg-slate-100 text-slate-700 rounded-2xl">
              <TrendingUp size={20} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Card 7: Cuentas Por cobrar (CXC) */}
        <div className="card p-6 border-slate-200/60 hover:shadow-md transition-shadow duration-300 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Cuentas Por cobrar (CXC)</p>
              <h3 className="text-3xl font-black mt-2 tracking-tight text-rose-500">{formatCurrency(totalCxcBalance)}</h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">Bs. {new Intl.NumberFormat('es-VE').format(totalCxcBalance * exchangeRate)} equiv.</p>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
              <Users size={20} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Space spacing to align Gran Total with Totals column on lg screens */}
        <div className="hidden lg:block"></div>

        {/* Card 8: Gran Total */}
        <div className="card p-6 border-slate-200/60 hover:shadow-md transition-shadow duration-300 flex flex-col justify-between bg-slate-900 border-none shadow-lg text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Gran Total</p>
              <h3 className="text-3xl font-black mt-2 tracking-tight text-emerald-400">
                {formatCurrency(totalUsdBancoUsd + totalUsdEfectivoUsd + totalCxcBalance + (totalBsBancoUsd + totalBsEfectivoUsd))}
              </h3>
              <div className="mt-3 pt-2.5 border-t border-slate-800">
                <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">Gran Total en Bs</span>
                <span className="text-sm font-bold text-slate-200">
                  Bs. {new Intl.NumberFormat('es-VE').format((totalUsdBancoUsd + totalUsdEfectivoUsd + totalCxcBalance) * exchangeRate + (totalBsBancoBs + totalBsEfectivoBs))}
                </span>
              </div>
            </div>
            <div className="p-3 bg-white/10 text-white rounded-2xl">
              <DollarSign size={20} strokeWidth={2.5} />
            </div>
          </div>
        </div>

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
