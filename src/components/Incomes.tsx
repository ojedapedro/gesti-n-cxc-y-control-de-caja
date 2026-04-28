import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { TransactionType, PaymentMethod, type Transaction } from '../types';
import { Plus, Search, Calendar, User, DollarSign, Tag, Clock } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Incomes({ exchangeRate }: { exchangeRate?: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amountBs: '',
    exchangeRate: exchangeRate?.toString() || '480', // Use prop if available
    amountUsdCash: '',
    amountZelle: '',
    amountCXC: '',
    concept: 'CUADRE DE CAJA DIARIO',
  });

  // Sync rate when prop changes if form is not dirty or just always for new forms
  useEffect(() => {
    if (exchangeRate && !showForm) {
      setFormData(prev => ({ ...prev, exchangeRate: exchangeRate.toString() }));
    }
  }, [exchangeRate, showForm]);

  useEffect(() => {
    return dbService.subscribeToTransactions(setTransactions);
  }, []);

  // Calculated Fields
  const amountUsdConv = parseFloat(formData.amountBs) / (parseFloat(formData.exchangeRate) || 1) || 0;
  const amountUsdCash = parseFloat(formData.amountUsdCash) || 0;
  const amountZelle = parseFloat(formData.amountZelle) || 0;
  const amountCXC = parseFloat(formData.amountCXC) || 0;
  const totalDailySale = amountUsdConv + amountUsdCash + amountZelle + amountCXC;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await dbService.addTransaction({
      date: formData.date,
      clientName: 'CUADRE DIARIO',
      concept: formData.concept,
      amountBs: parseFloat(formData.amountBs) || 0,
      exchangeRate: parseFloat(formData.exchangeRate) || 1,
      amountUsd: totalDailySale, // Total sale for the day
      paymentMethod: PaymentMethod.BS, // Or mixed? Let's use BS as base for this summary type
      type: TransactionType.SALE,
      isCXC: amountCXC > 0,
      amountUsdCash: amountUsdCash,
      amountZelle: amountZelle,
      amountCXC: amountCXC,
      totalDailySale: totalDailySale,
    });

    // If there's a CXC component, maybe we should ask for a client or record it generally?
    // The user image shows CXC as a column. In a real app, you'd want to know WHICH client.
    // For now, I'll record it as a general sales summary.

    setShowForm(false);
    setFormData({
      ...formData,
      amountBs: '',
      amountUsdCash: '',
      amountZelle: '',
      amountCXC: '',
    });
  };

  const getDayName = (dateStr: string) => {
    try {
      return format(new Date(dateStr + 'T12:00:00'), 'EEEE', { locale: es });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Relación de Ingresos de Caja</h2>
          <p className="text-slate-500">Cierre diario y cuadre de caja (Dual Conversion).</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          {showForm ? 'Cerrar Formulario' : <><Plus size={20} /> Nuevo Cuadre Diarío</>}
        </button>
      </div>

      {showForm && (
        <div className="card p-6 border-blue-100 bg-blue-50/10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
                <p className="text-[10px] text-blue-600 font-bold uppercase ml-1">{getDayName(formData.date)}</p>
              </div>

              <div className="space-y-1">
                <label className="label">Bolívares (BS)</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={formData.amountBs}
                  onChange={(e) => setFormData({...formData, amountBs: e.target.value})}
                  className="input-field" 
                />
              </div>

              <div className="space-y-1">
                <label className="label">Tasa de Cambio</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  placeholder="480.00"
                  value={formData.exchangeRate}
                  onChange={(e) => setFormData({...formData, exchangeRate: e.target.value})}
                  className="input-field font-mono text-blue-600 font-bold" 
                />
              </div>

              <div className="space-y-1">
                <label className="label">Dólares Conv.</label>
                <div className="input-field bg-slate-100 font-bold border-dashed flex items-center">
                  {formatCurrency(amountUsdConv)}
                </div>
                <p className="text-[10px] text-slate-400">BS / Tasa</p>
              </div>

              <div className="space-y-1">
                <label className="label">Dólares Efectivo</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={formData.amountUsdCash}
                  onChange={(e) => setFormData({...formData, amountUsdCash: e.target.value})}
                  className="input-field" 
                />
              </div>

              <div className="space-y-1">
                <label className="label">ZELLE</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={formData.amountZelle}
                  onChange={(e) => setFormData({...formData, amountZelle: e.target.value})}
                  className="input-field" 
                />
              </div>

              <div className="space-y-1">
                <label className="label">C X C</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={formData.amountCXC}
                  onChange={(e) => setFormData({...formData, amountCXC: e.target.value})}
                  className="input-field" 
                />
              </div>

              <div className="space-y-1">
                <label className="label">Concepto</label>
                <input 
                  type="text" 
                  required
                  value={formData.concept}
                  onChange={(e) => setFormData({...formData, concept: e.target.value})}
                  className="input-field" 
                />
              </div>

              <div className="col-span-1 md:col-span-2 lg:col-span-2 space-y-1">
                <label className="label text-blue-600">Venta Diaria Total (USD)</label>
                <div className="h-10 px-4 bg-blue-600 text-white rounded-lg flex items-center justify-between shadow-lg shadow-blue-200">
                  <span className="text-xs font-bold uppercase">Resultado:</span>
                  <span className="text-xl font-black">{formatCurrency(totalDailySale)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button type="submit" className="btn-primary px-10 h-12 shadow-xl shadow-blue-200">
                Guardar Cuadre de Caja
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-3 text-left text-[10px] uppercase font-black border-r border-slate-700">Item</th>
                <th className="p-3 text-left text-[10px] uppercase font-black border-r border-slate-700">Día</th>
                <th className="p-3 text-left text-[10px] uppercase font-black border-r border-slate-700">Fecha</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-orange-950/20">Bolívares</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700">Tasa</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-orange-950/20">Dolars Conv.</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-emerald-950/20">Efectivo ($)</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-emerald-950/20">Zelle</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-blue-950/20">C X C</th>
                <th className="p-3 text-right text-[10px] uppercase font-black">Venta Diaria</th>
              </tr>
            </thead>
            <tbody>
              {transactions
                .filter(t => t.type === TransactionType.SALE)
                .map((t, i) => {
                  const conv = (t.amountBs || 0) / (t.exchangeRate || 1);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 border-b border-slate-200 text-xs font-medium">
                      <td className="p-3 text-slate-400 border-r border-slate-100">{transactions.length - i}</td>
                      <td className="p-3 font-bold uppercase border-r border-slate-100">{getDayName(t.date)}</td>
                      <td className="p-3 border-r border-slate-100">{format(new Date(t.date + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-orange-50/30">{new Intl.NumberFormat('es-VE').format(t.amountBs || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 font-mono text-blue-600">{t.exchangeRate}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-orange-50/30">{formatCurrency(conv)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-emerald-50/30">{formatCurrency(t.amountUsdCash || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-emerald-50/30">{formatCurrency(t.amountZelle || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-blue-50/30">{formatCurrency(t.amountCXC || 0)}</td>
                      <td className="p-3 text-right font-black text-slate-900 bg-slate-50">{formatCurrency(t.totalDailySale || t.amountUsd)}</td>
                    </tr>
                  );
                })}
              {transactions.filter(t => t.type === TransactionType.SALE).length === 0 && (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-slate-400 italic">No hay cuadres de caja registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
