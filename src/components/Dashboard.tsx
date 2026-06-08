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
  CreditCard,
  Target,
  Award,
  Edit,
  Check,
  X,
  Sparkles
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
  Pie,
  AreaChart,
  Area,
  Legend,
  ComposedChart
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

  // States for Monthly Goals
  const [monthlyGoals, setMonthlyGoals] = useState<Record<string, number>>({});
  const [selectedGoalMonth, setSelectedGoalMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoalValue, setTempGoalValue] = useState('');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [chartMonths, setChartMonths] = useState(6);
  const [chartStyle, setChartStyle] = useState<'bar' | 'composed'>('composed');

  useEffect(() => {
    const unsubT = dbService.subscribeToTransactions(setTransactions);
    const unsubE = dbService.subscribeToExpenses(setExpenses);
    const unsubP = dbService.subscribeToAllPayments(setAllPayments);
    const unsubG = dbService.subscribeToMonthlyGoals(setMonthlyGoals);
    const unsubC = dbService.subscribeToCXCAccounts((accounts) => {
      setCXCAccounts(accounts);
      setLoading(false);
    });

    return () => {
      unsubT();
      unsubE();
      unsubP();
      unsubG();
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
  const getMonthlyChartData = (monthsCountCount: number) => {
    const data = [];
    for (let i = monthsCountCount - 1; i >= 0; i--) {
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

      const totalEgress = expense + withdrawal;
      const netProfit = income - totalEgress;
      const savingsRate = income > 0 ? (netProfit / income) * 100 : 0;

      data.push({
        name: format(monthDate, 'MMM', { locale: es }).toUpperCase(),
        fullName: format(monthDate, 'MMMM yyyy', { locale: es }),
        ingresos: income,
        egresos: totalEgress,
        neto: netProfit,
        tasaAhorro: savingsRate
      });
    }
    return data;
  };

  const selectedChartData = getMonthlyChartData(chartMonths);
  const totalChartIncomes = selectedChartData.reduce((sum, d) => sum + d.ingresos, 0);
  const totalChartExpenses = selectedChartData.reduce((sum, d) => sum + d.egresos, 0);
  const totalChartNet = totalChartIncomes - totalChartExpenses;
  const avgChartSavingsRate = totalChartIncomes > 0 ? (totalChartNet / totalChartIncomes) * 100 : 0;

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

  const CustomChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-xl max-w-xs text-left">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono mb-2">{data.fullName}</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                Ingresos:
              </span>
              <span className="text-xs font-black text-slate-900">{formatCurrency(data.ingresos)}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                Egresos/Retiros:
              </span>
              <span className="text-xs font-black text-slate-900">{formatCurrency(data.egresos)}</span>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-6">
              <span className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <span className={`w-2.5 h-2.5 rounded-full ${data.neto >= 0 ? 'bg-blue-600' : 'bg-amber-600'}`}></span>
                Sobrante Neto:
              </span>
              <span className={`text-xs font-black ${data.neto >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                {formatCurrency(data.neto)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-[10px] font-bold text-slate-500">Margen de Ahorro:</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${data.neto >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {data.tasaAhorro.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Helper to dynamically calculate total sales for an arbitrarily requested month in 'yyyy-MM' format
  const getSalesForMonth = (monthKey: string) => {
    if (!monthKey) return 0;
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) return 0;
    
    const startOfTarget = startOfMonth(new Date(year, month - 1, 1));
    const endOfTarget = endOfMonth(new Date(year, month - 1, 1));
    const interval = { start: startOfTarget, end: endOfTarget };

    return transactions
      .filter(t => {
        if (t.type !== TransactionType.SALE) return false;
        if (t.isCXC || t.paymentMethod === PaymentMethod.CXC) return false;
        try {
          return isWithinInterval(new Date(t.date), interval);
        } catch {
          return false;
        }
      })
      .reduce((sum, t) => {
        const isBsTx = !!(t.amountBs && t.amountBs > 0);
        const valueUsd = isBsTx ? ((t.amountUsdCash || 0) + (t.amountZelle || 0) + (t.amountCXC || 0)) : (t.totalDailySale || t.amountUsd || 0);
        return sum + valueUsd;
      }, 0);
  };

  // Pre-generate recent months
  const recentGoalMonths = React.useMemo(() => {
    const list = [];
    for (let i = 0; i < 4; i++) {
      const d = subMonths(new Date(), i);
      list.push({
        key: format(d, 'yyyy-MM'),
        label: format(d, 'MMMM yyyy', { locale: es }).toUpperCase(),
        shortLabel: format(d, 'MMM yyyy', { locale: es }).toUpperCase()
      });
    }
    return list;
  }, []);

  // Sync edit mode input when selected goal month changes
  useEffect(() => {
    const currentGoal = monthlyGoals[selectedGoalMonth] || 0;
    setTempGoalValue(currentGoal > 0 ? currentGoal.toString() : '');
  }, [selectedGoalMonth, monthlyGoals]);

  // Save changes to db
  const handleSaveGoal = async () => {
    const value = parseFloat(tempGoalValue);
    if (isNaN(value) || value < 0) return;
    await dbService.updateMonthlyGoal(selectedGoalMonth, value);
    setIsEditingGoal(false);
  };

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

      {/* Seccion de Metas de Ingresos Mensuales */}
      <div className="card p-6 border-slate-200/60 shadow-sm relative overflow-hidden bg-white mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Target className="text-blue-600" size={18} />
              Metas de Ingresos Mensuales
            </h3>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Establece objetivos de ventas y monitorea el progreso en tiempo real</p>
          </div>
          
          {/* Month Selection */}
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ver Mes:</label>
            <select
              value={selectedGoalMonth}
              onChange={(e) => {
                setSelectedGoalMonth(e.target.value);
                setIsEditingGoal(false);
              }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
            >
              {recentGoalMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Col 1 & 2: Tracker progress */}
          <div className="md:col-span-2 space-y-6">
            {isEditingGoal ? (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-left">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Definir Meta para {recentGoalMonths.find(m => m.key === selectedGoalMonth)?.label}</h4>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative w-full">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                    <input
                      type="number"
                      placeholder="Ej. 15000"
                      value={tempGoalValue}
                      onChange={(e) => setTempGoalValue(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-8 pr-4 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={handleSaveGoal}
                      className="w-full sm:w-auto shrink-0 bg-blue-600 text-white rounded-xl px-4 py-2 text-xs font-bold hover:bg-blue-700 active:transform active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check size={14} /> Guardar
                    </button>
                    <button
                      onClick={() => setIsEditingGoal(false)}
                      className="w-full sm:w-auto shrink-0 bg-slate-200 text-slate-700 rounded-xl px-4 py-2 text-xs font-bold hover:bg-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <X size={14} /> Cancelar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-left">
                {(monthlyGoals[selectedGoalMonth] || 0) > 0 ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-start sm:items-center gap-2 flex-wrap">
                        <span className="text-2xl font-black text-slate-800 tracking-tight">{formatCurrency(getSalesForMonth(selectedGoalMonth))}</span>
                        <span className="text-xs text-slate-400 font-semibold md:inline-block">logrados de una meta de</span>
                        <span className="text-sm font-black text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg">{formatCurrency(monthlyGoals[selectedGoalMonth])}</span>
                      </div>
                      <button
                        onClick={() => {
                          setTempGoalValue((monthlyGoals[selectedGoalMonth] || 0).toString());
                          setIsEditingGoal(true);
                        }}
                        className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg px-2.5 py-1.5 transition-colors self-start sm:self-auto cursor-pointer"
                      >
                        <Edit size={12} /> Modificar Meta
                      </button>
                    </div>

                    {/* Progress bar container */}
                    <div className="space-y-2 mt-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-500">Progreso del objetivo</span>
                        <span className={`font-black uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1.5 text-[10px] ${getSalesForMonth(selectedGoalMonth) >= (monthlyGoals[selectedGoalMonth] || 0) ? 'text-emerald-700 bg-emerald-50' : 'text-blue-750 bg-blue-50'}`}>
                          {getSalesForMonth(selectedGoalMonth) >= (monthlyGoals[selectedGoalMonth] || 0) && <Sparkles size={12} className="text-amber-500" />}
                          {(monthlyGoals[selectedGoalMonth] || 0) > 0 ? (getSalesForMonth(selectedGoalMonth) / (monthlyGoals[selectedGoalMonth] || 0) * 105).toFixed(1) : '0.0'}% {getSalesForMonth(selectedGoalMonth) >= (monthlyGoals[selectedGoalMonth] || 0) ? '¡Alcanzada!' : ''}
                        </span>
                      </div>

                      {/* Aesthetic bar wrapper */}
                      <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden shadow-inner relative border border-slate-100/60">
                        <div 
                          className={`h-full rounded-full transition-all duration-700 ease-out flex items-center justify-end pr-2 ${getSalesForMonth(selectedGoalMonth) >= (monthlyGoals[selectedGoalMonth] || 0) ? 'bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600' : 'bg-gradient-to-r from-blue-500 to-indigo-600'}`}
                          style={{ width: `${Math.min((monthlyGoals[selectedGoalMonth] || 0) > 0 ? (getSalesForMonth(selectedGoalMonth) / (monthlyGoals[selectedGoalMonth] || 0) * 100) : 0, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Feedback message cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/50">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Restante para Meta</span>
                        <span className={`text-lg font-black block mt-1 ${getSalesForMonth(selectedGoalMonth) >= (monthlyGoals[selectedGoalMonth] || 0) ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {getSalesForMonth(selectedGoalMonth) >= (monthlyGoals[selectedGoalMonth] || 0) ? '$0.00' : formatCurrency((monthlyGoals[selectedGoalMonth] || 0) - getSalesForMonth(selectedGoalMonth))}
                        </span>
                        <p className="text-[10px] text-slate-500 font-semibold mt-1">
                          {getSalesForMonth(selectedGoalMonth) >= (monthlyGoals[selectedGoalMonth] || 0) 
                            ? '¡Excelente rendimiento de ventas!' 
                            : `Equivalente en Bs: Bs. ${new Intl.NumberFormat('es-VE').format(Math.max(0, (monthlyGoals[selectedGoalMonth] || 0) - getSalesForMonth(selectedGoalMonth)) * exchangeRate)}`
                          }
                        </p>
                      </div>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/50 flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">Estado del Objetivo</span>
                          <div className="flex items-start gap-2.5 mt-1.5">
                            <Award size={18} className={`shrink-0 mt-0.5 ${getSalesForMonth(selectedGoalMonth) >= (monthlyGoals[selectedGoalMonth] || 0) ? 'text-amber-500' : 'text-blue-500'}`} />
                            <span className="text-xs font-bold text-slate-600 leading-tight">
                              {getSalesForMonth(selectedGoalMonth) >= (monthlyGoals[selectedGoalMonth] || 0) 
                                ? '¡Felicitaciones! Has consolidado mayores ventas de lo planificado para este mes. ¡Sigue rompiendo récords!' 
                                : (getSalesForMonth(selectedGoalMonth) / (monthlyGoals[selectedGoalMonth] || 1) * 100) >= 75 
                                ? 'Estás en la recta final de tu meta. ¡Mantén el esfuerzo y asiste tus clientes clave!'
                                : (getSalesForMonth(selectedGoalMonth) / (monthlyGoals[selectedGoalMonth] || 1) * 100) >= 50
                                ? 'Has alcanzado la mitad del recorrido. ¡Excelente avance!'
                                : 'Establecido y avanzando de forma consistente.'
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Target size={36} className="text-slate-300 mb-2 animate-bounce" />
                    <p className="text-sm font-bold text-slate-800">No se ha establecido una meta para {recentGoalMonths.find(m => m.key === selectedGoalMonth)?.label}</p>
                    <p className="text-xs text-slate-500 mt-1 mb-4">Define un objetivo de ventas para motivar e impulsar el rendimiento mensual.</p>
                    <button
                      onClick={() => {
                        setTempGoalValue('');
                        setIsEditingGoal(true);
                      }}
                      className="bg-blue-600 text-white font-bold text-xs rounded-xl px-4 py-2 hover:bg-blue-700 shadow-sm active:transform active:scale-95 transition-all cursor-pointer"
                    >
                      Establecer Meta de Ventas
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Col 3: Quick history / selectors list */}
          <div className="border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-6 text-left">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Historial y Selección</h4>
            <div className="space-y-2">
              {recentGoalMonths.map((m) => {
                const mGoal = monthlyGoals[m.key] || 0;
                const mSales = getSalesForMonth(m.key);
                const mPercent = mGoal > 0 ? (mSales / mGoal) * 100 : 0;
                const isMSelected = selectedGoalMonth === m.key;
                
                return (
                  <button
                    key={m.key}
                    onClick={() => {
                      setSelectedGoalMonth(m.key);
                      setIsEditingGoal(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer border text-left ${
                      isMSelected 
                        ? 'bg-blue-50 border-blue-200 shadow-xs font-bold text-blue-900' 
                        : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-700'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-bold block uppercase tracking-wide leading-none">{m.shortLabel}</span>
                      <span className="text-[10px] text-slate-400 font-semibold block mt-1.5">
                        {mGoal > 0 ? `Meta: ${formatCurrency(mGoal)}` : 'Sin meta definida'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-black block">
                        {formatCurrency(mSales)}
                      </span>
                      {mGoal > 0 && (
                        <span className={`text-[9px] font-bold block mt-0.5 ${mSales >= mGoal ? 'text-emerald-600 font-black' : 'text-slate-500'}`}>
                          {mPercent.toFixed(0)}% logrados
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 card p-6 border-slate-200/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 mb-4 gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-600" />
                Análisis de Salud Financiera
              </h3>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Distribución mensual de ingresos vs egresos</p>
            </div>
            
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {/* Type Switcher */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-xs text-[10px] font-semibold">
                <button
                  onClick={() => setChartStyle('composed')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${chartStyle === 'composed' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Áreas
                </button>
                <button
                  onClick={() => setChartStyle('bar')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${chartStyle === 'bar' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Barras
                </button>
              </div>

              {/* Month selector */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-xs text-[10px] font-semibold">
                <button
                  onClick={() => setChartMonths(6)}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${chartMonths === 6 ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  6 Meses
                </button>
                <button
                  onClick={() => setChartMonths(12)}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${chartMonths === 12 ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  12 Meses
                </button>
              </div>
            </div>
          </div>

          {/* Quick Stats Header */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 mb-4 text-left">
            <div>
              <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Ingresos Totales (Período)</span>
              <span className="text-xs font-black text-slate-800 leading-tight block mt-0.5">{formatCurrency(totalChartIncomes)}</span>
            </div>
            <div>
              <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Egresos / Retiros</span>
              <span className="text-xs font-black text-slate-800 leading-tight block mt-0.5">{formatCurrency(totalChartExpenses)}</span>
            </div>
            <div>
              <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Ahorro Neto</span>
              <span className={`text-xs font-black leading-tight block mt-0.5 ${totalChartNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatCurrency(totalChartNet)}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Margen Promedio</span>
              <span className="text-xs font-black text-slate-800 leading-tight block mt-0.5">
                {avgChartSavingsRate.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="h-72 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartStyle === 'composed' ? (
                <ComposedChart data={selectedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.01}/>
                    </linearGradient>
                    <linearGradient id="colorEgresos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                    dy={5}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                  />
                  <Tooltip content={<CustomChartTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10b981" strokeWidth={2} fill="url(#colorIngresos)" />
                  <Area type="monotone" dataKey="egresos" name="Egresos" stroke="#ef4444" strokeWidth={2} fill="url(#colorEgresos)" />
                  <Line type="monotone" dataKey="neto" name="Neto" stroke="#2563eb" strokeWidth={3} dot={{ r: 3, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} />
                </ComposedChart>
              ) : (
                <BarChart data={selectedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                    dy={5}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                  />
                  <Tooltip content={<CustomChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="#0f172a" radius={[4, 4, 0, 0]} barSize={chartMonths === 6 ? 24 : 14} />
                  <Bar dataKey="egresos" name="Egresos" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={chartMonths === 6 ? 24 : 14} />
                </BarChart>
              )}
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
