import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/db';
import { type CXCAccount, type CXCPayment, PaymentMethod, type Seller } from '../types';
import { User, DollarSign, History, ChevronRight, Plus, Calendar, Tag, AlertTriangle, CheckCircle, CircleDollarSign, Search, Download, FileText, CreditCard, Landmark, Edit, X, Percent } from 'lucide-react';
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
  const [searchMode, setSearchMode] = useState<'client' | 'item'>('client');
  const [allPayments, setAllPayments] = useState<CXCPayment[]>([]);
  const [highlightedPaymentId, setHighlightedPaymentId] = useState<string | null>(null);

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterSeller, setFilterSeller] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<CXCPayment | null>(null);

  const [editClientName, setEditClientName] = useState('');
  const [editAccountActionType, setEditAccountActionType] = useState<'rename' | 'reassign'>('rename');

  useEffect(() => {
    if (editingPayment && selectedAccount) {
      setEditClientName(selectedAccount.clientName);
      setEditAccountActionType('rename');
    } else {
      setEditClientName('');
    }
  }, [editingPayment, selectedAccount]);
  const [paymentData, setPaymentData] = useState({
    amountUsd: '',
    amountBs: '',
    exchangeRate: exchangeRate?.toString() || '0',
    date: format(new Date(), 'yyyy-MM-dd'),
    concept: 'ABONO',
    paymentMethod: PaymentMethod.BS_CASH,
    destinationBank: '',
  });

  const [lastEdited, setLastEdited] = useState<'usd' | 'bs' | null>(null);

  const [fetchingRate, setFetchingRate] = useState(false);

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
    item: `CXC-${format(new Date(), 'yyyyMMdd-HHmmss')}`
  });

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

  // Sync sellers
  useEffect(() => {
    const unsub = dbService.subscribeToSellers(setSellers);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (cxcData.exchangeRate && cxcData.amountUsd) {
      const usd = parseFloat(cxcData.amountUsd) || 0;
      const bs = usd * parseFloat(cxcData.exchangeRate);
      setCxcData(prev => ({ ...prev, amountBs: bs.toFixed(2) }));
    }
  }, [cxcData.exchangeRate]);

  // Fetch historical rate when date changes
  useEffect(() => {
    const fetchRate = async (dateStr: string) => {
      if (!dateStr) return;
      setFetchingRate(true);
      const historicalRate = await dbService.getExchangeRateForDate(dateStr);
      if (historicalRate) {
        setPaymentData(prev => ({ ...prev, exchangeRate: historicalRate.toString() }));
      } else if (exchangeRate !== undefined) {
        setPaymentData(prev => ({ ...prev, exchangeRate: exchangeRate.toString() }));
      }
      setFetchingRate(false);
    };

    if (showPaymentForm) {
      fetchRate(paymentData.date);
    }
  }, [paymentData.date, showPaymentForm, exchangeRate]);

  // Also handle editing payment rate if needed
  useEffect(() => {
    const fetchEditRate = async (dateStr: string) => {
      if (!dateStr || !editingPayment) return;
      setFetchingRate(true);
      const historicalRate = await dbService.getExchangeRateForDate(dateStr);
      if (historicalRate) {
        setEditingPayment(prev => prev ? { ...prev, exchangeRate: historicalRate } : null);
      }
      setFetchingRate(false);
    };

    if (editingPayment?.date) {
      fetchEditRate(editingPayment.date);
    }
  }, [editingPayment?.date]);

  // Automatic conversion logic
  useEffect(() => {
    const rate = parseFloat(paymentData.exchangeRate) || 0;
    if (rate <= 0) return;

    if (lastEdited === 'usd') {
      const usd = parseFloat(paymentData.amountUsd) || 0;
      const bs = (usd * rate).toFixed(2);
      setPaymentData(prev => ({ ...prev, amountBs: usd > 0 ? bs : '' }));
    } else if (lastEdited === 'bs') {
      const bs = parseFloat(paymentData.amountBs) || 0;
      const usd = (bs / rate).toFixed(2);
      setPaymentData(prev => ({ ...prev, amountUsd: bs > 0 ? usd : '' }));
    }
  }, [paymentData.amountUsd, paymentData.amountBs, paymentData.exchangeRate, lastEdited]);

  const inBolivares = (parseFloat(paymentData.amountBs) || 0) > 0;

  const [editLastEdited, setEditLastEdited] = useState<'usd' | 'bs'>('usd');

  const handleEditUsdChange = (valStr: string) => {
    setEditLastEdited('usd');
    const val = parseFloat(valStr) || 0;
    const rate = parseFloat(editingPayment?.exchangeRate?.toString() || '0') || 0;
    const bs = rate > 0 ? (val * rate).toFixed(2) : '';
    setEditingPayment(prev => prev ? {
      ...prev,
      amountUsd: val,
      amountBs: val > 0 ? bs : ''
    } : null);
  };

  const handleEditBsChange = (valStr: string) => {
    setEditLastEdited('bs');
    const val = parseFloat(valStr) || 0;
    const rate = parseFloat(editingPayment?.exchangeRate?.toString() || '0') || 0;
    const usd = rate > 0 ? (val / rate).toFixed(2) : '';
    setEditingPayment(prev => prev ? {
      ...prev,
      amountBs: valStr,
      amountUsd: val > 0 ? parseFloat(usd) || 0 : 0
    } : null);
  };

  const handleEditRateChange = (valStr: string) => {
    const rate = parseFloat(valStr) || 0;
    const usd = parseFloat(editingPayment?.amountUsd?.toString() || '0') || 0;
    const bs = parseFloat(editingPayment?.amountBs?.toString() || '0') || 0;

    let newBs = editingPayment?.amountBs || '';
    let newUsd = editingPayment?.amountUsd || 0;

    if (editLastEdited === 'usd' && usd > 0 && rate > 0) {
      newBs = (usd * rate).toFixed(2);
    } else if (editLastEdited === 'bs' && bs > 0 && rate > 0) {
      newUsd = parseFloat((bs / rate).toFixed(2)) || 0;
    }

    setEditingPayment(prev => prev ? {
      ...prev,
      exchangeRate: valStr,
      amountBs: newBs,
      amountUsd: newUsd
    } : null);
  };

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount?.id || !editingPayment?.id) return;

    const isCharge = editingPayment.type === 'charge';
    const gross = isCharge ? (editingPayment.grossAmountUsd || editingPayment.amountUsd) : editingPayment.amountUsd;
    const net = editingPayment.amountUsd;
    const commission = isCharge ? (gross - net) : 0;

    const updates: Partial<CXCPayment> = {
      amountUsd: net,
      grossAmountUsd: gross,
      commissionAmountUsd: commission,
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
      updates.amountBs = (editingPayment.amountBs !== undefined && editingPayment.amountBs !== null && editingPayment.amountBs !== '') ? parseFloat(editingPayment.amountBs as any) : null;
      updates.exchangeRate = (editingPayment.exchangeRate !== undefined && editingPayment.exchangeRate !== null && editingPayment.exchangeRate !== '') ? parseFloat(editingPayment.exchangeRate as any) : 1;
    }

    try {
      const rawNewName = editClientName.trim().toUpperCase();
      const oldName = selectedAccount.clientName.toUpperCase();
      let targetAccountId = selectedAccount.id;

      if (isCharge && rawNewName && rawNewName !== oldName) {
        if (editAccountActionType === 'rename') {
          // Action A: Rename the entire account
          await dbService.renameCXCAccount(selectedAccount.id, rawNewName);
          setSelectedAccount(prev => prev ? { ...prev, clientName: rawNewName } : null);
        } else {
          // Action B: Move this charge only to another account
          const newAccountId = await dbService.reassignCXCCharge(selectedAccount.id, editingPayment.id, rawNewName);
          targetAccountId = newAccountId || selectedAccount.id;
          
          const refreshedAccounts = await dbService.getCXCAccounts();
          const targetAccountDoc = refreshedAccounts?.find(a => a.id === targetAccountId);
          if (targetAccountDoc) {
            setSelectedAccount(targetAccountDoc);
          }
        }
      }

      await dbService.updateCXCPayment(targetAccountId, editingPayment.id, updates);

      const pays = await dbService.getCXCPayments(targetAccountId);
      setPayments(pays || []);
      setEditingPayment(null);
    } catch (err) {
      console.error(err);
    }
  };

  const [globalStats, setGlobalStats] = useState({ 
    totalCharges: 0, 
    totalPayments: 0, 
    totalPaymentsUsd: 0,
    totalPaymentsBs: 0,
    totalPaymentsBsUsd: 0,
    balance: 0,
    totalGrossCharges: 0,
    totalCommissions: 0,
    totalWarranty: 0,
    totalDonation: 0
  });



  useEffect(() => {
    const unsubStats = dbService.subscribeToGlobalCXCStats(setGlobalStats);
    const unsubAccounts = dbService.subscribeToCXCAccounts(setAccounts);
    const unsubAllPayments = dbService.subscribeToAllPayments(setAllPayments);
    return () => {
      unsubStats();
      unsubAccounts();
      unsubAllPayments();
    };
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

  const matchedCharges = allPayments.filter(p => {
    if (!searchQuery.trim() || searchMode !== 'item') return false;
    const inv = (p.invoiceNumber || '').toLowerCase();
    const itemCode = (p.item || '').toLowerCase();
    const queryStr = searchQuery.trim().toLowerCase();
    return inv.includes(queryStr) || itemCode.includes(queryStr);
  });

  useEffect(() => {
    if (selectedAccount?.id) {
      dbService.getCXCPayments(selectedAccount.id).then(pays => setPayments(pays || []));
      // Clear filters on client change to prevent confusion
      setFilterStartDate('');
      setFilterEndDate('');
      setFilterSeller('');
    }
  }, [selectedAccount]);

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
        type: 'charge'
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
        item: `CXC-${format(new Date(), 'yyyyMMdd-HHmmss')}`
      });

      if (selectedAccount && selectedAccount.clientName === cxcData.clientName.trim().toUpperCase()) {
        dbService.getCXCPayments(selectedAccount.id).then(pays => setPayments(pays || []));
      }
    } catch (error) {
      console.error("Error saving Cuentas por Cobrar (CXC):", error);
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount?.id) return;
    
    const amountUsd = parseFloat(paymentData.amountUsd) || 0;
    const amountBs = parseFloat(paymentData.amountBs) || 0;
    
    if (amountUsd <= 0) return;

    await dbService.addCXCPayment(selectedAccount.id, {
      amountUsd: amountUsd,
      amountBs: amountBs > 0 ? amountBs : null,
      exchangeRate: parseFloat(paymentData.exchangeRate) || 1,
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
      exchangeRate: exchangeRate?.toString() || '1',
      date: format(new Date(), 'yyyy-MM-dd'),
      concept: 'ABONO',
      paymentMethod: PaymentMethod.BS_CASH,
      destinationBank: '',
    });
    setLastEdited(null);
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

    let startYTable = 50;
    if (filterStartDate || filterEndDate || filterSeller) {
      let filterDetails = 'Filtros aplicados: ';
      if (filterStartDate) filterDetails += `Desde: ${filterStartDate} `;
      if (filterEndDate) filterDetails += `Hasta: ${filterEndDate} `;
      if (filterSeller) filterDetails += `Vendedor: ${filterSeller}`;
      doc.setFontSize(9);
      doc.setTextColor(115, 115, 115);
      doc.text(filterDetails, 14, 46);
      startYTable = 52;
      doc.setTextColor(0, 0, 0); // Reset color
    }

    const tableColumn = ["Fecha", "Concepto", "Vendedor", "Factura", "Monto Bruto", "Comisión", "Monto Neto", "Abono"];
    const tableRows: any[] = [];

    let totalPagos = 0;
    let totalCargos = 0;

    filteredPayments.forEach(payment => {
      const isCharge = payment.type === 'charge';
      
      const rowData = [
        payment.date,
        payment.concept || (isCharge ? 'Venta a Crédito' : 'Abono/Pago'),
        payment.sellerName ? (payment.rubroName ? `${payment.sellerName} (${payment.rubroName})` : payment.sellerName) : (isCharge ? '-' : (payment.paymentMethod || '-')),
        payment.invoiceNumber || '-',
        isCharge ? formatCurrency(payment.grossAmountUsd || payment.amountUsd) : '',
        isCharge ? formatCurrency((payment.grossAmountUsd || payment.amountUsd) - payment.amountUsd) : '',
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
      startY: startYTable,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 10 }
    });

    doc.save(`Estado_Cuenta_${selectedAccount.clientName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Merge sellers from database with those in payments so everything is covered
  const filterSellerOptions = Array.from(
    new Set([
      ...sellers.map(s => s.name.trim().toUpperCase()),
      ...payments.filter(p => p.type === 'charge' && p.sellerName).map(p => p.sellerName!.trim().toUpperCase())
    ])
  ).sort();

  const computedPayments = [...payments].reverse().map((p, index, arr) => {
    // Calculate running balance from oldest to newest
    let runningBalanceUsd = 0;
    for (let i = 0; i <= index; i++) {
      if (arr[i].type === 'charge') runningBalanceUsd += arr[i].amountUsd;
      else runningBalanceUsd -= arr[i].amountUsd;
    }
    return { ...p, _runningBalance: runningBalanceUsd };
  }).reverse();

  const filteredPayments = computedPayments.filter(p => {
    if (filterStartDate && p.date < filterStartDate) return false;
    if (filterEndDate && p.date > filterEndDate) return false;
    if (filterSeller && (p.sellerName || '').trim().toUpperCase() !== filterSeller.toUpperCase()) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Libro de Cuentas por Cobrar (CXC)</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Gestiona y consulta los saldos de los clientes.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleDownloadBook}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-705 font-medium py-2 px-4 rounded-xl transition-all text-sm border border-slate-200"
          >
            <FileText size={16} />
            <span>Generar PDF del Libro</span>
          </button>
        </div>
      </div>

      {/* Sección 1: Gestión de Cartera y Saldo Pendiente */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <Landmark size={14} className="text-slate-400" /> Cartera de Cuentas por Cobrar (Saldos)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-5 bg-white border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Landmark size={60} className="text-slate-900" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Monto Bruto CXC</p>
            <p className="text-2xl font-black text-slate-800 tracking-tighter relative z-10">{formatCurrency(globalStats.totalGrossCharges)}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1 relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.totalGrossCharges * exchangeRate)}</p>
          </div>

          <div className="card p-5 bg-white border-slate-200 shadow-sm relative overflow-hidden text-rose-650">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Tag size={60} className="text-rose-600" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Comisiones CXC</p>
            <p className="text-2xl font-black text-rose-600 tracking-tighter relative z-10">-{formatCurrency(globalStats.totalCommissions)}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1 relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.totalCommissions * exchangeRate)}</p>
          </div>

          <div className="card p-5 bg-white border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <AlertTriangle size={60} className="text-amber-600" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total CXC (Neto)</p>
            <p className="text-2xl font-black text-amber-600 tracking-tighter relative z-10">{formatCurrency(globalStats.totalCharges)}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1 relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.totalCharges * exchangeRate)}</p>
          </div>

          <div className="card p-5 bg-slate-900 border-slate-850 text-white shadow-md relative overflow-hidden ring-2 ring-slate-950">
            <div className="absolute top-0 right-0 p-4 opacity-15 pointer-events-none">
              <CircleDollarSign size={60} className="text-indigo-400" />
            </div>
            <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1 relative z-10">Saldo Pendiente Global</p>
            <p className="text-3xl font-black text-indigo-400 tracking-tighter relative z-10">{formatCurrency(globalStats.balance)}</p>
            <p className="text-[11px] font-bold text-slate-400 mt-1 relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.balance * exchangeRate)}</p>
          </div>
        </div>
      </div>

      {/* Sección 2: Abonos Recibidos y Ajustes */}
      <div className="space-y-3 pt-2">
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <CheckCircle size={14} className="text-slate-400" /> Flujos de Abonos y Ajustes Recibidos
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-5 bg-white border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <CheckCircle size={60} className="text-emerald-600" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Abonos en USD ($)</p>
            <p className="text-2xl font-black text-emerald-600 tracking-tighter relative z-10">{formatCurrency(globalStats.totalPaymentsUsd)}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1 relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.totalPaymentsUsd * exchangeRate)}</p>
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[9px] font-bold text-emerald-650 uppercase tracking-wider bg-emerald-50 px-1.5 py-0.5 rounded">Afecta Caja Activa</span>
            </div>
          </div>

          <div className="card p-5 bg-white border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <CheckCircle size={60} className="text-teal-600" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Abonos en Bs</p>
            <p className="text-2xl font-black text-teal-650 tracking-tighter relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.totalPaymentsBs)}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1 relative z-10">Equiv. {formatCurrency(globalStats.totalPaymentsBsUsd)}</p>
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[9px] font-bold text-teal-600 uppercase tracking-wider bg-teal-50 px-1.5 py-0.5 rounded">Afecta Caja Activa</span>
            </div>
          </div>

          <div className="card p-5 bg-slate-50/60 border-slate-200/80 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <History size={60} className="text-purple-600" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Garantías Aplicadas</p>
            <p className="text-2xl font-black text-purple-600 tracking-tighter relative z-10">{formatCurrency(globalStats.totalWarranty)}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1 relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.totalWarranty * exchangeRate)}</p>
            <div className="mt-2.5 pt-2 border-t border-slate-200/50 flex items-center justify-between">
              <span className="text-[9px] font-black text-purple-705 uppercase tracking-wider bg-purple-50 px-1.5 py-0.5 rounded">Garantía / Ajuste Contable</span>
            </div>
          </div>

          <div className="card p-5 bg-slate-50/60 border-slate-200/80 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Tag size={60} className="text-pink-600" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Donaciones/Exenciones</p>
            <p className="text-2xl font-black text-pink-600 tracking-tighter relative z-10">{formatCurrency(globalStats.totalDonation)}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1 relative z-10">Bs. {new Intl.NumberFormat('es-VE').format(globalStats.totalDonation * exchangeRate)}</p>
            <div className="mt-2.5 pt-2 border-t border-slate-200/50 flex items-center justify-between">
              <span className="text-[9px] font-black text-pink-700 uppercase tracking-wider bg-pink-50 px-1.5 py-0.5 rounded">Exención / No afecta Caja</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts List */}
        <div className="lg:col-span-1 card flex flex-col h-full border-slate-200/60 shadow-sm">
          <div className="p-5 border-b border-slate-100 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[13px] font-black text-slate-900 uppercase tracking-widest leading-none">Clientes CXC</h2>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest">
                {searchMode === 'client' ? `${filteredAccounts.length} Total` : `${matchedCharges.length} Encontrados`}
              </span>
            </div>

            {/* Alternador de Modo de Búsqueda */}
            <div className="flex bg-slate-100 p-1 rounded-xl mb-4 text-[11px] font-bold gap-1">
              <button
                type="button"
                onClick={() => {
                  setSearchMode('client');
                  setSearchQuery('');
                  setHighlightedPaymentId(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all outline-none ${
                  searchMode === 'client'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Por Cliente
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchMode('item');
                  setSearchQuery('');
                }}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all outline-none ${
                  searchMode === 'item'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Por Factura o Ítem
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder={searchMode === 'client' ? "Buscar cliente..." : "Buscar N° factura o código..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all uppercase"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
            {searchMode === 'item' ? (
              <>
                {matchedCharges.map((p) => {
                  const associatedAccount = accounts.find(a => a.id === p.clientId);
                  const clientDisplay = associatedAccount ? associatedAccount.clientName : 'DESCONOCIDO';
                  const isSelected = selectedAccount?.id === p.clientId && highlightedPaymentId === p.id;

                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (associatedAccount) {
                          setSelectedAccount(associatedAccount);
                          setHighlightedPaymentId(p.id);
                          setTimeout(() => {
                            setHighlightedPaymentId(null);
                          }, 8000);
                        }
                      }}
                      className={`w-full text-left p-4 transition-all group relative overflow-hidden ${
                        isSelected ? 'bg-amber-50/45' : 'hover:bg-slate-50'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-r-full" />
                      )}

                      <div className="flex items-start gap-3">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black uppercase transition-all shadow-sm shrink-0 ${
                          isSelected ? 'bg-amber-500 text-white rotate-3' : 'bg-amber-50 text-amber-500'
                        }`}>
                          F
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold truncate text-sm tracking-tight text-slate-800`}>
                            Fac N°: <span className="text-blue-600 font-extrabold">{p.invoiceNumber || 'S/N'}</span>
                          </p>
                          <p className="text-[10px] font-mono font-bold text-slate-400 truncate mt-0.5">
                            {p.item || 'S/I'}
                          </p>
                          <p className="text-xs font-semibold text-slate-500 truncate mt-1">
                            Cuenta: <span className="text-slate-700 font-bold">{clientDisplay}</span>
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 italic truncate">
                            {p.concept || 'Venta a Crédito'}
                          </p>
                        </div>
                        <div className="text-right pl-2 shrink-0">
                          <p className="text-xs font-black text-rose-600">
                            {formatCurrency(p.amountUsd)}
                          </p>
                          <p className="text-[9px] text-slate-400 font-bold mt-1">
                            {p.date}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {matchedCharges.length === 0 && searchQuery.trim() !== '' && (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Search className="text-slate-300" size={24} />
                    </div>
                    <p className="text-slate-400 text-sm italic">No se encontraron cargos con esa factura o ítem.</p>
                  </div>
                )}
                {searchQuery.trim() === '' && (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    Escriba un número de factura o código de ítem (ej: CXC-...) para buscar.
                  </div>
                )}
              </>
            ) : (
              <>
                {filteredAccounts.map((acc) => {
                  const urgency = getUrgencyStyles(acc.totalBalance);
                  const isSelected = selectedAccount?.id === acc.id;

                  return (
                    <button
                      key={acc.id}
                      onClick={() => {
                        setSelectedAccount(acc);
                        setHighlightedPaymentId(null);
                      }}
                      className={`w-full text-left p-4 transition-all group relative overflow-hidden ${isSelected ? 'bg-blue-50/30' : 'hover:bg-slate-50'
                        }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full" />
                      )}

                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black uppercase transition-all shadow-sm ${isSelected ? 'bg-blue-600 text-white rotate-3' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:shadow group-hover:-rotate-3'
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
                          <p className={`text-sm font-black tracking-tighter ${acc.totalBalance > 200 ? 'text-rose-600' :
                            acc.totalBalance > 50 ? 'text-orange-600' :
                              acc.totalBalance > 0 ? 'text-amber-600' :
                                'text-emerald-600'
                            }`}>
                            {formatCurrency(acc.totalBalance)}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                            Bs. {new Intl.NumberFormat('es-VE').format(acc.totalBalance * exchangeRate)}
                          </p>
                          <ChevronRight size={14} className={`ml-auto mt-1 transition-transform ${isSelected ? 'text-blue-400 translate-x-1' : 'text-slate-300'
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
              </>
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
                          <p className={`text-4xl font-black tracking-tighter ${selectedAccount.totalBalance > 200 ? 'text-rose-400' :
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
                    onClick={() => {
                      setCxcData({
                        date: format(new Date(), 'yyyy-MM-dd'),
                        clientName: selectedAccount.clientName.toUpperCase(),
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
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition-colors animate-fade-in"
                  >
                    <Plus size={16} /> Registrar Cargo
                  </button>
                  <button
                    onClick={() => setShowPaymentForm(!showPaymentForm)}
                    className="btn-primary text-sm px-3 py-1.5"
                  >
                    <Plus size={16} /> Registrar Pago
                  </button>
                </div>
              </div>

              {/* Filtros de Busqueda en Cuenta */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-50 border border-slate-200/80 p-3 rounded-2xl shadow-sm">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                  
                  {/* Rango de Fechas */}
                  <div className="flex flex-col sm:flex-row items-center gap-2 flex-1 max-w-xl">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl flex-1 w-full">
                      <Calendar className="text-slate-400 shrink-0" size={15} />
                      <div className="flex flex-col w-full">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-0.5">Desde</label>
                        <input 
                          type="date" 
                          value={filterStartDate}
                          onChange={(e) => setFilterStartDate(e.target.value)}
                          className="bg-transparent text-xs font-semibold text-slate-800 outline-none w-full cursor-pointer p-0 border-none focus:ring-0 leading-tight"
                        />
                      </div>
                    </div>

                    <div className="hidden sm:block text-slate-400 font-bold text-sm">al</div>

                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl flex-1 w-full">
                      <Calendar className="text-slate-400 shrink-0" size={15} />
                      <div className="flex flex-col w-full">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-0.5">Hasta</label>
                        <input 
                          type="date" 
                          value={filterEndDate}
                          onChange={(e) => setFilterEndDate(e.target.value)}
                          className="bg-transparent text-xs font-semibold text-slate-800 outline-none w-full cursor-pointer p-0 border-none focus:ring-0 leading-tight"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:block w-px h-8 bg-slate-200"></div>

                  {/* Vendedor */}
                  <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl w-full sm:w-60 shrink-0">
                    <User className="text-slate-400 shrink-0" size={15} />
                    <div className="flex flex-col w-full">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-0.5">Vendedor</label>
                      <select
                        value={filterSeller}
                        onChange={(e) => setFilterSeller(e.target.value)}
                        className="bg-transparent text-xs font-semibold text-slate-800 outline-none w-full cursor-pointer p-0 border-none focus:ring-0 leading-none"
                      >
                        <option value="">TODOS</option>
                        {filterSellerOptions.map(sellerName => (
                          <option key={sellerName} value={sellerName}>{sellerName}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                </div>

                {/* Limpiar Filtros */}
                {(filterStartDate || filterEndDate || filterSeller) && (
                  <button
                    onClick={() => {
                      setFilterStartDate('');
                      setFilterEndDate('');
                      setFilterSeller('');
                    }}
                    className="text-xs font-black text-slate-500 hover:text-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                  >
                    <X size={14} />
                    <span>Limpiar Filtros</span>
                  </button>
                )}
              </div>

              {showPaymentForm && (
                <div className="card p-6 bg-emerald-50/30 border-emerald-100">
                  <form onSubmit={handleAddPayment} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      <div className="space-y-1">
                        <label className="label">Fecha</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-2.5 text-slate-400" size={18} />
                          <input
                            type="date"
                            required
                            value={paymentData.date}
                            onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
                            className="input-field pl-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="label">Moneda</label>
                        <select
                          required
                          value={paymentData.paymentMethod}
                          onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value as PaymentMethod })}
                          className="input-field cursor-pointer"
                        >
                          <option value={PaymentMethod.USD_CASH}>{PaymentMethod.USD_CASH}</option>
                          <option value={PaymentMethod.BS_CASH}>{PaymentMethod.BS_CASH}</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="label">Banco / Destino</label>
                        <input
                          type="text"
                          placeholder="Ej: Banesco, Zelle, etc."
                          value={paymentData.destinationBank}
                          onChange={(e) => setPaymentData({ ...paymentData, destinationBank: e.target.value.toUpperCase() })}
                          className="input-field uppercase"
                          list="bancos-list-cxc"
                        />
                        <datalist id="bancos-list-cxc">
                          {(parseFloat(paymentData.amountBs) || 0) > 0 ? (
                            <>
                              <option value="BANESCO" />
                              <option value="PROVINCIAL" />
                              <option value="MERCANTIL" />
                              <option value="VENEZUELA" />
                              <option value="BANCO DEL TESORO" />
                              <option value="BNC" />
                              <option value="EFECTIVO" />
                              <option value="GARANTÍA" />
                              <option value="DONACIÓN" />
                              <option value="CUENTAS POR COBRAR (CXC)" />
                            </>
                          ) : (
                            <>
                              <option value="VENEZUELA" />
                              <option value="BANESCO" />
                              <option value="BNC" />
                              <option value="MERCANTIL" />
                              <option value="BANCO DEL TESORO" />
                              <option value="BINANCE P2P" />
                              <option value="ZELLE" />
                              <option value="EFECTIVO" />
                              <option value="GARANTÍA" />
                              <option value="DONACIÓN" />
                              <option value="CUENTAS POR COBRAR (CXC)" />
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
                          placeholder="1.00"
                          value={paymentData.exchangeRate}
                          onChange={(e) => setPaymentData({ ...paymentData, exchangeRate: e.target.value })}
                          className="input-field font-mono font-bold text-blue-600 bg-blue-50/30"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="label">Monto (USD)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-2.5 text-blue-400" size={16} />
                          <input
                            type="number"
                            step="0.01"
                            required
                            placeholder="0.00"
                            value={paymentData.amountUsd}
                            onChange={(e) => {
                              setLastEdited('usd');
                              setPaymentData({ ...paymentData, amountUsd: e.target.value });
                            }}
                            className="input-field pl-9 font-bold text-blue-600 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="label">Monto (Bs.)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-[10px] font-black text-emerald-400">Bs</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={paymentData.amountBs}
                            onChange={(e) => {
                              setLastEdited('bs');
                              setPaymentData({ ...paymentData, amountBs: e.target.value });
                            }}
                            className="input-field pl-9 font-bold text-emerald-600 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="label">Concepto</label>
                        <input
                          type="text"
                          required
                          value={paymentData.concept}
                          onChange={(e) => setPaymentData({ ...paymentData, concept: e.target.value })}
                          className="input-field"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-emerald-100">
                      <button type="button" onClick={() => setShowPaymentForm(false)} className="px-4 py-2 text-slate-600 font-medium">Cancelar</button>
                      <button 
                        type="submit" 
                        disabled={!paymentData.amountUsd || parseFloat(paymentData.amountUsd) <= 0}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center justify-center"
                      >
                        <Plus size={18} className="inline mr-2 -mt-0.5" />
                        Guardar Pago
                      </button>
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
                      <th className="table-header">Vendedor / Destino</th>
                      <th className="table-header whitespace-nowrap">Factura N°</th>
                      <th className="table-header text-right">Bruto</th>
                      <th className="table-header text-right text-rose-400">Comis.</th>
                      <th className="table-header text-right text-rose-600">Neto</th>
                      <th className="table-header text-right text-emerald-600">(-) Abono</th>
                      <th className="table-header text-right text-blue-600">(=) Saldo</th>
                      <th className="table-header text-center w-12">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((p) => {
                      const isCharge = p.type === 'charge';
                      const isHighlighted = highlightedPaymentId === p.id;
                      return (
                        <tr 
                          key={p.id} 
                          className={`hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors ${
                            isHighlighted ? 'bg-amber-100 hover:bg-amber-105 border-2 border-amber-400 font-semibold' : ''
                          }`}
                        >
                          <td className="table-cell">{p.date}</td>
                          <td className="table-cell text-slate-600">{p.concept || (isCharge ? 'Venta a Crédito' : 'Abono/Pago')}</td>
                          <td className="table-cell">
                            {isCharge ? (
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-700">{p.sellerName || '-'}</span>
                                {p.rubroName && <span className="text-[9px] text-blue-500 font-bold uppercase">{p.rubroName}</span>}
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                <span className="font-bold text-[10px] uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded w-fit">{p.paymentMethod || '-'}</span>
                                {p.destinationBank && <span className="text-[10px] text-slate-500 mt-0.5">{p.destinationBank}</span>}
                              </div>
                            )}
                          </td>
                          <td className="table-cell font-bold text-slate-700">{p.invoiceNumber || '-'}</td>
                          <td className="table-cell text-right text-slate-500 text-[11px] font-medium">
                            {isCharge ? formatCurrency(p.grossAmountUsd || p.amountUsd) : '-'}
                          </td>
                          <td className="table-cell text-right text-rose-400 text-[11px] font-medium">
                            {isCharge ? formatCurrency((p.grossAmountUsd || p.amountUsd) - p.amountUsd) : '-'}
                          </td>
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
                          <td className="table-cell text-right font-bold text-blue-600 bg-blue-50/30">
                            <>
                              {formatCurrency(p._runningBalance)}
                              <span className="block text-[9px] text-blue-400 font-normal">Bs. {new Intl.NumberFormat('es-VE').format(p._runningBalance * exchangeRate)}</span>
                            </>
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
                    {filteredPayments.length === 0 && (
                      <tr>
                        <td colSpan={10} className="table-cell text-center py-10 text-slate-400 italic">
                          {payments.length === 0 
                            ? "No hay movimientos registrados para este cliente." 
                            : "No se encontraron movimientos con los filtros aplicados."}
                        </td>
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
              {editingPayment.type === 'charge' ? (
                <>
                  {/* Charge View fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="label">Fecha</label>
                      <input
                        type="date"
                        required
                        value={editingPayment.date}
                        onChange={(e) => setEditingPayment({ ...editingPayment, date: e.target.value })}
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="label">Monto Neto (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editingPayment.amountUsd}
                        onChange={(e) => setEditingPayment({ ...editingPayment, amountUsd: parseFloat(e.target.value) || 0 })}
                        className="input-field font-bold"
                      />
                      <div className="mt-2 p-2 bg-blue-50 rounded text-[11px] flex justify-between items-center text-blue-700 font-bold">
                        <span>Comisión Calculada:</span>
                        <span>{formatCurrency((editingPayment.grossAmountUsd || editingPayment.amountUsd) - editingPayment.amountUsd)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="label">Monto Bruto (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingPayment.grossAmountUsd || editingPayment.amountUsd}
                      onChange={(e) => setEditingPayment({ ...editingPayment, grossAmountUsd: parseFloat(e.target.value) || 0 })}
                      className="input-field"
                    />
                    <p className="text-[10px] text-slate-400 italic">Ingrese el monto original antes de la comisión si aplica.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="label">Concepto</label>
                    <input
                      type="text"
                      required
                      value={editingPayment.concept || ''}
                      onChange={(e) => setEditingPayment({ ...editingPayment, concept: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="label">Vendedor</label>
                      <input
                        type="text"
                        value={editingPayment.sellerName || ''}
                        onChange={(e) => setEditingPayment({ ...editingPayment, sellerName: e.target.value.toUpperCase() })}
                        className="input-field uppercase"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="label">N° Factura</label>
                      <input
                        type="text"
                        value={editingPayment.invoiceNumber || ''}
                        onChange={(e) => setEditingPayment({ ...editingPayment, invoiceNumber: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  </div>

                  {/* Account Name Modification / Reassignment */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-3">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Cuenta / Nombre de Cliente</span>
                    
                    <div className="space-y-1">
                      <label className="label text-slate-600 font-bold">Modificar Nombre de la Cuenta</label>
                      <input
                        type="text"
                        value={editClientName}
                        onChange={(e) => setEditClientName(e.target.value)}
                        className="input-field uppercase bg-white font-semibold text-slate-800"
                        placeholder="Nombre completo del cliente"
                      />
                    </div>

                    {editClientName.trim().toUpperCase() !== selectedAccount?.clientName.toUpperCase() && (
                      <div className="space-y-2 pt-1 animate-fade-in bg-white p-3 rounded-lg border border-blue-100">
                        <span className="text-[10px] font-black text-blue-600 block uppercase tracking-wider">¿Cómo deseas aplicar este cambio?</span>
                        <div className="flex flex-col gap-2">
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="radio"
                              name="accountAction"
                              value="rename"
                              checked={editAccountActionType === 'rename'}
                              onChange={() => setEditAccountActionType('rename')}
                              className="mt-1"
                            />
                            <div className="text-xs">
                              <span className="font-bold text-slate-800 block">Renombrar toda la cuenta</span>
                              <span className="text-slate-500">Cambia el nombre completo de la cuenta "{selectedAccount?.clientName}" a "{editClientName.toUpperCase()}" en todos sus cargos.</span>
                            </div>
                          </label>

                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="radio"
                              name="accountAction"
                              value="reassign"
                              checked={editAccountActionType === 'reassign'}
                              onChange={() => setEditAccountActionType('reassign')}
                              className="mt-1"
                            />
                            <div className="text-xs">
                              <span className="font-bold text-slate-800 block">Mover solo este cargo a otra cuenta</span>
                              <span className="text-slate-500">Mueve únicamente este cargo con Factura N° {editingPayment.invoiceNumber || 'S/N'} al cliente "{editClientName.toUpperCase()}" (se crea la cuenta si no existe).</span>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Payment/Abono View fields (including dual currency) */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="label">Fecha</label>
                      <input
                        type="date"
                        required
                        value={editingPayment.date}
                        onChange={(e) => setEditingPayment({ ...editingPayment, date: e.target.value })}
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="label">Moneda</label>
                      <select
                        required
                        value={editingPayment.paymentMethod || PaymentMethod.BS_CASH}
                        onChange={(e) => setEditingPayment({ ...editingPayment, paymentMethod: e.target.value as PaymentMethod })}
                        className="input-field cursor-pointer font-bold text-emerald-700 bg-emerald-50/50"
                      >
                        <option value={PaymentMethod.USD_CASH}>{PaymentMethod.USD_CASH}</option>
                        <option value={PaymentMethod.BS_CASH}>{PaymentMethod.BS_CASH}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="label">Banco / Destino</label>
                      <input
                        type="text"
                        value={editingPayment.destinationBank || ''}
                        onChange={(e) => setEditingPayment({ ...editingPayment, destinationBank: e.target.value.toUpperCase() })}
                        className="input-field uppercase"
                        list="bancos-list-edit-cxc"
                      />
                      <datalist id="bancos-list-edit-cxc">
                        {(parseFloat(editingPayment.amountBs) || 0) > 0 ? (
                          <>
                            <option value="BANESCO" />
                            <option value="PROVINCIAL" />
                            <option value="MERCANTIL" />
                            <option value="VENEZUELA" />
                            <option value="BANCO DEL TESORO" />
                            <option value="BNC" />
                            <option value="EFECTIVO" />
                            <option value="GARANTÍA" />
                            <option value="DONACIÓN" />
                            <option value="CUENTAS POR COBRAR (CXC)" />
                          </>
                        ) : (
                          <>
                            <option value="VENEZUELA" />
                            <option value="BANESCO" />
                            <option value="BNC" />
                            <option value="MERCANTIL" />
                            <option value="BANCO DEL TESORO" />
                            <option value="BINANCE P2P" />
                            <option value="ZELLE" />
                            <option value="EFECTIVO" />
                            <option value="GARANTÍA" />
                            <option value="DONACIÓN" />
                            <option value="CUENTAS POR COBRAR (CXC)" />
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
                        value={editingPayment.exchangeRate !== undefined ? editingPayment.exchangeRate : '1'}
                        onChange={(e) => handleEditRateChange(e.target.value)}
                        className="input-field font-mono font-bold text-blue-600 bg-blue-50/30"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="label">Monto (USD)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-2.5 text-blue-400" size={16} />
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={editingPayment.amountUsd}
                          onChange={(e) => handleEditUsdChange(e.target.value)}
                          className="input-field pl-9 font-bold text-blue-600 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="label font-medium text-emerald-700">Monto (Bs.)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-[10px] font-black text-emerald-400">Bs</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editingPayment.amountBs !== undefined && editingPayment.amountBs !== null ? editingPayment.amountBs : ''}
                          onChange={(e) => handleEditBsChange(e.target.value)}
                          className="input-field pl-9 font-bold text-emerald-600 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="label">Concepto</label>
                    <input
                      type="text"
                      required
                      value={editingPayment.concept || ''}
                      onChange={(e) => setEditingPayment({ ...editingPayment, concept: e.target.value })}
                      className="input-field"
                    />
                  </div>
                </>
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
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-xl transition-all shadow-sm text-sm">
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
