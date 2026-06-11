import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { TransactionType, PaymentMethod } from '../types';
import { 
  Plus, 
  Minus, 
  X, 
  Calendar, 
  DollarSign, 
  Tag, 
  User, 
  Loader2, 
  CheckCircle2, 
  Building,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { format } from 'date-fns';

interface QuickActionFABProps {
  exchangeRate?: number;
}

const COMMON_BANKS = [
  'EFECTIVO',
  'BANCO VENEZOLANO DE CREDITO',
  'BANESCO',
  'VENEZUELA',
  'PROVINCIAL',
  'MERCANTIL',
  'BNC',
  'BANCO DEL TESORO'
];

export default function QuickActionFAB({ exchangeRate = 1 }: QuickActionFABProps) {
  const [isOpen, setIsOpen] = useState(false); // Menu toggle
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'ingreso' | 'egreso'>('ingreso');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fetchingRate, setFetchingRate] = useState(false);

  // Form State
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rate, setRate] = useState(exchangeRate?.toString() || '1');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('INGRESO');
  const [paymentMethod, setPaymentMethod] = useState<string>(PaymentMethod.BS_CASH);
  
  // Specific to Ingreso
  const [destinationBank, setDestinationBank] = useState('');
  
  // Specific to Egreso
  const [recipient, setRecipient] = useState('');

  // Fetch historical rate when date changes
  useEffect(() => {
    const fetchRate = async (dateStr: string) => {
      if (!dateStr || !showModal) return;
      setFetchingRate(true);
      try {
        const historicalRate = await dbService.getExchangeRateForDate(dateStr);
        if (historicalRate) {
          setRate(historicalRate.toString());
        } else if (exchangeRate !== undefined) {
          setRate(exchangeRate.toString());
        }
      } catch (err) {
        console.error('Error fetching rate for quick action:', err);
      } finally {
        setFetchingRate(false);
      }
    };
    fetchRate(date);
  }, [date, showModal, exchangeRate]);

  // Adjust defaults depending on active fields
  useEffect(() => {
    if (activeTab === 'ingreso') {
      setConcept('INGRESO');
      setPaymentMethod(PaymentMethod.BS_CASH);
      setDestinationBank('EFECTIVO');
    } else {
      setConcept('RETIRO EN EFECTIVO');
      setPaymentMethod(PaymentMethod.USD_CASH);
    }
  }, [activeTab]);

  const openForm = (tab: 'ingreso' | 'egreso') => {
    setActiveTab(tab);
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setAmount('');
    setRecipient('');
    setSuccess(false);
    setShowModal(true);
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputAmt = parseFloat(amount) || 0;
    if (inputAmt <= 0) return;

    setLoading(true);
    try {
      if (activeTab === 'ingreso') {
        // Ingreso Save Logic
        const inBolivares = paymentMethod === PaymentMethod.BS || paymentMethod === PaymentMethod.BS_CASH;
        const rateValue = parseFloat(rate) || 1;

        const destClean = (destinationBank || '').trim().toUpperCase();
        const isCashDest = destClean.includes('EFECTIVO') || destClean.includes('CAJA');
        const isBankDest = destClean.length > 0 && !isCashDest;

        const amountUsdConv = inBolivares ? inputAmt / rateValue : 0;
        const amountBs = inBolivares ? inputAmt : 0;
        const totalDailySale = inBolivares ? amountUsdConv : inputAmt;

        const currentUsdCash = (paymentMethod === PaymentMethod.USD_CASH && isCashDest) || (paymentMethod === PaymentMethod.USD_CASH && !isBankDest) ? inputAmt : 0;
        const currentZelle = (paymentMethod === PaymentMethod.ZELLE || paymentMethod === PaymentMethod.BINANCE || isBankDest) && !isCashDest ? (inBolivares ? 0 : inputAmt) : 0;

        await dbService.addTransaction({
          date: date,
          clientName: 'CUADRE DIARIO',
          concept: concept.trim() || 'INGRESO',
          amountBs: amountBs,
          exchangeRate: rateValue,
          amountUsd: totalDailySale,
          paymentMethod: paymentMethod as PaymentMethod,
          type: TransactionType.SALE,
          isCXC: false,
          amountUsdCash: currentUsdCash,
          amountZelle: currentZelle,
          amountCXC: 0,
          totalDailySale: totalDailySale,
          currency: inBolivares ? 'Bolívares (BS)' : 'Dólares ($)',
          destinationBank: destinationBank.trim().toUpperCase()
        });

      } else {
        // Egreso Save Logic
        const inBolivares = paymentMethod === PaymentMethod.BS || paymentMethod === PaymentMethod.BS_CASH;
        const rateValue = parseFloat(rate) || 1;

        const amountUsdConv = inBolivares ? inputAmt / rateValue : 0;
        const amountBs = inBolivares ? inputAmt : 0;
        const totalPaymentUsd = inBolivares ? amountUsdConv : inputAmt;

        // Fetch receipts to get transaction sequencing
        const receiptsSnapshot = await dbService.getReceipts();
        const nextNum = ((receiptsSnapshot?.length || 0) + 1).toString().padStart(5, '0');

        await dbService.addReceipt({
          receiptNumber: nextNum,
          recipient: recipient.trim() || 'COBROS VARIOS',
          amountUsd: totalPaymentUsd,
          amountBs: amountBs > 0 ? amountBs : null,
          paymentMethod: paymentMethod,
          exchangeRate: rateValue,
          concept: concept.trim() || 'RETIRO EN EFECTIVO',
          date: date,
        });
      }

      setSuccess(true);
      setTimeout(() => {
        setShowModal(false);
        setSuccess(false);
        setAmount('');
        setRecipient('');
      }, 1500);
    } catch (err) {
      console.error('Error saving quick action:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Menu overlay / triggers */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 font-sans">
        {isOpen && (
          <div className="flex flex-col items-end gap-2.5 mb-2 animate-in fade-in slide-in-from-bottom-6 duration-200">
            {/* Quick Income Button */}
            <button
              id="fab-ingreso-btn"
              onClick={() => openForm('ingreso')}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-full shadow-lg transition-transform hover:scale-105"
            >
              <div className="bg-white/20 p-1 rounded-full text-white">
                <ArrowUpRight size={14} />
              </div>
              <span>Registrar Ingreso</span>
            </button>

            {/* Quick Expense Button */}
            <button
              id="fab-egreso-btn"
              onClick={() => openForm('egreso')}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-3 rounded-full shadow-lg transition-transform hover:scale-105"
            >
              <div className="bg-white/20 p-1 rounded-full text-white">
                <ArrowDownRight size={14} />
              </div>
              <span>Registrar Egreso</span>
            </button>
          </div>
        )}

        {/* Main Floating Action Button */}
        <button
          id="fab-main-trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Acciones rápidas"
          className={`flex items-center justify-center w-14 h-14 rounded-full text-white shadow-2xl transition-all duration-300 transform hover:scale-110 ${
            isOpen ? 'bg-slate-900 rotate-45' : 'bg-blue-600 hover:bg-blue-700 animate-pulse'
          }`}
        >
          <Plus size={28} className="transition-transform duration-200" />
        </button>
      </div>

      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-transparent z-30 cursor-default"
        />
      )}

      {/* Quick Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => !loading && setShowModal(false)}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden relative z-10 animate-in zoom-in-95 duration-200">
            {/* Header Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50/50">
              <button
                id="modal-quick-tab-ingreso"
                type="button"
                onClick={() => !loading && setActiveTab('ingreso')}
                className={`flex-1 py-4 text-center font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'ingreso' 
                    ? 'bg-white border-b-2 border-emerald-600 text-emerald-600' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <ArrowUpRight size={16} />
                <span>Registrar Ingreso</span>
              </button>
              <button
                id="modal-quick-tab-egreso"
                type="button"
                onClick={() => !loading && setActiveTab('egreso')}
                className={`flex-1 py-4 text-center font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'egreso' 
                    ? 'bg-white border-b-2 border-rose-600 text-rose-600' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <ArrowDownRight size={16} />
                <span>Registrar Egreso</span>
              </button>
            </div>

            {/* Modal Body */}
            {success ? (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-3 min-h-[350px]">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center animate-bounce">
                  <CheckCircle2 size={36} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-base">¡Registro Exitoso!</h4>
                  <p className="text-xs text-slate-500 mt-1">El movimiento ha sido agregado a la base de datos en tiempo real.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Close Button */}
                <button
                  type="button"
                  id="modal-quick-close-btn"
                  onClick={() => setShowModal(false)}
                  disabled={loading}
                  className="absolute top-3.5 right-3.5 p-1 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                >
                  <X size={18} />
                </button>

                {/* Amount field - prominent */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monto</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-400 font-bold text-sm">
                      {paymentMethod === PaymentMethod.BS_CASH || paymentMethod === PaymentMethod.BS ? 'Bs' : '$'}
                    </span>
                    <input
                      id="quick-monto-input"
                      type="number"
                      step="any"
                      required
                      placeholder="0.00"
                      value={amount}
                      disabled={loading}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono font-bold text-base outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Grid for Date and Exchange Rate */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <Calendar size={11} /> <span>Fecha</span>
                    </label>
                    <input
                      id="quick-fecha-input"
                      type="date"
                      required
                      value={date}
                      disabled={loading}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <DollarSign size={11} /> <span>Tasa (Bs)</span>
                    </label>
                    <div className="relative">
                      <input
                        id="quick-tasa-input"
                        type="number"
                        step="any"
                        required
                        value={rate}
                        disabled={loading || fetchingRate}
                        onChange={(e) => setRate(e.target.value)}
                        className={`w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-mono font-bold outline-none ${fetchingRate ? 'opacity-50' : ''}`}
                      />
                      {fetchingRate && (
                        <div className="absolute right-2.5 top-2.5">
                          <Loader2 size={12} className="animate-spin text-slate-400" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Specific to Egreso: Recipient */}
                {activeTab === 'egreso' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <User size={11} /> <span>Persona / Beneficiario</span>
                    </label>
                    <input
                      id="quick-recipient-input"
                      type="text"
                      required={activeTab === 'egreso'}
                      placeholder="Ej: Abastecimiento, Nombre Personal, etc."
                      value={recipient}
                      disabled={loading}
                      onChange={(e) => setRecipient(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase"
                    />
                  </div>
                )}

                {/* Payment Method Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Método de Pago</label>
                  <select
                    id="quick-payment-method"
                    value={paymentMethod}
                    disabled={loading}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium outline-none"
                  >
                    {activeTab === 'ingreso' ? (
                      <>
                        <option value={PaymentMethod.BS_CASH}>Bs (Efectivo Bolívares)</option>
                        <option value={PaymentMethod.USD_CASH}>$ (Efectivo Dólares)</option>
                        <option value={PaymentMethod.BS}>Transferencia Bs / Pago Móvil</option>
                        <option value={PaymentMethod.ZELLE}>Zelle</option>
                        <option value={PaymentMethod.BINANCE}>Binance</option>
                      </>
                    ) : (
                      <>
                        <option value={PaymentMethod.USD_CASH}>$ (Efectivo Dólares)</option>
                        <option value={PaymentMethod.BS_CASH}>Bs (Efectivo Bolívares)</option>
                        <option value={PaymentMethod.BS}>Transferencia Bs</option>
                        <option value={PaymentMethod.ZELLE}>Zelle</option>
                        <option value={PaymentMethod.BINANCE}>Binance</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Specific to Ingreso: Destination Bank */}
                {activeTab === 'ingreso' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <Building size={11} /> <span>Banco / Destino</span>
                    </label>
                    <select
                      id="quick-destination-bank"
                      value={destinationBank}
                      disabled={loading}
                      onChange={(e) => setDestinationBank(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium outline-none"
                    >
                      {COMMON_BANKS.map((bank) => (
                        <option key={bank} value={bank}>{bank}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Concept/Note */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <Tag size={11} /> <span>Concepto / Descripción</span>
                  </label>
                  <input
                    id="quick-concept-input"
                    type="text"
                    required
                    placeholder="Ej: Insumos de papelería, venta directa, etc."
                    value={concept}
                    disabled={loading}
                    onChange={(e) => setConcept(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase"
                  />
                </div>

                {/* Equivalent Conversion Guide (Helper) */}
                {parseFloat(amount) > 0 && (
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl text-center">
                    <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Conversión Equivalente</span>
                    <span className="text-sm font-extrabold text-slate-700 mt-0.5 block font-mono">
                      {paymentMethod === PaymentMethod.BS_CASH || paymentMethod === PaymentMethod.BS ? (
                        `USD $${((parseFloat(amount) || 0) / (parseFloat(rate) || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      ) : (
                        `Bs ${((parseFloat(amount) || 0) * (parseFloat(rate) || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      )}
                    </span>
                  </div>
                )}

                {/* Submit Action */}
                <button
                  type="submit"
                  id="quick-submit-action"
                  disabled={loading || !amount || parseFloat(amount) <= 0}
                  className={`w-full font-bold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md ${
                    activeTab === 'ingreso'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-300'
                      : 'bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-300'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <span>
                      {activeTab === 'ingreso' ? 'Registrar Ingreso de Caja' : 'Registrar Egreso de Caja'}
                    </span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
