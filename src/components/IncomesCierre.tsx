import React, { useState, useEffect } from "react";
import { dbService } from "../services/db";
import {
  CashClosure,
  TransactionType,
  PaymentMethod,
  Transaction,
  Expense,
  Receipt,
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

export default function IncomesCierre({
  exchangeRate,
}: {
  exchangeRate?: number;
}) {
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [unlockKey, setUnlockKey] = useState("");
  const [unlockError, setUnlockError] = useState("");

  // Physical count state
  const [actualUsd, setActualUsd] = useState("0");
  const [actualBs, setActualBs] = useState("0");
  const [observations, setObservations] = useState("");

  useEffect(() => {
    const unsub1 = dbService.subscribeToCashClosures(setClosures);
    const unsub2 = dbService.subscribeToTransactions(setTransactions);
    return () => {
      unsub1();
      unsub2();
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

  let incomesUsd = 0; // Efectivo en Mano USD
  let incomesBs = 0; // Efectivo en Mano BS
  let incomesBsUsd = 0; // Valor USD del Efectivo BS

  // Breakdown metrics
  let totalSalesUsd = 0;
  let totalBsInBanks = 0;
  let totalBsInBanksUsd = 0; // Valor USD de Bancos BS
  let totalUsdInBanks = 0;
  let totalCxc = 0;
  let totalCxcPaymentsUsd = 0;

  // Separated sales vs CXC payments
  let salesIncomesUsd = 0;
  let cxcIncomesUsd = 0;

  let salesIncomesBs = 0;
  let cxcIncomesBs = 0;
  let salesIncomesBsUsd = 0;
  let cxcIncomesBsUsd = 0;

  let salesBsInBanks = 0;
  let cxcBsInBanks = 0;
  let salesBsInBanksUsd = 0;
  let cxcBsInBanksUsd = 0;

  let salesUsdInBanks = 0;
  let cxcUsdInBanks = 0;

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
    if (isCXCPayment) {
      totalCxcPaymentsUsd += amtUsd;
    }

    // Determine if it is a credit sale (Cuentas por Cobrar CXC)
    const isCXCField =
      t.isCXC ||
      t.paymentMethod === PaymentMethod.CXC ||
      destClean.includes("CXC") ||
      destClean.includes("COBRAR");

    if (isCXCField) {
      const grossCxc = t.grossAmountUsd || t.totalDailySale || amtUsd;
      totalCxc += grossCxc;
      totalSalesUsd += grossCxc;
      return; // Do not sum to physical cash or bank balances, but include in operational breakdown
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
        totalBsInBanks += amountBsVal;
        totalBsInBanksUsd += eqUsd;
        if (isCXCPayment) {
          cxcBsInBanks += amountBsVal;
          cxcBsInBanksUsd += eqUsd;
        } else {
          salesBsInBanks += amountBsVal;
          salesBsInBanksUsd += eqUsd;
        }
      } else {
        incomesBs += amountBsVal;
        incomesBsUsd += eqUsd;
        if (isCXCPayment) {
          cxcIncomesBs += amountBsVal;
          cxcIncomesBsUsd += eqUsd;
        } else {
          salesIncomesBs += amountBsVal;
          salesIncomesBsUsd += eqUsd;
        }
      }
      // Bolivares are only referential and do not sum as USD incomes/sales
      if (!isCXCPayment) {
        // Excluded from totalSalesUsd based on user's instruction
      }
    } else {
      // USD ($)
      if (isBank) {
        totalUsdInBanks += amtUsd;
        if (isCXCPayment) {
          cxcUsdInBanks += amtUsd;
        } else {
          salesUsdInBanks += amtUsd;
        }
      } else {
        incomesUsd += amtUsd;
        if (isCXCPayment) {
          cxcIncomesUsd += amtUsd;
        } else {
          salesIncomesUsd += amtUsd;
        }
      }
      if (!isCXCPayment) {
        totalSalesUsd += amtUsd;
      }
    }
  });

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

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
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
                  <div className="p-3 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-slate-900 uppercase tracking-wide">
                        Total de Ventas
                      </span>
                      <span className="font-black text-xl text-emerald-600">
                        {formatCurrency(totalSalesUsd)}
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
    </div>
  );
}
