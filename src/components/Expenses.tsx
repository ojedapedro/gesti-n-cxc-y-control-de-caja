import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { type Expense } from '../types';
import { Plus, TrendingDown, Calendar, Tag, FileText, Search, Filter, PieChart, List, ChevronRight, Download } from 'lucide-react';
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
  'Servicios',
  'Suministros',
  'Muestras',
  'Mantenimiento',
  'Sueldos / Vales',
  'Transporte',
  'Otros'
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

import Receipts from './Receipts';

export default function ExpensesModule({ exchangeRate }: { exchangeRate?: number }) {
  const [activeTab, setActiveTab] = useState<'gastos' | 'retiros'>('gastos');

  return (
    <div className="space-y-6">
      <div className="flex border-b border-slate-200 gap-8 mb-2">
        <button 
          onClick={() => setActiveTab('gastos')}
          className={`pb-3 font-bold text-[15px] flex items-center gap-2 transition-colors ${activeTab === 'gastos' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <TrendingDown size={18} />
          Gastos Operativos
        </button>
        <button 
          onClick={() => setActiveTab('retiros')}
          className={`pb-3 font-bold text-[15px] flex items-center gap-2 transition-colors ${activeTab === 'retiros' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <FileText size={18} />
          Vales y Retiros
        </button>
      </div>

      <div className={activeTab === 'gastos' ? 'block' : 'hidden'}>
        <Expenses exchangeRate={exchangeRate} />
      </div>
      <div className={activeTab === 'retiros' ? 'block' : 'hidden'}>
        <Receipts exchangeRate={exchangeRate} />
      </div>
    </div>
  );
}

function Expenses({ exchangeRate }: { exchangeRate?: number }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [view, setView] = useState<'list' | 'report'>('list');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    category: CATEGORIES[0],
    note: '',
    amountUsd: '',
    amountBs: '',
  });

  useEffect(() => {
    if (exchangeRate && formData.amountUsd) {
       const usd = parseFloat(formData.amountUsd) || 0;
       const bs = usd * exchangeRate;
       setFormData(prev => ({ ...prev, amountBs: bs.toFixed(2) }));
    }
  }, [exchangeRate]);

  // Automatic conversion logic
  const handleBsChange = (val: string) => {
    const bs = parseFloat(val);
    const rate = exchangeRate || 1;
    setFormData({
      ...formData,
      amountBs: val,
      amountUsd: bs > 0 ? (bs / rate).toFixed(2) : formData.amountUsd
    });
  };

  const handleUsdChange = (val: string) => {
    const usd = parseFloat(val);
    const rate = exchangeRate || 1;
    setFormData({
      ...formData,
      amountUsd: val,
      amountBs: usd > 0 ? (usd * rate).toFixed(2) : formData.amountBs
    });
  };

  const defaultStartDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const defaultEndDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  useEffect(() => {
    return dbService.subscribeToExpenses(setExpenses);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await dbService.addExpense({
      date: formData.date,
      category: formData.category,
      note: formData.note,
      amountUsd: parseFloat(formData.amountUsd),
      amountBs: parseFloat(formData.amountBs) || 0,
    });

    setShowForm(false);
    setFormData({
      ...formData,
      note: '',
      amountUsd: '',
      amountBs: '',
    });
  };

  const filteredExpenses = expenses.filter(e => {
    if (startDate && e.date < startDate) return false;
    if (endDate && e.date > endDate) return false;
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
    doc.text('Reporte de Gastos', 14, 22);
    
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
    doc.text(`Total Gastos USD: ${formatCurrency(totalMonthlyExpense)}`, 14, 43);
    if (exchangeRate) {
      doc.text(`Total Equivalente Bs: Bs. ${new Intl.NumberFormat('es-VE').format(totalMonthlyExpense * exchangeRate)}`, 14, 49);
    }

    const tableColumn = ["Fecha", "Categoría", "Detalle", "Monto USD"];
    if (exchangeRate) {
      tableColumn.push("Monto Bs.");
    }
    const tableRows: any[] = [];

    // Sort descending by date
    const sortedExpenses = [...filteredExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    sortedExpenses.forEach(e => {
      const rowData = [
        format(new Date(e.date), "dd/MM/yyyy"),
        e.category,
        e.note || '-',
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
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: exchangeRate 
          ? { 3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'right' } }
          : { 3: { halign: 'right', fontStyle: 'bold' } }
    });

    // Summary by category
    const finalY = (doc as any).lastAutoTable.finalY || 55;
    
    // Add page if near bottom
    let summaryY = finalY + 15;
    if (summaryY > 250) {
      doc.addPage();
      summaryY = 20;
    }
    
    doc.setFontSize(14);
    doc.setTextColor(20, 20, 20);
    doc.text('Resumen por Categoría', 14, summaryY);

    const summaryColumn = ["Categoría", "Monto USD"];
    if(exchangeRate) summaryColumn.push("Monto Bs.");
    const summaryRows: any[] = [];
    
    [...categoryData].sort((a, b) => b.value - a.value).forEach(cat => {
      const row = [cat.name, formatCurrency(cat.value)];
      if(exchangeRate) row.push(`Bs. ${new Intl.NumberFormat('es-VE').format(cat.value * exchangeRate)}`);
      summaryRows.push(row);
    });

    autoTable(doc, {
      startY: summaryY + 5,
      head: [summaryColumn],
      body: summaryRows,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
      columnStyles: exchangeRate 
          ? { 1: { halign: 'right', fontStyle: 'bold' }, 2: { halign: 'right' } }
          : { 1: { halign: 'right', fontStyle: 'bold' } }
    });

    doc.save(`gastos_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Control de Gastos</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Registro detallado de egresos por categoría.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl mr-2">
            <button 
              onClick={() => setView('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                view === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <List size={14} /> Lista
            </button>
            <button 
              onClick={() => setView('report')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                view === 'report' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <PieChart size={14} /> Reporte
            </button>
          </div>
          
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
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

            <div className="space-y-1">
              <label className="label">Categoría</label>
              <select 
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="input-field"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="label">Monto USD</label>
              <div className="relative">
                <TrendingDown className="absolute left-3 top-2.5 text-rose-400" size={18} />
                <input 
                  type="number" 
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={formData.amountUsd}
                  onChange={(e) => handleUsdChange(e.target.value)}
                  className="input-field pl-10" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="label">Monto BS (Equivalente)</label>
              <input 
                type="number" 
                step="0.01"
                placeholder="0.00"
                value={formData.amountBs}
                onChange={(e) => handleBsChange(e.target.value)}
                className="input-field" 
              />
              {exchangeRate && <p className="text-[9px] text-slate-400 text-right">Tasa: {exchangeRate} BS/$</p>}
            </div>

            <div className="space-y-1">
              <label className="label">Nota (Opcional)</label>
              <div className="relative">
                <FileText className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Ej: Pago de luz"
                  value={formData.note}
                  onChange={(e) => setFormData({...formData, note: e.target.value})}
                  className="input-field pl-10" 
                />
              </div>
            </div>

            <div className="md:col-span-4 flex justify-end">
              <button type="submit" className="bg-rose-600 hover:bg-rose-700 text-white font-medium py-2 px-8 rounded-lg transition-colors">
                Guardar Gasto
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

      {view === 'list' ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Categoría</th>
                  <th className="table-header">Nota</th>
                  <th className="table-header text-right">Monto USD</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 border-b border-slate-100">
                    <td className="table-cell">{e.date}</td>
                    <td className="table-cell">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-transform hover:scale-105 inline-block">
                        {e.category}
                      </span>
                    </td>
                    <td className="table-cell text-slate-600">{e.note || '-'}</td>
                    <td className="table-cell text-right font-bold text-rose-600">
                      -{formatCurrency(e.amountUsd)}
                      <span className="block text-[10px] text-slate-400">Bs. {new Intl.NumberFormat('es-VE').format(e.amountUsd * (exchangeRate || 1))}</span>
                    </td>
                  </tr>
                ))}
                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="table-cell text-center py-10 text-slate-500 italic">No hay gastos en este periodo.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6 min-h-[400px]">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <TrendingDown className="text-rose-600" size={18} />
              Distribución por Categoría
            </h3>
            {categoryData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} layout="vertical" margin={{ left: 40, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      width={100}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                    />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg">
                              <p className="text-xs font-bold text-slate-500 uppercase">{payload[0].payload.name}</p>
                              <p className="text-lg font-black text-rose-600">{formatCurrency(payload[0].value as number)}</p>
                              <p className="text-[10px] text-slate-400 italic">{( (payload[0].value as number / totalMonthlyExpense) * 100).toFixed(1)}% del total</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 italic">
                Sin datos para graficar
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Tag className="text-blue-600" size={18} />
              Resumen Detallado
            </h3>
            <div className="space-y-4">
              {categoryData.sort((a, b) => b.value - a.value).map((item) => (
                <div key={item.name} className="flex items-center group">
                  <div className="w-1 h-8 rounded-full mr-3" style={{ backgroundColor: item.color }} />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-700">{item.name}</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-1000" 
                        style={{ 
                          width: `${(item.value / totalMonthlyExpense) * 100}%`,
                          backgroundColor: item.color
                        }} 
                      />
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(item.value)}</p>
                    <p className="text-[10px] font-bold text-slate-400">Bs. {new Intl.NumberFormat('es-VE').format(item.value * (exchangeRate || 1))}</p>
                    <p className="text-[10px] font-bold text-slate-400 italic tracking-tighter mt-1">
                      {((item.value / totalMonthlyExpense) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
              {categoryData.length === 0 && (
                <div className="py-20 text-center text-slate-400 italic">No hay gastos registrados este mes</div>
              )}
            </div>
            
            {categoryData.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between text-slate-800">
                  <span className="text-sm font-black uppercase tracking-widest text-slate-400">Total Acumulado</span>
                  <div className="text-right">
                    <span className="block text-2xl font-black text-rose-600">{formatCurrency(totalMonthlyExpense)}</span>
                    <span className="block text-xs font-bold text-slate-400 mt-1">Bs. {new Intl.NumberFormat('es-VE').format(totalMonthlyExpense * (exchangeRate || 1))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
