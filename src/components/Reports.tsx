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

type ReportType = 'cxc_detail' | 'abonos' | 'bank_reconciliation' | 'egresos_vales' | 'predictive_analysis';

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

  const predictiveAnalysisData = useMemo(() => {
    // 1. Cartera de deudas activa
    const totalCXCPending = cxcAccounts.reduce((sum, acc) => sum + (acc.totalBalance || 0), 0);

    // 2. Cargos de deudas en periodo
    const periodDebts = allPayments.filter(p => p.type === 'charge' && (!startDate || p.date >= startDate) && (!endDate || p.date <= endDate));
    const totalPeriodGrossDebts = periodDebts.reduce((sum, p) => sum + (p.grossAmountUsd || p.amountUsd), 0);
    const totalPeriodNetDebts = periodDebts.reduce((sum, p) => sum + p.amountUsd, 0);
    const totalPeriodSellerCommissions = periodDebts.reduce((sum, p) => sum + (p.commissionAmountUsd || 0), 0);

    // 3. Abonos de deudas en periodo
    const periodAbonos = allPayments.filter(p => p.type !== 'charge' && (!startDate || p.date >= startDate) && (!endDate || p.date <= endDate));
    const totalPeriodAbonosUsdVal = periodAbonos.reduce((sum, p) => sum + p.amountUsd, 0);

    // Classification of abonos
    let usdCashAmount = 0;
    let usdZelleAmount = 0;
    let bsAmountUsdVal = 0;
    let bsAmountBsActual = 0;
    let warrantyAmountUsd = 0;
    let donationAmountUsd = 0;

    periodAbonos.forEach(p => {
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
        warrantyAmountUsd += p.amountUsd;
      } else if (isDonation) {
        donationAmountUsd += p.amountUsd;
      } else {
        const isBs = checkIsBsMethod(p.paymentMethod, undefined, p.amountBs);
        if (isBs) {
          bsAmountUsdVal += p.amountUsd;
          bsAmountBsActual += p.amountBs || (p.amountUsd * (p.exchangeRate || exchangeRate));
        } else {
          const isCash = pMethod.includes('EFECTIVO') || pMethod.includes('CASH') || dest.includes('EFECTIVO') || dest.includes('CAJA CHICA') || (!pMethod.includes('ZELLE') && !pMethod.includes('BINANCE') && !pMethod.includes('TRANSFERENCIA'));
          if (isCash) {
            usdCashAmount += p.amountUsd;
          } else {
            usdZelleAmount += p.amountUsd;
          }
        }
      }
    });

    // 4. Egresos del periodo
    const totalOutflowUsdVal = egresosValesSummary.totalUsd;
    const totalOutflowBs = egresosValesSummary.totalBs;

    // 5. Rates and Indices
    const recoveryRate = totalPeriodNetDebts > 0 ? (totalPeriodAbonosUsdVal / totalPeriodNetDebts) * 100 : 100;
    const dollarizationIndex = totalPeriodAbonosUsdVal > 0 ? ((usdCashAmount + usdZelleAmount) / (totalPeriodAbonosUsdVal - warrantyAmountUsd - donationAmountUsd || 1)) * 100 : 100;
    const cashCollectionRatio = totalPeriodAbonosUsdVal > 0 ? (usdCashAmount / (totalPeriodAbonosUsdVal || 1)) * 100 : 0;

    // 6. Problems Detected list
    const problems: Array<{
      id: string;
      title: string;
      severity: 'CRÍTICO' | 'ALTO' | 'MODERADO' | 'BAJO';
      color: string;
      description: string;
      solution: string;
    }> = [];

    // Problem 1: slow velocity / low recovery
    if (totalPeriodNetDebts > 300 && recoveryRate < 70) {
      problems.push({
        id: 'slow_collection',
        title: 'Descalce en la Tasa de Cobranza',
        severity: recoveryRate < 45 ? 'CRÍTICO' : 'ALTO',
        color: recoveryRate < 45 ? 'rose' : 'amber',
        description: `El ritmo de recaudación crédito es del ${recoveryRate.toFixed(1)}% de la facturación en este periodo. Estás acumulando deuda pendiente a una velocidad mayor de lo que recuperas liquidez.`,
        solution: 'Implementar inmediato plan de recargo del 5% en facturas vencidas más de 12 días e incentivar pronto pago con 2% de deducción para retornos en menos de 5 días hábiles.'
      });
    }

    // Problem 2: High Bolívares exposure
    const bsRatio = totalPeriodAbonosUsdVal > 0 ? (bsAmountUsdVal / totalPeriodAbonosUsdVal) * 100 : 0;
    if (bsRatio > 35) {
      problems.push({
        id: 'bs_devaluation',
        title: 'Exposición Elevada en Bolívares',
        severity: bsRatio > 55 ? 'CRÍTICO' : 'MODERADO',
        color: bsRatio > 55 ? 'rose' : 'amber',
        description: `El ${bsRatio.toFixed(1)}% de todos tus abonos ingresan en bolívares. Mantener saldos en bolívares o demorar en la reposición genera pérdidas invisibles pero severas de capital debido a la devaluación acumulativa.`,
        solution: 'Ejecutar regla de vaciado diario total en bolívares mediante transferencias inmediatas de pago a proveedores de transporte/fletes o adquisición instantánea de dólares en el mercado financiero.'
      });
    }

    // Problem 3: commission drainage
    const commissionRatio = totalPeriodNetDebts > 0 ? (totalPeriodSellerCommissions / totalPeriodNetDebts) * 100 : 0;
    if (commissionRatio > 12) {
      problems.push({
        id: 'commission_drainage',
        title: 'Drenaje de Margen por Comisiones',
        severity: 'ALTO',
        color: 'amber',
        description: `Las comisiones devengadas por la fuerza de venta representan el ${commissionRatio.toFixed(1)}% del facturado neto a crédito en el periodo analizado.`,
        solution: 'Rediseñar la estructura comercial: Pagar la comisión del vendedor únicamente cuando el cliente efectúa el abono y no al momento de cargar la factura, indexando penalizaciones por retraso del cliente.'
      });
    }

    // Problem 4: Cash Flow Deficit in Divisas
    if (totalOutflowUsdVal > (usdCashAmount + usdZelleAmount) && (usdCashAmount + usdZelleAmount) > 50) {
      problems.push({
        id: 'cash_depletion',
        title: 'Drenaje de Reservas de Bóveda en Divisas',
        severity: 'ALTO',
        color: 'amber',
        description: `Las salidas monetarias en dólares ($${totalOutflowUsdVal.toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD) superan ampliamente las captaciones directas en divisas ($${(usdCashAmount + usdZelleAmount).toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD).`,
        solution: 'Alinear los egresos e indexarlos para que se liquiden desde cuentas bancarias en bolívares remanentes y preservar las divisas físicas puramente para compras mayoristas de mercancías críticas.'
      });
    }

    // Default problems if none detected
    if (problems.length === 0) {
      problems.push({
        id: 'no_problems',
        title: 'Estabilidad de Cartera en Divisas',
        severity: 'BAJO',
        color: 'emerald',
        description: 'La gestión de cartera crediticia no muestra descalces graves. Los cobros de abonos en divisas fuertes ($) dominan con una excelente conversión en caja.',
        solution: 'Seguir operando bajo las normativas actuales de crédito selectivo limitando el plazo total a un máximo estricto de 15 días.'
      });
    }

    // 7. Predictive Math
    // Días de retorno estimados
    const daysInPeriod = Math.max(1, Math.round((new Date(endDate || new Date()).getTime() - new Date(startDate || new Date(Date.now() - 30 * 86400000)).getTime()) / 86400000)) || 30;
    const dailyRepaymentVelocity = totalPeriodAbonosUsdVal / daysInPeriod;
    const estimatedDaysToClear = dailyRepaymentVelocity > 0 ? Math.round(totalCXCPending / dailyRepaymentVelocity) : 45;

    // Projected Change and 30-day index
    const projectedCXCChange30d = (totalPeriodNetDebts - totalPeriodAbonosUsdVal) * (30 / daysInPeriod);
    const projectedCXCSaldo30d = Math.max(0, totalCXCPending + projectedCXCChange30d);

    // Projected loss due to Bolívar devaluation if not converted
    const projectedDevaluationLossUsd = (bsAmountUsdVal * 0.05) * (30 / daysInPeriod);

    return {
      totalCXCPending,
      totalPeriodGrossDebts,
      totalPeriodNetDebts,
      totalPeriodSellerCommissions,
      totalPeriodAbonosUsdVal,
      usdCashAmount,
      usdZelleAmount,
      bsAmountUsdVal,
      bsAmountBsActual,
      warrantyAmountUsd,
      donationAmountUsd,
      totalOutflowUsdVal,
      totalOutflowBs,
      recoveryRate,
      dollarizationIndex,
      cashCollectionRatio,
      problems,
      estimatedDaysToClear,
      projectedCXCChange30d,
      projectedCXCSaldo30d,
      projectedDevaluationLossUsd,
      daysInPeriod,
      bsRatio
    };
  }, [cxcAccounts, allPayments, startDate, endDate, egresosValesSummary, exchangeRate]);


  // ==========================================
  // PDF GENERATION WITH jspdf and autopdf
  // ==========================================
  const handleDownloadPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const todayStr = format(new Date(), 'dd/MM/yyyy HH:mm');
    
    if (activeReport === 'predictive_analysis') {
      doc.text('INVEPINCA CA', 14, 18);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text('Informe Directivo: Analisis Financiero y Predictivo', 14, 25);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha Emision: ${todayStr} | Tasa de Cambio Base BCV: ${formatBs(exchangeRate)}`, 14, 30);
      
      let filterText = 'Filtros de Periodo: ';
      if (startDate) filterText += `Desde: ${startDate} `;
      if (endDate) filterText += `Hasta: ${endDate} `;
      if (!startDate && !endDate) filterText += 'Historico Completo';
      doc.text(filterText, 14, 34);
      
      // 1. KPI Cards
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text('1. INDICADORES CLAVE DE RENDIMIENTO (KPIs)', 14, 42);

      const kpis = [
        ['Metrica Bimonetaria', 'Valor Calculado', 'Significado y Salud Financiera'],
        ['Saldo Neto Pendiente Cartera', formatCurrency(predictiveAnalysisData.totalCXCPending), 'Monto total en la calle a ser cobrado'],
        ['Tasa de Retorno/Cobranza', `${predictiveAnalysisData.recoveryRate.toFixed(1)}%`, predictiveAnalysisData.recoveryRate >= 75 ? 'Excelente velocidad de cobro' : 'Alerta: retrasos en abonos'],
        ['Indice Dolarizacion Recaudacion', `${predictiveAnalysisData.dollarizationIndex.toFixed(1)}%`, 'Porcentaje del ingreso total cobrado en USD ($)'],
        ['Tiempo de Retorno de Flujo', `${predictiveAnalysisData.estimatedDaysToClear === 999 ? 'Ninguno' : `${predictiveAnalysisData.estimatedDaysToClear} dias`}`, 'Dias promedio para liquidar el saldo total actual']
      ];

      autoTable(doc, {
        startY: 45,
        head: [kpis[0]],
        body: kpis.slice(1),
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 8.5 }
      });

      // 2. Breakdown of collection table
      const currentY1 = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text('2. DESGLOSE BIMONETARIO DE COBROS Y PAGOS REALIZADOS', 14, currentY1);

      const totalAbonosVal = predictiveAnalysisData.totalPeriodAbonosUsdVal || 1;
      const breakdownRows = [
        ['Instrumento de Pago', 'Monto Equivalente ($)', 'Proporcion (%)', 'Descripcion'],
        ['Dolares Efectivo (Cash $)', formatCurrency(predictiveAnalysisData.usdCashAmount), `${(predictiveAnalysisData.usdCashAmount / totalAbonosVal * 100).toFixed(1)}%`, 'Flujo en dolares fisicos billete'],
        ['Dolares Transferencia / Zelle', formatCurrency(predictiveAnalysisData.usdZelleAmount), `${(predictiveAnalysisData.usdZelleAmount / totalAbonosVal * 100).toFixed(1)}%`, 'Divisas electronicas de compensacion'],
        ['Bolivares (Pago Movil / Transf.)', formatCurrency(predictiveAnalysisData.bsAmountUsdVal), `${(predictiveAnalysisData.bsAmountUsdVal / totalAbonosVal * 100).toFixed(1)}%`, `Equivalente a ${formatBs(predictiveAnalysisData.bsAmountBsActual)}`],
        ['Garantias Aplicadas', formatCurrency(predictiveAnalysisData.warrantyAmountUsd), `${(predictiveAnalysisData.warrantyAmountUsd / totalAbonosVal * 100).toFixed(1)}%`, 'Compensacion de retornos de envases'],
        ['Donaciones o Exenciones', formatCurrency(predictiveAnalysisData.donationAmountUsd), `${(predictiveAnalysisData.donationAmountUsd / totalAbonosVal * 100).toFixed(1)}%`, 'Bonificaciones excepcionales hechas']
      ];

      autoTable(doc, {
        startY: currentY1 + 3,
        head: [breakdownRows[0]],
        body: breakdownRows.slice(1),
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85] },
        styles: { fontSize: 8.5 }
      });

      // 3. Proyecciones Predictivas
      const currentY2 = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text('3. PRONOSTICOS Y PROYECCIONES PREDICTIVAS A 30 DIAS', 14, currentY2);

      const trendStr = predictiveAnalysisData.projectedCXCChange30d > 0
        ? `En Alza (aumentara $${predictiveAnalysisData.projectedCXCChange30d.toLocaleString()} USD)`
        : `En Descenso (disminuira $${Math.abs(predictiveAnalysisData.projectedCXCChange30d).toLocaleString()} USD)`;

      const predictionsRows = [
        ['Indicador Predictivo', 'Valor Pronosticado', 'Impacto Operativo'],
        ['Tendencia del Saldo Cartera (30d)', formatCurrency(predictiveAnalysisData.projectedCXCSaldo30d), `Deberia situarse en ${trendStr}`],
        ['Riesgo Cambiario en Bs (Anualizado/30d)', `-$${predictiveAnalysisData.projectedDevaluationLossUsd.toFixed(2)} USD`, 'Perdida por depreciacion si los Bolivares se retienen'],
        ['Dias de Retorno Efectivo de Fondos', `${predictiveAnalysisData.estimatedDaysToClear === 999 ? 'Incalculable' : `${predictiveAnalysisData.estimatedDaysToClear} dias`}`, 'Plazo promedio que toma cada dolar en volver a caja']
      ];

      autoTable(doc, {
        startY: currentY2 + 3,
        head: [predictionsRows[0]],
        body: predictionsRows.slice(1),
        theme: 'grid',
        headStyles: { fillColor: [15, 118, 110] },
        styles: { fontSize: 8.5 }
      });

      // 4. Diagnostico de Problemas Detectados y Soluciones
      const currentY3 = (doc as any).lastAutoTable.finalY + 8;
      
      // Check if we need a page break to fit the problems
      let startingY4 = currentY3;
      if (startingY4 > 220) {
        doc.addPage();
        startingY4 = 20;
      }
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text('4. DIAGNOCITO DE PROBLEMAS Y COMPROMISOS TACTICOS RECOMENDADOS', 14, startingY4);

      const problemRows: any[] = [];
      predictiveAnalysisData.problems.forEach((p, idx) => {
        problemRows.push([
          `[${p.severity}] ${p.title}`,
          p.description,
          p.solution
        ]);
      });

      autoTable(doc, {
        startY: startingY4 + 3,
        head: [['Gravedad & Problema Detectado', 'Detalles Analizados', 'Solucion Propuesta Recomendada']],
        body: problemRows,
        theme: 'grid',
        headStyles: { fillColor: [190, 24, 74] },
        styles: { fontSize: 8.5, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 70 },
          2: { cellWidth: 70 }
        }
      });

      // Footer signature
      const finalY = (doc as any).lastAutoTable.finalY + 12;
      let signatureY = finalY;
      if (signatureY > 265) {
        doc.addPage();
        signatureY = 30;
      }
      
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 116, 139);
      doc.text('Este es un informe financiero predictivo bimonetario automatizado para INVEPINCA CA.', 14, signatureY);
      doc.text('Generado mediante el Motor Experto AI-Predictive en Dolares y Bolivares de manera segura.', 14, signatureY + 4);

      const pdfName = `Informe_Predictivo_INVEPINCA_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      doc.save(pdfName);
      return;
    }

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
        <button
          onClick={() => setActiveReport('predictive_analysis')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-colors flex items-center gap-2 ${
            activeReport === 'predictive_analysis' 
              ? 'bg-amber-600 text-white shadow-sm font-bold border border-amber-600' 
              : 'bg-amber-50 text-amber-850 hover:bg-amber-100 border border-amber-200'
          }`}
        >
          <TrendingUp size={14} /> Análisis Financiero y Predictivo
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
        
        {/* Report 5: Análisis Financiero y Predictivo */}
        {activeReport === 'predictive_analysis' && (
          <div className="p-6 space-y-6 bg-slate-50/50">
            {/* Top overview info banner with premium feel */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl shadow-md border border-slate-700/30">
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 uppercase tracking-widest leading-none">Motor Analítico Activo</span>
                <h4 className="text-lg font-black tracking-tight mt-1 flex items-center gap-2">
                  <TrendingUp className="text-amber-500" size={18} />
                  Análisis Predictivo Integral de Gestión
                </h4>
                <p className="text-xs text-slate-300 font-medium max-w-xl leading-relaxed">
                  Evaluación estadística detallada de la velocidad de recuperación de saldos cargados, distribución monetaria de cobros en caja, problemas operacionales críticos y devaluación estimada.
                </p>
              </div>
              <div className="flex items-center gap-3 bg-white/10 px-4 py-3 rounded-xl border border-white/10">
                <div className="text-xs font-semibold text-slate-200">
                  <div>Retorno Estimado de Fondos</div>
                  <div className="text-base font-black text-white">{predictiveAnalysisData.estimatedDaysToClear === 999 ? 'Indefinido' : `~ ${predictiveAnalysisData.estimatedDaysToClear} días`}</div>
                </div>
              </div>
            </div>

            {/* KPIs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Cartera CXC Pendiente</span>
                  <p className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(predictiveAnalysisData.totalCXCPending)}</p>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 mt-2 block">Saldo bruto activo cobrable en la calle</span>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Tasa de Cobranza (Periodo)</span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <p className="text-2xl font-black text-slate-900">{predictiveAnalysisData.recoveryRate.toFixed(1)}%</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      predictiveAnalysisData.recoveryRate >= 75 ? 'bg-emerald-100 text-emerald-800' :
                      predictiveAnalysisData.recoveryRate >= 50 ? 'bg-amber-100 text-amber-805' : 'bg-red-100 text-red-800'
                    }`}>
                      {predictiveAnalysisData.recoveryRate >= 75 ? 'Excelente' :
                       predictiveAnalysisData.recoveryRate >= 50 ? 'Aceptable' : 'Peligro'}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 mt-2 block">Porcentaje de abonos recibidos vs deudas cargadas</span>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Índice Dolarización Reclamos</span>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{predictiveAnalysisData.dollarizationIndex.toFixed(1)}%</p>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 mt-2 block">Indica la proporción de cobro efectivo en moneda fuerte ($)</span>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Egresos Totales (Periodo)</span>
                  <p className="text-2xl font-black text-rose-600 mt-1">{formatCurrency(predictiveAnalysisData.totalOutflowUsdVal)}</p>
                </div>
                <span className="text-[10px] font-semibold text-rose-600 mt-2 block">
                  Provisto en Bsf: {formatBs(predictiveAnalysisData.totalOutflowBs)}
                </span>
              </div>
            </div>

            {/* Breakdown of Payments (Gestión de Pagos Realizados) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Box 1: Payments Breakdown Instrument and Proportions */}
              <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm space-y-4">
                <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <DollarSign size={14} className="text-amber-500" /> Desglose de Instrumentos de Pago Recibidos
                </h5>
                <div className="space-y-4">
                  {/* USD Cash */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">Dólares Efectivo (Cash $)</span>
                      <span className="font-extrabold text-slate-900">{formatCurrency(predictiveAnalysisData.usdCashAmount)} ({(predictiveAnalysisData.usdCashAmount / (predictiveAnalysisData.totalPeriodAbonosUsdVal || 1) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(predictiveAnalysisData.usdCashAmount / (predictiveAnalysisData.totalPeriodAbonosUsdVal || 1) * 100)}%` }} />
                    </div>
                  </div>

                  {/* USD Zelle/Virtual */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">Dólares Electrónico (Zelle/Transferencia)</span>
                      <span className="font-extrabold text-slate-900">{formatCurrency(predictiveAnalysisData.usdZelleAmount)} ({(predictiveAnalysisData.usdZelleAmount / (predictiveAnalysisData.totalPeriodAbonosUsdVal || 1) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(predictiveAnalysisData.usdZelleAmount / (predictiveAnalysisData.totalPeriodAbonosUsdVal || 1) * 100)}%` }} />
                    </div>
                  </div>

                  {/* Bolívares */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">Bolívares (Pago Móvil / Transferencias BS)</span>
                      <span className="font-extrabold text-slate-900">{formatCurrency(predictiveAnalysisData.bsAmountUsdVal)} ({(predictiveAnalysisData.bsAmountUsdVal / (predictiveAnalysisData.totalPeriodAbonosUsdVal || 1) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-400 rounded-full" style={{ width: `${(predictiveAnalysisData.bsAmountUsdVal / (predictiveAnalysisData.totalPeriodAbonosUsdVal || 1) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-semibold block text-right font-mono text-sky-600">Total recibido en moneda nacional: {formatBs(predictiveAnalysisData.bsAmountBsActual)}</span>
                  </div>

                  {/* Warranties & Exemptions */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div className="p-2.5 bg-purple-50 border border-purple-100 rounded-xl text-center">
                      <span className="text-[10px] font-black text-purple-500 uppercase tracking-widest block">Garantías Aplicadas</span>
                      <span className="text-sm font-black text-purple-700">{formatCurrency(predictiveAnalysisData.warrantyAmountUsd)}</span>
                    </div>
                    <div className="p-2.5 bg-pink-50 border border-pink-100 rounded-xl text-center">
                      <span className="text-[10px] font-black text-pink-500 uppercase tracking-widest block">Exenciones / Descuentos</span>
                      <span className="text-sm font-black text-pink-700">{formatCurrency(predictiveAnalysisData.donationAmountUsd)}</span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Box 2: 30-day Predictive Models Forecast */}
              <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm space-y-4">
                <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <TrendingUp size={14} className="text-indigo-500" /> Pronósticos y Modelos Predictivos (Próximos 30 días)
                </h5>
                <div className="grid grid-cols-1 gap-3">
                  
                  <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tendencia Saldo de Cartera (30 d)</span>
                      <span className="text-base font-black text-slate-900 mt-0.5 block">{formatCurrency(predictiveAnalysisData.projectedCXCSaldo30d)}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-bold ${predictiveAnalysisData.projectedCXCChange30d > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {predictiveAnalysisData.projectedCXCChange30d > 0 ? '▲ En Aumento' : '▼ En Descenso'}
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">({predictiveAnalysisData.projectedCXCChange30d > 0 ? 'Acredita más de lo cobrado' : 'Cobros dominan cartera'})</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-amber-50/40 border border-amber-100 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Previsión Depreciación Bolívares</span>
                      <span className="text-sm font-black text-red-650 mt-0.5 block">-$ {predictiveAnalysisData.projectedDevaluationLossUsd.toFixed(2)} USD</span>
                    </div>
                    <div className="text-right max-w-[150px]">
                      <span className="text-[10px] font-semibold text-amber-950 leading-relaxed block text-right">Pérdida inflacionaria estimada por mantener tenencias en Bs o retrasar conversiones cambiarias.</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-emerald-50/40 border border-emerald-100 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Retorno Pleno del Fondo Monetario</span>
                      <span className="text-sm font-black text-emerald-700 mt-0.5 block font-mono">{predictiveAnalysisData.estimatedDaysToClear === 999 ? 'No estimable' : `${predictiveAnalysisData.estimatedDaysToClear} días`}</span>
                    </div>
                    <div className="text-right max-w-[160px]">
                      <span className="text-[10px] font-medium text-emerald-900 leading-relaxed block text-right">Tiempo necesario para cobrar el 100% al flujo promedio diario actual.</span>
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Section 3: Detailed Diagnósticos / Problems and recommended actions */}
            <div className="space-y-4">
              <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 pl-1">
                <Activity size={14} className="text-rose-600" /> Diagnóstico de Problemas Detectados y Soluciones
              </h5>

              <div className="grid grid-cols-1 gap-4">
                {predictiveAnalysisData.problems.map((p, index) => (
                  <div key={index} className="p-5 bg-white border border-slate-150 rounded-2xl shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider leading-none uppercase ${
                          p.severity === 'CRÍTICO' ? 'bg-red-100 text-red-700 border border-red-200' :
                          p.severity === 'ALTO' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                          p.severity === 'MODERADO' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                          'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}>
                          {p.severity}
                        </span>
                        <h6 className="text-sm font-black text-slate-900">{p.title}</h6>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Compromiso Financiero #{index + 1}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Problema Identificado</span>
                        <p className="text-slate-600 font-semibold leading-relaxed select-text">{p.description}</p>
                      </div>

                      <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-150">
                        <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest block">Solución Táctica Recomendada</span>
                        <p className="text-slate-700 font-bold leading-relaxed">{p.solution}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Note on model reliability */}
            <p className="text-[10px] text-center text-slate-400 italic">
              Este informe financiero dinámico simula la contabilidad analítica de mercado bimonetario (USD / BS) con proyecciones dinámicas basadas en los registros reales del módulo de cuentas por cobrar de INVEPINCA.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
