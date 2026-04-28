import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { type Expense } from '../types';
import { Plus, TrendingDown, Calendar, Tag, FileText, Search, Filter } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

const CATEGORIES = [
  'Servicios',
  'Suministros',
  'Muestras',
  'Mantenimiento',
  'Sueldos / Vales',
  'Transporte',
  'Otros'
];

export default function Expenses({ exchangeRate }: { exchangeRate?: number }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    category: CATEGORIES[0],
    note: '',
    amountUsd: '',
    amountBs: '',
  });

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

  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));

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
    const expenseMonth = e.date.substring(0, 7);
    return expenseMonth === filterMonth;
  });

  const totalMonthlyExpense = filteredExpenses.reduce((sum, e) => sum + e.amountUsd, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Control de Gastos</h2>
          <p className="text-slate-500">Registro detallado de egresos por categoría.</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          {showForm ? 'Cerrar' : <><Plus size={20} /> Registrar Egreso</>}
        </button>
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

      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-600">Filtrar Mes:</span>
        </div>
        <input 
          type="month" 
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="ml-auto flex items-center gap-4">
          <p className="text-sm text-slate-500">Total del Periodo:</p>
          <p className="text-xl font-bold text-rose-600 font-mono">{formatCurrency(totalMonthlyExpense)}</p>
        </div>
      </div>

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
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                      {e.category}
                    </span>
                  </td>
                  <td className="table-cell text-slate-600">{e.note || '-'}</td>
                  <td className="table-cell text-right font-bold text-rose-600">-{formatCurrency(e.amountUsd)}</td>
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
    </div>
  );
}
