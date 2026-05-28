import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/db';
import { Transaction, Expense, Receipt, TransactionType, PaymentMethod } from '../types';
import { Activity, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
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

export default function CashFlow({ exchangeRate }: { exchangeRate?: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [data, setData] = useState<DailyCashFlow[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

        // USD Efectivo
        if (t.amountUsdCash !== undefined && t.amountUsdCash > 0) {
             cashUsdAmount += Number(t.amountUsdCash);
        } else if (isCashByName || t.paymentMethod === PaymentMethod.USD_CASH || t.paymentMethod === 'Dolares Efectivo' || t.paymentMethod === '$ Efectivo') {
             cashUsdAmount += Number(t.amountUsd) || 0;
        }

        // BS Efectivo
        if (t.amountBs && t.amountBs > 0 && t.exchangeRate && t.exchangeRate > 0) {
             if (isCashByName || t.paymentMethod === PaymentMethod.BS_CASH || t.paymentMethod === 'Bolivares Efectivo' || t.paymentMethod === 'Bs Efectivo') {
                  cashBsAmount += Number(t.amountBs);
             }
        } else if (t.paymentMethod === PaymentMethod.BS_CASH || t.paymentMethod === 'Bolivares Efectivo' || t.paymentMethod === 'Bs Efectivo') {
             cashBsAmount += (Number(t.amountUsd) || 0) * (Number(t.exchangeRate) || exchangeRate || 1);
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
