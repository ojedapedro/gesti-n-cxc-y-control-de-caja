import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/db';
import { PaymentMethod, type Receipt } from '../types';
import { Plus, Printer, FileText, User, DollarSign, Calendar, Tag, Download } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function Receipts({ exchangeRate = 1 }: { exchangeRate?: number }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [formData, setFormData] = useState({
    recipient: '',
    amount: '',
    paymentMethod: PaymentMethod.USD_CASH as string,
    exchangeRate: exchangeRate?.toString() || '0',
    concept: 'RETIRO EN EFECTIVO',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dbService.getReceipts().then(res => setReceipts(res || []));
  }, []);

  const [fetchingRate, setFetchingRate] = useState(false);

  // Fetch historical rate when date changes
  useEffect(() => {
    const fetchRate = async (dateStr: string) => {
      if (!dateStr) return;
      setFetchingRate(true);
      const historicalRate = await dbService.getExchangeRateForDate(dateStr);
      if (historicalRate) {
        setFormData(prev => ({ ...prev, exchangeRate: historicalRate.toString() }));
      } else if (exchangeRate) {
        setFormData(prev => ({ ...prev, exchangeRate: exchangeRate.toString() }));
      }
      setFetchingRate(false);
    };

    if (showForm) {
      fetchRate(formData.date);
    }
  }, [formData.date, showForm, exchangeRate]);

  const inBolivares = formData.paymentMethod === PaymentMethod.BS || formData.paymentMethod === PaymentMethod.BS_CASH;
  const inputAmt = parseFloat(formData.amount) || 0;
  const amountUsdConv = inBolivares ? inputAmt / (parseFloat(formData.exchangeRate) || 1) : 0;
  const amountBs = inBolivares ? inputAmt : 0;
  const totalPaymentUsd = inBolivares ? amountUsdConv : inputAmt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalPaymentUsd <= 0) return;

    const nextNum = (receipts.length + 1).toString().padStart(5, '0');
    
    const newReceipt = {
      receiptNumber: nextNum,
      recipient: formData.recipient,
      amountUsd: totalPaymentUsd,
      amountBs: amountBs > 0 ? amountBs : null,
      paymentMethod: formData.paymentMethod,
      exchangeRate: parseFloat(formData.exchangeRate) || 1,
      concept: formData.concept,
      date: formData.date,
    };

    const docRef = await dbService.addReceipt(newReceipt);
    
    // Refresh
    const res = await dbService.getReceipts();
    setReceipts(res || []);
    setShowForm(false);
    setFormData(prev => ({ ...prev, amount: '', concept: 'RETIRO EN EFECTIVO', recipient: '' }));
    
    // Auto Select for Preview with the actual document data (including ID)
    if (docRef) {
      const fullReceipt = { ...newReceipt, id: docRef.id } as Receipt;
      setSelectedReceipt(fullReceipt);
    }
  };

  const handlePrint = () => {
    if (!selectedReceipt) return;
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!selectedReceipt) return;
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Recuadro exterior
      doc.setLineWidth(0.5);
      doc.rect(15, 15, 180, 100);

      // Cabecera
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('INVEPINCA, C.A', 20, 25);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('RIF: J-40490348-8', 20, 30);
      doc.text('Valencia, Carabobo, Zona postal 2001.', 20, 34);

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('RECIBO DE PAGO', 190, 25, { align: 'right' });
      
      doc.setFontSize(10);
      doc.setTextColor(220, 38, 38); // red
      doc.text(`Nº ${selectedReceipt.receiptNumber}`, 190, 30, { align: 'right' });
      doc.setTextColor(0, 0, 0);

      // Linea separadora cabecera
      doc.setLineWidth(0.2);
      doc.line(15, 40, 195, 40);

      // Quien Recibe y Montos
      // Linea vertical
      doc.line(125, 40, 125, 65);
      
      // Quien Recibe
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(150, 150, 150);
      doc.text('QUIEN RECIBE', 20, 45);
      
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(selectedReceipt.recipient, 20, 52);
      
      // Linea punteada
      doc.setLineDashPattern([1, 1], 0);
      doc.line(20, 54, 115, 54);
      doc.setLineDashPattern([], 0);

      // Monto
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(150, 150, 150);
      doc.text('POR LA CANTIDAD DE', 130, 45);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.text(formatCurrency(selectedReceipt.amountUsd), 130, 53);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const bsAmount = selectedReceipt.amountUsd * (selectedReceipt.exchangeRate || exchangeRate || 1);
      doc.setFont('helvetica', 'bold');
      doc.text(`Bs. ${new Intl.NumberFormat('es-VE').format(bsAmount)}`, 130, 60);

      // Concepto
      doc.setLineDashPattern([], 0);
      doc.line(15, 65, 195, 65); // Linea separadora horizontal
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(150, 150, 150);
      doc.text('POR CONCEPTO DE', 20, 71);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const splitConcept = doc.splitTextToSize(selectedReceipt.concept, 170);
      doc.text(splitConcept, 20, 78);

      // Firmas
      doc.line(15, 95, 195, 95); // Linea superior firmas
      doc.line(105, 95, 105, 115); // Linea vertical medio

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('RECIBÍ CONFORME', 60, 103, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text('Firma y Cédula', 60, 108, { align: 'center' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('ENTREGUÉ CONFORME', 150, 103, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text('Caja Principal', 150, 108, { align: 'center' });

      // Fecha emision (debajo del cuadro)
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Fecha de emisión: ${selectedReceipt.date}`, 15, 120);
      
      try {
        const formattedDate = format(new Date(selectedReceipt.date + 'T12:00:00'), 'EEEE dd MMMM yyyy', { locale: es });
        doc.text(formattedDate, 195, 120, { align: 'right' });
      } catch (e) {
        // Ignore date format error
      }

      doc.save(`Recibo_INVEPINCA_${selectedReceipt.receiptNumber}.pdf`);
    } catch (error) {
      console.error('Error generando el PDF', error);
      alert('Hubo un error al generar el PDF. Por favor, intenta de nuevo.');
    }
  };

  const filteredReceipts = receipts.filter(r => {
    if (startDate && r.date < startDate) return false;
    if (endDate && r.date > endDate) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 no-print">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Recibos de Retiro</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Vales de salida de efectivo que afectan Caja.</p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
            <div className="flex items-center gap-2 px-2 w-full sm:w-auto">
              <Calendar size={16} className="text-slate-400 shrink-0" />
              <div className="flex flex-col w-full">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Desde</label>
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
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Hasta</label>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-sm font-medium text-slate-900 outline-none w-full sm:w-28 cursor-pointer"
                />
              </div>
            </div>
            {(startDate || endDate) && (
              <button 
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="mt-2 sm:mt-0 sm:ml-2 text-xs font-bold text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors w-full sm:w-auto text-center border border-transparent sm:border-slate-200 bg-white sm:bg-transparent shadow-sm sm:shadow-none"
              >
                Limpiar
              </button>
            )}
          </div>

          <button 
            onClick={() => setShowForm(!showForm)}
            className="btn-primary"
          >
            {showForm ? 'Cerrar' : <><Plus size={16} /> Generar Recibo</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6 no-print">
          {showForm && (
            <div className="card p-6 border-amber-100 bg-amber-50/20">
              <h3 className="font-bold text-slate-800 mb-4">Nuevo Recibo</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="label">Recibe</label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        required
                        placeholder="Nombre de la persona"
                        value={formData.recipient}
                        onChange={(e) => setFormData({...formData, recipient: e.target.value})}
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
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                        className="input-field pl-10" 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="label">Moneda (Entregada en)</label>
                    <select
                      required
                      value={formData.paymentMethod}
                      onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}
                      className="input-field cursor-pointer"
                    >
                      <option value={PaymentMethod.USD_CASH}>{PaymentMethod.USD_CASH}</option>
                      <option value={PaymentMethod.BS_CASH}>{PaymentMethod.BS_CASH}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="label">Tasa de Cambio</label>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      placeholder="1.00"
                      value={formData.exchangeRate}
                      onChange={(e) => setFormData({...formData, exchangeRate: e.target.value})}
                      className={`input-field font-mono font-bold ${inBolivares ? 'text-blue-600' : 'text-slate-400 opacity-50 bg-slate-50'}`} 
                      readOnly={!inBolivares}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="label">Monto ({inBolivares ? 'Bs' : 'USD'})</label>
                    <input 
                      type="number"  
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      className="input-field font-bold" 
                    />
                  </div>

                  {inBolivares && (
                    <div className="space-y-1">
                      <label className="label text-amber-600">Dólares Conv.</label>
                      <div className="input-field bg-amber-50 text-amber-700 font-bold border-dashed flex items-center">
                        {formatCurrency(amountUsdConv)}
                      </div>
                      <p className="text-[10px] text-slate-400">BS / Tasa</p>
                    </div>
                  )}

                  <div className="space-y-1 md:col-span-2">
                    <label className="label">Concepto</label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        required
                        value={formData.concept}
                        onChange={(e) => setFormData({...formData, concept: e.target.value})}
                        className="input-field pl-10" 
                      />
                    </div>
                  </div>
                </div>
                <button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium py-3 rounded-xl transition-colors shadow-lg shadow-amber-200 mt-2">
                  Crear y Guardar Recibo
                </button>
              </form>
            </div>
          )}

          <div className="card">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <FileText size={18} className="text-slate-400" />
              <h3 className="font-bold text-slate-800">Recibos Emitidos</h3>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Nº</th>
                    <th className="table-header">Fecha</th>
                    <th className="table-header">Recibe</th>
                    <th className="table-header text-center whitespace-nowrap">Moneda O.</th>
                    <th className="table-header text-right bg-amber-50/50">Monto Eq. USD</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceipts.map((r) => {
                    const isBs = r.paymentMethod === PaymentMethod.BS_CASH || r.paymentMethod === PaymentMethod.BS;
                    return (
                    <tr 
                      key={r.id} 
                      onClick={() => setSelectedReceipt(r)}
                      className={`cursor-pointer hover:bg-slate-50 border-b border-slate-100 ${selectedReceipt?.id === r.id ? 'bg-blue-50/50' : ''}`}
                    >
                      <td className="table-cell font-mono text-xs">{r.receiptNumber}</td>
                      <td className="table-cell">
                        {(() => {
                          try {
                            return format(new Date(r.date + 'T12:00:00'), 'dd/MM/yyyy');
                          } catch {
                            return r.date;
                          }
                        })()}
                      </td>
                      <td className="table-cell font-medium">{r.recipient}</td>
                      <td className="table-cell text-center">
                         {isBs ? (
                           <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded">Bs</span>
                         ) : (
                           <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded">USD</span>
                         )}
                      </td>
                      <td className="table-cell text-right font-bold text-amber-700 bg-amber-50/10">
                        {formatCurrency(r.amountUsd)}
                        <span className="block text-[10px] text-slate-400 font-normal mt-0.5">Bs. {new Intl.NumberFormat('es-VE').format(r.amountUsd * (r.exchangeRate || exchangeRate || 1))}</span>
                      </td>
                      <td className="table-cell text-right">
                        <ChevronRight size={16} className="text-slate-300 ml-auto" />
                      </td>
                    </tr>
                  )})}
                  {filteredReceipts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-400 italic">No hay registros de retiro para el periodo seleccionado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Receipt Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Previsualización del Recibo</h3>
            {selectedReceipt && (
              <div className="flex items-center gap-4">
                <button onClick={handleDownloadPDF} className="flex items-center gap-2 text-green-600 font-bold hover:underline transition-colors">
                  <Download size={18} /> Descargar PDF
                </button>
                <button onClick={handlePrint} className="flex items-center gap-2 text-blue-600 font-bold hover:underline transition-colors">
                  <Printer size={18} /> Imprimir
                </button>
              </div>
            )}
          </div>
          
          {selectedReceipt ? (
            <div ref={printRef} className="print-container bg-white p-8 rounded-xl border border-slate-300 shadow-xl max-w-lg mx-auto print:shadow-none print:border-none print:m-0">
              <div className="border-2 border-slate-900 p-6 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h4 className="text-lg font-black tracking-tighter">INVEPINCA, C.A</h4>
                    <p className="text-[10px] uppercase text-slate-500 max-w-[200px]">RIF: J-40490348-8<br />Valencia, Carabobo, Zona postal 2001.</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-2xl font-black uppercase">Recibo de Pago</h2>
                    <p className="text-xs font-mono mt-1">Nº <span className="text-red-600 font-bold">{selectedReceipt.receiptNumber}</span></p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-0 border-t border-b border-slate-900">
                  <div className="col-span-2 p-3 border-r border-slate-900">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Quien Recibe</p>
                    <p className="text-lg font-bold border-b border-dotted border-slate-300 pb-1">{selectedReceipt.recipient}</p>
                  </div>
                  <div className="p-3 bg-slate-50">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Por la cantidad de</p>
                    <p className="text-xl font-black">{formatCurrency(selectedReceipt.amountUsd)}</p>
                    <p className="text-[11px] font-bold text-slate-500 uppercase">
                      Bs. {new Intl.NumberFormat('es-VE').format(selectedReceipt.amountUsd * (selectedReceipt.exchangeRate || exchangeRate || 1))}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Por Concepto de</p>
                    <p className="text-sm p-3 bg-slate-50 rounded border border-slate-100 min-h-[60px]">{selectedReceipt.concept}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 pt-10">
                  <div className="text-center">
                    <div className="border-t border-slate-900 pt-2">
                       <p className="text-[10px] font-bold uppercase">Recibí Conforme</p>
                       <p className="text-[9px] text-slate-400 mt-1">Firma y Cédula</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-slate-900 pt-2">
                      <p className="text-[10px] font-bold uppercase">Entregué Conforme</p>
                      <p className="text-[9px] text-slate-400 mt-1">Caja Principal</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-between items-end border-t border-slate-100 italic text-[10px] text-slate-400">
                   <p>Fecha de emisión: {selectedReceipt.date}</p>
                   <p>
                     {(() => {
                       try {
                         return format(new Date(selectedReceipt.date + 'T12:00:00'), 'EEEE dd MMMM yyyy', { locale: es });
                       } catch {
                         return '';
                       }
                     })()}
                   </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="card h-64 flex flex-col items-center justify-center text-slate-400 border-dashed">
              <Printer size={48} className="mb-4 opacity-10" />
              <p>Selecciona un recibo para previsualizar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChevronRight({ size, className }: { size: number, className: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
