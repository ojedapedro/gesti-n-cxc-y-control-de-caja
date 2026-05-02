import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/db';
import { Transaction, Expense, Receipt } from '../types';
import { Activity, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface DailyCashFlow {
  date: string;
  inflowUsd: number;
  cashUsd: number;
  zelleUsd: number;
  bsUsd: number;
  outflowUsd: number;
  withdrawalsUsd: number;
  netFlow: number;
}

export default function CashFlow({ exchangeRate }: { exchangeRate?: number }) {
  const [data, setData] = useState<DailyCashFlow[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const [transactions, expenses, receipts] = await Promise.all([
          dbService.getTransactions(),
          dbService.getExpenses(),
          dbService.getReceipts()
        ]);

        const flowMap = new Map<string, DailyCashFlow>();

        const getOrCreateDate = (dateStr: string) => {
          if (!flowMap.has(dateStr)) {
            flowMap.set(dateStr, {
              date: dateStr,
              inflowUsd: 0,
              cashUsd: 0,
              zelleUsd: 0,
              bsUsd: 0,
              outflowUsd: 0,
              withdrawalsUsd: 0,
              netFlow: 0
            });
          }
          return flowMap.get(dateStr)!;
        };

        transactions?.forEach(t => {
          const d = getOrCreateDate(t.date);
          d.inflowUsd += t.amountUsd || 0;
          d.cashUsd += t.amountUsdCash || 0;
          d.zelleUsd += t.amountZelle || 0;
          
          if (t.amountBs && t.exchangeRate) {
             d.bsUsd += t.amountBs / t.exchangeRate;
          }
        });

        expenses?.forEach(e => {
          const d = getOrCreateDate(e.date);
          d.outflowUsd += e.amountUsd || 0;
        });

        receipts?.forEach(r => {
          const d = getOrCreateDate(r.date);
          d.withdrawalsUsd += r.amountUsd || 0;
        });

        const aggregated = Array.from(flowMap.values()).map(d => ({
          ...d,
          netFlow: d.inflowUsd - d.outflowUsd - d.withdrawalsUsd
        }));

        // Sort descending
        aggregated.sort((a, b) => b.date.localeCompare(a.date));
        setData(aggregated);
      } catch (error) {
        console.error("Error fetching cash flow data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

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

  const totalInflow = filteredData.reduce((acc, curr) => acc + curr.inflowUsd, 0);
  const totalOutflow = filteredData.reduce((acc, curr) => acc + curr.outflowUsd + curr.withdrawalsUsd, 0);
  const totalNet = totalInflow - totalOutflow;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Balance de Liquidez</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Resumen del flujo de caja diario (Ingresos vs Egresos).</p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
         <div className="card p-6 border-slate-200/60 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Ingresos Totales</p>
                <h3 className="text-3xl font-black mt-2 tracking-tight text-slate-900">{formatCurrency(totalInflow)}</h3>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 text-emerald-600">
                <TrendingUp size={22} strokeWidth={2.5} />
              </div>
            </div>
         </div>
         <div className="card p-6 border-slate-200/60 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Egresos Totales</p>
                <h3 className="text-3xl font-black mt-2 tracking-tight text-slate-900">{formatCurrency(totalOutflow)}</h3>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 text-rose-600">
                <TrendingDown size={22} strokeWidth={2.5} />
              </div>
            </div>
         </div>
         <div className="card p-6 border-slate-200/60 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Flujo Neto</p>
                <h3 className={`text-3xl font-black mt-2 tracking-tight ${totalNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(totalNet)}
                </h3>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 text-slate-900">
                <Activity size={22} strokeWidth={2.5} />
              </div>
            </div>
         </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="p-4 px-5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Día</th>
                <th className="p-4 px-5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest text-emerald-700 bg-emerald-50/30">Ingresos</th>
                <th className="p-4 px-5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest text-rose-700 bg-rose-50/30">Gastos</th>
                <th className="p-4 px-5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest text-amber-700 bg-amber-50/30">Retiros</th>
                <th className="p-4 px-5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest bg-slate-100">Flujo Neto</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors">
                  <td className="p-4 px-5">
                    <div className="font-bold text-slate-900 capitalize">{getDayName(row.date)}</div>
                    <div className="text-[11px] text-slate-500">{row.date}</div>
                  </td>
                  <td className="p-4 px-5 text-right bg-emerald-50/10 border-l border-emerald-100/50">
                    <div className="font-bold text-emerald-600">{formatCurrency(row.inflowUsd)}</div>
                  </td>
                  <td className="p-4 px-5 text-right bg-rose-50/10 border-l border-rose-100/50">
                    <div className="font-bold text-rose-600">{formatCurrency(row.outflowUsd)}</div>
                  </td>
                  <td className="p-4 px-5 text-right bg-amber-50/10 border-l border-amber-100/50">
                    <div className="font-bold text-amber-600">{formatCurrency(row.withdrawalsUsd)}</div>
                  </td>
                  <td className="p-4 px-5 text-right bg-slate-50 border-l border-slate-200">
                    <div className={`font-black ${row.netFlow >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                      {formatCurrency(row.netFlow)}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-slate-400 italic">No hay registros de flujo de caja para el periodo seleccionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
