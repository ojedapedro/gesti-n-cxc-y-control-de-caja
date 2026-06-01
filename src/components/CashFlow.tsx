import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/db';
import { Transaction, Expense, Receipt, TransactionType, PaymentMethod } from '../types';
import { Activity, TrendingUp, TrendingDown, DollarSign, Calendar, Sparkles, Brain, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, Layers } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

interface DailyCashFlow {
  date: string;
  inflowUsdCash: number;
  inflowBsCash: number;
  outflowUsdCash: number;
  outflowBsCash: number;
  netUsdCash: number;
  netBsCash: number;
}

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

export default function CashFlow({ exchangeRate }: { exchangeRate?: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [data, setData] = useState<DailyCashFlow[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // AI Financial Analysis states
  const [aiTimeframe, setAiTimeframe] = useState<'today' | 'week' | 'month' | 'filtered'>('week');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    status: string;
    statusColor: string;
    overview: string;
    strengths: string[];
    risks: string[];
    recommendations: string[];
    trend: string;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const getTotalsForTimeframe = (timeframe: 'today' | 'week' | 'month' | 'filtered') => {
    let targetRows = [...data];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    
    if (timeframe === 'today') {
      targetRows = data.filter(row => row.date === todayStr);
    } else if (timeframe === 'week') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = format(sevenDaysAgo, 'yyyy-MM-dd');
      targetRows = data.filter(row => row.date >= sevenDaysAgoStr);
    } else if (timeframe === 'month') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = format(thirtyDaysAgo, 'yyyy-MM-dd');
      targetRows = data.filter(row => row.date >= thirtyDaysAgoStr);
    } else {
      targetRows = filteredData;
    }

    const inflowUsdCash = targetRows.reduce((acc, curr) => acc + curr.inflowUsdCash, 0);
    const inflowBsCash = targetRows.reduce((acc, curr) => acc + curr.inflowBsCash, 0);
    const outflowUsdCash = targetRows.reduce((acc, curr) => acc + curr.outflowUsdCash, 0);
    const outflowBsCash = targetRows.reduce((acc, curr) => acc + curr.outflowBsCash, 0);

    const inflow = inflowUsdCash + (inflowBsCash / (exchangeRate || 1));
    const outflow = outflowUsdCash + (outflowBsCash / (exchangeRate || 1));
    const netUsdCash = inflowUsdCash - outflowUsdCash;
    const netBsCash = inflowBsCash - outflowBsCash;
    const net = netUsdCash + (netBsCash / (exchangeRate || 1));

    return {
      rows: targetRows,
      summary: {
        totalInflowUsdCash: inflowUsdCash,
        totalInflowBsCash: inflowBsCash,
        totalOutflowUsdCash: outflowUsdCash,
        totalOutflowBsCash: outflowBsCash,
        totalInflow: inflow,
        totalOutflow: outflow,
        totalNetUsdCash: netUsdCash,
        totalNetBsCash: netBsCash,
        totalNet: net,
      }
    };
  };

  const runAiAnalysis = async (selectedTf: 'today' | 'week' | 'month' | 'filtered') => {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);

    const labelMap = {
      today: 'Día de hoy',
      week: 'Últimos 7 días (Semana)',
      month: 'Últimos 30 días (Mes)',
      filtered: `Rango filtrado (${startDate || 'Inicio'} hasta ${endDate || 'Fin'})`
    };

    const timeframeLabel = labelMap[selectedTf];
    const { rows, summary } = getTotalsForTimeframe(selectedTf);

    try {
      const response = await fetch('/api/ai/analyze-financials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeframe: timeframeLabel,
          summary,
          dailyFlows: rows.map(r => ({
            date: r.date,
            inflowUsd: r.inflowUsdCash,
            inflowBs: r.inflowBsCash,
            outflowUsd: r.outflowUsdCash,
            outflowBs: r.outflowBsCash,
            netUsd: r.netUsdCash,
            netBs: r.netBsCash
          })),
          exchangeRate
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'No se pudo conectar al servicio de análisis inteligente.');
      }

      const result = await response.json();
      setAiResult(result);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || 'Error al conectar con la Inteligencia Artificial.');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    let tLoaded = false;
    let eLoaded = false;
    let rLoaded = false;

    const checkReady = () => {
      if (tLoaded && eLoaded && rLoaded) setLoading(false);
    }

    const unsubT = dbService.subscribeToTransactions((data) => {
      setTransactions(data);
      tLoaded = true;
      checkReady();
    });
    const unsubE = dbService.subscribeToExpenses((data) => {
      setExpenses(data);
      eLoaded = true;
      checkReady();
    });
    const unsubR = dbService.subscribeToReceipts((data) => {
      setReceipts(data);
      rLoaded = true;
      checkReady();
    });

    return () => {
      unsubT();
      unsubE();
      unsubR();
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    try {
      const flowMap = new Map<string, DailyCashFlow>();

      const getOrCreateDate = (dateStr: string) => {
        if (!flowMap.has(dateStr)) {
          flowMap.set(dateStr, {
            date: dateStr,
            inflowUsdCash: 0,
            inflowBsCash: 0,
            outflowUsdCash: 0,
            outflowBsCash: 0,
            netUsdCash: 0,
            netBsCash: 0,
          });
        }
        return flowMap.get(dateStr)!;
      };

      transactions?.forEach(t => {
        if (t.type !== TransactionType.SALE && t.type !== TransactionType.INCOME) return;

        const destComp = (t.destinationBank || '').trim().toUpperCase();
        const conceptUpper = (t.concept || '').toUpperCase();
        const isCXCPayment = t.type === TransactionType.INCOME && (conceptUpper.includes('ABONO CUENTAS POR COBRAR') || conceptUpper.includes('(CXC)'));

        // Skip credit sale transactions (charges/CXC) from physical Cash Flow as they represent debt, not received money
        const isCXCField = t.isCXC || t.paymentMethod === PaymentMethod.CXC || 
                           (t.type === TransactionType.SALE && (destComp.includes('CXC') || destComp.includes('COBRAR')));
        if (isCXCField) return;

        const isCashDest = destComp.includes('EFECTIVO') || destComp.includes('CAJA') || destComp === '';
        const isBankDest = destComp.length > 0 && !isCashDest;

        const isBank = isBankDest || t.paymentMethod === PaymentMethod.BS || t.paymentMethod === PaymentMethod.ZELLE || t.paymentMethod === PaymentMethod.BINANCE;

        if (isBank) return; // Skip bank/destination options in Cash flow control!
        
        let cashUsdAmount = 0;
        let cashBsAmount = 0;

        const dest = (t.destinationBank || '').toUpperCase();
        const isCashByName = dest.includes('EFECTIVO') || dest.includes('CAJA');

        const isBsTx = isBsTransaction(t);

        if (isBsTx) {
          const isCashBsMethod = t.paymentMethod === PaymentMethod.BS_CASH || t.paymentMethod === 'Bolivares Efectivo' || t.paymentMethod === 'Bs Efectivo' || isCashByName;
          if (isCashBsMethod) {
            cashBsAmount = Number(t.amountBs) || (Number(t.amountUsd) * (Number(t.exchangeRate) || exchangeRate || 1));
          }
        } else {
          const isCashUsdMethod = t.paymentMethod === PaymentMethod.USD_CASH || t.paymentMethod === 'Dolares Efectivo' || t.paymentMethod === '$ Efectivo' || isCashByName;
          if (isCashUsdMethod) {
            if (t.amountUsdCash !== undefined && t.amountUsdCash > 0) {
              cashUsdAmount = Number(t.amountUsdCash);
            } else {
              cashUsdAmount = Number(t.amountUsd) || 0;
            }
          }
        }

        if (cashUsdAmount > 0 || cashBsAmount > 0) {
           const d = getOrCreateDate(t.date);
           d.inflowUsdCash += cashUsdAmount;
           d.inflowBsCash += cashBsAmount;
        }
      });

      expenses?.forEach(e => {
        const d = getOrCreateDate(e.date);
        const isBs = e.paymentMethod === PaymentMethod.BS_CASH || e.paymentMethod === PaymentMethod.BS;
        if (isBs) {
           d.outflowBsCash += Number(e.amountBs) || (Number(e.amountUsd) * (Number(e.exchangeRate) || exchangeRate || 1));
        } else {
           d.outflowUsdCash += Number(e.amountUsd) || 0;
        }
      });

      receipts?.forEach(r => {
        const d = getOrCreateDate(r.date);
        const isBs = r.paymentMethod === PaymentMethod.BS_CASH || r.paymentMethod === PaymentMethod.BS;
        if (isBs) {
           d.outflowBsCash += Number(r.amountBs) || (Number(r.amountUsd) * (Number(r.exchangeRate) || exchangeRate || 1));
        } else {
           d.outflowUsdCash += Number(r.amountUsd) || 0;
        }
      });

      const aggregated = Array.from(flowMap.values()).map(d => ({
        ...d,
        netUsdCash: d.inflowUsdCash - d.outflowUsdCash,
        netBsCash: d.inflowBsCash - d.outflowBsCash,
      }));

      // Sort descending
      aggregated.sort((a, b) => b.date.localeCompare(a.date));
      setData(aggregated);
    } catch (error) {
      console.error("Error calculating cash flow data:", error);
    }
  }, [transactions, expenses, receipts, loading]);

  const getDayName = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    if (!isValid(date)) return '';
    try {
      return format(date, 'EEEE, d MMM', { locale: es });
    } catch {
      return dateStr;
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(row => {
      if (startDate && row.date < startDate) return false;
      if (endDate && row.date > endDate) return false;
      return true;
    });
  }, [data, startDate, endDate]);

  const totalInflowUsdCash = filteredData.reduce((acc, curr) => acc + curr.inflowUsdCash, 0);
  const totalInflowBsCash = filteredData.reduce((acc, curr) => acc + curr.inflowBsCash, 0);
  const totalOutflowUsdCash = filteredData.reduce((acc, curr) => acc + curr.outflowUsdCash, 0);
  const totalOutflowBsCash = filteredData.reduce((acc, curr) => acc + curr.outflowBsCash, 0);

  const totalInflow = totalInflowUsdCash + (totalInflowBsCash / (exchangeRate || 1));
  const totalOutflow = totalOutflowUsdCash + (totalOutflowBsCash / (exchangeRate || 1));
  
  const totalNetUsdCash = totalInflowUsdCash - totalOutflowUsdCash;
  const totalNetBsCash = totalInflowBsCash - totalOutflowBsCash;
  const totalNet = totalNetUsdCash + (totalNetBsCash / (exchangeRate || 1));

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  const formatBs = (amt: number) => {
     return 'Bs ' + new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amt);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Balance de Liquidez</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Resumen del flujo de caja diario por moneda (USD y BS).</p>
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
         <div className="card p-6 border-emerald-100 bg-emerald-50/30">
            <div className="flex items-start justify-between">
              <div className="w-full">
                <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">Ingresos Efectivo</p>
                <div className="flex justify-between items-end mt-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">USD</p>
                    <h3 className="text-2xl font-black tracking-tight text-emerald-700">{formatCurrency(totalInflowUsdCash)}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">Bolívares</p>
                    <h3 className="text-2xl font-black tracking-tight text-emerald-700">{formatBs(totalInflowBsCash)}</h3>
                    <p className="text-[10px] text-emerald-600/70">Eq {formatCurrency(totalInflowBsCash / (exchangeRate || 1))}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-emerald-200/60 flex justify-between items-center text-sm">
                   <span className="font-semibold text-emerald-800">Total Ingresos Eq USD</span>
                   <span className="font-black text-emerald-800">{formatCurrency(totalInflow)}</span>
                </div>
              </div>
            </div>
         </div>

         <div className="card p-6 border-rose-100 bg-rose-50/30">
            <div className="flex items-start justify-between">
              <div className="w-full">
                <p className="text-[11px] font-bold text-rose-600 uppercase tracking-widest">Salidas Efectivo</p>
                <div className="flex justify-between items-end mt-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">USD</p>
                    <h3 className="text-2xl font-black tracking-tight text-rose-700">{formatCurrency(totalOutflowUsdCash)}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">Bolívares</p>
                    <h3 className="text-2xl font-black tracking-tight text-rose-700">{formatBs(totalOutflowBsCash)}</h3>
                    <p className="text-[10px] text-rose-600/70">Eq {formatCurrency(totalOutflowBsCash / (exchangeRate || 1))}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-rose-200/60 flex justify-between items-center text-sm">
                   <span className="font-semibold text-rose-800">Total Salidas Eq USD</span>
                   <span className="font-black text-rose-800">{formatCurrency(totalOutflow)}</span>
                </div>
              </div>
            </div>
         </div>

         <div className="card p-6 border-slate-200 shadow-sm relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-2 h-full ${totalNet >= 0 ? 'bg-blue-500' : 'bg-red-500'}`}></div>
            <div className="flex items-start justify-between">
              <div className="w-full relative z-10">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Saldos de Caja (Flujo Neto)</p>
                <div className="flex justify-between items-end mt-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">Saldo USD</p>
                    <h3 className={`text-2xl font-black tracking-tight ${totalNetUsdCash >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatCurrency(totalNetUsdCash)}
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">Saldo Bs</p>
                    <h3 className={`text-2xl font-black tracking-tight ${totalNetBsCash >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatBs(totalNetBsCash)}
                    </h3>
                    <p className="text-[10px] text-slate-400">Eq {formatCurrency(totalNetBsCash / (exchangeRate || 1))}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 flex justify-between items-center text-lg">
                   <span className="font-semibold text-slate-700">Flujo Total Eq USD</span>
                   <span className={`font-black ${totalNet >= 0 ? 'text-slate-900' : 'text-red-600'}`}>{formatCurrency(totalNet)}</span>
                </div>
              </div>
            </div>
         </div>
      </div>

      {/* SECCIÓN DEL ANÁLISIS FINANCIERO INTELIGENTE (IA) */}
      <div className="card p-6 border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Brain size={120} className="text-slate-900" />
        </div>
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <Sparkles size={18} className="animate-pulse" />
              </span>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Análisis Financiero Inteligente</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Evaluación automática de liquidez y consejos comerciales adaptados a mercados bimonetarios con el motor Gemini.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded-lg border border-slate-200 shadow-sm text-xs">
              <label className="text-slate-400 font-bold uppercase text-[9px] mr-1">Periodo:</label>
              <select
                value={aiTimeframe}
                onChange={(e) => setAiTimeframe(e.target.value as any)}
                className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer"
              >
                <option value="today">Día de hoy</option>
                <option value="week">Últimos 7 días</option>
                <option value="month">Últimos 30 días</option>
                <option value="filtered">Filtro activo actual</option>
              </select>
            </div>

            <button
              onClick={() => runAiAnalysis(aiTimeframe)}
              disabled={aiLoading}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {aiLoading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Analizando...</span>
                </>
              ) : (
                <>
                  <Brain size={14} />
                  <span>Generar Reporte</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* AI LOADING STATE */}
        {aiLoading && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-slate-800 animate-spin"></div>
              <Sparkles size={16} className="text-blue-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-ping" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-850">Analizando el balance de caja y flujos...</p>
              <p className="text-xs text-slate-400 mt-0.5">Calculando saldos y diagnosticando riesgos de devaluación cambiaria.</p>
            </div>
          </div>
        )}

        {/* AI ERROR STATE */}
        {aiError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-xs">
            <AlertTriangle className="shrink-0 mt-0.5" size={16} />
            <div>
              <p className="font-bold">No se pudo generar el análisis financiero</p>
              <p className="mt-1 opacity-90">{aiError}</p>
            </div>
          </div>
        )}

        {/* AI DEFAULT INSTRUCTION STATE */}
        {!aiLoading && !aiResult && !aiError && (
          <div className="py-8 text-center flex flex-col items-center max-w-lg mx-auto">
            <Brain className="text-slate-300 mb-3" size={32} />
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest font-mono">Diagnóstico de Tesorería</h4>
            <p className="text-xs text-slate-500 mt-1">
              Haz clic en "Generar Reporte" para evaluar la salud de tu flujo de caja en USD y BS, detectar acumulación riesgosa de bolívares y recibir consejos específicos para la realidad bimonetaria de Venezuela.
            </p>
          </div>
        )}

        {/* AI SYSTEM ANALYSIS RESULT */}
        {aiResult && (
          <div className="mt-5 space-y-5 text-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Salud Financiera del Periodo:</span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider
                  ${aiResult.statusColor === 'emerald' ? 'bg-emerald-100 text-emerald-850 border border-emerald-200' : ''}
                  ${aiResult.statusColor === 'teal' ? 'bg-teal-100 text-teal-850 border border-teal-200' : ''}
                  ${aiResult.statusColor === 'blue' ? 'bg-blue-100 text-blue-850 border border-blue-200' : ''}
                  ${aiResult.statusColor === 'orange' ? 'bg-amber-100 text-amber-850 border border-amber-200' : ''}
                  ${aiResult.statusColor === 'red' ? 'bg-red-100 text-red-850 border border-red-200' : ''}
                `}>
                  {aiResult.status}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <TrendingUp size={14} className="text-slate-400" />
                <span className="font-semibold">Tendencia proyectada:</span>
                <span className="font-bold text-slate-900 bg-white px-2 py-0.5 border border-slate-200 rounded">{aiResult.trend}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Resumen & Fortalezas */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Diagnóstico Global</h4>
                  <p className="text-sm leading-relaxed text-slate-600 font-medium">
                    {aiResult.overview}
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-600">Fortalezas Identificadas</h4>
                  <ul className="space-y-1.5">
                    {aiResult.strengths.map((st, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-600 font-medium">
                        <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                        <span>{st}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Riesgos & Recomendaciones */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-rose-600 flex items-center gap-1">
                    <AlertTriangle size={13} /> Alertas & Riesgos de Liquidez
                  </h4>
                  <ul className="space-y-1.5">
                    {aiResult.risks.map((rk, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-600 font-medium border-l-2 border-orange-200 pl-2">
                        <span>{rk}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2.5 bg-blue-50/40 p-4 border border-blue-100 rounded-xl">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-blue-700">Recomendaciones de Acción</h4>
                  <ul className="space-y-2">
                    {aiResult.recommendations.map((rc, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 font-medium">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-[10px] font-black text-blue-700 shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{rc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 px-5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Día</th>
                <th className="p-4 px-5 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-widest text-emerald-700 bg-emerald-50 border-l border-white">Ingresos (USD | BS)</th>
                <th className="p-4 px-5 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-widest text-rose-700 bg-rose-50 border-l border-white">Salidas (USD | BS)</th>
                <th className="p-4 px-5 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-widest text-blue-700 bg-blue-50 border-l border-white">Flujo Neto (USD | BS)</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors">
                  <td className="p-4 px-5 whitespace-nowrap">
                    <div className="font-bold text-slate-900 capitalize">{getDayName(row.date)}</div>
                    <div className="text-[11px] text-slate-500">{row.date}</div>
                  </td>
                  <td className="p-4 px-5 text-center bg-emerald-50/20 border-l border-emerald-100">
                    <div className="flex justify-center gap-4 text-xs items-center">
                      <div className="font-bold text-emerald-700 w-1/2 text-right">{formatCurrency(row.inflowUsdCash)}</div>
                      <div className="text-slate-300">|</div>
                      <div className="font-bold text-emerald-600 w-1/2 text-left">{formatBs(row.inflowBsCash)}</div>
                    </div>
                  </td>
                  <td className="p-4 px-5 text-center bg-rose-50/20 border-l border-rose-100">
                    <div className="flex justify-center gap-4 text-xs items-center">
                      <div className="font-bold text-rose-700 w-1/2 text-right">{formatCurrency(row.outflowUsdCash)}</div>
                      <div className="text-slate-300">|</div>
                      <div className="font-bold text-rose-600 w-1/2 text-left">{formatBs(row.outflowBsCash)}</div>
                    </div>
                  </td>
                  <td className="p-4 px-5 text-center bg-blue-50/20 border-l border-blue-100">
                     <div className="flex justify-center gap-4 text-xs items-center">
                      <div className={`font-bold w-1/2 text-right ${row.netUsdCash >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatCurrency(row.netUsdCash)}</div>
                      <div className="text-slate-300">|</div>
                      <div className={`font-bold w-1/2 text-left ${row.netBsCash >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{formatBs(row.netBsCash)}</div>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-slate-400 italic">No hay registros de flujo de caja para el periodo seleccionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
