import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/db';
import { Transaction, TransactionType } from '../types';
import { formatCurrency } from '../lib/utils';
import { format, isValid, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Filter, Download, FileText, ArrowUpRight, DollarSign } from 'lucide-react';

export default function Reports({ exchangeRate = 1 }: { exchangeRate?: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const defaultStartDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const defaultEndDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [bankFilter, setBankFilter] = useState('ALL');

  useEffect(() => {
    const unsub = dbService.subscribeToTransactions((data) => {
      setTransactions(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const getDayName = (dateStr: string) => {
    const d = parseISO(dateStr);
    if (!isValid(d)) return '';
    return format(d, 'eeee', { locale: es });
  };

  const filteredData = useMemo(() => {
    return transactions.filter(t => {
      // Solo tomamos en cuenta los ingresos de caja (SALE) o INCOME genéricos
      if (t.type !== TransactionType.SALE && t.type !== TransactionType.INCOME) return false;
      
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      if (currencyFilter !== 'ALL' && t.currency !== currencyFilter) return false;
      if (bankFilter !== 'ALL' && t.destinationBank !== bankFilter) return false;
      
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, startDate, endDate, currencyFilter, bankFilter]);

  // Extract unique banks for the dropdown filter
  const uniqueBanks = useMemo(() => {
    const banks = new Set<string>(['BANESCO', 'PROVINCIAL', 'MERCANTIL', 'VENEZUELA', 'BANCO DEL TESORO', 'BNC', 'EFECTIVO EN CAJA', 'BINANCE P2P', 'ZELLE']);
    transactions.forEach(t => {
      if ((t.type === TransactionType.SALE || t.type === TransactionType.INCOME) && t.destinationBank) {
        banks.add(t.destinationBank);
      }
    });
    return Array.from(banks).sort();
  }, [transactions]);

  // Calculations for summary boxes
  const summary = useMemo(() => {
    let bs = 0;
    let usd = 0;
    let cripto = 0;
    let totalUsdEquiv = 0;

    filteredData.forEach(t => {
      // In base on previous logic for Sales formatting
      const amtBs = t.amountBs || 0;
      const rate = t.exchangeRate || 1;
      
      if (t.currency === 'Bolívares (BS)') {
        bs += amtBs;
        totalUsdEquiv += amtBs / rate;
      } else if (t.currency === 'Dólares ($)') {
        usd += t.amountUsdCash || t.amountUsd || 0;
        totalUsdEquiv += t.amountUsdCash || t.amountUsd || 0;
      } else if (t.currency === 'Binance (USDT)' || t.amountZelle) {
        cripto += t.amountZelle || t.amountUsd || 0;
        totalUsdEquiv += t.amountZelle || t.amountUsd || 0;
      } else {
        // Fallback for older transactions
        totalUsdEquiv += t.amountUsd;
      }
    });

    return { bs, usd, cripto, totalUsdEquiv };
  }, [filteredData]);

  const exportCSV = () => {
    const headers = ["Día", "Fecha", "Detalle / Concepto", "Moneda", "Destino / Banco", "Monto", "Tasa", "Equiv. USD"];
    const rows = filteredData.map(t => {
      const day = getDayName(t.date);
      let date = t.date;
      const d = new Date(t.date + 'T12:00:00');
      if (isValid(d)) date = format(d, 'dd/MM/yyyy');
      
      const isBs = t.currency === 'Bolívares (BS)';
      const amt = isBs ? t.amountBs : (t.amountUsdCash || t.amountZelle || t.amountUsd);
      const eqUsd = isBs ? (t.amountBs || 0) / (t.exchangeRate || 1) : amt;
      
      return [
        day,
        date,
        `"${t.concept || ''}"`,
        t.currency || 'S/N',
        t.destinationBank || 'S/N',
        amt?.toString() || '0',
        t.exchangeRate?.toString() || '1',
        eqUsd?.toString() || '0'
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_ingresos_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Reportes de Ingreso</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Análisis detallado de entradas de caja.</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-emerald-200 text-sm"
        >
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={18} className="text-slate-400" />
          <h3 className="font-bold text-slate-700">Filtros de Búsqueda</h3>
        </div>
        
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm w-full lg:w-auto">
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
          
          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto lg:flex-1">
            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Moneda</label>
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 outline-none p-2.5 rounded-lg w-full"
              >
                <option value="ALL">Todas las Monedas</option>
                <option value="Bolívares (BS)">Bolívares (BS)</option>
                <option value="Dólares ($)">Dólares ($)</option>
                <option value="Binance (USDT)">Binance (USDT) / Zelle</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Destino / Banco</label>
              <select
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 outline-none p-2.5 rounded-lg w-full"
              >
                <option value="ALL">Todos los Destinos</option>
                {uniqueBanks.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Equiv. USD</p>
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <DollarSign size={20} className="text-emerald-500" />
              <p className="text-3xl font-black text-slate-800">{formatCurrency(summary.totalUsdEquiv)}</p>
            </div>
            <p className="text-xs font-bold text-emerald-600 px-1 mt-1">
              Bs. {new Intl.NumberFormat('es-VE').format(summary.totalUsdEquiv * exchangeRate)}
            </p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-50 rounded-full transition-transform group-hover:scale-150 duration-500 ease-out z-0"></div>
          <div className="relative z-10 flex flex-col">
            <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1">Total Bolívares</p>
            <p className="text-2xl font-black text-slate-800">Bs. {new Intl.NumberFormat('es-VE').format(summary.bs)}</p>
            <p className="text-xs font-bold text-blue-600 mt-1 opacity-70">
              {formatCurrency(summary.bs / exchangeRate)}
            </p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-50 rounded-full transition-transform group-hover:scale-150 duration-500 ease-out z-0"></div>
          <div className="relative z-10 flex flex-col">
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Total Dólares</p>
            <p className="text-2xl font-black text-slate-800">{formatCurrency(summary.usd)}</p>
            <p className="text-xs font-bold text-emerald-700 mt-1 opacity-70">
              Bs. {new Intl.NumberFormat('es-VE').format(summary.usd * exchangeRate)}
            </p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-orange-50 rounded-full transition-transform group-hover:scale-150 duration-500 ease-out z-0"></div>
          <div className="relative z-10 flex flex-col">
            <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">Total Cripto/Zelle</p>
            <p className="text-2xl font-black text-slate-800">{formatCurrency(summary.cripto)}</p>
            <p className="text-xs font-bold text-orange-700 mt-1 opacity-70">
              Bs. {new Intl.NumberFormat('es-VE').format(summary.cripto * exchangeRate)}
            </p>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <FileText size={18} className="text-slate-400" />
            Detalle de Movimientos
          </h3>
          <span className="text-xs font-bold text-slate-500 bg-slate-200 px-3 py-1 rounded-full">{filteredData.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="p-3 text-left text-[10px] uppercase font-black border-r border-slate-700">Día</th>
                <th className="p-3 text-left text-[10px] uppercase font-black border-r border-slate-700">Fecha</th>
                <th className="p-3 text-left text-[10px] uppercase font-black border-r border-slate-700">Concepto</th>
                <th className="p-3 text-left text-[10px] uppercase font-black border-r border-slate-700">Destino / Banco</th>
                <th className="p-3 text-left text-[10px] uppercase font-black border-r border-slate-700">Moneda</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700">Monto</th>
                <th className="p-3 text-right text-[10px] uppercase font-black">Eq. USD</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((t, i) => {
                const isBs = t.currency === 'Bolívares (BS)';
                const amount = isBs ? t.amountBs : (t.amountUsdCash || t.amountZelle || t.amountUsd);
                const conv = isBs ? (t.amountBs || 0) / (t.exchangeRate || 1) : amount;
                
                return (
                  <tr key={t.id || i} className="hover:bg-slate-50 border-b border-slate-200 text-xs font-medium">
                    <td className="p-3 font-bold uppercase border-r border-slate-100 text-slate-500">{getDayName(t.date)}</td>
                    <td className="p-3 border-r border-slate-100 whitespace-nowrap">
                      {(() => {
                        const d = new Date(t.date + 'T12:00:00');
                        if (!isValid(d)) return t.date;
                        try {
                          return format(d, 'dd/MM/yyyy');
                        } catch {
                          return t.date;
                        }
                      })()}
                    </td>
                    <td className="p-3 border-r border-slate-100 font-bold text-slate-700">{t.concept}</td>
                    <td className="p-3 border-r border-slate-100 font-bold text-slate-600">{t.destinationBank || '-'}</td>
                    <td className="p-3 border-r border-slate-100">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                        isBs ? 'bg-blue-100 text-blue-700' : 
                        t.currency === 'Dólares ($)' ? 'bg-emerald-100 text-emerald-700' : 
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {t.currency || 'USD Genérico'}
                      </span>
                    </td>
                    <td className={`p-3 text-right border-r border-slate-100 font-bold ${isBs ? 'text-blue-600' : ''}`}>
                      {isBs ? `Bs. ${new Intl.NumberFormat('es-VE').format(amount || 0)}` : formatCurrency(amount || 0)}
                      {isBs && <div className="text-[9px] text-slate-400 font-normal mt-0.5">Tasa: {t.exchangeRate}</div>}
                    </td>
                    <td className="p-3 text-right font-black text-slate-800 bg-slate-50/50">
                      {formatCurrency(conv || 0)}
                      <span className="block text-[9px] text-slate-400 font-bold mt-0.5">
                        Bs. {new Intl.NumberFormat('es-VE').format((conv || 0) * exchangeRate)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400 italic">No se encontraron registros para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
