import React, { useState, useEffect } from "react";
import { dbService } from "../services/db";
import {
  CashClosure,
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
  const [detailSubTab, setDetailSubTab] = useState<"ventas" | "abonos" | "cargos">("ventas");

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

    // Skip warranties, donations, exemptions, etc. so they do not impact the cash reconciliation
    const isWarranty =
      destClean.includes("GARANT") ||
      pMethodUpper.includes("GARANT") ||
      conceptUpper.includes("GARANT");
    const isDonation =
      destClean.includes("DONAC") ||
      pMethodUpper.includes("DONAC") ||
      conceptUpper.includes("DONAC") ||
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

  // Calculate CXC charges and CXC payments (abonos) directly from All Payments subcollection group
  const periodPaymentsList = allPayments.filter(
    (p) => p.date >= startDate && p.date <= endDate
  );

  let totalCxc = 0;
  let totalCxcPaymentsUsd = 0;

  let cxcIncomesUsd = 0;
  let cxcIncomesBs = 0;
  let cxcIncomesBsUsd = 0;
  let cxcBsInBanks = 0;
  let cxcBsInBanksUsd = 0;
  let cxcUsdInBanks = 0;

  periodPaymentsList.forEach((p) => {
    const dest = (p.destinationBank || "").toUpperCase();
    const pMethod = (p.paymentMethod || "").toUpperCase();
    const concept = (p.concept || "").toUpperCase();

    const isWarranty =
      dest.includes("GARANT") ||
      pMethod.includes("GARANT") ||
      concept.includes("GARANT");
    const isDonation =
      dest.includes("DONAC") ||
      pMethod.includes("DONAC") ||
      concept.includes("DONAC") ||
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
      // Balance to accounts receivable, we match the Monto Bruto of reports
      totalCxc += p.grossAmountUsd || p.amountUsd || 0;
    } else {
      // Must be a payment (not a charge)
      if (!isWarranty && !isDonation) {
        const isBs = isCxcPaymentBs(p);

        const isCashDest =
          dest.includes("EFECTIVO") ||
          dest.includes("CAJA") ||
          dest === "";
        const isBankDest = dest.length > 0 && !isCashDest;
        const isBank =
          isBankDest ||
          p.paymentMethod === PaymentMethod.BS ||
          p.paymentMethod === PaymentMethod.ZELLE ||
          p.paymentMethod === PaymentMethod.BINANCE ||
          pMethod.includes("ZELLE") ||
          pMethod.includes("BINANCE");

        if (isBs) {
          const payRate = p.exchangeRate || exchangeRate || 1;
          const amountBsVal = p.amountBs && p.amountBs > 0 ? p.amountBs : (p.amountUsd || 0) * payRate;
          const eqUsd = payRate > 0 ? amountBsVal / payRate : p.amountUsd || 0;

          if (isBank) {
            cxcBsInBanks += amountBsVal;
            cxcBsInBanksUsd += eqUsd;
          } else {
            cxcIncomesBs += amountBsVal;
            cxcIncomesBsUsd += eqUsd;
          }
          totalCxcPaymentsUsd += eqUsd;
        } else {
          const eqUsd = p.amountUsd || 0;
          if (isBank) {
            cxcUsdInBanks += eqUsd;
          } else {
            cxcIncomesUsd += eqUsd;
          }
          totalCxcPaymentsUsd += eqUsd;
        }
      }
    }
  });

  // Re-aggregate incomes and total balances for the system boxes (matching what's physical/bank)
  const incomesUsd = salesIncomesUsd + cxcIncomesUsd;
  const incomesBs = salesIncomesBs + cxcIncomesBs;
  const incomesBsUsd = salesIncomesBsUsd + cxcIncomesBsUsd;

  const totalBsInBanks = salesBsInBanks + cxcBsInBanks;
  const totalBsInBanksUsd = salesBsInBanksUsd + cxcBsInBanksUsd;
  const totalUsdInBanks = salesUsdInBanks + cxcUsdInBanks;

  // Total sales includes regular cash/bank sales in USD + the CXC charges (from the report!)
  const totalSalesUsd = salesIncomesUsd + salesUsdInBanks + totalCxc;

  // Let's compute the Total of Direct Sales in USD
  const totalVentasDirectasUsd = salesIncomesUsd + salesIncomesBsUsd + salesBsInBanksUsd + salesUsdInBanks;

  // Total Resumen de operaciones = Cuentas por Cobrar (CXC) + Total Abonos CXC Recibidos + Total Ventas Directas
  const totalResumenOperaciones = totalCxc + totalCxcPaymentsUsd + totalVentasDirectasUsd;

  // Expected balances based on the startDate
  const previousClosure = closures
    .filter((c) => c.date < startDate && c.isClosed)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const initialUsd = previousClosure?.actualBalanceUsd || 0;
  const initialBs = previousClosure?.actualBalanceBs || 0;

  const expectedUsd = initialUsd + incomesUsd - expensesUsd - withdrawalsUsd;
  const expectedBs = initialBs + incomesBs - expensesBs - withdrawalsBs;

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

    const isWarranty =
      destClean.includes("GARANT") ||
      pMethodUpper.includes("GARANT") ||
      conceptUpper.includes("GARANT");
    const isDonation =
      destClean.includes("DONAC") ||
      pMethodUpper.includes("DONAC") ||
      conceptUpper.includes("DONAC") ||
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

  let rTotalCxc = 0;
  let rTotalCxcPaymentsUsd = 0;

  let rCxcIncomesUsd = 0;
  let rCxcIncomesBs = 0;
  let rCxcIncomesBsUsd = 0;
  let rCxcBsInBanks = 0;
  let rCxcBsInBanksUsd = 0;
  let rCxcUsdInBanks = 0;

  reportPaymentsList.forEach((p) => {
    const dest = (p.destinationBank || "").toUpperCase();
    const pMethod = (p.paymentMethod || "").toUpperCase();
    const concept = (p.concept || "").toUpperCase();

    const isWarranty =
      dest.includes("GARANT") ||
      pMethod.includes("GARANT") ||
      concept.includes("GARANT");
    const isDonation =
      dest.includes("DONAC") ||
      pMethod.includes("DONAC") ||
      concept.includes("DONAC") ||
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
      rTotalCxc += p.grossAmountUsd || p.amountUsd || 0;
    } else {
      if (!isWarranty && !isDonation) {
        const isBs = isCxcPaymentBs(p);

        const isCashDest =
          dest.includes("EFECTIVO") ||
          dest.includes("CAJA") ||
          dest === "";
        const isBankDest = dest.length > 0 && !isCashDest;
        const isBank =
          isBankDest ||
          p.paymentMethod === PaymentMethod.BS ||
          p.paymentMethod === PaymentMethod.ZELLE ||
          p.paymentMethod === PaymentMethod.BINANCE ||
          pMethod.includes("ZELLE") ||
          pMethod.includes("BINANCE");

        if (isBs) {
          const payRate = p.exchangeRate || exchangeRate || 1;
          const amountBsVal = p.amountBs && p.amountBs > 0 ? p.amountBs : (p.amountUsd || 0) * payRate;
          const eqUsd = payRate > 0 ? amountBsVal / payRate : p.amountUsd || 0;

          if (isBank) {
            rCxcBsInBanks += amountBsVal;
            rCxcBsInBanksUsd += eqUsd;
          } else {
            rCxcIncomesBs += amountBsVal;
            rCxcIncomesBsUsd += eqUsd;
          }
          rTotalCxcPaymentsUsd += eqUsd;
        } else {
          const eqUsd = p.amountUsd || 0;
          if (isBank) {
            rCxcUsdInBanks += eqUsd;
          } else {
            rCxcIncomesUsd += eqUsd;
          }
          rTotalCxcPaymentsUsd += eqUsd;
        }
      }
    }
  });

  const rIncomesUsd = rSalesIncomesUsd + rCxcIncomesUsd;
  const rIncomesBs = rSalesIncomesBs + rCxcIncomesBs;
  const rIncomesBsUsd = rSalesIncomesBsUsd + rCxcIncomesBsUsd;

  const rTotalBsInBanks = rSalesBsInBanks + rCxcBsInBanks;
  const rTotalBsInBanksUsd = rSalesBsInBanksUsd + rCxcBsInBanksUsd;
  const rTotalUsdInBanks = rSalesUsdInBanks + rCxcUsdInBanks;

  const rTotalSalesUsd = rSalesIncomesUsd + rSalesUsdInBanks + rTotalCxc;

  // Expected balances
  const reportPreviousClosure = closures
    .filter((c) => c.date < reportDate && c.isClosed)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const rInitialUsd = reportPreviousClosure?.actualBalanceUsd || 0;
  const rInitialBs = reportPreviousClosure?.actualBalanceBs || 0;

  const rExpectedUsd = rInitialUsd + rIncomesUsd;
  const rExpectedBs = rInitialBs + rIncomesBs;

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
    const isWarranty = destClean.includes("GARANT") || pMethodUpper.includes("GARANT") || conceptUpper.includes("GARANT");
    const isDonation = destClean.includes("DONAC") || pMethodUpper.includes("DONAC") || conceptUpper.includes("DONAC") ||
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

  const reportAbonosList = reportPaymentsList.filter((p) => p.type !== "charge");
  const reportCargosList = reportPaymentsList.filter((p) => p.type === "charge");

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
                {/* CAJA USD */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-slate-100/50 px-4 py-2 border-b border-slate-200">
                    <h5 className="text-xs font-bold text-slate-700 tracking-widest uppercase flex items-center gap-2">
                      <DollarSign size={14} className="text-emerald-600" /> Caja
                      Efectivo USD
                    </h5>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-500">
                        Saldo Inicial
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(initialUsd)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-emerald-600">
                        Ingresos (+)
                      </span>
                      <span className="font-bold text-emerald-600">
                        +{formatCurrency(incomesUsd)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                      <span className="text-sm font-black text-slate-800">
                        Saldo Esperado USD
                      </span>
                      <span className="text-lg font-black text-emerald-600">
                        {formatCurrency(expectedUsd)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* CAJA BS */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-slate-100/50 px-4 py-2 border-b border-slate-200">
                    <h5 className="text-xs font-bold text-slate-700 tracking-widest uppercase flex items-center gap-2">
                      <div className="font-bold font-serif text-blue-600 bg-blue-100 rounded-sm px-1 text-[10px]">
                        Bs
                      </div>{" "}
                      Caja Efectivo Bolívares
                    </h5>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-500">
                        Saldo Inicial
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatBs(initialBs)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-emerald-600">
                        Ingresos (+)
                      </span>
                      <span className="font-bold text-emerald-600">
                        +{formatBs(incomesBs)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                      <span className="text-sm font-black text-slate-800">
                        Saldo Esperado BS
                      </span>
                      <span className="text-sm font-black text-blue-600">
                        {formatBs(expectedBs)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* OTROS TOTALES */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm mt-4">
                  <div className="bg-slate-100/50 px-4 py-2 border-b border-slate-200">
                    <h5 className="text-xs font-bold text-slate-700 tracking-widest uppercase flex items-center gap-2">
                      <Activity size={14} className="text-blue-600" /> Resumen
                      de Operaciones
                    </h5>
                  </div>
                  <div className="p-3 space-y-3.5 border-b border-slate-200">
                    {/* Caja Efectivo USD */}
                    <div className="space-y-1 py-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700 ml-2">
                          &bull; Caja Efectivo USD
                        </span>
                        <span className="font-bold text-slate-800">
                          {formatCurrency(incomesUsd)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pl-6">
                        <span>Ventas Directas (Efectivo):</span>
                        <span className="font-medium text-slate-500">{formatCurrency(salesIncomesUsd)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pl-6">
                        <span>Abonos CXC (Efectivo):</span>
                        <span className="font-medium text-slate-500">{formatCurrency(cxcIncomesUsd)}</span>
                      </div>
                    </div>

                    {/* Caja Efectivo BS */}
                    <div className="space-y-1 py-1 border-t border-slate-100/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700 ml-2">
                          &bull; Caja Efectivo BS{" "}
                          <span className="text-[10px] font-bold text-slate-400">
                            ({formatCurrency(incomesBsUsd)})
                          </span>
                        </span>
                        <span className="font-bold text-slate-800">
                          {formatBs(incomesBs)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pl-6">
                        <span>Ventas Directas (Efectivo BS):</span>
                        <span className="font-medium text-slate-500">
                          {formatBs(salesIncomesBs)}{" "}
                          <span className="text-[10px] text-slate-400">({formatCurrency(salesIncomesBsUsd)})</span>
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pl-6">
                        <span>Abonos CXC (Efectivo BS):</span>
                        <span className="font-medium text-slate-500">
                          {formatBs(cxcIncomesBs)}{" "}
                          <span className="text-[10px] text-slate-400">({formatCurrency(cxcIncomesBsUsd)})</span>
                        </span>
                      </div>
                    </div>

                    {/* Ingresos en Bancos BS */}
                    <div className="space-y-1 py-1 border-t border-slate-100/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700 ml-2">
                          &bull; Ingresos en Bancos BS{" "}
                          <span className="text-[10px] font-bold text-slate-400">
                            ({formatCurrency(totalBsInBanksUsd)})
                          </span>
                        </span>
                        <span className="font-bold text-slate-800">
                          {formatBs(totalBsInBanks)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pl-6">
                        <span>Ventas Directas (Bancos BS):</span>
                        <span className="font-medium text-slate-500">
                          {formatBs(salesBsInBanks)}{" "}
                          <span className="text-[10px] text-slate-400">({formatCurrency(salesBsInBanksUsd)})</span>
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pl-6">
                        <span>Abonos CXC (Bancos BS):</span>
                        <span className="font-medium text-slate-500">
                          {formatBs(cxcBsInBanks)}{" "}
                          <span className="text-[10px] text-slate-400">({formatCurrency(cxcBsInBanksUsd)})</span>
                        </span>
                      </div>
                    </div>

                    {/* Ingresos en Bancos USD */}
                    <div className="space-y-1 py-1 border-t border-slate-100/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700 ml-2">
                          &bull; Ingresos en Bancos USD
                        </span>
                        <span className="font-bold text-slate-800">
                          {formatCurrency(totalUsdInBanks)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pl-6">
                        <span>Ventas Directas (Zelle/Binance/Bancos USD):</span>
                        <span className="font-medium text-slate-500">{formatCurrency(salesUsdInBanks)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pl-6">
                        <span>Abonos CXC (Zelle/Binance/Bancos USD):</span>
                        <span className="font-medium text-slate-500">{formatCurrency(cxcUsdInBanks)}</span>
                      </div>
                    </div>

                    {/* Total Ventas Directas */}
                    <div className="flex items-center justify-between border-t border-slate-100/50 pt-2">
                      <span className="text-sm font-semibold text-slate-700 ml-2">
                        &bull; Total Ventas Directas
                      </span>
                      <span className="font-bold text-slate-800">
                        {formatCurrency(totalVentasDirectasUsd)}
                      </span>
                    </div>

                    {/* Cuentas por Cobrar CXC */}
                    <div className="flex items-center justify-between border-t border-slate-100/50 pt-2">
                      <span className="text-sm font-semibold text-slate-700 ml-2">
                        &bull; Cuentas por Cobrar (CXC)
                      </span>
                      <span className="font-bold text-slate-800">
                        {formatCurrency(totalCxc)}
                      </span>
                    </div>

                    {/* Abonos CXC Recibidos Total */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700 ml-2">
                        &bull; Total Abonos CXC Recibidos
                      </span>
                      <span className="font-bold text-emerald-600">
                        {formatCurrency(totalCxcPaymentsUsd)}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-white border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-slate-900 uppercase tracking-wide">
                        Total Resumen de operaciones
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

            <div className="flex items-center gap-2 font-semibold">
              <button
                onClick={() => jumpDate(-1)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold border border-slate-200 rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider"
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
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold border border-slate-200 rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider"
                title="Día Siguiente"
              >
                Siguiente &rarr;
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
                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-1 font-semibold">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Efectivo USD Ingresado</span>
                  <p className="text-lg font-black text-slate-800">{formatCurrency(rIncomesUsd)}</p>
                  <p className="text-[11px] text-slate-400 flex justify-between">
                    <span>Ventas: {formatCurrency(rSalesIncomesUsd)}</span>
                    <span>Abonos: {formatCurrency(rCxcIncomesUsd)}</span>
                  </p>
                </div>

                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-1 font-semibold">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Efectivo BS Ingresado</span>
                  <p className="text-lg font-black text-slate-800">{formatBs(rIncomesBs)}</p>
                  <p className="text-[11px] text-slate-400 flex justify-between">
                    <span>Ventas: {formatBs(rSalesIncomesBs)}</span>
                    <span>Abonos: {formatBs(rCxcIncomesBs)}</span>
                  </p>
                </div>

                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-1 font-semibold">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Bancos BS Recibido</span>
                  <p className="text-lg font-black text-slate-800">{formatBs(rTotalBsInBanks)}</p>
                  <p className="text-[11px] text-slate-400">Equiv. USD: {formatCurrency(rTotalBsInBanksUsd)}</p>
                </div>

                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-1 font-semibold">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Bancos/Zelle/Binance USD</span>
                  <p className="text-lg font-black text-slate-800">{formatCurrency(rTotalUsdInBanks)}</p>
                  <p className="text-[11px] text-slate-400">Transferencias divisas directas</p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 flex flex-col sm:flex-row justify-between items-center gap-4 bg-emerald-50/30 p-4 rounded-xl border border-emerald-100 font-semibold text-xs text-slate-500">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block leading-tight">Monto Total de Ventas</span>
                  <span className="text-xl font-black text-emerald-600 font-sans tracking-tight">{formatCurrency(rTotalSalesUsd)}</span>
                </div>
                <div className="text-center sm:text-right font-medium space-y-1">
                  <div>Ventas Contado: <strong className="text-slate-800">{formatCurrency(rSalesIncomesUsd + rSalesUsdInBanks)}</strong></div>
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
                  onClick={() => setDetailSubTab("abonos")}
                  id="tab-pills-abonos"
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                    detailSubTab === "abonos"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Abonos CXC ({reportAbonosList.length})
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

              {/* Abonos Recibidos render table */}
              {detailSubTab === "abonos" && (
                <div className="overflow-x-auto border border-slate-100 rounded-xl bg-white shadow-sm">
                  {reportAbonosList.length === 0 ? (
                    <div className="p-12 text-center text-sm font-medium text-slate-400">
                      No se registraron abonos a cuentas por cobrar hoy.
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left border-collapse font-semibold">
                      <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Concepto/Pago</th>
                          <th className="px-4 py-3">Vendedor</th>
                          <th className="px-4 py-3">Vía de Pago</th>
                          <th className="px-4 py-3">Banco / Destino</th>
                          <th className="px-4 py-3 text-right">Monto (USD)</th>
                          <th className="px-4 py-3 text-right">Monto (Bs)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                        {reportAbonosList.map((p, idx) => {
                          const associated = cxcAccounts.find((a) => a.id === p.clientId);
                          const clientName = associated ? associated.clientName : (p.clientId || "Desconocido");
                          const isBs = isCxcPaymentBs(p);
                          const bsAmount = p.amountBs && p.amountBs > 0 ? p.amountBs : (p.amountUsd || 0) * (p.exchangeRate || 1);
                          return (
                            <tr key={p.id || idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 text-slate-900 font-black flex items-center gap-2">
                                <Users size={12} className="text-blue-500" /> {clientName}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 font-bold">{p.concept || "Abono / Pago de Cuenta"}</td>
                              <td className="px-4 py-3 text-xs text-slate-500">{p.sellerName || "—"}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 text-[10px] uppercase font-black px-2 py-0.5 rounded">
                                  {p.paymentMethod}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs font-mono text-slate-400">{p.destinationBank || "Efectivo"}</td>
                              <td className="px-4 py-3 text-right font-black text-emerald-600">{formatCurrency(p.amountUsd)}</td>
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
