import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { CashClosure, TransactionType, PaymentMethod, Transaction, Expense, Receipt } from '../types';
import { formatCurrency } from '../lib/utils';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Lock, Unlock, AlertTriangle, Search, Save, CheckCircle, Activity, DollarSign } from 'lucide-react';

export default function IncomesCierre({ exchangeRate }: { exchangeRate?: number }) {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  
  const [unlockKey, setUnlockKey] = useState('');
  const [unlockError, setUnlockError] = useState('');

  // Physical count state
  const [actualUsd, setActualUsd] = useState('0');
  const [actualBs, setActualBs] = useState('0');
  const [observations, setObservations] = useState('');

  useEffect(() => {
    const unsub1 = dbService.subscribeToCashClosures(setClosures);
    const unsub2 = dbService.subscribeToTransactions(setTransactions);
    const unsub3 = dbService.subscribeToExpenses(setExpenses);
    const unsub4 = dbService.subscribeToReceipts(setReceipts);
    return () => {
      unsub1(); unsub2(); unsub3(); unsub4();
    };
  }, []);

  const currentClosure = closures.find(c => c.date === selectedDate);
  const isClosed = currentClosure?.isClosed || false;

  // Compute daily totals
  const dailyTransactions = transactions.filter(t => t.date === selectedDate && t.type !== TransactionType.WITHDRAWAL);
  const dailyExpenses = expenses.filter(e => e.date === selectedDate);
  const dailyReceipts = receipts.filter(r => r.date === selectedDate);

  let incomesUsd = 0;
  let incomesBs = 0;
  dailyTransactions.forEach(t => {
     let cashUsdAmount = 0;
     let cashBsAmount = 0;

     const dest = (t.destinationBank || '').toUpperCase();
     const isCashByName = dest.includes('EFECTIVO') || dest.includes('CAJA');

     // USD Efectivo
     if (t.amountUsdCash !== undefined && t.amountUsdCash > 0) {
          cashUsdAmount += Number(t.amountUsdCash);
     } else if (isCashByName || t.paymentMethod === PaymentMethod.USD_CASH || t.paymentMethod === 'Dolares Efectivo' || t.paymentMethod === '$ Efectivo') {
          cashUsdAmount += Number(t.amountUsd) || 0;
     }

     // BS Efectivo
     if (t.amountBs !== undefined && t.amountBs > 0) {
          if (isCashByName || t.paymentMethod === PaymentMethod.BS_CASH || t.paymentMethod === 'Bolivares Efectivo' || t.paymentMethod === 'Bs Efectivo') {
               cashBsAmount += Number(t.amountBs);
          }
     } else if (t.paymentMethod === PaymentMethod.BS_CASH || t.paymentMethod === 'Bolivares Efectivo' || t.paymentMethod === 'Bs Efectivo') {
          cashBsAmount += (Number(t.amountUsd) || 0) * (Number(t.exchangeRate) || exchangeRate || 1);
     }

     incomesUsd += cashUsdAmount;
     incomesBs += cashBsAmount;
  });

  let expUsd = 0;
  let expBs = 0;
  dailyExpenses.forEach(e => {
      const isBs = e.paymentMethod === PaymentMethod.BS_CASH || e.paymentMethod === PaymentMethod.BS;
      if (isBs) {
         expBs += Number(e.amountBs) || (Number(e.amountUsd) * (Number(e.exchangeRate) || exchangeRate || 1));
      } else {
         expUsd += Number(e.amountUsd) || 0;
      }
  });

  let withUsd = 0;
  let withBs = 0;
  dailyReceipts.forEach(r => {
      const isBs = r.paymentMethod === PaymentMethod.BS_CASH || r.paymentMethod === PaymentMethod.BS;
      if (isBs) {
         withBs += Number(r.amountBs) || (Number(r.amountUsd) * (Number(r.exchangeRate) || exchangeRate || 1));
      } else {
         withUsd += Number(r.amountUsd) || 0;
      }
  });

  // Expected balances. For simplicity, initial balance is 0 for the day. Can be enhanced to fetch previous day's actual balance.
  const previousClosure = closures.find(c => c.date < selectedDate && c.isClosed);
  const initialUsd = previousClosure?.actualBalanceUsd || 0;
  const initialBs = previousClosure?.actualBalanceBs || 0;

  const expectedUsd = initialUsd + incomesUsd - expUsd - withUsd;
  const expectedBs = initialBs + incomesBs - expBs - withBs;

  // When physical inputs change
  const actUsd = parseFloat(actualUsd) || 0;
  const actBs = parseFloat(actualBs) || 0;
  const diffUsd = actUsd - expectedUsd;
  const diffBs = actBs - expectedBs;

  const [isClosing, setIsClosing] = useState(false);

  const handleCloseRegister = async () => {
    setIsClosing(true);
    try {
      const data: Omit<CashClosure, 'id' | 'createdAt'> = {
        date: selectedDate,
        initialBalanceUsd: initialUsd,
        initialBalanceBs: initialBs,
        incomesUsd,
        incomesBs,
        expensesUsd: expUsd,
        expensesBs: expBs,
        withdrawalsUsd: withUsd,
        withdrawalsBs: withBs,
        expectedBalanceUsd: expectedUsd,
        expectedBalanceBs: expectedBs,
        actualBalanceUsd: actUsd,
        actualBalanceBs: actBs,
        differenceUsd: diffUsd,
        differenceBs: diffBs,
        observations: observations,
        isClosed: true,
        closedAt: new Date(),
      };

      if (currentClosure?.id) {
         await dbService.updateCashClosure(currentClosure.id, { ...data, isClosed: true, closedAt: new Date() });
      } else {
         await dbService.addCashClosure(data);
      }
      
      setObservations('');
      setActualUsd('0');
      setActualBs('0');
    } catch (e) {
      console.error(e);
      alert('Error cerrando caja: ' + String(e));
    } finally {
      setIsClosing(false);
    }
  };

  const handleUnlock = async () => {
     if (unlockKey === 'admin123') {
        if (currentClosure?.id) {
            await dbService.updateCashClosure(currentClosure.id, { isClosed: false });
        }
        setUnlockKey('');
        setUnlockError('');
     } else {
        setUnlockError('Llave digital incorrecta.');
     }
  };

  // Pre-fill actual inputs if there is a current closure
  useEffect(() => {
     if (currentClosure) {
        setActualUsd(currentClosure.actualBalanceUsd.toString());
        setActualBs(currentClosure.actualBalanceBs.toString());
        setObservations(currentClosure.observations || '');
     } else {
        setActualUsd('0');
        setActualBs('0');
        setObservations('');
     }
  }, [currentClosure, selectedDate]);


  const getDayName = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    if (!isValid(date)) return '';
    return format(date, 'EEEE d MMMM, yyyy', { locale: es });
  };

  const formatBs = (amt: number) => {
     return 'Bs ' + new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amt);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Cierre de Caja</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Cuadre diario de efectivo e impresión de histórico.</p>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="flex bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm">
                <Calendar size={16} className="text-slate-400 shrink-0 ml-2 mt-auto mb-auto mr-2" />
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Fecha de Cierre</label>
                  <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent text-sm font-medium text-slate-900 outline-none cursor-pointer"
                  />
                </div>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
               <h3 className="text-lg font-black text-slate-900 capitalize">{getDayName(selectedDate)}</h3>
               <div className="flex items-center gap-2 mt-1">
                 <div className={`w-2 h-2 rounded-full ${isClosed ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                 <span className={`text-xs font-bold uppercase tracking-widest ${isClosed ? 'text-rose-600' : 'text-emerald-600'}`}>
                   {isClosed ? 'Caja Cerrada' : 'Caja Abierta'}
                 </span>
               </div>
            </div>
         </div>

         <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Movimientos del Sistema */}
            <div className="space-y-6 relative">
                {isClosed && (
                   <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                      <div className="bg-white p-6 rounded-2xl shadow-xl border border-rose-100 flex flex-col items-center max-w-sm w-full text-center">
                         <Lock size={48} className="text-rose-500 mb-4" strokeWidth={1.5} />
                         <h4 className="text-xl font-bold text-slate-900 mb-2">Caja Bloqueada</h4>
                         <p className="text-sm text-slate-500 mb-6">El cierre de este día ya fue emitido y asegurado.</p>
                         
                         <label className="text-sm font-bold text-slate-700 w-full text-left mb-1">Llave Digital de Desbloqueo</label>
                         <input 
                            type="password"
                            value={unlockKey}
                            onChange={(e) => setUnlockKey(e.target.value)}
                            placeholder="Ingrese su PIN..."
                            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none text-slate-900 w-full mb-3"
                         />
                         {unlockError && <span className="text-xs text-rose-500 w-full text-left font-semibold mb-3">{unlockError}</span>}
                         
                         <button 
                            onClick={handleUnlock}
                            className="bg-slate-900 text-white rounded-xl px-4 py-3 font-semibold text-sm hover:bg-slate-800 transition-colors w-full flex justify-center items-center gap-2"
                         >
                            <Unlock size={16} /> <span>Desbloquear Caja</span>
                         </button>
                      </div>
                   </div>
                )}
                
                <div>
                   <h4 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2"><Activity size={16} /> Movimientos del Sistema</h4>
                   
                   <div className="space-y-6">
                      {/* CAJA USD */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                         <div className="bg-slate-100/50 px-4 py-2 border-b border-slate-200">
                             <h5 className="text-xs font-bold text-slate-700 tracking-widest uppercase flex items-center gap-2"><DollarSign size={14} className="text-emerald-600"/> Caja Efectivo USD</h5>
                         </div>
                         <div className="p-3 space-y-2">
                             <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-500">Saldo Inicial</span>
                                <span className="font-bold text-slate-900">{formatCurrency(initialUsd)}</span>
                             </div>
                             <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-emerald-600">Ingresos</span>
                                <span className="font-bold text-emerald-600">+{formatCurrency(incomesUsd)}</span>
                             </div>
                             <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-rose-600">Egresos / Gastos</span>
                                <span className="font-bold text-rose-600">-{formatCurrency(expUsd)}</span>
                             </div>
                             <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-amber-600">Vales / Retiros</span>
                                <span className="font-bold text-amber-600">-{formatCurrency(withUsd)}</span>
                             </div>
                             <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                                <span className="text-sm font-black text-slate-800">Saldo Esperado USD</span>
                                <span className="text-lg font-black text-emerald-600">{formatCurrency(expectedUsd)}</span>
                             </div>
                         </div>
                      </div>

                      {/* CAJA BS */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                         <div className="bg-slate-100/50 px-4 py-2 border-b border-slate-200">
                             <h5 className="text-xs font-bold text-slate-700 tracking-widest uppercase flex items-center gap-2"><div className="font-bold font-serif text-blue-600 bg-blue-100 rounded-sm px-1 text-[10px]">Bs</div> Caja Efectivo Bolívares</h5>
                         </div>
                         <div className="p-3 space-y-2">
                             <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-500">Saldo Inicial</span>
                                <span className="font-bold text-slate-900">{formatBs(initialBs)}</span>
                             </div>
                             <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-emerald-600">Ingresos</span>
                                <span className="font-bold text-emerald-600">+{formatBs(incomesBs)}</span>
                             </div>
                             <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-rose-600">Egresos / Gastos</span>
                                <span className="font-bold text-rose-600">-{formatBs(expBs)}</span>
                             </div>
                             <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-amber-600">Vales / Retiros</span>
                                <span className="font-bold text-amber-600">-{formatBs(withBs)}</span>
                             </div>
                             <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                                <span className="text-sm font-black text-slate-800">Saldo Esperado BS</span>
                                <span className="text-sm font-black text-blue-600">{formatBs(expectedBs)}</span>
                             </div>
                         </div>
                      </div>
                   </div>
                </div>
            </div>

            {/* Cuadre Físico */}
            <div>
               <h4 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2"><CheckCircle size={16} /> Verificación Física (Conteo)</h4>
               
               <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-600 uppercase mb-2 block">Efectivo Físico USD ($)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-3.5 text-slate-400" size={16} />
                          <input 
                              type="number"
                              disabled={isClosed}
                              value={actualUsd}
                              onChange={(e) => setActualUsd(e.target.value)}
                              className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-all disabled:opacity-75 disabled:bg-slate-100"
                              placeholder="0.00"
                              min="0"
                              step="0.01"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 uppercase mb-2 block">Efectivo Físico BS</label>
                        <div className="relative">
                          <span className="absolute left-3 top-3.5 text-slate-400 font-bold text-xs mt-0.5">Bs</span>
                          <input 
                              type="number"
                              disabled={isClosed}
                              value={actualBs}
                              onChange={(e) => setActualBs(e.target.value)}
                              className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-all disabled:opacity-75 disabled:bg-slate-100"
                              placeholder="0.00"
                              min="0"
                              step="0.01"
                          />
                        </div>
                      </div>
                  </div>

                  <div className="flex space-x-4">
                     <div className={`p-4 flex-1 rounded-xl border ${diffUsd === 0 ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800' : diffUsd > 0 ? 'bg-blue-50/50 border-blue-200 text-blue-800' : 'bg-red-50/50 border-red-200 text-red-800'}`}>
                        <span className="text-[10px] font-bold uppercase tracking-widest block mb-1 opacity-70">
                           {diffUsd === 0 ? 'Cuadre USD Correcto' : diffUsd > 0 ? 'Sobrante USD' : 'Faltante USD'}
                        </span>
                        <span className="text-lg font-black">{formatCurrency(Math.abs(diffUsd))}</span>
                     </div>
                     <div className={`p-4 flex-1 rounded-xl border ${diffBs === 0 ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800' : diffBs > 0 ? 'bg-blue-50/50 border-blue-200 text-blue-800' : 'bg-red-50/50 border-red-200 text-red-800'}`}>
                        <span className="text-[10px] font-bold uppercase tracking-widest block mb-1 opacity-70">
                           {diffBs === 0 ? 'Cuadre BS Correcto' : diffBs > 0 ? 'Sobrante BS' : 'Faltante BS'}
                        </span>
                        <span className="text-lg font-black">{formatBs(Math.abs(diffBs))}</span>
                     </div>
                  </div>

                  <div>
                     <label className="text-xs font-bold text-slate-600 uppercase mb-2 block">Observaciones Generales</label>
                     <textarea 
                        disabled={isClosed}
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                        className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white min-h-[100px] resize-none disabled:opacity-75 disabled:bg-slate-100"
                        placeholder="Justificación de faltantes/sobrantes, notas del cajero..."
                     ></textarea>
                  </div>

                  {!isClosed && (
                     <button 
                        onClick={handleCloseRegister}
                        disabled={isClosing}
                        className="w-full bg-blue-600 text-white rounded-xl py-4 font-bold text-sm uppercase tracking-widest hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-blue-600/30 disabled:opacity-70 disabled:cursor-not-allowed"
                     >
                        <Save size={18} />
                        {isClosing ? 'Cerrando y Asegurando...' : 'Cerrar y Asegurar Caja'}
                     </button>
                  )}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
