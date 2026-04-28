import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { type CXCAccount, type CXCPayment } from '../types';
import { User, DollarSign, History, ChevronRight, Plus, Calendar, Tag } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function CXCAccounts() {
  const [accounts, setAccounts] = useState<CXCAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<CXCAccount | null>(null);
  const [payments, setPayments] = useState<CXCPayment[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amountUsd: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    concept: '',
  });

  useEffect(() => {
    return dbService.subscribeToCXCAccounts(setAccounts);
  }, []);

  useEffect(() => {
    if (selectedAccount?.id) {
      dbService.getCXCPayments(selectedAccount.id).then(pays => setPayments(pays || []));
    }
  }, [selectedAccount]);

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount?.id) return;

    await dbService.addCXCPayment(selectedAccount.id, {
      amountUsd: parseFloat(paymentData.amountUsd),
      date: paymentData.date,
      concept: paymentData.concept,
    });

    // Refresh payments list
    const pays = await dbService.getCXCPayments(selectedAccount.id);
    setPayments(pays || []);
    
    setShowPaymentForm(false);
    setPaymentData({
      amountUsd: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      concept: '',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Accounts List */}
      <div className="lg:col-span-1 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Clientes CXC</h2>
        </div>
        <div className="card max-h-[calc(100vh-200px)] overflow-y-auto">
          {accounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setSelectedAccount(acc)}
              className={`w-full text-left p-4 border-b border-slate-100 transition-colors flex items-center justify-between hover:bg-slate-50 ${
                selectedAccount?.id === acc.id ? 'bg-blue-50/50 border-r-4 border-r-blue-600' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold uppercase transition-transform hover:scale-110">
                  {acc.clientName.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{acc.clientName}</p>
                  <p className="text-xs text-slate-500">Saldo pendiente</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-bold ${acc.totalBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {formatCurrency(acc.totalBalance)}
                </p>
                <ChevronRight size={16} className="text-slate-300 ml-auto" />
              </div>
            </button>
          ))}
          {accounts.length === 0 && (
            <div className="p-8 text-center text-slate-500 italic">No hay cuentas CXC activas.</div>
          )}
        </div>
      </div>

      {/* Account Details */}
      <div className="lg:col-span-2 space-y-6">
        {selectedAccount ? (
          <>
            <div className="card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">{selectedAccount.clientName}</h3>
                <p className="text-slate-500 flex items-center gap-2 mt-1">
                  <User size={14} /> ID Cliente: {selectedAccount.id}
                </p>
              </div>
              <div className="bg-slate-50 px-6 py-4 rounded-xl border border-slate-100 text-center md:text-right">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Saldo de la Cuenta</p>
                <p className={`text-3xl font-extrabold ${selectedAccount.totalBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {formatCurrency(selectedAccount.totalBalance)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h4 className="font-bold flex items-center gap-2">
                <History size={18} className="text-blue-600" /> Historial de Pagos
              </h4>
              <button 
                onClick={() => setShowPaymentForm(!showPaymentForm)}
                className="btn-primary text-sm px-3 py-1.5"
              >
                <Plus size={16} /> Registrar Pago
              </button>
            </div>

            {showPaymentForm && (
              <div className="card p-6 bg-emerald-50/30 border-emerald-100">
                <form onSubmit={handleAddPayment} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="label">Monto a Pagar (USD)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input 
                        type="number" 
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={paymentData.amountUsd}
                        onChange={(e) => setPaymentData({...paymentData, amountUsd: e.target.value})}
                        className="input-field pl-10" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="label">Fecha</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input 
                        type="date" 
                        required
                        value={paymentData.date}
                        onChange={(e) => setPaymentData({...paymentData, date: e.target.value})}
                        className="input-field pl-10" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="label">Concepto / Nota</label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Nota del pago"
                        value={paymentData.concept}
                        onChange={(e) => setPaymentData({...paymentData, concept: e.target.value})}
                        className="input-field pl-10" 
                      />
                    </div>
                  </div>
                  <div className="md:col-span-3 flex justify-end gap-3">
                    <button type="button" onClick={() => setShowPaymentForm(false)} className="px-4 py-2 text-slate-600 font-medium">Cancelar</button>
                    <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-6 rounded-lg transition-colors">Guardar Pago</button>
                  </div>
                </form>
              </div>
            )}

            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Fecha</th>
                    <th className="table-header">Concepto</th>
                    <th className="table-header text-right">Monto USD</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="table-cell">{p.date}</td>
                      <td className="table-cell text-slate-600">{p.concept || '-'}</td>
                      <td className="table-cell text-right font-bold text-emerald-600">-{formatCurrency(p.amountUsd)}</td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={3} className="table-cell text-center py-10 text-slate-400 italic">No hay pagos registrados para este cliente.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl p-12">
            <User size={64} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">Selecciona un cliente para ver detalles</p>
            <p className="text-sm">Podrás ver su balance y registrar abonos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
