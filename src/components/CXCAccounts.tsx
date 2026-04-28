import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { type CXCAccount, type CXCPayment } from '../types';
import { User, DollarSign, History, ChevronRight, Plus, Calendar, Tag, AlertTriangle, CheckCircle, CircleDollarSign, Search } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function CXCAccounts() {
  const [accounts, setAccounts] = useState<CXCAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<CXCAccount | null>(null);
  const [payments, setPayments] = useState<CXCPayment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amountUsd: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    concept: '',
  });

  useEffect(() => {
    return dbService.subscribeToCXCAccounts(setAccounts);
  }, []);

  const getUrgencyStyles = (balance: number) => {
    if (balance === 0) return { 
      bg: 'bg-emerald-50 text-emerald-700', 
      border: 'border-emerald-100', 
      dot: 'bg-emerald-500',
      icon: <CheckCircle size={14} className="text-emerald-500" />,
      label: 'Al día'
    };
    if (balance < 50) return { 
      bg: 'bg-amber-50 text-amber-700', 
      border: 'border-amber-100', 
      dot: 'bg-amber-500',
      icon: <CircleDollarSign size={14} className="text-amber-500" />,
      label: 'Bajo'
    };
    if (balance < 200) return { 
      bg: 'bg-orange-50 text-orange-700', 
      border: 'border-orange-100', 
      dot: 'bg-orange-500',
      icon: <AlertTriangle size={14} className="text-orange-500" />,
      label: 'Moderado'
    };
    return { 
      bg: 'bg-rose-50 text-rose-700', 
      border: 'border-rose-100', 
      dot: 'bg-rose-500',
      icon: <AlertTriangle size={14} className="text-rose-500" />,
      label: 'Alto Riesgo'
    };
  };

  const filteredAccounts = accounts.filter(acc => 
    acc.clientName.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => b.totalBalance - a.totalBalance);

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
      <div className="lg:col-span-1 flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Clientes CXC</h2>
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase">
              {filteredAccounts.length} Total
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar cliente..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
          {filteredAccounts.map((acc) => {
            const urgency = getUrgencyStyles(acc.totalBalance);
            const isSelected = selectedAccount?.id === acc.id;
            
            return (
              <button
                key={acc.id}
                onClick={() => setSelectedAccount(acc)}
                className={`w-full text-left p-4 transition-all group relative overflow-hidden ${
                  isSelected ? 'bg-blue-50/30' : 'hover:bg-slate-50'
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full" />
                )}
                
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black uppercase transition-all shadow-sm ${
                    isSelected ? 'bg-blue-600 text-white rotate-3' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:shadow group-hover:-rotate-3'
                  }`}>
                    {acc.clientName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold truncate text-sm tracking-tight ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                      {acc.clientName}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1 ${urgency.bg}`}>
                        {urgency.icon}
                        {urgency.label}
                      </span>
                    </div>
                  </div>
                  <div className="text-right pl-2">
                    <p className={`text-sm font-black tracking-tighter ${
                      acc.totalBalance > 200 ? 'text-rose-600' : 
                      acc.totalBalance > 50 ? 'text-orange-600' : 
                      acc.totalBalance > 0 ? 'text-amber-600' : 
                      'text-emerald-600'
                    }`}>
                      {formatCurrency(acc.totalBalance)}
                    </p>
                    <ChevronRight size={14} className={`ml-auto mt-1 transition-transform ${
                      isSelected ? 'text-blue-400 translate-x-1' : 'text-slate-300'
                    }`} />
                  </div>
                </div>
              </button>
            );
          })}
          {filteredAccounts.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Search className="text-slate-300" size={24} />
              </div>
              <p className="text-slate-400 text-sm italic">No se encontraron clientes.</p>
            </div>
          )}
        </div>
      </div>

      {/* Account Details */}
      <div className="lg:col-span-2 space-y-6">
        {selectedAccount ? (
          <>
            <div className="card p-0 overflow-hidden bg-white border-slate-200 shadow-xl">
              <div className="bg-slate-900 p-8 text-white relative isolate">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <CircleDollarSign size={160} />
                </div>
                
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-2xl font-black shadow-lg shadow-blue-500/20">
                        {selectedAccount.clientName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-3xl font-black tracking-tighter">{selectedAccount.clientName}</h3>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mt-1">
                          <User size={12} className="text-blue-400" /> ID: {selectedAccount.id}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-left md:text-right bg-white/5 backdrop-blur px-6 py-4 rounded-2xl border border-white/10">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Balance Pendiente</p>
                    <div className="flex items-center gap-3 justify-end">
                      {selectedAccount.totalBalance > 200 && (
                        <div className="bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1 animate-pulse">
                          <AlertTriangle size={12} /> Urgente
                        </div>
                      )}
                      <p className={`text-4xl font-black tracking-tighter ${
                        selectedAccount.totalBalance > 200 ? 'text-rose-400' : 
                        selectedAccount.totalBalance > 50 ? 'text-orange-400' : 
                        selectedAccount.totalBalance > 0 ? 'text-amber-400' : 
                        'text-emerald-400'
                      }`}>
                        {formatCurrency(selectedAccount.totalBalance)}
                      </p>
                    </div>
                  </div>
                </div>
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
