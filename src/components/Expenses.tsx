import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { PaymentMethod, type Expense } from '../types';
import { Plus, TrendingDown, Calendar, Tag, FileText, Search, Filter, PieChart, List, ChevronRight, Download, Activity } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

const CATEGORIES = [
  'GENERAL'
];

const COLORS = ['#ef4444'];

import Receipts from './Receipts';
import CashFlow from './CashFlow';

export default function ExpensesModule({ exchangeRate, globalSearch = '' }: { exchangeRate?: number; globalSearch?: string }) {
  const [activeTab, setActiveTab] = useState<'resumen' | 'gastos' | 'retiros'>('resumen');

  return (
    <div className="space-y-6">
      <div className="flex border-b border-slate-200 gap-8 mb-2 overflow-x-auto scroolbar-hide">
        <button 
          onClick={() => setActiveTab('resumen')}
          className={`pb-3 font-bold text-[15px] flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'resumen' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <Activity size={18} />
          <span>Resumen Liquidez</span>
        </button>
        <button 
          onClick={() => setActiveTab('gastos')}
          className={`pb-3 font-bold text-[15px] flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'gastos' ? 'border-b-2 border-rose-600 text-rose-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <TrendingDown size={18} />
          <span>Gastos Operativos</span>
        </button>
        <button 
          onClick={() => setActiveTab('retiros')}
          className={`pb-3 font-bold text-[15px] flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'retiros' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <FileText size={18} />
          <span>Vales y Retiros</span>
        </button>
      </div>

      <div className={activeTab === 'resumen' ? 'block' : 'hidden'}>
        <CashFlow exchangeRate={exchangeRate} />
      </div>
      <div className={activeTab === 'gastos' ? 'block' : 'hidden'}>
        <Expenses exchangeRate={exchangeRate} globalSearch={globalSearch} />
      </div>
      <div className={activeTab === 'retiros' ? 'block' : 'hidden'}>
        <Receipts exchangeRate={exchangeRate} globalSearch={globalSearch} />
      </div>
    </div>
  );
}

function Expenses({ exchangeRate, globalSearch = '' }: { exchangeRate?: number; globalSearch?: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [view, setView] = useState<'list' | 'report'>('list');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    note: '',
    amount: '',
    paymentMethod: PaymentMethod.USD_CASH as string,
    exchangeRate: exchangeRate?.toString() || '0',
  });

  const [fetchingRate, setFetchingRate] = useState(false);

  // Fetch historical rate when date changes
  useEffect(() => {
    const fetchRate = async (dateStr: string) => {
      if (!dateStr) return;
      setFetchingRate(true);
      const historicalRate = await dbService.getExchangeRateForDate(dateStr);
      if (historicalRate) {
        setFormData(prev => ({ ...prev, exchangeRate: historicalRate.toString() }));
      } else if (exchangeRate !== undefined) {
        setFormData(prev => ({ ...prev, exchangeRate: exchangeRate.toString() }));
      }
      setFetchingRate(false);
    };

    if (showForm) {
      fetchRate(formData.date);
    }
  }, [formData.date, showForm, exchangeRate]);

  const defaultStartDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const defaultEndDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  useEffect(() => {
    return dbService.subscribeToExpenses(setExpenses);
  }, []);

  const inBolivares = formData.paymentMethod === PaymentMethod.BS || formData.paymentMethod === PaymentMethod.BS_CASH;
  const inputAmt = parseFloat(formData.amount) || 0;
  const amountUsdConv = inBolivares ? inputAmt / (parseFloat(formData.exchangeRate) || 1) : 0;
  const amountBs = inBolivares ? inputAmt : 0;
  const totalPaymentUsd = inBolivares ? amountUsdConv : inputAmt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalPaymentUsd <= 0) return;

    await dbService.addExpense({
      date: formData.date,
      category: 'GENERAL',
      note: formData.note,
      amountUsd: totalPaymentUsd,
      amountBs: amountBs > 0 ? amountBs : null,
      paymentMethod: formData.paymentMethod,
      exchangeRate: parseFloat(formData.exchangeRate) || 1,
    });

    setShowForm(false);
    setFormData({
      ...formData,
      note: '',
      amount: '',
      paymentMethod: PaymentMethod.USD_CASH,
    });
  };

  const filteredExpenses = expenses.filter(e => {
    if (startDate && e.date < startDate) return false;
    if (endDate && e.date > endDate) return false;
    if (globalSearch) {
      const gs = globalSearch.toLowerCase();
      const noteMatch = (e.note || '').toLowerCase().includes(gs);
      const categoryMatch = (e.category || '').toLowerCase().includes(gs);
      const methodMatch = (e.paymentMethod || '').toLowerCase().includes(gs);
      if (!noteMatch && !categoryMatch && !methodMatch) return false;
    }
    return true;
  });

  const totalMonthlyExpense = filteredExpenses.reduce((sum, e) => sum + e.amountUsd, 0);

  // Group by category for reporting
  const categoryData = CATEGORIES.map((cat, index) => {
    const total = filteredExpenses
      .filter(e => e.category === cat)
      .reduce((sum, e) => sum + e.amountUsd, 0);
    return {
      name: cat,
      value: total,
      color: COLORS[index % COLORS.length]
    };
  }).filter(d => d.value > 0);

  const handleDownloadReport = () => {
    const doc = new jsPDF();
    const currentDate = format(new Date(), "dd/MM/yyyy HH:mm");

    doc.setFontSize(18);
    doc.text('Reporte de Egresos', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado: ${currentDate}`, 14, 28);
    
    let periodText = 'Periodo: Todos los registros';
    if (startDate && endDate) {
      periodText = `Periodo: ${format(new Date(startDate), "dd/MM/yyyy")} al ${format(new Date(endDate), "dd/MM/yyyy")}`;
    } else if (startDate) {
      periodText = `Periodo: Desde ${format(new Date(startDate), "dd/MM/yyyy")}`;
    } else if (endDate) {
      periodText = `Periodo: Hasta ${format(new Date(endDate), "dd/MM/yyyy")}`;
    }
    doc.text(periodText, 14, 33);
    
    doc.setFontSize(12);
    doc.setTextColor(50);
    doc.text(`Total Egresos USD: ${formatCurrency(totalMonthlyExpense)}`, 14, 43);
    if (exchangeRate) {
      doc.text(`Total Equivalente Bs: Bs. ${new Intl.NumberFormat('es-VE').format(totalMonthlyExpense * exchangeRate)}`, 14, 49);
    }

    const tableColumn = ["Fecha", "Detalle", "Moneda", "Monto USD"];
    if (exchangeRate) {
      tableColumn.push("Monto Bs.");
    }
    const tableRows: any[] = [];

    // Sort descending by date
    const sortedExpenses = [...filteredExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    sortedExpenses.forEach(e => {
      const rowData = [
        format(new Date(e.date), "dd/MM/yyyy"),
        e.note || e.category || '-',
        e.paymentMethod === PaymentMethod.BS_CASH || e.paymentMethod === PaymentMethod.BS ? 'Bs' : '$',
        formatCurrency(e.amountUsd)
      ];
      if (exchangeRate) {
         rowData.push(`Bs. ${new Intl.NumberFormat('es-VE').format(e.amountUsd * exchangeRate)}`);
      }
      tableRows.push(rowData);
    });

    autoTable(doc, {
      startY: 55,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: exchangeRate 
          ? { 3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'right' } }
          : { 3: { halign: 'right', fontStyle: 'bold' } }
    });

    doc.save(`gastos_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Gastos Operativos</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Registro detallado de salidas y compras de insumos.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleDownloadReport}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors shadow-sm"
          >
            <Download size={16} /> PDF
          </button>
          
          <button 
            onClick={() => setShowForm(!showForm)}
            className="btn-primary"
          >
            {showForm ? 'Cerrar' : <><Plus size={16} /> Registrar Egreso</>}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card p-6 border-rose-100 bg-rose-50/30">
          <form onSubmit={handleSubmit} className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
               <div className="space-y-1">
                 <label className="label">Fecha</label>
                 <div className="relative">
                   <Calendar className="absolute left-3 top-2.5 text-slate-400" size={18} />
                   <input 
                     type="date" 
                     required
                     value={formData.date}
                     onChange={(e) => setFormData({...formData, date: e.target.value})}
                     className="input-field pl-10" 
                   />
                 </div>
               </div>

               <div className="space-y-1 md:col-span-1 lg:col-span-2">
                 <label className="label">Detalle del Gasto</label>
                 <div className="relative">
                   <FileText className="absolute left-3 top-2.5 text-slate-400" size={18} />
                   <input 
                     type="text" 
                     required
                     placeholder="Ej: Pago de luz, Compras de insumos..."
                     value={formData.note}
                     onChange={(e) => setFormData({...formData, note: e.target.value})}
                     className="input-field pl-10" 
                   />
                 </div>
               </div>

               <div className="space-y-1">
                 <label className="label">Moneda (Pagado en)</label>
                 <select
                   required
                   value={formData.paymentMethod}
                   onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}
                   className="input-field cursor-pointer"
                 >
                   <option value={PaymentMethod.USD_CASH}>{PaymentMethod.USD_CASH}</option>
                   <option value={PaymentMethod.BS_CASH}>{PaymentMethod.BS_CASH}</option>
                 </select>
               </div>

               <div className="space-y-1">
                 <label className="label">Tasa de Cambio</label>
                 <input 
                   type="number" 
                   step="0.01"
                   required
                   placeholder="1.00"
                   value={formData.exchangeRate}
                   onChange={(e) => setFormData({...formData, exchangeRate: e.target.value})}
                   className={`input-field font-mono font-bold ${inBolivares ? 'text-blue-600' : 'text-slate-400 opacity-50 bg-slate-50'}`} 
                   readOnly={!inBolivares}
                 />
               </div>

               <div className="space-y-1">
                 <label className="label">Monto Gasto ({inBolivares ? 'Bs' : 'USD'})</label>
                 <input 
                   type="number"  
                   step="0.01"
                   required
                   placeholder="0.00"
                   value={formData.amount}
                   onChange={(e) => setFormData({...formData, amount: e.target.value})}
                   className="input-field font-bold" 
                 />
               </div>

               {inBolivares && (
                 <div className="space-y-1">
                   <label className="label text-rose-600">Dólares Conv.</label>
                   <div className="input-field bg-rose-50 text-rose-700 font-bold border-dashed flex items-center">
                     {formatCurrency(amountUsdConv)}
                   </div>
                   <p className="text-[10px] text-slate-400">BS / Tasa</p>
                 </div>
               )}

               <div className={`space-y-1 ${inBolivares ? 'col-span-1' : 'col-span-1 lg:col-span-2'}`}>
                 <label className="label text-rose-600">Monto Total de Salida</label>
                 <div className="h-10 px-4 bg-rose-600 text-white rounded-lg flex items-center justify-between shadow-lg shadow-rose-200">
                   <span className="text-xs font-bold uppercase">Impacto en Caja:</span>
                   <span className="text-lg font-black">{formatCurrency(totalPaymentUsd)}</span>
                 </div>
               </div>
             </div>

             <div className="flex justify-end gap-3 pt-4 border-t border-rose-100">
               <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 font-medium">Cancelar</button>
               <button type="submit" className="bg-rose-600 hover:bg-rose-700 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center justify-center">
                 <TrendingDown size={18} className="inline mr-2 -mt-0.5" />
                 Guardar Egreso
               </button>
             </div>
          </form>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-600">Filtrar:</span>
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

        <div className="md:ml-auto flex flex-col items-end gap-1 w-full md:w-auto bg-slate-50 md:bg-transparent p-3 md:p-0 rounded-lg">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-slate-500">Total <span className="hidden sm:inline">del Periodo</span>:</p>
            <p className="text-xl font-bold text-rose-600 font-mono">{formatCurrency(totalMonthlyExpense)}</p>
          </div>
          <p className="text-xs font-bold text-slate-400">Bs. {new Intl.NumberFormat('es-VE').format(totalMonthlyExpense * (exchangeRate || 1))}</p>
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 px-5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Fecha</th>
                <th className="p-4 px-5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Detalle</th>
                <th className="p-4 px-5 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap">Moneda O.</th>
                <th className="p-4 px-5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest bg-rose-50/50">Monto Eq. USD</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((e) => {
                const isBs = e.paymentMethod === PaymentMethod.BS_CASH || e.paymentMethod === PaymentMethod.BS;
                return (
                 <tr key={e.id} className="hover:bg-slate-50 border-b border-slate-100">
                   <td className="p-4 px-5">{e.date}</td>
                   <td className="p-4 px-5 text-slate-600 font-medium">{e.note || e.category || '-'}</td>
                   <td className="p-4 px-5 text-center">
                     {isBs ? (
                        <span className="inline-flex items-center bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider relative border border-blue-100">
                           <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></span>
                           BS
                        </span>
                     ) : (
                        <span className="inline-flex items-center bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider relative border border-emerald-100">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                           USD
                        </span>
                     )}
                   </td>
                   <td className="p-4 px-5 text-right font-bold text-rose-600 bg-rose-50/10">
                     -{formatCurrency(e.amountUsd)}
                     <span className="block text-[10px] text-slate-400 font-normal mt-0.5">Bs. {new Intl.NumberFormat('es-VE').format(e.amountUsd * (e.exchangeRate || exchangeRate || 1))}</span>
                   </td>
                 </tr>
                )
              })}
              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-slate-500 italic">No hay egresos en este periodo.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
