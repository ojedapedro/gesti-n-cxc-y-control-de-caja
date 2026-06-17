import React from 'react';
import { Transaction, Receipt, Expense, PaymentMethod } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PrintReceiptComponentProps {
  type: 'receipt' | 'transaction' | 'expense' | null;
  data: any; // Can be a Receipt, Transaction, or Expense
  exchangeRate?: number;
}

export default function PrintReceiptComponent({ type, data, exchangeRate = 1 }: PrintReceiptComponentProps) {
  if (!type || !data) return null;

  const appName = "INVEPINCA C.A.";
  const appRif = "J-40490348-8";
  const appAddress = "Valencia, Carabobo, Zona postal 2001.";
  const formattedToday = format(new Date(), 'dd/MM/yyyy h:mm a');

  // Format currencies correctly
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatBs = (amount: number) => {
    return 'Bs. ' + new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  };

  // Extract shared variables depending on the transaction type
  let title = "COMPROBANTE";
  let docNumber = data.receiptNumber || data.id?.slice(0, 8).toUpperCase() || "N/A";
  let dateVal = data.date || data.createdAt?.toDate?.()?.toISOString()?.slice(0,10) || format(new Date(), 'yyyy-MM-dd');
  let partyLabel = "Cliente / Beneficiario";
  let partyName = data.recipient || data.clientName || "CLIENTE GENERAL";
  let conceptText = data.concept || data.note || "REGISTRO DE OPERACIÓN";
  let amountUsd = data.amountUsd || 0;
  let amountBs = data.amountBs || 0;
  let rateUsed = data.exchangeRate || exchangeRate || 1;
  let paymentMethodLabel = data.paymentMethod || "EFECTIVO";
  let destinationBank = data.destinationBank || "";

  // Details for specific types
  if (type === 'receipt') {
    title = "RECIBO DE PAGO (RETIRO)";
    partyLabel = "Recibido de/por";
  } else if (type === 'transaction') {
    title = "COMPROBANTE DE INGRESO";
    partyLabel = "Cliente";
    // Check if it's dual-currency or Bs-based
    const isBs = data.paymentMethod === PaymentMethod.BS_CASH || data.paymentMethod === PaymentMethod.BS;
    if (isBs && !amountBs && amountUsd) {
      amountBs = amountUsd * rateUsed;
    } else if (!isBs && !amountUsd && amountBs) {
      amountUsd = amountBs / rateUsed;
    }
  } else if (type === 'expense') {
    title = "COMPROBANTE DE EGRESO (GASTO)";
    partyLabel = "Proveedor / Categoría";
    partyName = data.category || "GASTO GENERAL";
    
    // Expenses fields
    if (data.amountBs) amountBs = data.amountBs;
    if (data.amountUsd) amountUsd = data.amountUsd;
  }

  // Calculate matching conversions if one is missing
  if (amountUsd > 0 && amountBs === 0) {
    amountBs = amountUsd * rateUsed;
  } else if (amountBs > 0 && amountUsd === 0) {
    amountUsd = amountBs / rateUsed;
  }

  // Formatted Date
  let dateDisplay = dateVal;
  try {
    const parseDate = new Date(dateVal + 'T12:00:00');
    dateDisplay = format(parseDate, "EEEE dd 'de' MMMM 'de' yyyy", { locale: es });
  } catch (e) {
    // raw datefallback
  }

  return (
    <div className="global-print-container print-only bg-white text-black font-sans text-xs w-full max-w-[190mm] mx-auto p-4 border border-slate-200 rounded-lg shadow-sm print:shadow-none print:border-none print:p-0">
      {/* Outer elegant thin frame for clean look, inside margin to save paper */}
      <div className="border border-slate-400 p-4 space-y-4 rounded print:border-slate-800 print:p-3">
        
        {/* Header - Super Compact Layout */}
        <div className="flex justify-between items-start border-b border-slate-300 pb-3">
          <div className="space-y-0.5">
            <h1 className="text-sm font-black tracking-tight">{appName}</h1>
            <p className="text-[9px] text-slate-500 uppercase leading-none font-bold">RIF: {appRif}</p>
            <p className="text-[9px] text-slate-400 leading-none">{appAddress}</p>
          </div>
          <div className="text-right space-y-0.5">
            <h2 className="text-xs font-black uppercase text-slate-700 tracking-wide">{title}</h2>
            <div className="text-[10px] font-mono leading-none">
              Nº <span className="text-red-600 font-bold">{docNumber}</span>
            </div>
            <p className="text-[8px] text-slate-400">Impreso: {formattedToday}</p>
          </div>
        </div>

        {/* Dynamic Details Grid */}
        <div className="grid grid-cols-12 gap-0 border border-slate-300 rounded overflow-hidden">
          {/* Metadata */}
          <div className="col-span-8 p-2 border-r border-slate-300 space-y-2">
            <div>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">{partyLabel}</span>
              <span className="text-xs font-black text-slate-800 uppercase">{partyName}</span>
            </div>
            <div>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Fecha de Operación</span>
              <span className="text-xs font-bold text-slate-700 capitalize">{dateDisplay}</span>
            </div>
          </div>

          {/* Amount Box - Highly visible but compact */}
          <div className="col-span-4 p-2 bg-slate-50 flex flex-col justify-center text-center space-y-1">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Monto Total</span>
            <div className="space-y-0.5">
              <p className="text-sm font-black text-emerald-700 leading-none">{formatCurrency(amountUsd)}</p>
              <p className="text-[10px] font-extrabold text-blue-700 leading-none">{formatBs(amountBs)}</p>
              <p className="text-[8px] text-slate-400">Tasa: {rateUsed.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Concept / Description */}
        <div className="space-y-1">
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Por Concepto De</span>
          <div className="border border-slate-200 bg-slate-50/30 p-2.5 rounded min-h-[45px] text-[10px] leading-relaxed text-slate-800 uppercase font-medium">
            {conceptText}
          </div>
        </div>

        {/* Payment details */}
        <div className="grid grid-cols-3 gap-3 text-[9px] pt-1">
          <div className="border border-slate-200 p-1.5 rounded">
            <span className="text-[7px] text-slate-400 font-bold uppercase block">Método de Pago</span>
            <span className="font-bold text-slate-800 uppercase">{paymentMethodLabel}</span>
          </div>
          <div className="border border-slate-200 p-1.5 rounded">
            <span className="text-[7px] text-slate-400 font-bold uppercase block">Banco / Destino / ID</span>
            <span className="font-bold text-slate-800 uppercase">{destinationBank || 'CAJA GENERAL'}</span>
          </div>
          <div className="border border-slate-200 p-1.5 rounded bg-slate-50/55 flex justify-between items-center px-2">
            <div>
              <span className="text-[7px] text-slate-400 font-bold uppercase block">Tasa de Cambio</span>
              <span className="font-mono font-bold text-slate-700">{rateUsed.toFixed(2)} Bs/$</span>
            </div>
          </div>
        </div>

        {/* Signature Box */}
        <div className="grid grid-cols-2 gap-6 pt-6 pb-2">
          <div className="text-center space-y-1 border-t border-dashed border-slate-400 pt-1.5">
            <p className="text-[9px] font-black uppercase text-slate-700">Entregué Conforme</p>
            <p className="text-[8px] text-slate-400">Firma y Sello Coordinador</p>
          </div>
          <div className="text-center space-y-1 border-t border-dashed border-slate-400 pt-1.5">
            <p className="text-[9px] font-black uppercase text-slate-700">Recibí Conforme</p>
            <p className="text-[8px] text-slate-400">Beneficiario / C.I. o Cargo</p>
          </div>
        </div>

        {/* Small footprint */}
        <div className="text-center text-[7.5px] text-slate-400 border-t border-slate-100 pt-1 flex justify-between items-center font-mono">
          <span>Este comprobante electrónico es válido como respaldo administrativo interno.</span>
          <span>Invepinca - Control de Caja</span>
        </div>
      </div>
    </div>
  );
}
