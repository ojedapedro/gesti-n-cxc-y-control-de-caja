import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { TransactionType, PaymentMethod, type Transaction } from '../types';
import { Plus, Search, Calendar, User, DollarSign, Tag, Clock, FileText, Edit, X } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Incomes({ exchangeRate }: { exchangeRate?: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showForm, setShowForm] = useState(true);
  const [showCXCModal, setShowCXCModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [pendingIngresos, setPendingIngresos] = useState<any[]>([]);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    paymentMethod: PaymentMethod.BS_CASH,
    destinationBank: '',
    amount: '',
    exchangeRate: exchangeRate?.toString() || '480',
    concept: 'INGRESO',
  });

  const [cxcData, setCxcData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    clientName: '',
    concept: '',
    amountUsd: '',
    amountBs: '',
    invoiceNumber: '',
    sellerName: '',
    exchangeRate: exchangeRate?.toString() || '1',
    item: `CXC-${format(new Date(), 'yyyyMMdd-HHmmss')}`
  });

  // Sync rate when prop changes or when form is opened
  useEffect(() => {
    if (exchangeRate) {
      setFormData(prev => ({ ...prev, exchangeRate: exchangeRate.toString() }));
    }
  }, [exchangeRate, showForm]);

  useEffect(() => {
    return dbService.subscribeToTransactions(setTransactions);
  }, []);

  useEffect(() => {
    const rateToUse = exchangeRate ? exchangeRate.toString() : '1';
    
    // Attempt to find a transaction for the currently selected date to pick its exchange rate
    const dateTx = transactions.find(t => t.date === cxcData.date && t.exchangeRate && t.exchangeRate > 0);
    const finalRate = dateTx?.exchangeRate ? dateTx.exchangeRate.toString() : rateToUse;

    setCxcData(prev => {
      if (prev.exchangeRate !== finalRate) {
        const usd = parseFloat(prev.amountUsd) || 0;
        const bs = usd * parseFloat(finalRate);
        return {
          ...prev,
          exchangeRate: finalRate,
          amountBs: usd > 0 ? bs.toFixed(2) : prev.amountBs
        };
      }
      return prev;
    });
  }, [cxcData.date, transactions, exchangeRate]);

  useEffect(() => {
    if (cxcData.exchangeRate && cxcData.amountUsd) {
      const usd = parseFloat(cxcData.amountUsd) || 0;
      const bs = usd * parseFloat(cxcData.exchangeRate);
      setCxcData(prev => ({ ...prev, amountBs: bs.toFixed(2) }));
    }
  }, [cxcData.exchangeRate]);

  // Handle form field changes helper
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Calculated Fields
  const inputAmt = parseFloat(formData.amount) || 0;
  const inBolivares = formData.paymentMethod === PaymentMethod.BS || formData.paymentMethod === PaymentMethod.BS_CASH;
  const amountUsdConv = inBolivares ? inputAmt / (parseFloat(formData.exchangeRate) || 1) : 0;
  const amountUsdCash = formData.paymentMethod === PaymentMethod.USD_CASH ? inputAmt : 0;
  const amountZelle = formData.paymentMethod === PaymentMethod.ZELLE || formData.paymentMethod === PaymentMethod.BINANCE ? inputAmt : 0;
  const amountBs = inBolivares ? inputAmt : 0;
  
  const totalDailySale = inBolivares ? amountUsdConv : inputAmt;

  const handleAddPending = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputAmt <= 0) return;
    if (!formData.destinationBank.trim() || !formData.concept.trim()) return;

    setPendingIngresos(prev => [...prev, {
        date: formData.date,
        clientName: 'CUADRE DIARIO',
        concept: formData.concept,
        amountBs: amountBs,
        exchangeRate: parseFloat(formData.exchangeRate) || 1,
        amountUsd: totalDailySale,
        paymentMethod: formData.paymentMethod,
        type: TransactionType.SALE,
        isCXC: false,
        amountUsdCash: amountUsdCash,
        amountZelle: amountZelle,
        amountCXC: 0,
        totalDailySale: totalDailySale,
        currency: inBolivares ? 'Bolívares (BS)' : 'Dólares ($)',
        destinationBank: formData.destinationBank
    }]);

    setFormData({
      ...formData,
      amount: '',
      destinationBank: '',
      concept: 'INGRESO',
      paymentMethod: PaymentMethod.BS_CASH,
      exchangeRate: exchangeRate?.toString() || '480',
    });
  };

  const handleSaveAll = async () => {
    if (pendingIngresos.length === 0) return;
    
    try {
      for (const t of pendingIngresos) {
        await dbService.addTransaction(t);
      }
      setPendingIngresos([]);
      setShowForm(false);
    } catch (error) {
      console.error("Error saving multiple transactions:", error);
    }
  };

  const handleSubmitCXC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cxcData.clientName.trim() || !cxcData.amountUsd || !cxcData.concept.trim() || !cxcData.sellerName.trim() || !cxcData.invoiceNumber.trim()) return;

    try {
      await dbService.addCXCCharge(cxcData.clientName, {
        date: cxcData.date,
        amountUsd: parseFloat(cxcData.amountUsd) || 0,
        amountBs: parseFloat(cxcData.amountBs) || 0,
        exchangeRate: parseFloat(cxcData.exchangeRate) || parseFloat(exchangeRate?.toString() || '1'),
        concept: cxcData.concept,
        item: cxcData.item,
        invoiceNumber: cxcData.invoiceNumber,
        sellerName: cxcData.sellerName,
        type: 'charge'
      });

      setShowCXCModal(false);
      setCxcData({
        date: format(new Date(), 'yyyy-MM-dd'),
        clientName: '',
        concept: '',
        amountUsd: '',
        amountBs: '',
        invoiceNumber: '',
        sellerName: '',
        exchangeRate: exchangeRate?.toString() || '1',
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
      const isBs = editingTransaction.paymentMethod === PaymentMethod.BS || editingTransaction.paymentMethod === PaymentMethod.BS_CASH;
      const amtUsd = Number(editingTransaction.amountUsd) || 0;
      const inputAmtUsd = isBs ? (Number(editingTransaction.amountBs) || 0) / (Number(editingTransaction.exchangeRate) || 1) : amtUsd;
      
      const isUsdCash = editingTransaction.paymentMethod === PaymentMethod.USD_CASH;
      const isZelle = editingTransaction.paymentMethod === PaymentMethod.ZELLE || editingTransaction.paymentMethod === PaymentMethod.BINANCE;
  
      await dbService.updateTransaction(editingTransaction.id, {
        concept: editingTransaction.concept,
        clientName: editingTransaction.clientName,
        amountBs: Number(editingTransaction.amountBs) || 0,
        exchangeRate: Number(editingTransaction.exchangeRate) || 1,
        amountUsd: Number(editingTransaction.amountUsd) || 0,
        paymentMethod: editingTransaction.paymentMethod,
        type: editingTransaction.type,
        isCXC: editingTransaction.isCXC,
        cxcBalance: Number(editingTransaction.cxcBalance) || 0,
        amountUsdCash: isUsdCash ? inputAmtUsd : 0,
        amountZelle: isZelle ? inputAmtUsd : 0,
        totalDailySale: inputAmtUsd
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

  const filteredTransactions = transactions.filter(t => {
    if (t.type !== TransactionType.SALE) return false;
    if (startDate && t.date < startDate) return false;
    if (endDate && t.date > endDate) return false;
    return true;
  });

  const totals = filteredTransactions.reduce((acc, t) => {
    acc.bs += t.amountBs || 0;
    acc.usdConv += (t.amountBs || 0) / (t.exchangeRate || 1);
    acc.usdCash += t.amountUsdCash || 0;
    acc.zelle += t.amountZelle || 0;
    acc.cxc += t.amountCXC || 0;
    acc.ventaDiaria += t.totalDailySale || t.amountUsd || 0;
    return acc;
  }, { bs: 0, usdConv: 0, usdCash: 0, zelle: 0, cxc: 0, ventaDiaria: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Relación de Ingresos de Caja</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Cierre diario y cuadre de caja (Dual Conversion).</p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
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
            {showForm ? <span>Cerrar Formulario</span> : <span><Plus size={16} className="inline mr-2 -mt-0.5" />Nuevo Ingreso</span>}
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label">Número de Factura</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      required
                      value={cxcData.invoiceNumber}
                      onChange={(e) => setCxcData({...cxcData, invoiceNumber: e.target.value})}
                      className="input-field pl-10" 
                      placeholder="Ej: FAC-00123"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="label">Vendedor</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      required
                      value={cxcData.sellerName}
                      onChange={(e) => setCxcData({...cxcData, sellerName: e.target.value.toUpperCase()})}
                      className="input-field pl-10 uppercase" 
                      placeholder="Nombre del vendedor"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="label">Monto (USD)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                      type="number" 
                      step="0.01"
                      min="0.01"
                      required
                      value={cxcData.amountUsd}
                      onChange={(e) => {
                        const usd = parseFloat(e.target.value) || 0;
                        const bs = usd * (parseFloat(cxcData.exchangeRate) || 1);
                        setCxcData({...cxcData, amountUsd: e.target.value, amountBs: e.target.value ? bs.toFixed(2) : ''});
                      }}
                      className="input-field pl-10 font-bold" 
                      placeholder="0.00"
                    />
                  </div>
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
          <form onSubmit={handleAddPending} className="space-y-6">
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
                <label className="label">Forma de Pago</label>
                <select
                  required
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({...formData, paymentMethod: e.target.value as PaymentMethod})}
                  className="input-field cursor-pointer"
                >
                  <option value={PaymentMethod.BS_CASH}>{PaymentMethod.BS_CASH}</option>
                  <option value={PaymentMethod.USD_CASH}>{PaymentMethod.USD_CASH}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="label">Banco / Destino</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Banesco, Provincial, Caja Fuerte, etc."
                  value={formData.destinationBank}
                  onChange={(e) => setFormData({...formData, destinationBank: e.target.value.toUpperCase()})}
                  className="input-field uppercase" 
                  list="bancos-list"
                />
                <datalist id="bancos-list">
                  <option value="BANESCO" />
                  <option value="PROVINCIAL" />
                  <option value="MERCANTIL" />
                  <option value="VENEZUELA" />
                  <option value="BANCO DEL TESORO" />
                  <option value="BNC" />
                  <option value="EFECTIVO EN CAJA" />
                  <option value="EFECTIVO" />
                  <option value="BINANCE P2P" />
                  <option value="ZELLE" />
                </datalist>
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
                  className={`input-field font-mono font-bold ${inBolivares ? 'text-blue-600' : 'text-slate-400 opacity-50 bg-slate-50'}`} 
                  readOnly={!inBolivares}
                />
              </div>

              <div className="space-y-1">
                <label className="label">Monto ({inBolivares ? 'Bs' : 'USD'})</label>
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

              {inBolivares && (
                <div className="space-y-1">
                  <label className="label text-emerald-600">Dólares Conv.</label>
                  <div className="input-field bg-emerald-50 text-emerald-700 font-bold border-dashed flex items-center">
                    {formatCurrency(amountUsdConv)}
                  </div>
                  <p className="text-[10px] text-slate-400">BS / Tasa</p>
                </div>
              )}

              <div className="col-span-1 md:col-span-2 lg:col-span-2 space-y-1">
                <label className="label text-blue-600">Venta Diaria Total (USD)</label>
                <div className="h-14 px-4 bg-blue-600 text-white rounded-lg flex flex-col justify-center shadow-lg shadow-blue-200 text-right">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold uppercase">Resultado:</span>
                    <span className="text-xl font-black">{formatCurrency(totalDailySale)}</span>
                  </div>
                  <span className="text-[10px] font-bold text-blue-200 mt-0.5">Bs. {new Intl.NumberFormat('es-VE').format(totalDailySale * (parseFloat(formData.exchangeRate) || 1))}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button type="submit" className="bg-white border border-slate-200 shadow-sm text-slate-700 hover:bg-slate-50 font-bold rounded-xl px-6 h-12 flex items-center justify-center transition-colors">
                <Plus size={18} className="inline mr-2 -mt-0.5" />
                Agregar a la Lista
              </button>
            </div>
          </form>

          {pendingIngresos.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
                <span>Ingresos por Registrar ({pendingIngresos.length})</span>
                <span className="text-blue-600">
                  Total: {formatCurrency(pendingIngresos.reduce((sum, p) => sum + p.totalDailySale, 0))}
                </span>
              </h3>
              <div className="space-y-3 mb-6">
                {pendingIngresos.map((p, i) => (
                  <div key={i} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm">
                    <div>
                      <span className="font-bold text-slate-700 block">{p.destinationBank || 'Sin Banco'} - {p.currency}</span>
                      <span className="text-slate-500 text-xs">{p.concept}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="block font-black text-slate-800">{formatCurrency(p.totalDailySale)}</span>
                        {p.amountBs > 0 && <span className="block text-[10px] text-slate-500 font-bold">Bs. {new Intl.NumberFormat('es-VE').format(p.amountBs)}</span>}
                      </div>
                      <button onClick={() => setPendingIngresos(prev => prev.filter((_, idx) => idx !== i))} className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded-md transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button 
                  onClick={handleSaveAll}
                  className="btn-primary px-10 h-12 shadow-xl shadow-blue-200"
                >
                  Guardar Todos ({pendingIngresos.length})
                </button>
              </div>
            </div>
          )}
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
                <th className="p-3 text-left text-[10px] uppercase font-black border-r border-slate-700">Moneda</th>
                <th className="p-3 text-left text-[10px] uppercase font-black border-r border-slate-700">Destino</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-orange-950/20">Bolívares</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700">Tasa</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-orange-950/20">Dolars Conv.</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-emerald-950/20">Efectivo ($)</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-emerald-950/20">Zelle/Binance</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-blue-950/20">C X C</th>
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700">Venta Diaria</th>
                <th className="p-3 text-center text-[10px] uppercase font-black">Edit</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-100 text-slate-800 font-black text-[11px] uppercase border-b-2 border-slate-300">
                <td colSpan={5} className="p-3 text-right">TOTALES PERIODO:</td>
                <td className="p-3 text-right text-orange-700 bg-orange-100/50">{new Intl.NumberFormat('es-VE').format(totals.bs)}</td>
                <td className="p-3 bg-orange-100/50 text-right text-slate-400 font-mono">-</td>
                <td className="p-3 text-right text-orange-700 bg-orange-100/50">{formatCurrency(totals.usdConv)}</td>
                <td className="p-3 text-right text-emerald-700 bg-emerald-100/50">{formatCurrency(totals.usdCash)}</td>
                <td className="p-3 text-right text-emerald-700 bg-emerald-100/50">{formatCurrency(totals.zelle)}</td>
                <td className="p-3 text-right text-blue-700 bg-blue-100/50">{formatCurrency(totals.cxc)}</td>
                <td className="p-3 text-right text-slate-900 bg-slate-200 border-r border-slate-300">
                  {formatCurrency(totals.ventaDiaria)}
                  <span className="block text-[9px] text-slate-500 font-bold mt-0.5 whitespace-nowrap">
                    Bs. {new Intl.NumberFormat('es-VE').format(totals.ventaDiaria * (exchangeRate || 1))}
                  </span>
                </td>
                <td className="p-3 bg-slate-100"></td>
              </tr>
              {filteredTransactions.map((t, i) => {
                  const conv = (t.amountBs || 0) / (t.exchangeRate || 1);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 border-b border-slate-200 text-xs font-medium">
                      <td className="p-3 text-slate-400 border-r border-slate-100">{filteredTransactions.length - i}</td>
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
                      <td className="p-3 border-r border-slate-100 text-slate-600">{t.currency || '-'}</td>
                      <td className="p-3 border-r border-slate-100 font-bold">{t.destinationBank || '-'}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-orange-50/30">{new Intl.NumberFormat('es-VE').format(t.amountBs || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 font-mono text-blue-600">{t.exchangeRate}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-orange-50/30">{formatCurrency(conv)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-emerald-50/30">{formatCurrency(t.amountUsdCash || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-emerald-50/30">{formatCurrency(t.amountZelle || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-blue-50/30">{formatCurrency(t.amountCXC || 0)}</td>
                      <td className="p-3 text-right font-black text-slate-900 bg-slate-50 border-r border-slate-100">
                        {formatCurrency(t.totalDailySale || t.amountUsd)}
                        <span className="block text-[9px] text-slate-400 font-bold mt-0.5 whitespace-nowrap">
                          Bs. {new Intl.NumberFormat('es-VE').format((t.totalDailySale || t.amountUsd) * (exchangeRate || 1))}
                        </span>
                      </td>
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
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-slate-400 italic">No hay cuadres de caja registrados en el periodo seleccionado.</td>
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
