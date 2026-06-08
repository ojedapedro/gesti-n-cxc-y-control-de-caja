import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { TransactionType, PaymentMethod, type Transaction, type Seller } from '../types';
import { Plus, Search, Calendar, User, DollarSign, Tag, Clock, FileText, Edit, X, Percent, Landmark } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

export default function IncomesRegistro({ exchangeRate }: { exchangeRate?: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showForm, setShowForm] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [pendingIngresos, setPendingIngresos] = useState<any[]>([]);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [fetchingRate, setFetchingRate] = useState(false);

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    paymentMethod: PaymentMethod.BS_CASH,
    destinationBank: '',
    amount: '',
    exchangeRate: exchangeRate?.toString() || '0',
    concept: 'INGRESO',
  });

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [showCXCModal, setShowCXCModal] = useState(false);
  const [cxcData, setCxcData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    clientName: '',
    concept: '',
    amountUsd: '',
    grossAmountUsd: '',
    amountBs: '',
    invoiceNumber: '',
    sellerName: '',
    sellerId: '',
    rubroName: '',
    exchangeRate: exchangeRate?.toString() || '0',
    item: `CXC-${format(new Date(), 'yyyyMMdd-HHmmss')}`,
    destinationBank: ''
  });

  // Sync sellers
  useEffect(() => {
    const unsub = dbService.subscribeToSellers(setSellers);
    return () => unsub();
  }, []);

  // Fetch historical rate when cxcData date changes
  useEffect(() => {
    const fetchCxcRate = async (dateStr: string) => {
      if (!dateStr || !showCXCModal) return;
      setFetchingRate(true);
      const historicalRate = await dbService.getExchangeRateForDate(dateStr);
      if (historicalRate) {
        setCxcData(prev => ({ ...prev, exchangeRate: historicalRate.toString() }));
      } else if (exchangeRate !== undefined) {
        setCxcData(prev => ({ ...prev, exchangeRate: exchangeRate.toString() }));
      }
      setFetchingRate(false);
    };
    fetchCxcRate(cxcData.date);
  }, [cxcData.date, showCXCModal, exchangeRate]);

  // Handle automatic amountBs calculation for CXC
  useEffect(() => {
    if (cxcData.exchangeRate && cxcData.amountUsd) {
      const usd = parseFloat(cxcData.amountUsd) || 0;
      const bs = usd * parseFloat(cxcData.exchangeRate);
      setCxcData(prev => ({ ...prev, amountBs: bs.toFixed(2) }));
    }
  }, [cxcData.exchangeRate, cxcData.amountUsd]);

  // Fetch historical rate when date changes
  useEffect(() => {
    const fetchRate = async (date: string) => {
      if (!date) return;
      setFetchingRate(true);
      const historicalRate = await dbService.getExchangeRateForDate(date);
      if (historicalRate) {
        setFormData(prev => ({ ...prev, exchangeRate: historicalRate.toString() }));
      } else if (exchangeRate !== undefined) {
        // Fallback to prop if no history
        setFormData(prev => ({ ...prev, exchangeRate: exchangeRate.toString() }));
      }
      setFetchingRate(false);
    };

    fetchRate(formData.date);
  }, [formData.date, exchangeRate]);

  // Sync rate when prop changes or when form is opened
  useEffect(() => {
    if (exchangeRate !== undefined) {
      setFormData(prev => ({ ...prev, exchangeRate: exchangeRate.toString() }));
    }
  }, [exchangeRate, showForm]);

  useEffect(() => {
    return dbService.subscribeToTransactions(setTransactions);
  }, []);

  // Handle form field changes helper
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Calculated Fields
  const inputAmt = parseFloat(formData.amount) || 0;
  const inBolivares = formData.paymentMethod === PaymentMethod.BS || formData.paymentMethod === PaymentMethod.BS_CASH;
  
  const destClean = (formData.destinationBank || '').trim().toUpperCase();
  const isCashDest = destClean.includes('EFECTIVO') || destClean.includes('CAJA');
  const isBankDest = destClean.length > 0 && !isCashDest;

  const amountUsdConv = inBolivares ? inputAmt / (parseFloat(formData.exchangeRate) || 1) : 0;
  const amountUsdCash = formData.paymentMethod === PaymentMethod.USD_CASH ? inputAmt : 0;
  const amountZelle = formData.paymentMethod === PaymentMethod.ZELLE || formData.paymentMethod === PaymentMethod.BINANCE ? inputAmt : 0;
  const amountBs = inBolivares ? inputAmt : 0;
  
  const totalDailySale = inBolivares ? amountUsdConv : inputAmt;

  const currentUsdCash = (formData.paymentMethod === PaymentMethod.USD_CASH && isCashDest) || (formData.paymentMethod === PaymentMethod.USD_CASH && !isBankDest) ? inputAmt : 0;
  const currentZelle = (formData.paymentMethod === PaymentMethod.ZELLE || formData.paymentMethod === PaymentMethod.BINANCE || isBankDest) && !isCashDest ? (inBolivares ? 0 : inputAmt) : 0;

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
        amountUsdCash: currentUsdCash,
        amountZelle: currentZelle,
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
      const gross = parseFloat(cxcData.grossAmountUsd) || parseFloat(cxcData.amountUsd) || 0;
      const net = parseFloat(cxcData.amountUsd) || 0;
      const commissionAmount = gross - net;

      await dbService.addCXCCharge(cxcData.clientName.trim().toUpperCase(), {
        date: cxcData.date,
        amountUsd: net,
        grossAmountUsd: gross,
        commissionAmountUsd: commissionAmount,
        amountBs: parseFloat(cxcData.amountBs) || 0,
        exchangeRate: parseFloat(cxcData.exchangeRate) || parseFloat(exchangeRate?.toString() || '1'),
        concept: cxcData.concept,
        item: cxcData.item,
        invoiceNumber: cxcData.invoiceNumber,
        sellerName: cxcData.sellerName,
        sellerId: cxcData.sellerId,
        rubroName: cxcData.rubroName.split('|')[0],
        type: 'charge',
        destinationBank: cxcData.destinationBank || ''
      });

      setShowCXCModal(false);
      setCxcData({
        date: format(new Date(), 'yyyy-MM-dd'),
        clientName: '',
        concept: '',
        amountUsd: '',
        grossAmountUsd: '',
        amountBs: '',
        invoiceNumber: '',
        sellerName: '',
        sellerId: '',
        rubroName: '',
        exchangeRate: exchangeRate?.toString() || '1',
        item: `CXC-${format(new Date(), 'yyyyMMdd-HHmmss')}`,
        destinationBank: ''
      });
    } catch (error) {
      console.error("Error saving Cuentas por Cobrar (CXC):", error);
    }
  };



  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction || !editingTransaction.id) return;

    try {
      await dbService.updateTransaction(editingTransaction.id, {
        date: editingTransaction.date || format(new Date(), 'yyyy-MM-dd'),
        concept: editingTransaction.concept || '',
        clientName: editingTransaction.clientName || '',
        amountBs: Number(editingTransaction.amountBs) || 0,
        exchangeRate: Number(editingTransaction.exchangeRate) || 1,
        amountUsd: Number(editingTransaction.amountUsd) || 0,
        currency: editingTransaction.currency || '',
        destinationBank: editingTransaction.destinationBank || '',
        paymentMethod: editingTransaction.paymentMethod,
        type: editingTransaction.type,
        isCXC: editingTransaction.isCXC || false,
        amountUsdCash: Number(editingTransaction.amountUsdCash) || 0,
        amountZelle: Number(editingTransaction.amountZelle) || 0,
        amountCXC: Number(editingTransaction.amountCXC) || 0,
        totalDailySale: Number(editingTransaction.totalDailySale) || 0
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

  // Unique options for filtrations
  const uniqueCurrencies = Array.from(
    new Set(
      transactions
        .filter(t => t.type === TransactionType.SALE && !t.isCXC && t.paymentMethod !== PaymentMethod.CXC && t.currency)
        .map(t => t.currency)
    )
  ).sort();

  const uniqueDestinations = Array.from(
    new Set(
      transactions
        .filter(t => t.type === TransactionType.SALE && !t.isCXC && t.paymentMethod !== PaymentMethod.CXC && t.destinationBank && (t.destinationBank || '').trim().length > 0)
        .map(t => (t.destinationBank || '').trim().toUpperCase())
    )
  ).sort();

  const filteredTransactions = transactions.filter(t => {
    if (t.type !== TransactionType.SALE) return false;
    if (t.isCXC || t.paymentMethod === PaymentMethod.CXC) return false;
    if (startDate && t.date < startDate) return false;
    if (endDate && t.date > endDate) return false;
    if (selectedCurrency && t.currency !== selectedCurrency) return false;
    if (selectedDestination && (t.destinationBank || '').trim().toUpperCase() !== selectedDestination.toUpperCase()) return false;
    return true;
  });

  const totals = filteredTransactions.reduce((acc, t) => {
    const destClean = (t.destinationBank || '').trim().toUpperCase();
    const isCashDest = destClean.includes('EFECTIVO') || destClean.includes('CAJA');
    const isBsTx = !!(t.amountBs && t.amountBs > 0);

    if (isBsTx) {
      if (isCashDest) {
        acc.bsCash += t.amountBs || 0;
      } else {
        acc.bs += t.amountBs || 0;
        acc.usdConvert = (t.amountBs || 0) / (t.exchangeRate || 1); // Helper
        acc.usdConv += acc.usdConvert;
      }
    }

    acc.usdCash += t.amountUsdCash || 0;
    acc.zelle += t.amountZelle || 0;
    acc.cxc += t.amountCXC || 0;
    
    const valueUsd = isBsTx ? ((t.amountUsdCash || 0) + (t.amountZelle || 0) + (t.amountCXC || 0)) : (t.totalDailySale || t.amountUsd || 0);
    acc.ventaDiaria += valueUsd;
    
    const rate = t.exchangeRate || exchangeRate || 1;
    acc.ventaDiariaBs += valueUsd * rate;
    
    return acc;
  }, { bs: 0, usdConv: 0, usdCash: 0, zelle: 0, cxc: 0, bsCash: 0, ventaDiaria: 0, ventaDiariaBs: 0 } as { bs: number; usdConv: number; usdCash: number; zelle: number; cxc: number; bsCash: number; ventaDiaria: number; ventaDiariaBs: number; usdConvert?: number });

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

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
            <div className="flex items-center gap-2 px-2 w-full sm:w-auto">
              <div className="flex flex-col w-full">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Moneda</label>
                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  className="bg-transparent text-sm font-medium text-slate-900 outline-none w-full sm:w-32 cursor-pointer border-none p-0 focus:ring-0 leading-tight"
                >
                  <option value="">TODAS</option>
                  {uniqueCurrencies.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1"></div>
            <div className="w-full h-px sm:hidden bg-slate-200 my-1"></div>
            <div className="flex items-center gap-2 px-2 w-full sm:w-auto">
              <div className="flex flex-col w-full">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Destino</label>
                <select
                  value={selectedDestination}
                  onChange={(e) => setSelectedDestination(e.target.value)}
                  className="bg-transparent text-sm font-medium text-slate-900 outline-none w-full sm:w-36 cursor-pointer border-none p-0 focus:ring-0 leading-tight"
                >
                  <option value="">TODOS</option>
                  {uniqueDestinations.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
            {(selectedCurrency || selectedDestination) && (
              <button 
                onClick={() => { setSelectedCurrency(''); setSelectedDestination(''); }}
                className="mt-2 sm:mt-0 sm:ml-2 text-xs font-bold text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors w-full sm:w-auto text-center border border-transparent sm:border-slate-200 bg-white sm:bg-transparent shadow-sm sm:shadow-none"
              >
                Limpiar
              </button>
            )}
          </div>
          
          <button 
            onClick={() => setShowForm(!showForm)}
            className="btn-primary"
          >
            {showForm ? <span>Cerrar Formulario</span> : <span><Plus size={16} className="inline mr-2 -mt-0.5" />Nuevo Ingreso</span>}
          </button>

          <button 
            onClick={() => {
              setCxcData({
                date: format(new Date(), 'yyyy-MM-dd'),
                clientName: '',
                concept: '',
                amountUsd: '',
                grossAmountUsd: '',
                amountBs: '',
                invoiceNumber: '',
                sellerName: '',
                sellerId: '',
                rubroName: '',
                exchangeRate: exchangeRate?.toString() || '1',
                item: `CXC-${format(new Date(), 'yyyyMMdd-HHmmss')}`
              });
              setShowCXCModal(true);
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 shadow-sm transition-colors text-sm h-10"
          >
            <Plus size={16} />
            <span>Registrar Cargo (CXC)</span>
          </button>
        </div>
      </div>

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
                <label className="label">Moneda</label>
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
                  {inBolivares ? (
                    <>
                      <option value="GARANTIA" />
                      <option value="DONACION" />
                      <option value="EFECTIVO" />
                      <option value="BANESCO" />
                      <option value="BANCO DEL TESORO" />
                      <option value="VENEZUELA" />
                      <option value="PROVINCIAL" />
                      <option value="MERCANTIL" />
                      <option value="BNC" />
                    </>
                  ) : (
                    <>
                      <option value="GARANTIA" />
                      <option value="DONACION" />
                      <option value="ZELLE" />
                      <option value="BINANCE P2P" />
                      <option value="EFECTIVO" />
                      <option value="BANESCO" />
                      <option value="BANCO DEL TESORO" />
                      <option value="VENEZUELA" />
                      <option value="PROVINCIAL" />
                      <option value="MERCANTIL" />
                      <option value="BNC" />
                    </>
                  )}
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
                <th className="p-3 text-right text-[10px] uppercase font-black border-r border-slate-700 bg-orange-950/20">Efectivo Bs</th>
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
                <td className="p-3 text-right text-orange-700 bg-orange-100/50">{new Intl.NumberFormat('es-VE').format(totals.bsCash)}</td>
                <td className="p-3 text-right text-slate-900 bg-slate-200 border-r border-slate-300">
                  {formatCurrency(totals.ventaDiaria)}
                  <span className="block text-[9px] text-slate-500 font-bold mt-0.5 whitespace-nowrap">
                    Bs. {new Intl.NumberFormat('es-VE').format(totals.ventaDiariaBs)}
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
                      <td className="p-3 text-right border-r border-slate-100 bg-orange-50/30 font-bold text-slate-800">
                        {(() => {
                          const destClean = (t.destinationBank || '').trim().toUpperCase();
                          const isCashDest = destClean.includes('EFECTIVO') || destClean.includes('CAJA');
                          const isBsTx = !!(t.amountBs && t.amountBs > 0);
                          return isBsTx && !isCashDest ? new Intl.NumberFormat('es-VE').format(t.amountBs || 0) : '0';
                        })()}
                      </td>
                      <td className="p-3 text-right border-r border-slate-100 font-mono text-blue-600">{t.exchangeRate}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-orange-50/30">
                        {(() => {
                          const destClean = (t.destinationBank || '').trim().toUpperCase();
                          const isCashDest = destClean.includes('EFECTIVO') || destClean.includes('CAJA');
                          const isBsTx = !!(t.amountBs && t.amountBs > 0);
                          return isBsTx && !isCashDest ? formatCurrency(conv) : formatCurrency(0);
                        })()}
                      </td>
                      <td className="p-3 text-right border-r border-slate-100 bg-emerald-50/30">{formatCurrency(t.amountUsdCash || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-emerald-50/30">{formatCurrency(t.amountZelle || 0)}</td>
                      <td className="p-3 text-right border-r border-slate-100 bg-orange-50/30 font-bold text-orange-850 bg-orange-50">
                        {(() => {
                          const destClean = (t.destinationBank || '').trim().toUpperCase();
                          const isCashDest = destClean.includes('EFECTIVO') || destClean.includes('CAJA');
                          const isBsTx = !!(t.amountBs && t.amountBs > 0);
                          return isBsTx && isCashDest ? new Intl.NumberFormat('es-VE').format(t.amountBs || 0) : '-';
                        })()}
                      </td>
                      <td className="p-3 text-right font-black text-slate-900 bg-slate-50 border-r border-slate-100">
                        {(() => {
                          const isBsTx = !!(t.amountBs && t.amountBs > 0);
                          const valUsd = isBsTx ? ((t.amountUsdCash || 0) + (t.amountZelle || 0)) : (t.totalDailySale || t.amountUsd || 0);
                          return (
                            <>
                              {formatCurrency(valUsd)}
                              <span className="block text-[9px] text-slate-400 font-bold mt-0.5 whitespace-nowrap">
                                Bs. {new Intl.NumberFormat('es-VE').format(valUsd * (t.exchangeRate || exchangeRate || 1))}
                              </span>
                            </>
                          );
                        })()}
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
                  <td colSpan={13} className="p-10 text-center text-slate-400 italic">No hay cuadres de caja registrados en el periodo seleccionado.</td>
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
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="label">Día / Fecha</label>
                  <input 
                    type="date" 
                    required
                    value={editingTransaction.date || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, date: e.target.value})}
                    className="input-field" 
                  />
                  {editingTransaction.date && <p className="text-xs font-bold text-slate-500 uppercase">{getDayName(editingTransaction.date)}</p>}
                </div>
                <div className="space-y-1">
                  <label className="label">Moneda</label>
                  <select 
                    required
                    value={editingTransaction.currency || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, currency: e.target.value})}
                    className="input-field uppercase" 
                  >
                    <option value="">Seleccione...</option>
                    <option value="Bolívares (BS)">Bolívares (BS)</option>
                    <option value="Dólares ($)">Dólares ($)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="label">Destino</label>
                  <select 
                    required
                    value={editingTransaction.destinationBank || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, destinationBank: e.target.value.toUpperCase()})}
                    className="input-field uppercase cursor-pointer" 
                  >
                    <option value="">Seleccione...</option>
                    {editingTransaction.currency?.includes('Bolívares') ? (
                      <>
                        <option value="GARANTIA">GARANTÍA</option>
                        <option value="DONACION">DONACIÓN</option>
                        <option value="EFECTIVO">EFECTIVO</option>
                        <option value="BANESCO">BANESCO</option>
                        <option value="BANCO DEL TESORO">BANCO DEL TESORO</option>
                        <option value="VENEZUELA">VENEZUELA</option>
                        <option value="PROVINCIAL">PROVINCIAL</option>
                        <option value="MERCANTIL">MERCANTIL</option>
                        <option value="BNC">BNC</option>
                      </>
                    ) : (
                      <>
                        <option value="GARANTIA">GARANTÍA</option>
                        <option value="DONACION">DONACIÓN</option>
                        <option value="ZELLE">ZELLE</option>
                        <option value="BINANCE P2P">BINANCE P2P</option>
                        <option value="EFECTIVO">EFECTIVO</option>
                        <option value="BANESCO">BANESCO</option>
                        <option value="BANCO DEL TESORO">BANCO DEL TESORO</option>
                        <option value="VENEZUELA">VENEZUELA</option>
                        <option value="PROVINCIAL">PROVINCIAL</option>
                        <option value="MERCANTIL">MERCANTIL</option>
                        <option value="BNC">BNC</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="label">Bolívares</label>
                  <input 
                    type="number" step="0.01"
                    required
                    value={editingTransaction.amountBs ?? ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, amountBs: parseFloat(e.target.value) || 0})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Tasa</label>
                  <input 
                    type="number" step="0.01"
                    required
                    value={editingTransaction.exchangeRate ?? ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, exchangeRate: parseFloat(e.target.value) || 0})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Dolars Conv.</label>
                  <input 
                    type="number" step="0.01"
                    required
                    value={editingTransaction.amountUsd ?? ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, amountUsd: parseFloat(e.target.value) || 0})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Efectivo ($)</label>
                  <input 
                    type="number" step="0.01"
                    required
                    value={editingTransaction.amountUsdCash ?? ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, amountUsdCash: parseFloat(e.target.value) || 0})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Zelle/Binance</label>
                  <input 
                    type="number" step="0.01"
                    required
                    value={editingTransaction.amountZelle ?? ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, amountZelle: parseFloat(e.target.value) || 0})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Venta Diaria</label>
                  <input 
                    type="number" step="0.01"
                    required
                    value={editingTransaction.totalDailySale ?? ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, totalDailySale: parseFloat(e.target.value) || 0})}
                    className="input-field" 
                  />
                </div>
                {/* Metodo and Concept are not strictly required based on the list but might be useful, keep them or let them be? The prompt said "agrega los siguientes item a editar", so I'll append just Concept, Client, type in the modal but smaller, or just strictly what they asked. I'll just leave them under this grid and the other ones as a single block */}
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 border-t border-slate-100 pt-4 mt-4">
                <div className="space-y-1">
                  <label className="label">Concept</label>
                  <input 
                    type="text" 
                    required
                    value={editingTransaction.concept || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, concept: e.target.value})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Client Name</label>
                  <input 
                    type="text" 
                    required
                    value={editingTransaction.clientName || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, clientName: e.target.value})}
                    className="input-field" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">Forma de Pago</label>
                  <select
                    required
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
                    required
                    value={editingTransaction.type || ''}
                    onChange={(e) => setEditingTransaction({...editingTransaction, type: e.target.value as TransactionType})}
                    className="input-field"
                  >
                    {Object.values(TransactionType).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
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

      {showCXCModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col animate-scale-up">
            <div className="p-4 border-b border-slate-100 bg-blue-50/50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-blue-600" size={20} />
                Registrar Cargo / Venta a Crédito (CXC)
              </h3>
              <button 
                onClick={() => setShowCXCModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmitCXC} className="p-6 space-y-4 overflow-y-auto max-h-[80vh] custom-scrollbar">
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
                    onChange={(e) => setCxcData({...cxcData, clientName: e.target.value})}
                    className="input-field pl-10 uppercase font-medium" 
                    placeholder="Escriba el nombre exacto del cliente"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                  <label className="label">Banco / Destino</label>
                  <div className="relative">
                    <Landmark className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      value={cxcData.destinationBank || ''}
                      onChange={(e) => setCxcData({...cxcData, destinationBank: e.target.value.toUpperCase()})}
                      className="input-field pl-10 uppercase" 
                      placeholder="Garantía, Donación, Cuenta por Cobrar (CXC)"
                      list="bancos-list-cargo-cxc"
                    />
                    <datalist id="bancos-list-cargo-cxc">
                      <option value="GARANTIA" />
                      <option value="DONACION" />
                      <option value="CUENTA POR COBRAR (CXC)" />
                    </datalist>
                  </div>
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
                  <label className="label">Vendedor / Perfil</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <select 
                      required
                      value={cxcData.sellerId}
                      onChange={(e) => {
                        const sId = e.target.value;
                        const seller = sellers.find(s => s.id === sId);
                        if (seller) {
                          const baseUsd = parseFloat(cxcData.grossAmountUsd) || parseFloat(cxcData.amountUsd) || 0;
                          const commission = 0;
                          const finalUsd = baseUsd * (1 - commission);
                          const finalBs = finalUsd * (parseFloat(cxcData.exchangeRate) || 1);
                          setCxcData({
                            ...cxcData, 
                            sellerId: sId, 
                            sellerName: seller.name,
                            rubroName: '', 
                            grossAmountUsd: baseUsd.toString(),
                            amountUsd: finalUsd.toFixed(2),
                            amountBs: finalBs.toFixed(2)
                          });
                        } else {
                          setCxcData({...cxcData, sellerId: sId, sellerName: '', rubroName: ''});
                        }
                      }}
                      className="input-field pl-10 cursor-pointer text-sm"
                    >
                      <option value="">Seleccione Vendedor...</option>
                      {sellers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="label flex items-center justify-between">
                  <span>Rubro / Categoría de Venta</span>
                  {cxcData.rubroName && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-black uppercase">
                      {cxcData.rubroName.includes('|') ? cxcData.rubroName.split('|')[1] : '0'}% Comis.
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Tag className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <select 
                    required
                    value={cxcData.rubroName}
                    onChange={(e) => {
                      const rValue = e.target.value;
                      const [rName, rComm] = rValue.split('|');
                      const commission = rComm ? (parseFloat(rComm) / 100) : 0;
                      
                      const baseUsd = parseFloat(cxcData.grossAmountUsd) || parseFloat(cxcData.amountUsd) || 0;
                      const finalUsd = baseUsd * (1 - commission);
                      const finalBs = finalUsd * (parseFloat(cxcData.exchangeRate) || 1);
                      
                      setCxcData({
                        ...cxcData,
                        rubroName: rValue,
                        amountUsd: finalUsd.toFixed(2),
                        amountBs: finalBs.toFixed(2)
                      });
                    }}
                    className="input-field pl-10 cursor-pointer disabled:bg-slate-50 disabled:text-slate-400 text-sm"
                    disabled={!cxcData.sellerId}
                  >
                    <option value="">Sin Comisión / Ninguno</option>
                    {sellers.find(s => s.id === cxcData.sellerId)?.rubros?.map((r, index) => {
                      const optVal = `${r.name}|${r.commissionPercentage}`;
                      return (
                        <option key={`${r.name}-${r.commissionPercentage}-${index}`} value={optVal}>
                          {r.name} ({r.commissionPercentage}%)
                        </option>
                      );
                    })}
                  </select>
                </div>
                {!cxcData.sellerId && <p className="text-[10px] text-amber-600 font-bold mt-1">Seleccione un vendedor para ver sus rubros.</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label">Monto Bruto (USD)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                      type="number" 
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={cxcData.grossAmountUsd}
                      onChange={(e) => {
                        const usd = parseFloat(e.target.value) || 0;
                        const [rName, rComm] = cxcData.rubroName.split('|');
                        const commission = rComm ? (parseFloat(rComm) / 100) : 0;
                        
                        const finalUsd = usd * (1 - commission);
                        const finalBs = finalUsd * (parseFloat(cxcData.exchangeRate) || 1);
                        setCxcData({
                          ...cxcData, 
                          grossAmountUsd: e.target.value,
                          amountUsd: finalUsd.toFixed(2), 
                          amountBs: finalBs.toFixed(2)
                        });
                      }}
                      className="input-field pl-10 font-bold" 
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Monto antes de comisión.</p>
                </div>

                <div className="space-y-1">
                  <label className="label text-blue-600 font-bold">Monto Neto CXC (USD)</label>
                  <div className="input-field bg-blue-50 text-blue-700 font-bold border-dashed flex items-center justify-between h-[38px] px-3">
                    <span>{formatCurrency(parseFloat(cxcData.amountUsd) || 0)}</span>
                    {cxcData.sellerId && (
                      <span className="text-[10px] bg-blue-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Percent size={10} /> {(() => {
                          const rComm = cxcData.rubroName.includes('|') ? cxcData.rubroName.split('|')[1] : '0';
                          return rComm;
                        })()}% Comis.
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">Monto neto a registrar.</p>
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowCXCModal(false)} className="px-5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-medium transition-colors text-sm">
                  Cancelar
                </button>
                <button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-xl transition-all shadow-sm text-sm">
                  Registrar Cargo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
