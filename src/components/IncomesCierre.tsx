import React, { useState, useEffect } from "react";
import { dbService } from "../services/db";
import { backupService } from "../services/backup";
import {  CashClosure,
  TransactionType,
  PaymentMethod,
  Transaction,
  Expense,
  Receipt,
  CXCPayment,
  CXCAccount,
} from "../types";
import { formatCurrency } from "../lib/utils";
import { format, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Calendar,
  Lock,
  Unlock,
  AlertTriangle,
  Search,
  Save,
  CheckCircle,
  Activity,
  DollarSign,
  Eye,
  FileText,
  Clock,
  ArrowRight,
  TrendingUp,
  Building2,
  Users,
  Coins,
} from "lucide-react";

const isBsTransaction = (t: Transaction): boolean => {
  const normalize = (str?: string) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const pMethod = normalize(t.paymentMethod);
  const currency = normalize(t.currency);

  const isBsMethod = 
    pMethod.includes("bs") ||
    pMethod.includes("bolivar") ||
    pMethod.includes("pago movil") ||
    pMethod.includes("transferencia") ||
    currency.includes("bs") ||
    currency.includes("bolivar");

  const isUsdMethod = 
    pMethod.includes("$") ||
    pMethod.includes("usd") ||
    pMethod.includes("dolar") ||
    pMethod.includes("zelle") ||
    pMethod.includes("binance") ||
    currency.includes("$") ||
    currency.includes("usd") ||
    currency.includes("dolar");

  return isBsMethod || (!isUsdMethod && !!t.amountBs && t.amountBs > 0);
};

const isCxcPaymentBs = (p: CXCPayment): boolean => {
  const normalize = (str?: string) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const pMethod = normalize(p.paymentMethod);

  const isBsMethod = 
    pMethod.includes("bs") ||
    pMethod.includes("bolivar") ||
    pMethod.includes("pago movil") ||
    pMethod.includes("transferencia");

  const isUsdMethod = 
    pMethod.includes("$") ||
    pMethod.includes("usd") ||
    pMethod.includes("dolar") ||
    pMethod.includes("zelle") ||
    pMethod.includes("binance") ||
    (pMethod.includes("efectivo") && !pMethod.includes("bs"));

  return isBsMethod || (!isUsdMethod && !!p.amountBs && p.amountBs > 0);
};

export default function IncomesCierre({
  exchangeRate,
}: {
  exchangeRate?: number;
}) {
  const [activeTab, setActiveTab] = useState<"cierre" | "reporte">("cierre");
  const [reportDate, setReportDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [detailSubTab, setDetailSubTab] = useState<"ventas" | "cargos">("ventas");

  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cxcAccounts, setCxcAccounts] = useState<CXCAccount[]>([]);

  const [unlockKey, setUnlockKey] = useState("");
  const [unlockError, setUnlockError] = useState("");

  // Physical count state
  const [actualUsd, setActualUsd] = useState("0");
  const [actualBs, setActualBs] = useState("0");
  const [observations, setObservations] = useState("");

  const [allPayments, setAllPayments] = useState<CXCPayment[]>([]);

  useEffect(() => {
    const unsub1 = dbService.subscribeToCashClosures(setClosures);
    const unsub2 = dbService.subscribeToTransactions(setTransactions);
    const unsub3 = dbService.subscribeToAllPayments(setAllPayments);
    const unsub4 = dbService.subscribeToCXCAccounts(setCxcAccounts);
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, []);

  const isPeriodMode = startDate !== endDate;
  const currentClosure = closures.find((c) => c.date === startDate);
  const isClosed = !isPeriodMode && (currentClosure?.isClosed || false);

  // Compute period totals
  const dailyTransactions = transactions.filter(
    (t) =>
      t.date >= startDate &&
      t.date <= endDate &&
      t.type !== TransactionType.WITHDRAWAL,
  );

  const expensesUsd = 0;
  const expensesBs = 0;
  const withdrawalsUsd = 0;
  const withdrawalsBs = 0;

  // Let's first compute the standard sales metrics from normal transactions
  // (which are all transactions EXCEPT credit sales/CXC charges and CXC payments/abonos)
  let salesIncomesUsd = 0;
  let salesIncomesBs = 0;
  let salesIncomesBsUsd = 0;
  let salesBsInBanks = 0;
  let salesBsInBanksUsd = 0;
  let salesUsdInBanks = 0;

  dailyTransactions.forEach((t) => {
    const rate = t.exchangeRate || exchangeRate || 1;
    const amtUsd = t.amountUsd || 0;
    const destClean = (t.destinationBank || "").trim().toUpperCase();
    const conceptUpper = (t.concept || "").toUpperCase();
    const pMethodUpper = (t.paymentMethod || "").toUpperCase();
    const sellerUpper = (t.sellerName || "").toUpperCase();
    const clientUpper = (t.clientName || "").toUpperCase();

    // Skip warranties, donations, exemptions, etc. so they do not impact the cash reconciliation
    const isWarranty =
      destClean.includes("GARANT") ||
      pMethodUpper.includes("GARANT") ||
      conceptUpper.includes("GARANT") ||
      sellerUpper.includes("GARANT") ||
      clientUpper.includes("GARANT");
    const isDonation =
      destClean.includes("DONAC") ||
      pMethodUpper.includes("DONAC") ||
      conceptUpper.includes("DONAC") ||
      sellerUpper.includes("DONAC") ||
      clientUpper.includes("DONAC") ||
      destClean.includes("EXENC") ||
      pMethodUpper.includes("EXENC") ||
      conceptUpper.includes("EXENC") ||
      destClean.includes("EXCENC") ||
      pMethodUpper.includes("EXCENC") ||
      conceptUpper.includes("EXCENC") ||
      destClean.includes("EXENT") ||
      pMethodUpper.includes("EXENT") ||
      conceptUpper.includes("EXENT") ||
      destClean.includes("EXCENT") ||
      pMethodUpper.includes("EXCENT") ||
      conceptUpper.includes("EXCENT") ||
      destClean.includes("CORTES") ||
      pMethodUpper.includes("CORTES") ||
      conceptUpper.includes("CORTES") ||
      destClean.includes("DESCUENT") ||
      pMethodUpper.includes("DESCUENT") ||
      conceptUpper.includes("DESCUENT") ||
      destClean.includes("ANULA") ||
      pMethodUpper.includes("ANULA") ||
      conceptUpper.includes("ANULA") ||
      destClean.includes("BONIF") ||
      pMethodUpper.includes("BONIF") ||
      conceptUpper.includes("BONIF");

    if (isWarranty || isDonation) {
      return; // Do not sum to physical cash or bank balances
    }

    const isCXCPayment =
      t.type === TransactionType.INCOME &&
      (conceptUpper.includes("ABONO CUENTAS POR COBRAR") ||
        conceptUpper.includes("(CXC)"));

    const isCXCField =
      t.isCXC ||
      t.paymentMethod === PaymentMethod.CXC ||
      destClean.includes("CXC") ||
      destClean.includes("COBRAR");

    // Skip CXC charges and payments here because they are calculated from the master payments list
    if (isCXCField || isCXCPayment) {
      return;
    }

    const isCashDest =
      destClean.includes("EFECTIVO") ||
      destClean.includes("CAJA") ||
      destClean === "";
    const isBankDest = destClean.length > 0 && !isCashDest;

    const isBank =
      isBankDest ||
      t.paymentMethod === PaymentMethod.BS ||
      t.paymentMethod === PaymentMethod.ZELLE ||
      t.paymentMethod === PaymentMethod.BINANCE;

    const isBs = isBsTransaction(t);

    if (isBs) {
      const amountBsVal =
        t.amountBs && t.amountBs > 0 ? t.amountBs : amtUsd * rate;
      const eqUsd = rate > 0 ? amountBsVal / rate : amtUsd;

      if (isBank) {
        salesBsInBanks += amountBsVal;
        salesBsInBanksUsd += eqUsd;
      } else {
        salesIncomesBs += amountBsVal;
        salesIncomesBsUsd += eqUsd;
      }
    } else {
      // USD ($)
      if (isBank) {
        salesUsdInBanks += amtUsd;
      } else {
        salesIncomesUsd += amtUsd;
      }
    }
  });

  // Calculate CXC charges directly from All Payments subcollection group
  const periodPaymentsList = allPayments.filter(
    (p) => p.date >= startDate && p.date <= endDate
  );

  let totalCxc = 0;

  periodPaymentsList.forEach((p) => {
    const dest = (p.destinationBank || "").toUpperCase();
    const pMethod = (p.paymentMethod || "").toUpperCase();
    const concept = (p.concept || "").toUpperCase();
    const seller = (p.sellerName || "").toUpperCase();
    const client = (p.clientName || "").toUpperCase();

    const isWarranty =
      dest.includes("GARANT") ||
      pMethod.includes("GARANT") ||
      concept.includes("GARANT") ||
      seller.includes("GARANT") ||
      client.includes("GARANT");
    const isDonation =
      dest.includes("DONAC") ||
      pMethod.includes("DONAC") ||
      concept.includes("DONAC") ||
      seller.includes("DONAC") ||
      client.includes("DONAC") ||
      dest.includes("EXENC") ||
      pMethod.includes("EXENC") ||
      concept.includes("EXENC") ||
      dest.includes("EXCENC") ||
      pMethod.includes("EXCENC") ||
      concept.includes("EXCENC") ||
      dest.includes("EXENT") ||
      pMethod.includes("EXENT") ||
      concept.includes("EXENT") ||
      dest.includes("EXCENT") ||
      pMethod.includes("EXCENT") ||
      concept.includes("EXCENT") ||
      dest.includes("CORTES") ||
      pMethod.includes("CORTES") ||
      concept.includes("CORTES") ||
      dest.includes("DESCUENT") ||
      pMethod.includes("DESCUENT") ||
      concept.includes("DESCUENT") ||
      dest.includes("ANULA") ||
      pMethod.includes("ANULA") ||
      concept.includes("ANULA") ||
      dest.includes("BONIF") ||
      pMethod.includes("BONIF") ||
      concept.includes("BONIF");

    if (p.type === "charge") {
      if (!isWarranty && !isDonation) {
        // Balance to accounts receivable, we match the Monto Bruto of reports
        totalCxc += p.grossAmountUsd || p.amountUsd || 0;
      }
    }
  });

  // Group BS banks for standard direct sales
  const bsBanksMap: { [bankName: string]: { amountBs: number; amountUsd: number } } = {};
  // Group USD banks for standard direct sales
  const usdBanksMap: { [bankName: string]: number } = {};

  // 1. Process standard transactions (direct sales)
  dailyTransactions.forEach((t) => {
    const rate = t.exchangeRate || exchangeRate || 1;
    const amtUsd = t.amountUsd || 0;
    const destClean = (t.destinationBank || "").trim().toUpperCase();
    const conceptUpper = (t.concept || "").toUpperCase();
    const pMethodUpper = (t.paymentMethod || "").toUpperCase();
    const sellerUpper = (t.sellerName || "").toUpperCase();
    const clientUpper = (t.clientName || "").toUpperCase();

    const isWarranty =
      destClean.includes("GARANT") ||
      pMethodUpper.includes("GARANT") ||
      conceptUpper.includes("GARANT") ||
      sellerUpper.includes("GARANT") ||
      clientUpper.includes("GARANT");
    const isDonation =
      destClean.includes("DONAC") ||
      pMethodUpper.includes("DONAC") ||
      conceptUpper.includes("DONAC") ||
      sellerUpper.includes("DONAC") ||
      clientUpper.includes("DONAC") ||
      destClean.includes("EXENC") ||
      pMethodUpper.includes("EXENC") ||
      conceptUpper.includes("EXENC") ||
      destClean.includes("EXCENC") ||
      pMethodUpper.includes("EXCENC") ||
      conceptUpper.includes("EXCENC") ||
      destClean.includes("EXENT") ||
      pMethodUpper.includes("EXENT") ||
      conceptUpper.includes("EXENT") ||
      destClean.includes("EXCENT") ||
      pMethodUpper.includes("EXCENT") ||
      conceptUpper.includes("EXCENT") ||
      destClean.includes("CORTES") ||
      pMethodUpper.includes("CORTES") ||
      conceptUpper.includes("CORTES") ||
      destClean.includes("DESCUENT") ||
      pMethodUpper.includes("DESCUENT") ||
      conceptUpper.includes("DESCUENT") ||
      destClean.includes("ANULA") ||
      pMethodUpper.includes("ANULA") ||
      conceptUpper.includes("ANULA") ||
      destClean.includes("BONIF") ||
      pMethodUpper.includes("BONIF") ||
      conceptUpper.includes("BONIF");

    if (isWarranty || isDonation) return;

    const isCXCPayment =
      t.type === TransactionType.INCOME &&
      (conceptUpper.includes("ABONO CUENTAS POR COBRAR") ||
        conceptUpper.includes("(CXC)"));

    const isCXCField =
      t.isCXC ||
      t.paymentMethod === PaymentMethod.CXC ||
      destClean.includes("CXC") ||
      destClean.includes("COBRAR");

    if (isCXCField || isCXCPayment) return;

    const isCashDest =
      destClean.includes("EFECTIVO") ||
      destClean.includes("CAJA") ||
      destClean === "";
    const isBankDest = destClean.length > 0 && !isCashDest;

    const isBank =
      isBankDest ||
      t.paymentMethod === PaymentMethod.BS ||
      t.paymentMethod === PaymentMethod.ZELLE ||
      t.paymentMethod === PaymentMethod.BINANCE;

    if (isBank) {
      const isBs = isBsTransaction(t);
      const bankName = (t.destinationBank || t.paymentMethod || "OTRO BANCO").trim().toUpperCase();

      if (isBs) {
        const amountBsVal = t.amountBs && t.amountBs > 0 ? t.amountBs : amtUsd * rate;
        const eqUsd = rate > 0 ? amountBsVal / rate : amtUsd;
        if (!bsBanksMap[bankName]) {
          bsBanksMap[bankName] = { amountBs: 0, amountUsd: 0 };
        }
        bsBanksMap[bankName].amountBs += amountBsVal;
        bsBanksMap[bankName].amountUsd += eqUsd;
      } else {
        if (!usdBanksMap[bankName]) {
          usdBanksMap[bankName] = 0;
        }
        usdBanksMap[bankName] += amtUsd;
      }
    }
  });

  // Re-aggregate incomes and total balances for system box tracking (strictly standard direct sales coming from the main cash registry (caja principal))
  const incomesUsd = salesIncomesUsd;
  const incomesBs = salesIncomesBs;
  const incomesBsUsd = salesIncomesBsUsd;

  const totalBsInBanks = salesBsInBanks;
  const totalBsInBanksUsd = salesBsInBanksUsd;
  const totalUsdInBanks = salesUsdInBanks;

  // Let's compute the Total of Direct Sales in USD
  const totalVentasDirectasUsd = salesIncomesUsd + salesIncomesBsUsd + salesBsInBanksUsd + salesUsdInBanks;

  // Total Resumen de operaciones = Ventas Directas + Cuentas por Cobrar (Nuevos Cargos CXC hoy)
  const totalResumenOperaciones = totalVentasDirectasUsd + totalCxc;

  // Total sales includes regular cash/bank sales in USD + the CXC charges (from the report!)
  const totalSalesUsd = totalResumenOperaciones;

  // Expected balances based on the startDate (Initial balance is eliminated/set to 0 by request)
  const initialUsd = 0;
  const initialBs = 0;

  const expectedUsd = incomesUsd - expensesUsd - withdrawalsUsd;
  const expectedBs = incomesBs - expensesBs - withdrawalsBs;

  // Filter closures recorded in the selected period for history display
  const periodClosures = closures
    .filter((c) => c.date >= startDate && c.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  // When physical inputs change
  const actUsd = parseFloat(actualUsd) || 0;
  const actBs = parseFloat(actualBs) || 0;
  const diffUsd = Number((actUsd - expectedUsd).toFixed(2));
  const diffBs = Number((actBs - expectedBs).toFixed(2));

  const [isClosing, setIsClosing] = useState(false);

  const handleCloseRegister = async () => {
    setIsClosing(true);
    try {
      const data: Omit<CashClosure, "id" | "createdAt"> = {
        date: startDate,
        initialBalanceUsd: initialUsd,
        initialBalanceBs: initialBs,
        incomesUsd,
        incomesBs,
        expensesUsd,
        expensesBs,
        withdrawalsUsd,
        withdrawalsBs,
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
        await dbService.updateCashClosure(currentClosure.id, {
          ...data,
          isClosed: true,
          closedAt: new Date(),
        });
      } else {
        await dbService.addCashClosure(data);
      }

      // Trigger automatic backup if configured for cash closure
      try {
        const backupResult = await backupService.triggerClosureBackup();
        if (backupResult.executed) {
          console.log("[Backup] Respaldo automático por cierre de caja ejecutado: ", backupResult.method);
        }
      } catch (backupErr) {
        console.error("Error doing automatic backup on cash closure:", backupErr);
      }

      setObservations("");
      setActualUsd("0");
      setActualBs("0");
    } catch (e) {
      console.error(e);
      alert("Error cerrando caja: " + String(e));
    } finally {
      setIsClosing(false);
    }
  };

  const handleUnlock = async () => {
    if (unlockKey === "admin123") {
      if (currentClosure?.id) {
        await dbService.updateCashClosure(currentClosure.id, {
          isClosed: false,
        });
      }
      setUnlockKey("");
      setUnlockError("");
    } else {
      setUnlockError("Llave digital incorrecta.");
    }
  };

  // Pre-fill actual inputs if there is a current closure
  useEffect(() => {
    if (currentClosure) {
      setActualUsd(currentClosure.actualBalanceUsd.toString());
      setActualBs(currentClosure.actualBalanceBs.toString());
      setObservations(currentClosure.observations || "");
    } else {
      setActualUsd("0");
      setActualBs("0");
      setObservations("");
    }
  }, [currentClosure, startDate, endDate]);

  const getDayName = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr + "T12:00:00");
    if (!isValid(date)) return "";
    return format(date, "EEEE d MMMM, yyyy", { locale: es });
  };

  const formatBs = (amt: number) => {
    return (
      "Bs " +
      new Intl.NumberFormat("es-VE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amt)
    );
  };

  // Isolate query variables for reportDate
  const reportTransactions = transactions.filter(
    (t) => t.date === reportDate && t.type !== TransactionType.WITHDRAWAL
  );

  let rSalesIncomesUsd = 0;
  let rSalesIncomesBs = 0;
  let rSalesIncomesBsUsd = 0;
  let rSalesBsInBanks = 0;
  let rSalesBsInBanksUsd = 0;
  let rSalesUsdInBanks = 0;

  reportTransactions.forEach((t) => {
    const rate = t.exchangeRate || exchangeRate || 1;
    const amtUsd = t.amountUsd || 0;
    const destClean = (t.destinationBank || "").trim().toUpperCase();
    const conceptUpper = (t.concept || "").toUpperCase();
    const pMethodUpper = (t.paymentMethod || "").toUpperCase();
    const sellerUpper = (t.sellerName || "").toUpperCase();
    const clientUpper = (t.clientName || "").toUpperCase();

    const isWarranty =
      destClean.includes("GARANT") ||
      pMethodUpper.includes("GARANT") ||
      conceptUpper.includes("GARANT") ||
      sellerUpper.includes("GARANT") ||
      clientUpper.includes("GARANT");
    const isDonation =
      destClean.includes("DONAC") ||
      pMethodUpper.includes("DONAC") ||
      conceptUpper.includes("DONAC") ||
      sellerUpper.includes("DONAC") ||
      clientUpper.includes("DONAC") ||
      destClean.includes("EXENC") ||
      pMethodUpper.includes("EXENC") ||
      conceptUpper.includes("EXENC") ||
      destClean.includes("EXCENC") ||
      pMethodUpper.includes("EXCENC") ||
      conceptUpper.includes("EXCENC") ||
      destClean.includes("EXENT") ||
      pMethodUpper.includes("EXENT") ||
      conceptUpper.includes("EXENT") ||
      destClean.includes("EXCENT") ||
      pMethodUpper.includes("EXCENT") ||
      conceptUpper.includes("EXCENT") ||
      destClean.includes("CORTES") ||
      pMethodUpper.includes("CORTES") ||
      conceptUpper.includes("CORTES") ||
      destClean.includes("DESCUENT") ||
      pMethodUpper.includes("DESCUENT") ||
      conceptUpper.includes("DESCUENT") ||
      destClean.includes("ANULA") ||
      pMethodUpper.includes("ANULA") ||
      conceptUpper.includes("ANULA") ||
      destClean.includes("BONIF") ||
      pMethodUpper.includes("BONIF") ||
      conceptUpper.includes("BONIF");

    if (isWarranty || isDonation) {
      return;
    }

    const isCXCPayment =
      t.type === TransactionType.INCOME &&
      (conceptUpper.includes("ABONO CUENTAS POR COBRAR") ||
        conceptUpper.includes("(CXC)"));

    const isCXCField =
      t.isCXC ||
      t.paymentMethod === PaymentMethod.CXC ||
      destClean.includes("CXC") ||
      destClean.includes("COBRAR");

    if (isCXCField || isCXCPayment) {
      return;
    }

    const isCashDest =
      destClean.includes("EFECTIVO") ||
      destClean.includes("CAJA") ||
      destClean === "";
    const isBankDest = destClean.length > 0 && !isCashDest;

    const isBank =
      isBankDest ||
      t.paymentMethod === PaymentMethod.BS ||
      t.paymentMethod === PaymentMethod.ZELLE ||
      t.paymentMethod === PaymentMethod.BINANCE;

    const isBs = isBsTransaction(t);

    if (isBs) {
      const amountBsVal =
        t.amountBs && t.amountBs > 0 ? t.amountBs : amtUsd * rate;
      const eqUsd = rate > 0 ? amountBsVal / rate : amtUsd;

      if (isBank) {
        rSalesBsInBanks += amountBsVal;
        rSalesBsInBanksUsd += eqUsd;
      } else {
        rSalesIncomesBs += amountBsVal;
        rSalesIncomesBsUsd += eqUsd;
      }
    } else {
      if (isBank) {
        rSalesUsdInBanks += amtUsd;
      } else {
        rSalesIncomesUsd += amtUsd;
      }
    }
  });

  const reportPaymentsList = allPayments.filter((p) => p.date === reportDate);
  const reportAbonosList = reportPaymentsList.filter((p) => p.type !== "charge");
  const reportCargosList = reportPaymentsList.filter((p) => p.type === "charge");

  let rTotalCxc = 0;

  reportPaymentsList.forEach((p) => {
    const dest = (p.destinationBank || "").toUpperCase();
    const pMethod = (p.paymentMethod || "").toUpperCase();
    const concept = (p.concept || "").toUpperCase();
    const seller = (p.sellerName || "").toUpperCase();
    const client = (p.clientName || "").toUpperCase();

    const isWarranty =
      dest.includes("GARANT") ||
      pMethod.includes("GARANT") ||
      concept.includes("GARANT") ||
      seller.includes("GARANT") ||
      client.includes("GARANT");
    const isDonation =
      dest.includes("DONAC") ||
      pMethod.includes("DONAC") ||
      concept.includes("DONAC") ||
      seller.includes("DONAC") ||
      client.includes("DONAC") ||
      dest.includes("EXENC") ||
      pMethod.includes("EXENC") ||
      concept.includes("EXENC") ||
      dest.includes("EXCENC") ||
      pMethod.includes("EXCENC") ||
      concept.includes("EXCENC") ||
      dest.includes("EXENT") ||
      pMethod.includes("EXENT") ||
      concept.includes("EXENT") ||
      dest.includes("EXCENT") ||
      pMethod.includes("EXCENT") ||
      concept.includes("EXCENT") ||
      dest.includes("CORTES") ||
      pMethod.includes("CORTES") ||
      concept.includes("CORTES") ||
      dest.includes("DESCUENT") ||
      pMethod.includes("DESCUENT") ||
      concept.includes("DESCUENT") ||
      dest.includes("ANULA") ||
      pMethod.includes("ANULA") ||
      concept.includes("ANULA") ||
      dest.includes("BONIF") ||
      pMethod.includes("BONIF") ||
      concept.includes("BONIF");

    if (p.type === "charge") {
      if (!isWarranty && !isDonation) {
        rTotalCxc += p.grossAmountUsd || p.amountUsd || 0;
      }
    }
  });

  // Group BS banks for report
  const rBsBanksMap: { [bankName: string]: { amountBs: number; amountUsd: number } } = {};
  // Group USD banks for report
  const rUsdBanksMap: { [bankName: string]: number } = {};

  // 1. Process report transactions (direct sales)
  reportTransactions.forEach((t) => {
    const rate = t.exchangeRate || exchangeRate || 1;
    const amtUsd = t.amountUsd || 0;
    const destClean = (t.destinationBank || "").trim().toUpperCase();
    const conceptUpper = (t.concept || "").toUpperCase();
    const pMethodUpper = (t.paymentMethod || "").toUpperCase();
    const sellerUpper = (t.sellerName || "").toUpperCase();
    const clientUpper = (t.clientName || "").toUpperCase();

    const isWarranty =
      destClean.includes("GARANT") ||
      pMethodUpper.includes("GARANT") ||
      conceptUpper.includes("GARANT") ||
      sellerUpper.includes("GARANT") ||
      clientUpper.includes("GARANT");
    const isDonation =
      destClean.includes("DONAC") ||
      pMethodUpper.includes("DONAC") ||
      conceptUpper.includes("DONAC") ||
      sellerUpper.includes("DONAC") ||
      clientUpper.includes("DONAC") ||
      destClean.includes("EXENC") ||
      pMethodUpper.includes("EXENC") ||
      conceptUpper.includes("EXENC") ||
      destClean.includes("EXCENC") ||
      pMethodUpper.includes("EXCENC") ||
      conceptUpper.includes("EXCENC") ||
      destClean.includes("EXENT") ||
      pMethodUpper.includes("EXENT") ||
      conceptUpper.includes("EXENT") ||
      destClean.includes("EXCENT") ||
      pMethodUpper.includes("EXCENT") ||
      conceptUpper.includes("EXCENT") ||
      destClean.includes("CORTES") ||
      pMethodUpper.includes("CORTES") ||
      conceptUpper.includes("CORTES") ||
      destClean.includes("DESCUENT") ||
      pMethodUpper.includes("DESCUENT") ||
      conceptUpper.includes("DESCUENT") ||
      destClean.includes("ANULA") ||
      pMethodUpper.includes("ANULA") ||
      conceptUpper.includes("ANULA") ||
      destClean.includes("BONIF") ||
      pMethodUpper.includes("BONIF") ||
      conceptUpper.includes("BONIF");

    if (isWarranty || isDonation) return;

    const isCXCPayment =
      t.type === TransactionType.INCOME &&
      (conceptUpper.includes("ABONO CUENTAS POR COBRAR") ||
        conceptUpper.includes("(CXC)"));

    const isCXCField =
      t.isCXC ||
      t.paymentMethod === PaymentMethod.CXC ||
      destClean.includes("CXC") ||
      destClean.includes("COBRAR");

    if (isCXCField || isCXCPayment) return;

    const isCashDest =
      destClean.includes("EFECTIVO") ||
      destClean.includes("CAJA") ||
      destClean === "";
    const isBankDest = destClean.length > 0 && !isCashDest;

    const isBank =
      isBankDest ||
      t.paymentMethod === PaymentMethod.BS ||
      t.paymentMethod === PaymentMethod.ZELLE ||
      t.paymentMethod === PaymentMethod.BINANCE;

    if (isBank) {
      const isBs = isBsTransaction(t);
      const bankName = (t.destinationBank || t.paymentMethod || "OTRO BANCO").trim().toUpperCase();

      if (isBs) {
        const amountBsVal = t.amountBs && t.amountBs > 0 ? t.amountBs : amtUsd * rate;
        const eqUsd = rate > 0 ? amountBsVal / rate : amtUsd;
        if (!rBsBanksMap[bankName]) {
          rBsBanksMap[bankName] = { amountBs: 0, amountUsd: 0 };
        }
        rBsBanksMap[bankName].amountBs += amountBsVal;
        rBsBanksMap[bankName].amountUsd += eqUsd;
      } else {
        if (!rUsdBanksMap[bankName]) {
          rUsdBanksMap[bankName] = 0;
        }
        rUsdBanksMap[bankName] += amtUsd;
      }
    }
  });

  // Re-aggregate report incomes and total balances from standard sales
  const rIncomesUsd = rSalesIncomesUsd;
  const rIncomesBs = rSalesIncomesBs;
  const rIncomesBsUsd = rSalesIncomesBsUsd;

  const rTotalBsInBanks = rSalesBsInBanks;
  const rTotalBsInBanksUsd = rSalesBsInBanksUsd;
  const rTotalUsdInBanks = rSalesUsdInBanks;

  // Let's compute the Total of Direct Sales in USD for reports
  const rTotalVentasDirectasUsd = rSalesIncomesUsd + rSalesIncomesBsUsd + rSalesBsInBanksUsd + rSalesUsdInBanks;

  // Total Resumen de operaciones = Ventas Directas + Cuentas por Cobrar (Nuevos Cargos CXC hoy)
  const rTotalSalesUsd = rTotalVentasDirectasUsd + rTotalCxc;

  // Expected balances (Initial balance is eliminated/set to 0 by request)
  const rInitialUsd = 0;
  const rInitialBs = 0;

  const rExpectedUsd = rIncomesUsd;
  const rExpectedBs = rIncomesBs;

  const rCurrentClosure = closures.find((c) => c.date === reportDate);
  const rIsClosed = rCurrentClosure?.isClosed || false;

  // Jump date helper
  const jumpDate = (days: number) => {
    const parts = reportDate.split("-");
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    d.setDate(d.getDate() + days);
    setReportDate(format(d, "yyyy-MM-dd"));
  };

  const reportVentasDirectas = reportTransactions.filter((t) => {
    const destClean = (t.destinationBank || "").trim().toUpperCase();
    const conceptUpper = (t.concept || "").toUpperCase();
    const pMethodUpper = (t.paymentMethod || "").toUpperCase();
    const sellerUpper = (t.sellerName || "").toUpperCase();
    const clientUpper = (t.clientName || "").toUpperCase();
    
    const isWarranty = destClean.includes("GARANT") || pMethodUpper.includes("GARANT") || conceptUpper.includes("GARANT") || sellerUpper.includes("GARANT") || clientUpper.includes("GARANT");
    const isDonation = destClean.includes("DONAC") || pMethodUpper.includes("DONAC") || conceptUpper.includes("DONAC") ||
                       sellerUpper.includes("DONAC") || clientUpper.includes("DONAC") ||
                       destClean.includes("EXENC") || pMethodUpper.includes("EXENC") || conceptUpper.includes("EXENC") ||
                       destClean.includes("EXCENC") || pMethodUpper.includes("EXCENC") || conceptUpper.includes("EXCENC") ||
                       destClean.includes("EXENT") || pMethodUpper.includes("EXENT") || conceptUpper.includes("EXENT") ||
                       destClean.includes("EXCENT") || pMethodUpper.includes("EXCENT") || conceptUpper.includes("EXCENT") ||
                       destClean.includes("CORTES") || pMethodUpper.includes("CORTES") || conceptUpper.includes("CORTES") ||
                       destClean.includes("DESCUENT") || pMethodUpper.includes("DESCUENT") || conceptUpper.includes("DESCUENT") ||
                       destClean.includes("ANULA") || pMethodUpper.includes("ANULA") || conceptUpper.includes("ANULA") ||
                       destClean.includes("BONIF") || pMethodUpper.includes("BONIF") || conceptUpper.includes("BONIF");

    if (isWarranty || isDonation) return false;

    const isCXCPayment = t.type === TransactionType.INCOME && (conceptUpper.includes("ABONO CUENTAS POR COBRAR") || conceptUpper.includes("(CXC)"));
    const isCXCField = t.isCXC || t.paymentMethod === PaymentMethod.CXC || destClean.includes("CXC") || destClean.includes("COBRAR");

    return !isCXCField && !isCXCPayment;
  });

  const handleDownloadReportPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    
    // Header section decoration - White background with thin minimal separator line (ink-saver)
    doc.setDrawColor(226, 232, 240); // slate 200
    doc.setLineWidth(0.4);
    doc.line(14, 28, 196, 28);
    
    // Header text
    doc.setTextColor(15, 23, 42); // slate 900
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("INVEPINCA C.A.", 14, 14);
    
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139); // slate 500
    doc.text("COMPROBANTE DE CIERRE Y REPORTE DETALLADO DE CAJA DIARIA", 14, 20);
    
    // Header metadata on the right side
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105); // slate 600
    doc.text(`Fecha de Caja: ${reportDate}`, 196, 14, { align: "right" });
    doc.text(`Impresión: ${format(new Date(), "dd/MM/yyyy h:mm a")}`, 196, 19, { align: "right" });
    
    const statusText = rIsClosed ? "Caja Cerrada y Asegurada" : "Cierre Físico Pendiente";
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`Estado: ${statusText.toUpperCase()}`, 196, 25, { align: "right" });
    
    let currentY = 38;
    
    // Section 1: Auditoria sementes (Conteo fisico vs esperado)
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("1. AUDITORÍA DE SALDOS FÍSICOS (CUADRE DE EFECTIVO)", 14, currentY);
    currentY += 4;
    
    const expectedUsdFormatted = formatCurrency(rExpectedUsd);
    const expectedBsFormatted = formatBs(rExpectedBs);
    
    const physicalUsdFormatted = rCurrentClosure ? formatCurrency(rCurrentClosure.actualBalanceUsd) : "---";
    const physicalBsFormatted = rCurrentClosure ? formatBs(rCurrentClosure.actualBalanceBs) : "---";
    
    const diffUsdFormatted = rCurrentClosure ? `${rCurrentClosure.differenceUsd > 0 ? "+" : ""}${formatCurrency(rCurrentClosure.differenceUsd)}` : "---";
    const diffBsFormatted = rCurrentClosure ? `${rCurrentClosure.differenceBs > 0 ? "+" : ""}${formatBs(rCurrentClosure.differenceBs)}` : "---";
    
    let statusUsd = "---";
    if (rCurrentClosure) {
      statusUsd = rCurrentClosure.differenceUsd === 0 ? "CUADRADO" : rCurrentClosure.differenceUsd > 0 ? "SOBRANTE" : "FALTANTE";
    }
    let statusBs = "---";
    if (rCurrentClosure) {
      statusBs = rCurrentClosure.differenceBs === 0 ? "CUADRADO" : rCurrentClosure.differenceBs > 0 ? "SOBRANTE" : "FALTANTE";
    }

    const verificationRows = [
      ["EFECTIVO DÓLARES ($)", expectedUsdFormatted, physicalUsdFormatted, diffUsdFormatted, statusUsd],
      ["EFECTIVO BOLÍVARES (Bs)", expectedBsFormatted, physicalBsFormatted, diffBsFormatted, statusBs]
    ];
    
    autoTable(doc, {
      startY: currentY,
      head: [["Caja / Moneda", "Dato Sistema (Esperado)", "Saldo Conteo Físico", "Diferencia", "Diagnóstico"]],
      body: verificationRows,
      theme: "grid",
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 8.5, fontStyle: "bold" },
      styles: { fontSize: 8.5, fontStyle: "bold", lineColor: [226, 232, 240], lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 35 },
        2: { cellWidth: 35 },
        3: { cellWidth: 32 },
        4: { cellWidth: 30 }
      }
    });
    
    currentY = (doc as any).lastAutoTable.finalY + 6;
    
    // Notes / Observations if present
    if (rCurrentClosure?.observations) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("Observaciones del Cierre Físico:", 14, currentY);
      currentY += 4;
      
      doc.setFont("helvetica", "oblique");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      
      const splitText = doc.splitTextToSize(`"${rCurrentClosure.observations}"`, 182);
      doc.text(splitText, 14, currentY);
      
      currentY += splitText.length * 4 + 4;
    }
    
    // Section 2: Resumen de actividad
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("2. RESUMEN DE ACTIVIDAD EN SISTEMA (FLUJO AUTOMÁTICO)", 14, currentY);
    currentY += 4;
    
    const bimonetaryRows: any[] = [
      ["Efectivo USD (Caja)", formatCurrency(rIncomesUsd), "Ventas Directas (Efectivo)"],
      ["Efectivo Bolívares (Caja)", formatBs(rIncomesBs), "Ventas Directas (Efectivo Bs)"],
      ["Ingresos en Bancos Nacionales (Bs)", "Desglose de Ventas Directas por Banco", ""]
    ];

    Object.entries(rBsBanksMap).forEach(([bank, val]) => {
      bimonetaryRows.push([`  - ${bank}`, formatBs(val.amountBs), `Equiv. USD: ${formatCurrency(val.amountUsd)}`]);
    });
    bimonetaryRows.push(["TOTAL BANCOS BS (Totalizado)", formatBs(rTotalBsInBanks), `Equiv. USD: ${formatCurrency(rTotalBsInBanksUsd)}`]);

    bimonetaryRows.push(["Ingresos en Bancos Divisas (USD)", "Desglose de Ventas Directas por Banco", ""]);
    Object.entries(rUsdBanksMap).forEach(([bank, val]) => {
      bimonetaryRows.push([`  - ${bank}`, formatCurrency(val), ""]);
    });
    bimonetaryRows.push(["TOTAL BANCOS USD (Totalizado)", formatCurrency(rTotalUsdInBanks), ""]);
    
    autoTable(doc, {
      startY: currentY,
      head: [["Vía de Recaudación", "Monto Registrado Período", "Desglose Operativo Internado"]],
      body: bimonetaryRows,
      theme: "grid",
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 8.5, fontStyle: "bold" },
      styles: { fontSize: 8, fontStyle: "normal", lineColor: [226, 232, 240], lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: "bold" },
        1: { cellWidth: 40, fontStyle: "bold" },
        2: { cellWidth: 87 }
      }
    });
    
    currentY = (doc as any).lastAutoTable.finalY + 5;

    // Integrated financial metrics box (Border representation, no colored ink fill)
    doc.setDrawColor(203, 213, 225); // slate 300
    doc.rect(14, currentY, 182, 20, "S");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Monto Total de Ventas Registradas (Ventas Directas + CXC): ${formatCurrency(rTotalSalesUsd)}`, 18, currentY + 6);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`- Ventas Directas Totales (Efectivo + Bancos): ${formatCurrency(rTotalVentasDirectasUsd)}`, 18, currentY + 11);
    doc.text(`- Ventas a Crédito (Nuevos Cargos CXC hoy): ${formatCurrency(rTotalCxc)}`, 18, currentY + 16);
    
    currentY += 27;

    // Trigger a new page if remaining vertical space is tight (less than 85mm)
    if (currentY > 190) {
      doc.addPage();
      currentY = 20;
    }
    
    // Section 3: Ventas Directas
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("3. MOVIMIENTOS DESGOSADOS: VENTAS DIRECTAS", 14, currentY);
    currentY += 4;

    const salesTableBody = reportVentasDirectas.map((t) => {
      const isBs = isBsTransaction(t);
      const bsAmount = t.amountBs && t.amountBs > 0 ? t.amountBs : t.amountUsd * (t.exchangeRate || 1);
      return [
        t.concept || "Venta Directa",
        t.clientName || "—",
        t.sellerName || "—",
        t.paymentMethod || "—",
        t.destinationBank || "Efectivo",
        formatCurrency(t.amountUsd),
        isBs ? formatBs(bsAmount) : "—"
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [["Concepto", "Cliente", "Vendedor", "Vía Pago", "Destino", "Monto USD", "Monto BS"]],
      body: salesTableBody.length > 0 ? salesTableBody : [["No se registraron ventas directas el día de hoy.", "", "", "", "", "", ""]],
      theme: "grid",
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 7.5, fontStyle: "bold" },
      styles: { fontSize: 7.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 26 },
        2: { cellWidth: 26 },
        3: { cellWidth: 22 },
        4: { cellWidth: 24 },
        5: { cellWidth: 21, halign: "right" },
        6: { cellWidth: 21, halign: "right" }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;

    // Section 4: Cargos Emitidos
    if (currentY > 200) {
      doc.addPage();
      currentY = 20;
    }

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("4. MOVIMIENTOS DESGLOSADOS: NUEVOS CARGOS CXC (PROVEÍDOS A CRÉDITO)", 14, currentY);
    currentY += 4;

    const cargosTableBody = reportCargosList.map((p) => {
      const associated = cxcAccounts.find((a) => a.id === p.clientId);
      const clientName = associated ? associated.clientName : (p.clientId || "Desconocido");
      return [
        clientName,
        p.rubroName || p.concept || "Cargo de Compra",
        p.invoiceNumber || "—",
        p.sellerName || "—",
        formatCurrency(p.amountUsd || 0)
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [["Cliente de Cargo", "Item / Rubro de Crédito", "Factura Nº", "Cargador/Vendedor", "Importe Crédito USD"]],
      body: cargosTableBody.length > 0 ? cargosTableBody : [["No se registraron ventas a crédito el día de hoy.", "", "", "", ""]],
      theme: "grid",
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 7.5, fontStyle: "bold" },
      styles: { fontSize: 7.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 45 },
        2: { cellWidth: 25 },
        3: { cellWidth: 35 },
        4: { cellWidth: 32, halign: "right" }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 12;

    // Signatures block
    if (currentY > 230) {
      doc.addPage();
      currentY = 30;
    }

    doc.setDrawColor(203, 213, 225); // slate 300
    
    // Line and signature placeholders
    doc.line(20, currentY + 15, 85, currentY + 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Firma de Gerencia de Caja", 34, currentY + 19);
    
    doc.line(125, currentY + 15, 190, currentY + 15);
    doc.text("Firma de Auditoría General", 137, currentY + 19);

    // Save and download PDF
    doc.save(`Reporte_Caja_Detallado_${reportDate}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">
            Cierre de Caja
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Cuadre diario de efectivo e impresión de histórico.
          </p>
        </div>
      </div>

      {/* Tabs list navigation */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("cierre")}
          id="btn-tab-cierre"
          className={`px-5 py-3 font-bold text-sm border-b-2 mr-6 transition-all flex items-center gap-2 ${
            activeTab === "cierre"
              ? "border-blue-600 text-blue-600 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Lock size={16} /> Cierre Diario y Control Físico
        </button>
        <button
          onClick={() => setActiveTab("reporte")}
          id="btn-tab-reporte"
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "reporte"
              ? "border-blue-600 text-blue-600 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Eye size={16} /> Consulta de Reportes Detallados
        </button>
      </div>

      {activeTab === "cierre" ? (
        <>
          <div className="flex justify-end mt-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto font-bold font-semibold">
          <div className="flex items-center gap-2 px-2 w-full sm:w-auto">
            <Calendar size={16} className="text-slate-400 shrink-0" />
            <div className="flex flex-col w-full">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">
                Desde
              </label>
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
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-900 outline-none w-full sm:w-28 cursor-pointer"
              />
            </div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1"></div>
          <div className="w-full h-px sm:hidden bg-slate-200 my-1"></div>
          <button
            onClick={() => {
              const today = format(new Date(), "yyyy-MM-dd");
              setStartDate(today);
              setEndDate(today);
            }}
            className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-lg border border-slate-200 transition-colors shadow-sm"
          >
            Hoy
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            {isPeriodMode ? (
              <h3 className="text-lg font-black text-slate-900">
                Periodo:{" "}
                {format(new Date(startDate + "T12:00:00"), "dd/MM/yyyy")} al{" "}
                {format(new Date(endDate + "T12:00:00"), "dd/MM/yyyy")}
              </h3>
            ) : (
              <h3 className="text-lg font-black text-slate-900 capitalize">
                {getDayName(startDate)}
              </h3>
            )}
            {isPeriodMode ? (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-xs font-bold uppercase tracking-widest text-blue-600">
                  Vista consolidada de {periodClosures.length} cierre
                  {periodClosures.length === 1 ? "" : "s"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <div
                  className={`w-2 h-2 rounded-full ${isClosed ? "bg-rose-500" : "bg-emerald-500"}`}
                ></div>
                <span
                  className={`text-xs font-bold uppercase tracking-widest ${isClosed ? "text-rose-600" : "text-emerald-600"}`}
                >
                  {isClosed ? "Caja Cerrada" : "Caja Abierta"}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Movimientos del Sistema */}
          <div className="space-y-6 relative">
            {isClosed && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                <div className="bg-white p-6 rounded-2xl shadow-xl border border-rose-100 flex flex-col items-center max-w-sm w-full text-center">
                  <Lock
                    size={48}
                    className="text-rose-500 mb-4"
                    strokeWidth={1.5}
                  />
                  <h4 className="text-xl font-bold text-slate-900 mb-2">
                    Caja Bloqueada
                  </h4>
                  <p className="text-sm text-slate-500 mb-6">
                    El cierre de este día ya fue emitido y asegurado.
                  </p>

                  <label className="text-sm font-bold text-slate-700 w-full text-left mb-1">
                    Llave Digital de Desbloqueo
                  </label>
                  <input
                    type="password"
                    value={unlockKey}
                    onChange={(e) => setUnlockKey(e.target.value)}
                    placeholder="Ingrese su PIN..."
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none text-slate-900 w-full mb-3"
                  />
                  {unlockError && (
                    <span className="text-xs text-rose-500 w-full text-left font-semibold mb-3">
                      {unlockError}
                    </span>
                  )}

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
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                <Activity size={16} /> Movimientos del Sistema
              </h4>

              <div className="space-y-6">




                {/* OTROS TOTALES */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm mt-4">
                  <div className="bg-slate-100/50 px-4 py-2 border-b border-slate-200">
                    <h5 className="text-xs font-bold text-slate-700 tracking-widest uppercase flex items-center gap-2">
                       <Activity size={14} className="text-blue-600" /> Resumen de Operaciones
                    </h5>
                  </div>
                  <div className="p-3 space-y-3.5 border-b border-slate-200">
                    {/* 1. Caja efectivo $ */}
                    <div className="space-y-1 py-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700 ml-2">
                          &bull; Caja efectivo $
                        </span>
                        <span className="font-bold text-slate-800">
                          {formatCurrency(incomesUsd)}
                        </span>
                      </div>
                    </div>

                    {/* 2. Banco en $ (detallado por banco) */}
                    <div className="space-y-1 py-1 border-t border-slate-100/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700 ml-2">
                          &bull; Banco en $
                        </span>
                        <span className="font-bold text-slate-400 text-[10px] uppercase">
                          Desglose por Banco
                        </span>
                      </div>

                      {Object.keys(usdBanksMap).length === 0 ? (
                        <div className="text-[11px] text-slate-400 pl-6 italic">No se registraron transferencias en USD</div>
                      ) : (
                        Object.entries(usdBanksMap).map(([bank, amt]) => (
                          <div key={bank} className="flex justify-between text-[11px] text-slate-500 pl-6 border-b border-dashed border-slate-100 py-0.5">
                            <span className="font-medium text-slate-600">{bank}:</span>
                            <span className="font-mono text-slate-700">{formatCurrency(amt)}</span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* 3. Total $ */}
                    <div className="flex items-center justify-between border-t border-slate-100/50 pt-2 pb-1 bg-slate-100/35 px-2 rounded-lg">
                      <span className="text-sm font-bold text-slate-800 ml-1">
                        &bull; Total $
                      </span>
                      <span className="font-extrabold text-slate-900">
                        {formatCurrency(incomesUsd + totalUsdInBanks)}
                      </span>
                    </div>

                    {/* 4. Caja efectivo bs */}
                    <div className="space-y-1 py-1 border-t border-slate-100/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700 ml-2">
                          &bull; Caja efectivo bs
                        </span>
                        <span className="font-bold text-slate-800">
                          {formatBs(incomesBs)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pl-6">
                        <span>Equivalente USD:</span>
                        <span className="font-medium text-slate-500">
                          {formatCurrency(incomesBsUsd)}
                        </span>
                      </div>
                    </div>

                    {/* 5. Caja Banco bs */}
                    <div className="space-y-1 py-1 border-t border-slate-100/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700 ml-2">
                          &bull; Caja Banco bs
                        </span>
                        <span className="font-bold text-slate-400 text-[10px] uppercase">
                          Desglose por Banco
                        </span>
                      </div>
                      
                      {Object.keys(bsBanksMap).length === 0 ? (
                        <div className="text-[11px] text-slate-400 pl-6 italic">No se registraron transferencias en Bs</div>
                      ) : (
                        Object.entries(bsBanksMap).map(([bank, data]) => (
                          <div key={bank} className="flex justify-between text-[11px] text-slate-500 pl-6 border-b border-dashed border-slate-100 py-0.5">
                            <span className="font-medium text-slate-600">{bank}:</span>
                            <span className="font-mono text-slate-700 font-bold">
                              {formatBs(data.amountBs)}{" "}
                              <span className="text-[10px] text-slate-400 font-normal">({formatCurrency(data.amountUsd)})</span>
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* 6. Total Bs */}
                    <div className="flex items-center justify-between border-t border-slate-100/50 pt-2 pb-1 bg-slate-100/35 px-2 rounded-lg">
                      <span className="text-sm font-bold text-slate-800 ml-1">
                        &bull; Total Bs
                      </span>
                      <span className="font-extrabold text-slate-900 border-b border-dashed border-slate-200">
                        {formatBs(incomesBs + totalBsInBanks)}{" "}
                        <span className="text-xs font-semibold text-slate-500 font-sans">
                          ({formatCurrency(incomesBsUsd + totalBsInBanksUsd)})
                        </span>
                      </span>
                    </div>

                    {/* 7. Total ventas cobradas */}
                    <div className="flex items-center justify-between border-t border-indigo-100 pt-2 pb-1 bg-indigo-50/25 px-2 rounded-lg">
                      <span className="text-sm font-black text-indigo-900 ml-1 uppercase tracking-wide">
                        &bull; Total ventas cobradas
                      </span>
                      <span className="font-black text-indigo-700 text-sm">
                        {formatCurrency(totalVentasDirectasUsd)}
                      </span>
                    </div>

                    {/* 8. Cxc */}
                    <div className="flex items-center justify-between border-t border-slate-100/50 pt-2">
                      <span className="text-sm font-semibold text-slate-600 ml-2">
                        &bull; Cxc (Nuevos Cargos)
                      </span>
                      <span className="font-bold text-slate-700">
                        {formatCurrency(totalCxc)}
                      </span>
                    </div>
                  </div>
                  {/* 9. Total resumen operaciones */}
                  <div className="p-3 bg-white border-t border-slate-200">
                    <div className="flex items-center justify-between bg-emerald-50/20 p-2 rounded-lg border border-emerald-100/50">
                      <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                        Total resumen operaciones
                      </span>
                      <span className="font-black text-xl text-emerald-600">
                        {formatCurrency(totalResumenOperaciones)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cuadre Físico u Historial de Cierres según isPeriodMode */}
          {isPeriodMode ? (
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                <CheckCircle size={16} /> Historial de Cierres (
                {periodClosures.length})
              </h4>
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-xs font-medium leading-relaxed">
                  ℹ️ <strong>Vista de Periodo:</strong> El registro y cuadre de
                  caja físico se realiza de manera individual por día. Para
                  registrar un cierre físico, por favor seleccione una fecha
                  única (Desde y Hasta iguales).
                </div>

                <div className="max-h-[350px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-sm custom-scrollbar">
                  {periodClosures.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-sm">
                      No se encontraron cierres registrados en este rango de
                      fecha.
                    </div>
                  ) : (
                    periodClosures.map((c) => {
                      const hasDiscrepancy =
                        (c.differenceUsd || 0) !== 0 ||
                        (c.differenceBs || 0) !== 0;
                      return (
                        <div
                          key={c.id}
                          className="p-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-black text-slate-800">
                              {format(
                                new Date(c.date + "T12:00:00"),
                                "dd/MM/yyyy",
                              )}
                              <span className="text-xs text-slate-500 font-medium ml-2 font-mono uppercase">
                                (
                                {format(new Date(c.date + "T12:00:00"), "E", {
                                  locale: es,
                                })}
                                )
                              </span>
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <span className="text-slate-500 font-bold">
                                Físico:
                              </span>
                              <span className="text-slate-800 font-semibold">
                                {formatCurrency(c.actualBalanceUsd)}
                              </span>
                              <span className="text-slate-300">|</span>
                              <span className="text-slate-800 font-semibold">
                                {formatBs(c.actualBalanceBs)}
                              </span>
                            </div>
                            {c.observations && (
                              <p
                                className="text-[10px] text-slate-400 italic truncate max-w-[200px]"
                                title={c.observations}
                              >
                                "{c.observations}"
                              </p>
                            )}
                          </div>

                          <div className="text-right flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-1.5">
                              {hasDiscrepancy ? (
                                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <AlertTriangle size={10} /> Discrepancia
                                </span>
                              ) : (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                                  Cuadrado
                                </span>
                              )}
                              <span className="text-[10px] bg-green-100 text-green-800 font-bold px-1.5 py-0.5 rounded-full">
                                Cerrado
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setStartDate(c.date);
                                setEndDate(c.date);
                              }}
                              className="text-[11px] text-blue-600 hover:text-blue-700 font-black flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md transition-colors"
                            >
                              <Search size={10} /> Ver Detalles
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                <CheckCircle size={16} /> Verificación Física (Conteo)
              </h4>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase mb-2 block">
                      Efectivo Físico USD ($)
                    </label>
                    <div className="relative">
                      <DollarSign
                        className="absolute left-3 top-3.5 text-slate-400"
                        size={16}
                      />
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
                    <label className="text-xs font-bold text-slate-600 uppercase mb-2 block">
                      Efectivo Físico BS
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3.5 text-slate-400 font-bold text-xs mt-0.5">
                        Bs
                      </span>
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
                  <div
                    className={`p-4 flex-1 rounded-xl border ${diffUsd === 0 ? "bg-emerald-50/50 border-emerald-200 text-emerald-800" : diffUsd > 0 ? "bg-blue-50/50 border-blue-200 text-blue-800" : "bg-red-50/50 border-red-200 text-red-800"}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest block mb-1 opacity-70">
                      {diffUsd === 0
                        ? "Cuadre USD Correcto"
                        : diffUsd > 0
                          ? "Sobrante USD"
                          : "Faltante USD"}
                    </span>
                    <span className="text-lg font-black">
                      {formatCurrency(Math.abs(diffUsd))}
                    </span>
                  </div>
                  <div
                    className={`p-4 flex-1 rounded-xl border ${diffBs === 0 ? "bg-emerald-50/50 border-emerald-200 text-emerald-800" : diffBs > 0 ? "bg-blue-50/50 border-blue-200 text-blue-800" : "bg-red-50/50 border-red-200 text-red-800"}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest block mb-1 opacity-70">
                      {diffBs === 0
                        ? "Cuadre BS Correcto"
                        : diffBs > 0
                          ? "Sobrante BS"
                          : "Faltante BS"}
                    </span>
                    <span className="text-lg font-black">
                      {formatBs(Math.abs(diffBs))}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase mb-2 block">
                    Observaciones Generales
                  </label>
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
                    {isClosing
                      ? "Cerrando y Asegurando..."
                      : "Cerrar y Asegurar Caja"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
        </>
      ) : (
        // Detailed daily box reports (consult date, completely read-only)
        <div className="space-y-6 animate-fade-in">
          {/* Date Selector Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                <Clock size={12} className="text-blue-500" /> Consulta Histórica Detallada
              </span>
              <h3 className="text-xl font-extrabold text-slate-900 capitalize">
                Caja del {getDayName(reportDate) || reportDate}
              </h3>
              <p className="text-xs font-semibold text-slate-400 leading-none">
                Seleccione cualquier fecha para auditar los movimientos detallados de caja.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 font-semibold">
              <button
                onClick={() => jumpDate(-1)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold border border-slate-200 rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider cursor-pointer"
                title="Día Anterior"
              >
                &larr; Anterior
              </button>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
                <Calendar size={15} className="text-slate-400" />
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="text-sm font-bold text-slate-800 outline-none cursor-pointer"
                />
              </div>
              <button
                onClick={() => jumpDate(1)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold border border-slate-200 rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider cursor-pointer"
                title="Día Siguiente"
              >
                Siguiente &rarr;
              </button>
              <button
                onClick={handleDownloadReportPDF}
                className="ml-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border border-blue-600"
                title="Descargar PDF de Caja Diaria"
              >
                <FileText size={14} />
                <span>Exportar PDF</span>
              </button>
            </div>
          </div>

          {/* Closure Status Alert */}
          {rIsClosed ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-5 flex items-start gap-4 shadow-sm font-semibold">
              <div className="p-2 bg-emerald-100 rounded-xl text-emerald-800 shrink-0 mt-0.5">
                <Lock size={20} strokeWidth={2.5} />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm uppercase tracking-wider text-emerald-950">
                    Cerrada y Asegurada
                  </h4>
                  {rCurrentClosure?.closedAt && (
                    <span className="text-[10px] bg-emerald-200/50 text-emerald-900 font-mono font-bold px-2 py-0.5 rounded-full">
                      {format(new Date(rCurrentClosure.closedAt instanceof Date ? rCurrentClosure.closedAt : rCurrentClosure.closedAt?.toDate?.() || rCurrentClosure.closedAt), "dd/MM/yyyy h:mm a")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed font-semibold">
                  Esta caja fue cerrada físicamente. Es de solo lectura para evitar alteraciones del histórico.
                </p>
                {rCurrentClosure?.observations && (
                  <div className="bg-white/50 border border-emerald-100/50 rounded-xl p-3 text-xs italic mt-2.5 text-emerald-950 font-medium">
                    &ldquo;{rCurrentClosure.observations}&rdquo;
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-5 flex items-start gap-4 shadow-sm font-semibold">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-800 shrink-0 mt-0.5">
                <AlertTriangle size={20} strokeWidth={2.5} />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-amber-950">
                  Cierre Físico Pendiente
                </h4>
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  La caja de este día no ha sido asegurada con verificación física de conteo en el sistema. Los montos se actualizan en vivo.
                </p>
              </div>
            </div>
          )}

          {/* Grid de Resumen del Balance de ese Día */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Resumen Físico / Discrepancias */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <CheckCircle size={15} /> Verificación Conteo Físico
              </h4>

              {/* CARD USD */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 font-semibold">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">
                  Dólares Estadounidenses ($)
                </span>
                <div className="grid grid-cols-3 gap-2 divide-x divide-slate-200 text-center">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Esperado</span>
                    <span className="text-sm font-extrabold text-slate-900">{formatCurrency(rExpectedUsd)}</span>
                  </div>
                  <div className="space-y-1 pl-2">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Físico</span>
                    <span className="text-sm font-extrabold text-slate-950">
                      {rCurrentClosure ? formatCurrency(rCurrentClosure.actualBalanceUsd) : "---"}
                    </span>
                  </div>
                  <div className="space-y-1 pl-2">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Diferencia</span>
                    {rCurrentClosure ? (
                      <span className={`text-sm font-black ${rCurrentClosure.differenceUsd === 0 ? "text-emerald-600" : rCurrentClosure.differenceUsd > 0 ? "text-blue-600" : "text-rose-600"}`}>
                        {rCurrentClosure.differenceUsd > 0 ? "+" : ""}{formatCurrency(rCurrentClosure.differenceUsd)}
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-slate-400">---</span>
                    )}
                  </div>
                </div>
              </div>

              {/* CARD BS */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 font-semibold">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                  Bolívares Digitales (Bs)
                </span>
                <div className="grid grid-cols-3 gap-2 divide-x divide-slate-200 text-center">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Esperado</span>
                    <span className="text-xs font-extrabold text-slate-900 truncate block">{formatBs(rExpectedBs)}</span>
                  </div>
                  <div className="space-y-1 pl-2">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Físico</span>
                    <span className="text-xs font-extrabold text-slate-950 truncate block">
                      {rCurrentClosure ? formatBs(rCurrentClosure.actualBalanceBs) : "---"}
                    </span>
                  </div>
                  <div className="space-y-1 pl-2">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Diferencia</span>
                    {rCurrentClosure ? (
                      <span className={`text-xs font-black truncate block ${rCurrentClosure.differenceBs === 0 ? "text-emerald-600" : rCurrentClosure.differenceBs > 0 ? "text-blue-600" : "text-rose-600"}`}>
                        {rCurrentClosure.differenceBs > 0 ? "+" : ""}{formatBs(rCurrentClosure.differenceBs)}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400 block">---</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Resumen del Movimiento de Caja del Sistema */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <TrendingUp size={15} /> Resumen de Actividad Sistema
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-1.5 font-semibold">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Efectivo USD Ingresado</span>
                  <p className="text-lg font-black text-slate-800">{formatCurrency(rIncomesUsd)}</p>
                  <p className="text-[11px] text-slate-400">
                    <span>Ventas Directas: {formatCurrency(rSalesIncomesUsd)}</span>
                  </p>
                </div>

                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-1.5 font-semibold">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Efectivo BS Ingresado</span>
                  <p className="text-lg font-black text-slate-800">{formatBs(rIncomesBs)}</p>
                  <p className="text-[11px] text-slate-400">
                    <span>Ventas Directas: {formatBs(rSalesIncomesBs)}</span>
                  </p>
                </div>

                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-1.5 font-semibold">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Bancos BS Desglosado</span>
                  <div className="space-y-1 pt-1">
                    {Object.keys(rBsBanksMap).length === 0 ? (
                      <p className="text-xs text-slate-400 italic font-medium">No se registraron transferencias en Bs</p>
                    ) : (
                      Object.entries(rBsBanksMap).map(([bank, data]) => (
                        <div key={bank} className="flex justify-between text-[11px] text-slate-500 border-b border-dashed border-slate-200/50 pb-0.5">
                          <span>{bank}:</span>
                          <span className="font-mono text-slate-700">{formatBs(data.amountBs)}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-sm font-black text-slate-800 pt-1 border-t border-slate-200 flex justify-between">
                    <span>Total BS:</span>
                    <span>{formatBs(rTotalBsInBanks)}</span>
                  </p>
                  <p className="text-[10px] text-slate-450 font-bold">Equiv. USD: {formatCurrency(rTotalBsInBanksUsd)}</p>
                </div>

                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-1.5 font-semibold">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Bancos USD Desglosado</span>
                  <div className="space-y-1 pt-1">
                    {Object.keys(rUsdBanksMap).length === 0 ? (
                      <p className="text-xs text-slate-400 italic font-medium">No se registraron transferencias en USD</p>
                    ) : (
                      Object.entries(rUsdBanksMap).map(([bank, amt]) => (
                        <div key={bank} className="flex justify-between text-[11px] text-slate-500 border-b border-dashed border-slate-200/50 pb-0.5">
                          <span>{bank}:</span>
                          <span className="font-mono text-slate-700">{formatCurrency(amt)}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-sm font-black text-slate-800 pt-1 border-t border-slate-200 flex justify-between">
                    <span>Total USD:</span>
                    <span>{formatCurrency(rTotalUsdInBanks)}</span>
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 flex flex-col sm:flex-row justify-between items-center gap-4 bg-emerald-50/30 p-4 rounded-xl border border-emerald-100 font-semibold text-xs text-slate-500">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block leading-tight">Monto Total de Ventas (Directas + CXC)</span>
                  <span className="text-xl font-black text-emerald-600 font-sans tracking-tight">{formatCurrency(rTotalSalesUsd)}</span>
                </div>
                <div className="text-center sm:text-right font-medium space-y-1">
                  <div>Ventas Directas Totales: <strong className="text-slate-800">{formatCurrency(rTotalVentasDirectasUsd)}</strong></div>
                  <div>Nuevos créditos (Cargos CXC): <strong className="text-slate-800">{formatCurrency(rTotalCxc)}</strong></div>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Movements List Tabs */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-6">
            <div className="p-5 border-b border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <FileText size={16} className="text-slate-500" /> Movimientos Desglosados del Día
              </h4>

              {/* Sub tabs pills */}
              <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200">
                <button
                  onClick={() => setDetailSubTab("ventas")}
                  id="tab-pills-ventas"
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                    detailSubTab === "ventas"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Ventas Directas ({reportVentasDirectas.length})
                </button>
                <button
                  onClick={() => setDetailSubTab("cargos")}
                  id="tab-pills-cargos"
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                    detailSubTab === "cargos"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Cargos CXC ({reportCargosList.length})
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Ventas Directas render table */}
              {detailSubTab === "ventas" && (
                <div className="overflow-x-auto border border-slate-100 rounded-xl bg-white shadow-sm">
                  {reportVentasDirectas.length === 0 ? (
                    <div className="p-12 text-center text-sm font-medium text-slate-400">
                      No se registraron ventas directas el día de hoy.
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left border-collapse font-semibold">
                      <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Concepto</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Vendedor</th>
                          <th className="px-4 py-3">Vía de Pago</th>
                          <th className="px-4 py-3">Destino</th>
                          <th className="px-4 py-3 text-right">Monto (USD)</th>
                          <th className="px-4 py-3 text-right">Monto (Bs)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                        {reportVentasDirectas.map((t, idx) => {
                          const isBs = isBsTransaction(t);
                          const bsAmount = t.amountBs && t.amountBs > 0 ? t.amountBs : t.amountUsd * (t.exchangeRate || 1);
                          return (
                            <tr key={t.id || idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 text-slate-900 font-black">{t.concept}</td>
                              <td className="px-4 py-3 text-slate-500 font-bold">{t.clientName || "—"}</td>
                              <td className="px-4 py-3 text-xs text-slate-500">{t.sellerName || "—"}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 text-[10px] uppercase font-black px-2 py-0.5 rounded">
                                  {t.paymentMethod}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs font-mono text-slate-400">{t.destinationBank || "Efectivo"}</td>
                              <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(t.amountUsd)}</td>
                              <td className="px-4 py-3 text-right font-mono text-blue-600">
                                {isBs ? formatBs(bsAmount) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Cargos issued render table */}
              {detailSubTab === "cargos" && (
                <div className="overflow-x-auto border border-slate-100 rounded-xl bg-white shadow-sm">
                  {reportCargosList.length === 0 ? (
                    <div className="p-12 text-center text-sm font-medium text-slate-400">
                      No se registraron ventas a crédito (cargos CXC) hoy.
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left border-collapse font-semibold">
                      <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Item / Rubro</th>
                          <th className="px-4 py-3">Nº Factura</th>
                          <th className="px-4 py-3">Vendedor</th>
                          <th className="px-4 py-3 text-right">Monto Crédito (USD)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                        {reportCargosList.map((p, idx) => {
                          const associated = cxcAccounts.find((a) => a.id === p.clientId);
                          const clientName = associated ? associated.clientName : (p.clientId || "Desconocido");
                          return (
                            <tr key={p.id || idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 text-slate-900 font-black flex items-center gap-2">
                                <Users size={12} className="text-amber-500" /> {clientName}
                              </td>
                              <td className="px-4 py-3 text-xs font-bold text-slate-600">{p.rubroName || p.concept || "Cargo de Compra"}</td>
                              <td className="px-4 py-3 text-xs font-mono text-slate-400">{p.invoiceNumber || "—"}</td>
                              <td className="px-4 py-3 text-xs text-slate-500">{p.sellerName || "—"}</td>
                              <td className="px-4 py-3 text-right font-black text-amber-600">{formatCurrency(p.amountUsd)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
