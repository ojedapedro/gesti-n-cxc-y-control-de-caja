import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { TransactionType, PaymentMethod, type Transaction } from '../types';
import { Plus, Search, Calendar, User, DollarSign, Tag, Clock, FileText, Edit, X } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Incomes({ exchangeRate }: { exchangeRate?: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showCXCModal, setShowCXCModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amountBs: '',
    exchangeRate: exchangeRate?.toString() || '480',
    amountUsdCash: '',
    amountZelle: '',
    amountCXC: '',
    concept: 'CUADRE DE CAJA DIARIO',
  });

  const [cxcData, setCxcData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    clientName: '',
    concept: '',
    amountUsd: '',
    item: `CXC-${format(new Date(), 'yyyyMMdd-HHmmss')}`
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

  useEffect(() => {
    if (exchangeRate && !formData.amountBs) {
      setFormData(prev => ({ ...prev, exchangeRate: exchangeRate.toString() }));
    }
  }, [exchangeRate]);

  // Handle form field changes helper
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Calculated Fields
  const amountUsdConv = (parseFloat(formData.amountBs) || 0) / (parseFloat(formData.exchangeRate) || 1);
  const amountUsdCash = parseFloat(formData.amountUsdCash) || 0;
  const amountZelle = parseFloat(formData.amountZelle) || 0;
  const amountCXC = parseFloat(formData.amountCXC) || 0;
  const totalDailySale = amountUsdConv + amountUsdCash + amountZelle + amountCXC;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await dbService.addTransaction({
        date: formData.date,
        clientName: 'CUADRE DIARIO',
        concept: formData.concept,
        amountBs: parseFloat(formData.amountBs) || 0,
        exchangeRate: parseFloat(formData.exchangeRate) || 1,
        amountUsd: totalDailySale,
        paymentMethod: PaymentMethod.BS,
        type: TransactionType.SALE,
        isCXC: amountCXC > 0,
        amountUsdCash: amountUsdCash,
        amountZelle: amountZelle,
        amountCXC: amountCXC,
        totalDailySale: totalDailySale,
      });

      setShowForm(false);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        exchangeRate: exchangeRate?.toString() || '480',
        amountBs: '',
        amountUsdCash: '',
        amountZelle: '',
        amountCXC: '',
        concept: 'CUADRE DE CAJA DIARIO',
      });
    } catch (error) {
      console.error("Error saving daily closing:", error);
    }
  };

  const handleSubmitCXC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cxcData.clientName || !cxcData.amountUsd) return;

    try {
      await dbService.addCXCCharge(cxcData.clientName, {
        date: cxcData.date,
        amountUsd: parseFloat(cxcData.amountUsd) || 0,
        concept: cxcData.concept,
        item: cxcData.item,
        type: 'charge'
      });

      setShowCXCModal(false);
      setCxcData({
        date: format(new Date(), 'yyyy-MM-dd'),
        clientName: '',
        concept: '',
        amountUsd: '',
        item: `CXC-${format(new Date(), 'yyyyMMdd-HHmmss')}`
      });
    } catch (error) {
      console.error("Error saving CXC:", error);
    }
  };

  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction || !editingTransaction.id) return;

    try {
      await dbService.updateTransaction(editingTransaction.id, {
        concept: editingTransaction.concept,
        clientName: editingTransaction.clientName,
        amountBs: Number(editingTransaction.amountBs) || 0,
        exchangeRate: Number(editingTransaction.exchangeRate) || 1,
        amountUsd: Number(editingTransaction.amountUsd) || 0,
        paymentMethod: editingTransaction.paymentMethod,
        type: editingTransaction.type,
        isCXC: editingTransaction.isCXC,
        cxcBalance: Number(editingTransaction.cxcBalance) || 0
      });
      setEditingTransaction(null);
    } catch (error) {
      console.error("Error updating transaction:", error);
    }
  };

  const getDayName = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    if (!isValid(date)) return '';
    try {
      return format(date, 'EEEE', { locale: es });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Relación de Ingresos de Caja</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Cierre diario y cuadre de caja (Dual Conversion).</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowCXCModal(!showCXCModal)}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-5 rounded-xl transition-all shadow-sm text-sm"
          >
            <FileText size={16} /> <span>Ingreso CXC</span>
          </button>
          <button 
            onClick={() => setShowForm(!showForm)}
            className="btn-primary"
          >
            {showForm ? <span>Cerrar Formulario</span> : <span><Plus size={16} className="inline mr-2 -mt-0.5" />Nuevo Cuadre Diario</span>}
          </button>
        </div>
      </div>

      {showCXCModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 bg-blue-50/50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-blue-600" size={20} />
                Registrar Ingreso CXC
              </h3>
              <button 
                onClick={() => setShowCXCModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmitCXC} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label">Fecha</label>
                  <input 
                    type="date" 
                    required
                    value={cxcData.date}
                    onChange={(e) => setCxcData({...cxcData, date: e.target.value})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Item (Autogenerado)</label>
                  <input 
                    type="text" 
                    readOnly
                    value={cxcData.item}
                    className="input-field bg-slate-50 text-slate-500 font-mono" 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="label">Cliente (Nombre y Apellido)</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    required
                    value={cxcData.clientName}
                    onChange={(e) => setCxcData({...cxcData, clientName: e.target.value.toUpperCase()})}
                    className="input-field pl-10 uppercase" 
                    placeholder="Escriba el nombre exacto del cliente"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="label">Concepto</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    required
                    value={cxcData.concept}
                    onChange={(e) => setCxcData({...cxcData, concept: e.target.value})}
                    className="input-field pl-10" 
                    placeholder="Detalle de la venta/ingreso a crédito"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="label">Monto de la Deuda (USD)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    required
                    value={cxcData.amountUsd}
                    onChange={(e) => setCxcData({...cxcData, amountUsd: e.target.value})}
                    className="input-field pl-10 font-bold" 
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowCXCModal(false)} className="px-5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Registrar CXC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div key="incomes-form-container" className="card p-6 border-blue-100 bg-blue-50/10">
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
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700">Venta Diaria</th>
                <th className="p-3 text-center text-[10px] uppercase font-black">Edit</th>
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
                      <td className="p-3 border-r border-slate-100">
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
                      <td className="p-3 text-right border-r border-slate-100 bg-orange-50/30">{new Intl.NumberFormat('es-VE').format(t.amountBs || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 font-mono text-blue-600">{t.exchangeRate}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-orange-50/30">{formatCurrency(conv)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-emerald-50/30">{formatCurrency(t.amountUsdCash || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-emerald-50/30">{formatCurrency(t.amountZelle || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-blue-50/30">{formatCurrency(t.amountCXC || 0)}</td>
                      <td className="p-3 text-right font-black text-slate-900 bg-slate-50 border-r border-slate-100">{formatCurrency(t.totalDailySale || t.amountUsd)}</td>
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => setEditingTransaction(t)}
                          className="p-1.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
                        >
                          <Edit size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              {transactions.filter(t => t.type === TransactionType.SALE).length === 0 && (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-slate-400 italic">No hay cuadres de caja registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 bg-blue-50/50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Edit className="text-blue-600" size={20} />
                Editar Transacción
              </h3>
              <button 
                onClick={() => setEditingTransaction(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleUpdateTransaction} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label">Concept</label>
                  <input 
                    type="text" 
                    value={editingTransaction.concept || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, concept: e.target.value})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Client Name</label>
                  <input 
                    type="text" 
                    value={editingTransaction.clientName || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, clientName: e.target.value})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Amount (BS)</label>
                  <input 
                    type="number" step="0.01"
                    value={editingTransaction.amountBs || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, amountBs: parseFloat(e.target.value)})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Exchange Rate</label>
                  <input 
                    type="number" step="0.01"
                    value={editingTransaction.exchangeRate || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, exchangeRate: parseFloat(e.target.value)})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Amount (USD)</label>
                  <input 
                    type="number" step="0.01"
                    value={editingTransaction.amountUsd || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, amountUsd: parseFloat(e.target.value)})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Payment Method</label>
                  <select
                    value={editingTransaction.paymentMethod || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, paymentMethod: e.target.value as PaymentMethod})}
                    className="input-field"
                  >
                    {Object.values(PaymentMethod).map(method => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="label">Type</label>
                  <select
                    value={editingTransaction.type || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, type: e.target.value as TransactionType})}
                    className="input-field"
                  >
                    {Object.values(TransactionType).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="label">CXC Balance</label>
                  <input 
                    type="number" step="0.01"
                    value={editingTransaction.cxcBalance || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, cxcBalance: parseFloat(e.target.value)})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1 flex items-center pt-6">
                  <input 
                    type="checkbox" id="isCXC"
                    checked={editingTransaction.isCXC || false}
                    onChange={(e) => setEditingTransaction({...editingTransaction, isCXC: e.target.checked})}
                    className="mr-2"
                  />
                  <label htmlFor="isCXC" className="label mb-0 cursor-pointer">Is CXC?</label>
                </div>
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={() => setEditingTransaction(null)} className="px-5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
