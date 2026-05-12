import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/db';
import { type CXCAccount, type CXCPayment, PaymentMethod } from '../types';
import { User, DollarSign, History, ChevronRight, Plus, Calendar, Tag, AlertTriangle, CheckCircle, CircleDollarSign, Search, Download, FileText, CreditCard, Landmark, Edit, X } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function CXCAccounts({ exchangeRate = 1 }: { exchangeRate?: number }) {
  const [accounts, setAccounts] = useState<CXCAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<CXCAccount | null>(null);
  const [payments, setPayments] = useState<CXCPayment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<CXCPayment | null>(null);
  const [paymentData, setPaymentData] = useState({

    amountUsd: '',
    amountBs: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    concept: '',
    paymentMethod: PaymentMethod.BS_CASH,
    destinationBank: '',
  });

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount?.id || !editingPayment?.id) return;

    const updates: Partial<CXCPayment> = {
      amountUsd: editingPayment.amountUsd,
      date: editingPayment.date || format(new Date(), 'yyyy-MM-dd'),
      concept: editingPayment.concept || '',
      type: editingPayment.type || 'payment',
      paymentMethod: editingPayment.paymentMethod || PaymentMethod.BS_CASH,
    };
    
    if (updates.type === 'charge') {
      updates.invoiceNumber = editingPayment.invoiceNumber || '';
      updates.sellerName = editingPayment.sellerName || '';
    } else {
      updates.destinationBank = editingPayment.destinationBank || '';
    }

    await dbService.updateCXCPayment(selectedAccount.id, editingPayment.id, updates);

    const pays = await dbService.getCXCPayments(selectedAccount.id);
    setPayments(pays || []);
    setEditingPayment(null);
  };

  const [globalStats, setGlobalStats] = useState({ totalCharges: 0, totalPayments: 0, balance: 0 });

  useEffect(() => {
    if (exchangeRate && paymentData.amountUsd && !paymentData.amountBs) {
       const usd = parseFloat(paymentData.amountUsd);
       const bs = usd * exchangeRate;
       setPaymentData(prev => ({ ...prev, amountBs: bs.toFixed(2) }));
    } else if (exchangeRate && paymentData.amountUsd && paymentData.amountBs) {
       const usd = parseFloat(paymentData.amountUsd);
       const bs = usd * exchangeRate;
       setPaymentData(prev => ({ ...prev, amountBs: bs.toFixed(2) }));
    }
  }, [exchangeRate]);

  useEffect(() => {
    dbService.getGlobalCXCStats().then(stats => setGlobalStats(stats));
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
      paymentMethod: paymentData.paymentMethod,
      destinationBank: paymentData.destinationBank,
    });

    // Refresh payments list
    const pays = await dbService.getCXCPayments(selectedAccount.id);
    setPayments(pays || []);
    
    setShowPaymentForm(false);
    setPaymentData({
      amountUsd: '',
      amountBs: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      concept: '',
      paymentMethod: PaymentMethod.BS_CASH,
      destinationBank: '',
    });
  };

  const handleDownloadBook = () => {
    const doc = new jsPDF();
    const currentDate = format(new Date(), "dd/MM/yyyy HH:mm");

    doc.setFontSize(18);
    doc.text('Libro de CXC - Cuentas por Cobrar', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Invepinca CA - Generado el: ${currentDate}`, 14, 30);

    const tableColumn = ["Cliente", "Última Actualización", "Deuda Acumulada"];
    const tableRows: any[] = [];

    let totalCXC = 0;

    // Accounts is already in state as `filteredAccounts` (or `accounts` to be complete)
    const dataToExport = accounts.sort((a, b) => b.totalBalance - a.totalBalance).filter(a => a.totalBalance > 0);

    dataToExport.forEach(account => {
      let dateObj = new Date();
      if (account.lastUpdated?.toDate) {
        dateObj = account.lastUpdated.toDate();
      } else if (typeof account.lastUpdated === 'string' || typeof account.lastUpdated === 'number') {
        dateObj = new Date(account.lastUpdated);
      }

      const rowData = [
        account.clientName,
        format(dateObj, "dd/MM/yyyy"), 
        formatCurrency(account.totalBalance)
      ];
      tableRows.push(rowData);
      totalCXC += account.totalBalance;
    });

    // Subtotal/Total row
    tableRows.push([
      { content: "TOTAL GENERAL", colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: formatCurrency(totalCXC), styles: { fontStyle: 'bold', textColor: [200, 50, 50] } }
    ]);

    autoTable(doc, {
      startY: 40,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }, // Slate-900 like
      styles: { fontSize: 10 }
    });

    doc.save(`Libro_CXC_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const handleDownloadClientPDF = () => {
    if (!selectedAccount) return;

    const doc = new jsPDF();
    const currentDate = format(new Date(), "dd/MM/yyyy HH:mm");

    doc.setFontSize(18);
    doc.text(`Estado de Cuenta - ${selectedAccount.clientName}`, 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Invepinca CA - Generado el: ${currentDate}`, 14, 30);
    doc.text(`ID Cliente: ${selectedAccount.id}`, 14, 36);
    doc.text(`Saldo Total Pendiente: ${formatCurrency(selectedAccount.totalBalance)}`, 14, 42);

    const tableColumn = ["Fecha", "Concepto", "Forma Pago", "Vendedor", "Item", "Factura", "Cargo", "Abono"];
    const tableRows: any[] = [];

    let totalPagos = 0;
    let totalCargos = 0;

    payments.forEach(payment => {
      const isCharge = payment.type === 'charge';
      const fp = isCharge ? '-' : `${payment.paymentMethod || '-'}${payment.destinationBank ? ' (' + payment.destinationBank + ')' : ''}`;
      
      const rowData = [
        payment.date,
        payment.concept || (isCharge ? 'Venta a Crédito' : 'Abono/Pago'),
        fp,
        payment.sellerName || '-',
        payment.item || '-',
        payment.invoiceNumber || '-',
        isCharge ? formatCurrency(payment.amountUsd) : '',
        !isCharge ? formatCurrency(payment.amountUsd) : ''
      ];
      tableRows.push(rowData);
      if (isCharge) totalCargos += payment.amountUsd;
      else totalPagos += payment.amountUsd;
    });

    tableRows.push([
      { content: "TOTALES", colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: formatCurrency(totalCargos), styles: { fontStyle: 'bold', textColor: [200, 50, 50] } },
      { content: formatCurrency(totalPagos), styles: { fontStyle: 'bold', textColor: [50, 150, 50] } }
    ]);
    
    tableRows.push([
      { content: "SALDO DEUDOR", colSpan: 7, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: formatCurrency(totalCargos - totalPagos), styles: { fontStyle: 'bold' } }
    ]);

    autoTable(doc, {
      startY: 50,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 10 }
    });

    doc.save(`Estado_Cuenta_${selectedAccount.clientName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Libro de Cuentas por Cobrar (CXC)</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Gestiona y consulta los saldos de los clientes.</p>
        </div>
        <button 
          onClick={handleDownloadBook}
          className="btn-primary"
        >
          <FileText size={16} />
          <span>Generar PDF del Libro</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6 bg-white border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
             <AlertTriangle size={80} className="text-amber-600" />
          </div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total CXC (Cargos)</p>
          <p className="text-3xl font-black text-amber-600 tracking-tighter relative z-10">{formatCurrency(globalStats.totalCharges)}</p>
          <p className="text-xs font-bold text-slate-400 mt-1 relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.totalCharges * exchangeRate)}</p>
        </div>
        
        <div className="card p-6 bg-white border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
             <CheckCircle size={80} className="text-emerald-600" />
          </div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Abonos</p>
          <p className="text-3xl font-black text-emerald-600 tracking-tighter relative z-10">{formatCurrency(globalStats.totalPayments)}</p>
          <p className="text-xs font-bold text-slate-400 mt-1 relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.totalPayments * exchangeRate)}</p>
        </div>
        
        <div className="card p-6 bg-white border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
             <CircleDollarSign size={80} className="text-blue-600" />
          </div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Saldo Pendiente Global</p>
          <p className="text-3xl font-black text-blue-600 tracking-tighter relative z-10">{formatCurrency(globalStats.balance)}</p>
          <p className="text-xs font-bold text-slate-400 mt-1 relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.balance * exchangeRate)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts List */}
        <div className="lg:col-span-1 card flex flex-col h-full border-slate-200/60 shadow-sm">
        <div className="p-5 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-black text-slate-900 uppercase tracking-widest">Clientes CXC</h2>
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest">
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
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
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
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                      Bs. {new Intl.NumberFormat('es-VE').format(acc.totalBalance * exchangeRate)}
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
                    <div className="flex flex-col md:items-end justify-end">
                      <div className="flex items-center gap-3">
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
                      <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                        Bs. {new Intl.NumberFormat('es-VE').format(selectedAccount.totalBalance * exchangeRate)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h4 className="font-bold flex items-center gap-2">
                <History size={18} className="text-blue-600" /> Estado de Cuenta (Cargos y Abonos)
              </h4>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleDownloadClientPDF}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-1.5 px-3 rounded-lg transition-colors text-sm"
                >
                  <Download size={16} /> 
                  <span className="hidden sm:inline">Descargar PDF</span>
                </button>
                <button 
                  onClick={() => setShowPaymentForm(!showPaymentForm)}
                  className="btn-primary text-sm px-3 py-1.5"
                >
                  <Plus size={16} /> Registrar Pago
                </button>
              </div>
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
                        onChange={(e) => {
                          const usd = parseFloat(e.target.value) || 0;
                          const bs = usd * (exchangeRate || 1);
                          setPaymentData({...paymentData, amountUsd: e.target.value, amountBs: e.target.value ? bs.toFixed(2) : ''});
                        }}
                        className="input-field pl-10" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="label text-blue-600 truncate">Eq. (Bs) - Tasa: {exchangeRate}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-blue-400 font-bold text-sm">Bs</span>
                      <input 
                        type="number" 
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={paymentData.amountBs}
                        onChange={(e) => {
                          const bs = parseFloat(e.target.value) || 0;
                          const usd = bs / (exchangeRate || 1);
                          setPaymentData({...paymentData, amountBs: e.target.value, amountUsd: e.target.value ? usd.toFixed(4) : ''});
                        }}
                        className="input-field pl-10 font-bold text-blue-700 bg-blue-50 border-blue-200" 
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
                    <label className="label">Moneda</label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <select 
                        value={paymentData.paymentMethod}
                        onChange={(e) => setPaymentData({...paymentData, paymentMethod: e.target.value as PaymentMethod})}
                        className="input-field pl-10"
                      >
                        <option value={PaymentMethod.BS_CASH}>{PaymentMethod.BS_CASH}</option>
                        <option value={PaymentMethod.USD_CASH}>{PaymentMethod.USD_CASH}</option>
                      </select>
                    </div>
                  </div>
                  {(paymentData.paymentMethod === PaymentMethod.BS || paymentData.paymentMethod === PaymentMethod.ZELLE || paymentData.paymentMethod === PaymentMethod.BINANCE) && (
                    <div className="space-y-1">
                      <label className="label">Banco / Destino</label>
                      <div className="relative">
                        <Landmark className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <input 
                          type="text" 
                          placeholder="Ej: Banesco, Zelle, etc."
                          value={paymentData.destinationBank}
                          onChange={(e) => setPaymentData({...paymentData, destinationBank: e.target.value.toUpperCase()})}
                          className="input-field pl-10 uppercase" 
                          list="bancos-list-cxc"
                        />
                        <datalist id="bancos-list-cxc">
                          <option value="BANESCO" />
                          <option value="PROVINCIAL" />
                          <option value="MERCANTIL" />
                          <option value="VENEZUELA" />
                          <option value="BANCO DEL TESORO" />
                          <option value="BNC" />
                          <option value="ZELLE" />
                          <option value="BINANCE P2P" />
                          <option value="CUENTAS CXC" />
                        </datalist>
                      </div>
                    </div>
                  )}
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

            <div className="card overflow-hidden text-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="table-header">Fecha</th>
                    <th className="table-header">Concepto</th>
                    <th className="table-header">Forma de Pago</th>
                    <th className="table-header">Vendedor</th>
                    <th className="table-header">Item</th>
                    <th className="table-header whitespace-nowrap">Factura N°</th>
                    <th className="table-header text-right text-rose-600">(+) Cargo</th>
                    <th className="table-header text-right text-emerald-600">(-) Abono</th>
                    <th className="table-header text-center w-12">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const isCharge = p.type === 'charge';
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                        <td className="table-cell">{p.date}</td>
                        <td className="table-cell text-slate-600">{p.concept || (isCharge ? 'Venta a Crédito' : 'Abono/Pago')}</td>
                        <td className="table-cell text-slate-600">
                           {!isCharge && (
                             <span className="inline-flex flex-col">
                               <span className="font-bold text-[10px] uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded w-fit">{p.paymentMethod || '-'}</span>
                               {p.destinationBank && <span className="text-[10px] text-slate-500 mt-0.5">{p.destinationBank}</span>}
                             </span>
                           )}
                           {isCharge && <span className="text-slate-400">-</span>}
                        </td>
                        <td className="table-cell font-bold text-slate-700">{p.sellerName || '-'}</td>
                        <td className="table-cell font-mono text-slate-400 text-xs">{p.item || '-'}</td>
                        <td className="table-cell font-bold text-slate-700">{p.invoiceNumber || '-'}</td>
                        <td className="table-cell text-right font-bold text-rose-600">
                          {isCharge ? (
                            <>
                              {formatCurrency(p.amountUsd)}
                              <span className="block text-[9px] text-rose-400 font-normal">Bs. {new Intl.NumberFormat('es-VE').format(p.amountUsd * exchangeRate)}</span>
                            </>
                          ) : ''}
                        </td>
                        <td className="table-cell text-right font-bold text-emerald-600">
                          {!isCharge ? (
                            <>
                              -{formatCurrency(p.amountUsd)}
                              <span className="block text-[9px] text-emerald-400 font-normal">-Bs. {new Intl.NumberFormat('es-VE').format(p.amountUsd * exchangeRate)}</span>
                            </>
                          ) : ''}
                        </td>
                        <td className="table-cell text-center">
                          <button 
                            onClick={() => setEditingPayment(p)}
                            className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                            title="Editar Registro"
                          >
                            <Edit size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={9} className="table-cell text-center py-10 text-slate-400 italic">No hay movimientos registrados para este cliente.</td>
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

    {editingPayment && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Edit className="text-blue-500" size={20} />
              Editar Registro {editingPayment.type === 'charge' ? '(Cargo)' : '(Abono)'}
            </h3>
            <button 
              onClick={() => setEditingPayment(null)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              title="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleUpdatePayment} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="label">Fecha</label>
                <input 
                  type="date" 
                  required
                  value={editingPayment.date}
                  onChange={(e) => setEditingPayment({...editingPayment, date: e.target.value})}
                  className="input-field" 
                />
              </div>
              <div className="space-y-1">
                <label className="label">Monto (USD)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  required
                  value={editingPayment.amountUsd}
                  onChange={(e) => setEditingPayment({...editingPayment, amountUsd: parseFloat(e.target.value) || 0})}
                  className="input-field font-bold" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="label">Concepto</label>
              <input 
                type="text" 
                required
                value={editingPayment.concept || ''}
                onChange={(e) => setEditingPayment({...editingPayment, concept: e.target.value})}
                className="input-field" 
              />
            </div>

            {editingPayment.type === 'charge' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label">Vendedor</label>
                  <input 
                    type="text" 
                    value={editingPayment.sellerName || ''}
                    onChange={(e) => setEditingPayment({...editingPayment, sellerName: e.target.value.toUpperCase()})}
                    className="input-field uppercase" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="label">N° Factura</label>
                  <input 
                    type="text" 
                    value={editingPayment.invoiceNumber || ''}
                    onChange={(e) => setEditingPayment({...editingPayment, invoiceNumber: e.target.value})}
                    className="input-field" 
                  />
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setEditingPayment(null)} 
                className="px-5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-medium transition-colors"
              >
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
