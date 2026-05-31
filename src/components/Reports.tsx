import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/db';
import { 
  FileText, 
  Calendar, 
  User, 
  Printer, 
  X, 
  DollarSign, 
  CreditCard, 
  Activity, 
  TrendingDown, 
  Download,
  Building2,
  ListFilter,
  TrendingUp
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  TransactionType, 
  PaymentMethod, 
  type Transaction, 
  type Expense, 
  type CXCAccount, 
  type CXCPayment, 
  type Receipt, 
  type Seller 
} from '../types';

interface ReportsProps {
  exchangeRate?: number;
}

type ReportType = 'cxc_detail' | 'abonos' | 'bank_reconciliation' | 'egresos_vales';

const checkIsBsMethod = (paymentMethod?: string, currency?: string, amountBs?: number): boolean => {
  const normalize = (str?: string) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  const pMethod = normalize(paymentMethod);
  const curr = normalize(currency);

  const isBsMethod = 
    pMethod.includes('bs') ||
    pMethod.includes('bolivar') ||
    pMethod.includes('pago movil') ||
    pMethod.includes('transferencia') ||
    curr.includes('bs') ||
    curr.includes('bolivar');

  const isUsdMethod = 
    pMethod.includes('$') ||
    pMethod.includes('usd') ||
    pMethod.includes('dolar') ||
    pMethod.includes('zelle') ||
    pMethod.includes('binance') ||
    curr.includes('$') ||
    curr.includes('usd') ||
    curr.includes('dolar');

  return isBsMethod || (!isUsdMethod && !!amountBs && amountBs > 0);
};

export default function Reports({ exchangeRate = 1 }: ReportsProps) {
  const [activeReport, setActiveReport] = useState<ReportType>('cxc_detail');
  
  // Data State
  const [cxcAccounts, setCxcAccounts] = useState<CXCAccount[]>([]);
  const [allPayments, setAllPayments] = useState<CXCPayment[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  
  // Filter States
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [selectedEgresoType, setSelectedEgresoType] = useState('all'); // 'all' | 'expense' | 'vale'
  const [selectedCategoryOrRecipient, setSelectedCategoryOrRecipient] = useState('');

  // Subscriptions
  useEffect(() => {
    const unsubCXC = dbService.subscribeToCXCAccounts(setCxcAccounts);
    const unsubPayments = dbService.subscribeToAllPayments(setAllPayments);
    const unsubSellers = dbService.subscribeToSellers(setSellers);
    const unsubTransactions = dbService.subscribeToTransactions(setTransactions);
    const unsubExpenses = dbService.subscribeToExpenses(setExpenses);
    const unsubReceipts = dbService.subscribeToReceipts(setReceipts);

    return () => {
      unsubCXC();
      unsubPayments();
      unsubSellers();
      unsubTransactions();
      unsubExpenses();
      unsubReceipts();
    };
  }, []);

  // Format currency helpers
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatBs = (amount: number) => {
    return `Bs. ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
  };

  // Maps for lookups
  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    cxcAccounts.forEach(acc => {
      if (acc.id) map.set(acc.id, acc.clientName);
    });
    return map;
  }, [cxcAccounts]);

  const clientBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    cxcAccounts.forEach(acc => {
      if (acc.id) map.set(acc.id, acc.totalBalance || 0);
    });
    return map;
  }, [cxcAccounts]);

  // Clean Filter States when report type changes to prevent conflicts
  useEffect(() => {
    setStartDate('');
    setEndDate('');
    setSelectedClient('');
    setSelectedSeller('');
    setSelectedBank('');
    setSelectedCurrency('');
    setSelectedEgresoType('all');
    setSelectedCategoryOrRecipient('');
  }, [activeReport]);

  const uniqueSellersFromDBAndPayments = useMemo(() => {
    const names = new Set<string>();
    sellers.forEach(s => s.name && names.add(s.name.trim().toUpperCase()));
    allPayments.forEach(p => p.sellerName && names.add(p.sellerName.trim().toUpperCase()));
    return Array.from(names).sort();
  }, [sellers, allPayments]);

  // UNIQUE BANKS FILTER RESOLUTION
  const uniqueBanksList = useMemo(() => {
    const banks = new Set<string>();
    
    // Check standard transactions
    transactions.forEach(t => {
      if (t.destinationBank && t.destinationBank.trim()) {
        const dest = t.destinationBank.trim().toUpperCase();
        if (!dest.includes('EFECTIVO') && !dest.includes('CAJA CHICA')) {
          banks.add(dest);
        }
      }
    });

    // Check payments
    allPayments.forEach(p => {
      if (p.destinationBank && p.destinationBank.trim()) {
        const dest = p.destinationBank.trim().toUpperCase();
        if (!dest.includes('EFECTIVO') && !dest.includes('CAJA CHICA')) {
          banks.add(dest);
        }
      }
    });

    return Array.from(banks).sort();
  }, [transactions, allPayments]);


  // ==========================================
  // REPORT 1: CUENTAS POR COBRAR (DETALLADO)
  // Shows all CXC charges (deudas/ventas a crédito)
  // ==========================================
  const cxcDetailData = useMemo(() => {
    // We want individual charges ('charge') type entries
    return allPayments.filter(p => {
      if (p.type !== 'charge') return false;
      if (startDate && p.date < startDate) return false;
      if (endDate && p.date > endDate) return false;
      if (selectedClient && p.clientId !== selectedClient) return false;
      if (selectedSeller && (!p.sellerName || p.sellerName.trim().toUpperCase() !== selectedSeller.toUpperCase())) return false;
      return true;
    });
  }, [allPayments, startDate, endDate, selectedClient, selectedSeller]);

  const cxcDetailSummary = useMemo(() => {
    let totalBruto = 0;
    let totalNeto = 0;
    let totalComisiones = 0;
    cxcDetailData.forEach(p => {
      totalBruto += p.grossAmountUsd || p.amountUsd;
      totalNeto += p.amountUsd;
      totalComisiones += p.commissionAmountUsd || 0;
    });
    return { totalBruto, totalNeto, totalComisiones };
  }, [cxcDetailData]);

  // ==========================================
  // REPORT 2: ABONOS
  // columns: fecha, cliente, vendedor, abonos (en efectivo $ y Bs), saldo
  // ==========================================
  const abonosData = useMemo(() => {
    return allPayments.filter(p => {
      // Must be a payment (not a charge)
      if (p.type === 'charge') return false;
      if (startDate && p.date < startDate) return false;
      if (endDate && p.date > endDate) return false;
      if (selectedClient && p.clientId !== selectedClient) return false;
      if (selectedSeller && (!p.sellerName || p.sellerName.trim().toUpperCase() !== selectedSeller.toUpperCase())) return false;
      return true;
    });
  }, [allPayments, startDate, endDate, selectedClient, selectedSeller]);

  const abonosSummary = useMemo(() => {
    let totalUsd = 0;
    let totalBs = 0;
    let totalWarranty = 0;
    let totalDonation = 0;
    abonosData.forEach(p => {
      const dest = (p.destinationBank || '').toUpperCase();
      const pMethod = (p.paymentMethod || '').toUpperCase();
      const concept = (p.concept || '').toUpperCase();
      
      const isWarranty = dest.includes('GARANT') || pMethod.includes('GARANT') || concept.includes('GARANT');
      const isDonation = dest.includes('DONAC') || pMethod.includes('DONAC') || concept.includes('DONAC') ||
                         dest.includes('EXENC') || pMethod.includes('EXENC') || concept.includes('EXENC') ||
                         dest.includes('EXCENC') || pMethod.includes('EXCENC') || concept.includes('EXCENC') ||
                         dest.includes('EXENT') || pMethod.includes('EXENT') || concept.includes('EXENT') ||
                         dest.includes('EXCENT') || pMethod.includes('EXCENT') || concept.includes('EXCENT') ||
                         dest.includes('CORTES') || pMethod.includes('CORTES') || concept.includes('CORTES') ||
                         dest.includes('DESCUENT') || pMethod.includes('DESCUENT') || concept.includes('DESCUENT') ||
                         dest.includes('ANULA') || pMethod.includes('ANULA') || concept.includes('ANULA') ||
                         dest.includes('BONIF') || pMethod.includes('BONIF') || concept.includes('BONIF');

      if (isWarranty) {
        totalWarranty += p.amountUsd;
      } else if (isDonation) {
        totalDonation += p.amountUsd;
      } else {
        const isBs = checkIsBsMethod(p.paymentMethod, undefined, p.amountBs);
        if (!isBs) {
          totalUsd += p.amountUsd;
        } else {
          totalBs += p.amountBs || (p.amountUsd * (p.exchangeRate || exchangeRate));
        }
      }
    });
    return { totalUsd, totalBs, totalWarranty, totalDonation };
  }, [abonosData, exchangeRate]);

  // ==========================================
  // REPORT 3: BANCOS BS Y DOLARES
  // columns: fecha, moneda, banco, monto
  // Combining standard transactions + payments that went to bank
  // ==========================================
  const bankReconciliationData = useMemo(() => {
    const list: Array<{
      date: string;
      source: string;
      bank: string;
      currency: string;
      amountUsd: number;
      amountBs: number;
    }> = [];

    // 1. Process main transactions
    transactions.forEach(t => {
      if (!t.destinationBank) return;

      // Exclude CXC payment entries which are processed via allPayments below to prevent double counting
      const conceptUpper = (t.concept || '').toUpperCase();
      if (conceptUpper.includes('ABONO CUENTAS POR COBRAR') || conceptUpper.includes('(CXC)')) {
        return;
      }

      const bankClean = t.destinationBank.trim().toUpperCase();
      if (bankClean.includes('EFECTIVO') || bankClean.includes('CAJA CHICA') || bankClean.trim() === '') return;
      
      const isBs = checkIsBsMethod(t.paymentMethod, t.currency, t.amountBs);
      
      list.push({
        date: t.date,
        source: t.concept || 'Ingreso Directo',
        bank: bankClean,
        currency: isBs ? 'Bolívares (BS)' : 'Dólares ($)',
        amountUsd: isBs ? 0 : t.amountUsd,
        amountBs: t.amountBs || 0
      });
    });

    // 2. Process payments (abonos)
    allPayments.forEach(p => {
      if (p.type === 'charge' || !p.destinationBank) return;
      const bankClean = p.destinationBank.trim().toUpperCase();
      if (bankClean.includes('EFECTIVO') || bankClean.includes('CAJA CHICA') || bankClean.trim() === '') return;

      const pMethodUpper = (p.paymentMethod || '').trim().toUpperCase();
      const conceptUpper = (p.concept || '').trim().toUpperCase();
      
      const isWarranty = bankClean.includes('GARANT') || pMethodUpper.includes('GARANT') || conceptUpper.includes('GARANT');
      const isDonation = bankClean.includes('DONAC') || pMethodUpper.includes('DONAC') || conceptUpper.includes('DONAC') ||
                         bankClean.includes('EXENC') || pMethodUpper.includes('EXENC') || conceptUpper.includes('EXENC') ||
                         bankClean.includes('EXCENC') || pMethodUpper.includes('EXCENC') || conceptUpper.includes('EXCENC') ||
                         bankClean.includes('EXENT') || pMethodUpper.includes('EXENT') || conceptUpper.includes('EXENT') ||
                         bankClean.includes('EXCENT') || pMethodUpper.includes('EXCENT') || conceptUpper.includes('EXCENT') ||
                         bankClean.includes('CORTES') || pMethodUpper.includes('CORTES') || conceptUpper.includes('CORTES') ||
                         bankClean.includes('DESCUENT') || pMethodUpper.includes('DESCUENT') || conceptUpper.includes('DESCUENT') ||
                         bankClean.includes('ANULA') || pMethodUpper.includes('ANULA') || conceptUpper.includes('ANULA') ||
                         bankClean.includes('BONIF') || pMethodUpper.includes('BONIF') || conceptUpper.includes('BONIF');

      if (isWarranty || isDonation) return;

      const isBs = checkIsBsMethod(p.paymentMethod, undefined, p.amountBs);
      const cName = clientMap.get(p.clientId) || 'Cliente';

      list.push({
        date: p.date,
        source: `Abono Cliente: ${cName} (${p.concept || 'S/C'})`,
        bank: bankClean,
        currency: isBs ? 'Bolívares (BS)' : 'Dólares ($)',
        amountUsd: isBs ? 0 : p.amountUsd,
        amountBs: p.amountBs || (isBs ? p.amountUsd * (p.exchangeRate || exchangeRate) : 0)
      });
    });

    // Apply Filters
    return list.filter(item => {
      if (startDate && item.date < startDate) return false;
      if (endDate && item.date > endDate) return false;
      if (selectedBank && item.bank !== selectedBank.toUpperCase()) return false;
      if (selectedCurrency) {
        if (selectedCurrency === 'USD' && !item.currency.includes('$')) return false;
        if (selectedCurrency === 'BS' && !item.currency.includes('BS')) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, allPayments, startDate, endDate, selectedBank, selectedCurrency, clientMap, exchangeRate]);

  const bankReconciliationSummary = useMemo(() => {
    let totalUsd = 0;
    let totalBs = 0;
    bankReconciliationData.forEach(item => {
      totalUsd += item.amountUsd;
      totalBs += item.amountBs;
    });
    return { totalUsd, totalBs };
  }, [bankReconciliationData]);

  const uniqueCategoriesAndRecipients = useMemo(() => {
    const values = new Set<string>();
    expenses.forEach(e => {
      if (e.category) values.add(e.category.trim().toUpperCase());
    });
    receipts.forEach(r => {
      if (r.recipient) values.add(r.recipient.trim().toUpperCase());
    });
    return Array.from(values).sort();
  }, [expenses, receipts]);


  // ==========================================
  // REPORT 4: RETIROS, VALES O EGRESOS
  // Combining standard expenses + receipts (vales/retiros)
  // ==========================================
  const egresosValesData = useMemo(() => {
    const list: Array<{
      date: string;
      type: 'Gasto' | 'Vale/Retiro';
      categoryOrRecipient: string;
      concept: string;
      amountUsd: number;
      amountBs: number;
      rate: number;
    }> = [];

    // 1. Process expenses
    if (selectedEgresoType === 'all' || selectedEgresoType === 'expense') {
      expenses.forEach(e => {
        list.push({
          date: e.date,
          type: 'Gasto',
          categoryOrRecipient: e.category,
          concept: e.note || 'Egreso de Caja',
          amountUsd: e.amountUsd,
          amountBs: e.amountBs || 0,
          rate: e.exchangeRate || exchangeRate
        });
      });
    }

    // 2. Process receipts (vales de caja)
    if (selectedEgresoType === 'all' || selectedEgresoType === 'vale') {
      receipts.forEach(r => {
        list.push({
          date: r.date,
          type: 'Vale/Retiro',
          categoryOrRecipient: r.recipient,
          concept: r.concept,
          amountUsd: r.amountUsd,
          amountBs: r.amountBs || 0,
          rate: r.exchangeRate || exchangeRate
        });
      });
    }

    // Apply generic dates and category/recipient filters
    return list.filter(item => {
      if (startDate && item.date < startDate) return false;
      if (endDate && item.date > endDate) return false;
      if (selectedCategoryOrRecipient && item.categoryOrRecipient.trim().toUpperCase() !== selectedCategoryOrRecipient.toUpperCase()) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, receipts, startDate, endDate, selectedEgresoType, selectedCategoryOrRecipient, exchangeRate]);

  const egresosValesSummary = useMemo(() => {
    let totalUsd = 0;
    let totalBs = 0;
    egresosValesData.forEach(item => {
      totalUsd += item.amountUsd;
      totalBs += item.amountBs || (item.amountUsd * item.rate);
    });
    return { totalUsd, totalBs };
  }, [egresosValesData]);

  // ==========================================
  // HISTORICAL TREND FOR CXC MONTHLY BALANCES
  // ==========================================
  const trendData = useMemo(() => {
    // 1. Generate the last 12 months list ending in the current month dynamically
    const d = new Date();
    let currentYear = d.getFullYear();
    let currentMonth = d.getMonth(); // 0 is January, 11 is December
    
    const months: string[] = [];
    for (let i = 0; i < 12; i++) {
      const mStr = String(currentMonth + 1).padStart(2, '0');
      months.unshift(`${currentYear}-${mStr}`);
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
    }

    // 2. Sort all payments by date ascending
    const sortedPayments = [...allPayments]
      .filter(p => p.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    // 3. Compute running balance for all payments sequentially across time
    const monthlyBalances: Record<string, number> = {};
    let runningBalance = 0;

    sortedPayments.forEach(p => {
      const pMonth = p.date.substring(0, 7); // "YYYY-MM"
      const change = p.type === 'charge' ? p.amountUsd : -p.amountUsd;
      runningBalance += change;
      monthlyBalances[pMonth] = runningBalance;
    });

    // 4. Map the target 12 months carrying forward previous month's balance when no activity was present
    const data: Array<{ month: string; label: string; balance: number }> = [];
    
    // Sum everything up to the beginning of the 12-month window to obtain opening balance
    const firstMonth = months[0];
    let initialBalance = 0;
    sortedPayments.forEach(p => {
      const pMonth = p.date.substring(0, 7);
      if (pMonth < firstMonth) {
        const change = p.type === 'charge' ? p.amountUsd : -p.amountUsd;
        initialBalance += change;
      }
    });

    let currentCarry = initialBalance;
    const monthNamesSpanish = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
    ];

    months.forEach(m => {
      if (monthlyBalances[m] !== undefined) {
        currentCarry = monthlyBalances[m];
      }
      
      const [year, monthNum] = m.split('-');
      const monthIndex = parseInt(monthNum, 10) - 1;
      const label = `${monthNamesSpanish[monthIndex]} ${year}`;

      data.push({
        month: m,
        label,
        balance: parseFloat(Math.max(0, currentCarry).toFixed(2))
      });
    });

    return data;
  }, [allPayments]);


  // ==========================================
  // PDF GENERATION WITH jspdf and autopdf
  // ==========================================
  const handleDownloadPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const todayStr = format(new Date(), 'dd/MM/yyyy HH:mm');
    
    // Cover Design / Headings
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42); // slate-900

    let titleText = '';
    let tableHeaders: string[] = [];
    let tableRows: any[] = [];
    let summaryLines: string[] = [];

    if (activeReport === 'cxc_detail') {
      titleText = 'Reporte Detallado de Cuentas por Cobrar (CXC)';
      tableHeaders = ['Cliente', 'Fecha', 'Factura', 'Vendedor', 'Monto Bruto', 'Comisión', 'Monto Neto'];
      
      cxcDetailData.forEach(p => {
        const clientName = clientMap.get(p.clientId) || 'Desconocido';
        tableRows.push([
          clientName,
          p.date,
          p.invoiceNumber || '-',
          p.sellerName || '-',
          formatCurrency(p.grossAmountUsd || p.amountUsd),
          formatCurrency(p.commissionAmountUsd || 0),
          formatCurrency(p.amountUsd)
        ]);
      });

      // summary row
      tableRows.push([
        { content: 'TOTAL GENERAL', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(cxcDetailSummary.totalBruto), styles: { fontStyle: 'bold' } },
        { content: formatCurrency(cxcDetailSummary.totalComisiones), styles: { fontStyle: 'bold' } },
        { content: formatCurrency(cxcDetailSummary.totalNeto), styles: { fontStyle: 'bold', textColor: [37, 99, 235] } }
      ]);
    } 
    else if (activeReport === 'abonos') {
      titleText = 'Reporte de Abonos Recibidos';
      tableHeaders = ['Fecha', 'Cliente', 'Vendedor', 'Abono ($)', 'Abono (Bs)', 'Saldo Cliente'];
      
      abonosData.forEach(p => {
        const clientName = clientMap.get(p.clientId) || 'Desconocido';
        const clientBalance = clientBalanceMap.get(p.clientId) || 0;
        const isBs = checkIsBsMethod(p.paymentMethod, undefined, p.amountBs);
        const isUsd = !isBs;
        
        tableRows.push([
          p.date,
          clientName,
          p.sellerName || '-',
          isUsd ? formatCurrency(p.amountUsd) : '-',
          !isUsd ? formatBs(p.amountBs || (p.amountUsd * (p.exchangeRate || exchangeRate))) : '-',
          formatCurrency(clientBalance)
        ]);
      });

      tableRows.push([
        { content: 'TOTAL ACUMULADO', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(abonosSummary.totalUsd), styles: { fontStyle: 'bold', textColor: [5, 150, 105] } },
        { content: formatBs(abonosSummary.totalBs), styles: { fontStyle: 'bold', textColor: [15, 120, 210] } },
        { content: '-', styles: { halign: 'center' } }
      ]);
    } 
    else if (activeReport === 'bank_reconciliation') {
      titleText = 'Movimientos y Depósitos Bancarios (Bs / $)';
      tableHeaders = ['Fecha', 'Banco', 'Moneda', 'Concepto / Origen', 'Monto USD', 'Monto BS'];
      
      bankReconciliationData.forEach(item => {
        const hasUsd = item.amountUsd > 0;
        tableRows.push([
          item.date,
          item.bank,
          item.currency,
          item.source,
          hasUsd ? formatCurrency(item.amountUsd) : '-',
          !hasUsd ? formatBs(item.amountBs) : '-'
        ]);
      });

      tableRows.push([
        { content: 'TOTAL DEPOSITADO', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(bankReconciliationSummary.totalUsd), styles: { fontStyle: 'bold', textColor: [37, 99, 235] } },
        { content: formatBs(bankReconciliationSummary.totalBs), styles: { fontStyle: 'bold', textColor: [225, 29, 72] } }
      ]);
    } 
    else if (activeReport === 'egresos_vales') {
      titleText = 'Reporte de Egresos, Vales de Salida y Retiros';
      tableHeaders = ['Fecha', 'Tipo', 'Beneficiario / Categoria', 'Concepto', 'Monto USD', 'Monto Bs'];
      
      egresosValesData.forEach(item => {
        tableRows.push([
          item.date,
          item.type,
          item.categoryOrRecipient,
          item.concept,
          formatCurrency(item.amountUsd),
          formatBs(item.amountBs || (item.amountUsd * item.rate))
        ]);
      });

      tableRows.push([
        { content: 'EGRESOS TOTALES', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(egresosValesSummary.totalUsd), styles: { fontStyle: 'bold', textColor: [225, 29, 72] } },
        { content: formatBs(egresosValesSummary.totalBs), styles: { fontStyle: 'bold' } }
      ]);
    }

    // PDF Headers rendering
    doc.text('INVEPINCA CA', 14, 18);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(titleText, 14, 24);
    doc.text(`Fecha Emisión: ${todayStr} | Tasa de Cambio Base: ${formatBs(exchangeRate)}`, 14, 29);

    let filterText = 'Filtros aplicados: ';
    if (startDate) filterText += `Desde: ${startDate} `;
    if (endDate) filterText += `Hasta: ${endDate} `;
    if (selectedClient && activeReport !== 'bank_reconciliation' && activeReport !== 'egresos_vales') {
      filterText += `Cliente: ${clientMap.get(selectedClient) || ''} `;
    }
    if (selectedSeller && activeReport !== 'bank_reconciliation' && activeReport !== 'egresos_vales') {
      filterText += `Vendedor: ${selectedSeller} `;
    }
    if (selectedBank && activeReport === 'bank_reconciliation') {
      filterText += `Banco: ${selectedBank} `;
    }
    if (selectedCurrency && activeReport === 'bank_reconciliation') {
      filterText += `Moneda: ${selectedCurrency} `;
    }
    if (activeReport === 'egresos_vales' && selectedEgresoType !== 'all') {
      filterText += `Tipo: ${selectedEgresoType === 'expense' ? 'Gasto' : 'Vale/Retiro'} `;
    }
    if (activeReport === 'egresos_vales' && selectedCategoryOrRecipient) {
      filterText += `Categoría/Beneficiario: ${selectedCategoryOrRecipient} `;
    }
    if (!startDate && !endDate && !selectedClient && !selectedSeller && !selectedBank && !selectedCurrency && selectedEgresoType === 'all' && !selectedCategoryOrRecipient) {
      filterText += 'Ninguno (Datos completos)';
    }

    doc.setFontSize(9);
    doc.text(filterText, 14, 34);

    // Apply autotable PDF library
    autoTable(doc, {
      startY: 38,
      head: [tableHeaders],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 'auto' }
      }
    });

    const pdfName = `Reporte_${activeReport}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    doc.save(pdfName);
  };

  return (
    <div className="space-y-6">
      {/* Header section with modern display layout */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="text-slate-900" size={28} />
            Módulo de Reportes de Caja
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Filtra, consolida, audita e imprime los reportes financieros integrales de la empresa.
          </p>
        </div>
        <button 
          onClick={handleDownloadPDF}
          className="btn-primary self-start md:self-center"
        >
          <Download size={16} /> Exportar Reporte a PDF
        </button>
      </div>

      {/* Tabs / Select Report Selector */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveReport('cxc_detail')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-colors flex items-center gap-2 ${
            activeReport === 'cxc_detail' 
              ? 'bg-slate-900 text-white shadow-sm' 
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 hover:border-slate-300'
          }`}
        >
          <Activity size={14} /> Cuentas por Cobrar Detalle
        </button>
        <button
          onClick={() => setActiveReport('abonos')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-colors flex items-center gap-2 ${
            activeReport === 'abonos' 
              ? 'bg-slate-900 text-white shadow-sm' 
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 hover:border-slate-300'
          }`}
        >
          <DollarSign size={14} /> Registro de Abonos
        </button>
        <button
          onClick={() => setActiveReport('bank_reconciliation')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-colors flex items-center gap-2 ${
            activeReport === 'bank_reconciliation' 
              ? 'bg-slate-900 text-white shadow-sm' 
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 hover:border-slate-300'
          }`}
        >
          <Building2 size={14} /> Depósitos en Banco
        </button>
        <button
          onClick={() => setActiveReport('egresos_vales')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-colors flex items-center gap-2 ${
            activeReport === 'egresos_vales' 
              ? 'bg-slate-900 text-white shadow-sm' 
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 hover:border-slate-300'
          }`}
        >
          <TrendingDown size={14} /> Egresos, Vales y Retiros
        </button>
      </div>

      {/* Interactive Filtering Card Panel */}
      <div className="card p-6 border-slate-200/60 bg-white">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4">
          <ListFilter size={14} />
          Filtros de Búsqueda
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* General Date From Selector */}
          <div className="flex flex-col">
            <label className="label">Desde</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3.5 text-slate-400" size={16} />
              <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>

          {/* General Date To Selector */}
          <div className="flex flex-col">
            <label className="label">Hasta</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3.5 text-slate-400" size={16} />
              <input 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>

          {/* Report Conditional filters */}
          {(activeReport === 'cxc_detail' || activeReport === 'abonos') && (
            <>
              <div className="flex flex-col">
                <label className="label">Cliente</label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 text-slate-400" size={16} />
                  <select
                    value={selectedClient}
                    onChange={(e) => setSelectedClient(e.target.value)}
                    className="input-field pl-10 cursor-pointer"
                  >
                    <option value="">TODOS</option>
                    {cxcAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.clientName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="label">Vendedor</label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 text-slate-400" size={16} />
                  <select
                    value={selectedSeller}
                    onChange={(e) => setSelectedSeller(e.target.value)}
                    className="input-field pl-10 cursor-pointer"
                  >
                    <option value="">TODOS</option>
                    {uniqueSellersFromDBAndPayments.map(sellerName => (
                      <option key={sellerName} value={sellerName}>{sellerName}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {activeReport === 'bank_reconciliation' && (
            <>
              <div className="flex flex-col">
                <label className="label">Banco</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3.5 text-slate-400" size={16} />
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="input-field pl-10 cursor-pointer"
                  >
                    <option value="">TODOS</option>
                    {uniqueBanksList.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="label">Moneda</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-3.5 text-slate-400" size={16} />
                  <select
                    value={selectedCurrency}
                    onChange={(e) => setSelectedCurrency(e.target.value)}
                    className="input-field pl-10 cursor-pointer"
                  >
                    <option value="">TODAS</option>
                    <option value="USD">DÓLARES ($)</option>
                    <option value="BS">BOLÍVARES (BS)</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {activeReport === 'egresos_vales' && (
            <>
              <div className="flex flex-col">
                <label className="label">Clasificación de Egreso</label>
                <div className="relative">
                  <Activity className="absolute left-3 top-3.5 text-slate-400" size={16} />
                  <select
                    value={selectedEgresoType}
                    onChange={(e) => setSelectedEgresoType(e.target.value)}
                    className="input-field pl-10 cursor-pointer"
                  >
                    <option value="all">TODOS</option>
                    <option value="expense">EGRESOS GENERALES (Caja y Egresos Efectivo)</option>
                    <option value="vale">VALES DE CAJA / RETIROS (Vales)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="label">Categoría / Beneficiario</label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 text-slate-400" size={16} />
                  <select
                    value={selectedCategoryOrRecipient}
                    onChange={(e) => setSelectedCategoryOrRecipient(e.target.value)}
                    className="input-field pl-10 cursor-pointer uppercase"
                  >
                    <option value="">TODOS</option>
                    {uniqueCategoriesAndRecipients.map(item => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Clear Filters Button Action */}
        {(startDate || endDate || selectedClient || selectedSeller || selectedBank || selectedCurrency || selectedEgresoType !== 'all' || selectedCategoryOrRecipient) && (
          <div className="mt-4 flex justify-end">
            <button
               onClick={() => {
                 setStartDate('');
                 setEndDate('');
                 setSelectedClient('');
                 setSelectedSeller('');
                 setSelectedBank('');
                 setSelectedCurrency('');
                 setSelectedEgresoType('all');
                 setSelectedCategoryOrRecipient('');
               }}
              className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <X size={15} /> Limpiar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Historical Trend Line Chart (only shown when Active Report is CXC Detail) */}
      {activeReport === 'cxc_detail' && (
        <div className="card p-6 border-slate-200/60 bg-white shadow-md space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-50 rounded-xl text-slate-900 border border-slate-200/50">
              <TrendingUp size={20} className="text-slate-900" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Tendencia Histórica de Cuentas por Cobrar (CXC)</h3>
              <p className="text-xs font-semibold text-slate-500">Saldo acumulado cobrable acumulado mes a mes durante el último año (USD)</p>
            </div>
          </div>
          
          <div className="h-[280px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                  tickFormatter={(val) => `$${val.toLocaleString()}`}
                />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Saldo Pendiente']}
                  contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 600 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="balance" 
                  stroke="#0f172a" 
                  strokeWidth={3} 
                  dot={{ r: 4, stroke: '#0f172a', strokeWidth: 2, fill: '#fff' }} 
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#0f172a' }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabular Visualizer Panel */}
      <div className="card border-slate-200/60 overflow-hidden bg-white shadow-md">
        
        {/* Report 1 detailed table view */}
        {activeReport === 'cxc_detail' && (
          <div>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <span className="text-sm font-black text-slate-900 uppercase tracking-wider">Cuentas por Cobrar Detalle</span>
              <span className="text-xs font-bold text-slate-500">{cxcDetailData.length} registros encontrados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Cliente</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Fecha Factura</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Factura #</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Vendedor</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Detalle / Item</th>
                    <th className="p-4 text-right font-bold text-slate-600 text-xs">Monto Bruto</th>
                    <th className="p-4 text-right font-bold text-slate-600 text-xs">Comisión</th>
                    <th className="p-4 text-right font-bold text-slate-600 text-xs">Monto Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cxcDetailData.map(p => {
                    const clientName = clientMap.get(p.clientId) || 'Desconocido';
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 font-bold text-slate-800">{clientName}</td>
                        <td className="p-4 text-slate-500 font-medium">{p.date}</td>
                        <td className="p-4 font-mono font-bold text-slate-600">{p.invoiceNumber || '-'}</td>
                        <td className="p-4 text-slate-600 font-semibold">{p.sellerName || '-'}</td>
                        <td className="p-4 text-slate-500 text-xs max-w-[200px] truncate">{p.item || p.concept || '-'}</td>
                        <td className="p-4 text-right text-slate-500 font-semibold">{formatCurrency(p.grossAmountUsd || p.amountUsd)}</td>
                        <td className="p-4 text-right text-red-600 font-medium">-{formatCurrency(p.commissionAmountUsd || 0)}</td>
                        <td className="p-4 text-right font-black text-slate-900">{formatCurrency(p.amountUsd)}</td>
                      </tr>
                    );
                  })}
                  
                  {cxcDetailData.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-400 italic">No se encontraron deudas / ventas a crédito registradas con los filtros indicados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Table Sum-up Footer */}
            {cxcDetailData.length > 0 && (
              <div className="bg-slate-50 p-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-center md:text-right">
                <div className="p-3 bg-white rounded-xl border border-slate-150">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Monto Bruto Consolidado</span>
                  <span className="text-lg font-black text-slate-700">{formatCurrency(cxcDetailSummary.totalBruto)}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-150">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Consolidado en Comisiones</span>
                  <span className="text-lg font-black text-amber-600">-{formatCurrency(cxcDetailSummary.totalComisiones)}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-150 ring-2 ring-slate-900 ring-offset-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Total Deuda Neta Cartera</span>
                  <span className="text-lg font-black text-slate-900">{formatCurrency(cxcDetailSummary.totalNeto)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Report 2 abonos list */}
        {activeReport === 'abonos' && (
          <div>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <span className="text-sm font-black text-slate-900 uppercase tracking-wider">Abonos Recibidos</span>
              <span className="text-xs font-bold text-slate-500">{abonosData.length} registros encontrados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Fecha</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Cliente</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Vendedor</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Concepto / Ref</th>
                    <th className="p-4 text-right font-bold text-slate-600 text-xs">Abono ($)</th>
                    <th className="p-4 text-right font-bold text-slate-600 text-xs">Abono (Bs)</th>
                    <th className="p-4 text-right font-bold text-slate-600 text-xs">Saldo actual Cliente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {abonosData.map(p => {
                    const clientName = clientMap.get(p.clientId) || 'Desconocido';
                    const clientBalance = clientBalanceMap.get(p.clientId) || 0;
                    const isBs = checkIsBsMethod(p.paymentMethod, undefined, p.amountBs);
                    const isUsd = !isBs;
                    
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 font-semibold text-slate-600">{p.date}</td>
                        <td className="p-4 font-bold text-slate-800">{clientName}</td>
                        <td className="p-4 font-medium text-slate-500">{p.sellerName || '-'}</td>
                        <td className="p-4 text-slate-400 font-medium text-xs truncate max-w-[150px]">{p.concept || 'ABONO'}</td>
                        <td className="p-4 text-right font-black text-emerald-600 bg-emerald-50/10">
                          {isUsd ? formatCurrency(p.amountUsd) : '-'}
                        </td>
                        <td className="p-4 text-right font-black text-sky-600 bg-sky-50/10">
                          {!isUsd ? formatBs(p.amountBs || (p.amountUsd * (p.exchangeRate || exchangeRate))) : '-'}
                        </td>
                        <td className="p-4 text-right font-bold text-slate-900">{formatCurrency(clientBalance)}</td>
                      </tr>
                    );
                  })}

                  {abonosData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400 italic">No se encontraron abonos registrados con los filtros seleccionados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Sum-up Footer */}
            {abonosData.length > 0 && (
              <div className="bg-slate-50 p-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3 bg-white rounded-xl border border-slate-150 text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Consolidado USD ($ Cash/Zelle)</span>
                  <span className="text-xl font-black text-emerald-600">{formatCurrency(abonosSummary.totalUsd)}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-150 text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Consolidado BS (Pago Móvil/Bs)</span>
                  <span className="text-xl font-black text-sky-600">{formatBs(abonosSummary.totalBs)}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-150 text-right">
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest block">Garantías Aplicadas (Ref)</span>
                  <span className="text-xl font-black text-purple-600">{formatCurrency(abonosSummary.totalWarranty)}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-150 text-right">
                  <span className="text-[10px] font-bold text-pink-400 uppercase tracking-widest block">Donaciones/Exenciones (Ref)</span>
                  <span className="text-xl font-black text-pink-600">{formatCurrency(abonosSummary.totalDonation)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Report 3 bank deposit list */}
        {activeReport === 'bank_reconciliation' && (
          <div>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <span className="text-sm font-black text-slate-900 uppercase tracking-wider">Depositos y Conciliaciones Bancarias</span>
              <span className="text-xs font-bold text-slate-500">{bankReconciliationData.length} registros encontrados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Fecha</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Banco</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Moneda</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Concepto / Origen</th>
                    <th className="p-4 text-right font-bold text-slate-600 text-xs">Monto USD ($)</th>
                    <th className="p-4 text-right font-bold text-slate-600 text-xs">Monto BS (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bankReconciliationData.map((item, index) => {
                    const hasUsd = item.amountUsd > 0;
                    return (
                      <tr key={index} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 text-slate-500 font-medium">{item.date}</td>
                        <td className="p-4 font-black text-slate-800">{item.bank}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-bold leading-none ${
                            item.currency.includes('BS') 
                              ? 'bg-sky-50 text-sky-700 border border-sky-100' 
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            {item.currency}
                          </span>
                        </td>
                        <td className="p-4 text-slate-600 font-semibold max-w-[280px] truncate">{item.source}</td>
                        <td className="p-4 text-right font-bold text-emerald-600">
                          {hasUsd ? formatCurrency(item.amountUsd) : '-'}
                        </td>
                        <td className="p-4 text-right font-bold text-sky-600">
                          {!hasUsd ? formatBs(item.amountBs) : '-'}
                        </td>
                      </tr>
                    );
                  })}

                  {bankReconciliationData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-400 italic">No se encontraron depósitos bancarios registrados con los filtros seleccionados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Sum-up Footer */}
            {bankReconciliationData.length > 0 && (
              <div className="bg-slate-50 p-5 border-t border-slate-100 flex flex-col md:flex-row justify-end gap-4 text-right">
                <div className="p-3 bg-white rounded-xl border border-slate-150 min-w-[200px]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Banco Total Dólares ($)</span>
                  <span className="text-xl font-black text-emerald-600">{formatCurrency(bankReconciliationSummary.totalUsd)}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-150 min-w-[200px]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Banco Total Bolívares (Bs)</span>
                  <span className="text-xl font-black text-sky-600">{formatBs(bankReconciliationSummary.totalBs)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Report 4 egresos (gastos + vales) list */}
        {activeReport === 'egresos_vales' && (
          <div>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <span className="text-sm font-black text-slate-900 uppercase tracking-wider">Egresos, Vales y Retiros</span>
              <span className="text-xs font-bold text-slate-500">{egresosValesData.length} registros encontrados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Fecha</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Tipo de Registro</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Categoría / Beneficiario</th>
                    <th className="p-4 text-left font-bold text-slate-600 text-xs">Concepto Detallado</th>
                    <th className="p-4 text-right font-bold text-slate-600 text-xs">Monto USD ($)</th>
                    <th className="p-4 text-right font-bold text-slate-600 text-xs">Monto Equivalente BS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {egresosValesData.map((item, index) => {
                    return (
                      <tr key={index} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 text-slate-500 font-medium">{item.date}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-black leading-none ${
                            item.type === 'Gasto' 
                              ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                              : 'bg-violet-50 text-violet-700 border border-violet-100'
                          }`}>
                            {item.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-slate-800">{item.categoryOrRecipient}</td>
                        <td className="p-4 text-slate-600 font-medium max-w-[280px] truncate">{item.concept}</td>
                        <td className="p-4 text-right font-black text-rose-600 bg-rose-50/10">
                          {formatCurrency(item.amountUsd)}
                        </td>
                        <td className="p-4 text-right font-semibold text-slate-500">
                          {formatBs(item.amountBs || (item.amountUsd * item.rate))}
                        </td>
                      </tr>
                    );
                  })}

                  {egresosValesData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-400 italic">No se encontraron egresos o vales registrados con los filtros indicados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Sum-up Footer */}
            {egresosValesData.length > 0 && (
              <div className="bg-slate-50 p-5 border-t border-slate-100 flex flex-col md:flex-row justify-end gap-4 text-right">
                <div className="p-3 bg-white rounded-xl border border-slate-150 min-w-[200px] ring-2 ring-rose-600 ring-offset-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Total General Egresado ($)</span>
                  <span className="text-xl font-black text-rose-600">{formatCurrency(egresosValesSummary.totalUsd)}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-150 min-w-[200px]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Egresado Equivalente (Bs)</span>
                  <span className="text-xl font-black text-slate-800 font-mono">{formatBs(egresosValesSummary.totalBs)}</span>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
