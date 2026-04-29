import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/db';
import { type Receipt } from '../types';
import { Plus, Printer, FileText, User, DollarSign, Calendar, Tag, Download } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function Receipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [formData, setFormData] = useState({
    recipient: '',
    amountUsd: '',
    concept: 'RETIRO EN EFECTIVO',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dbService.getReceipts().then(res => setReceipts(res || []));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextNum = (receipts.length + 1).toString().padStart(5, '0');
    
    const newReceipt = {
      receiptNumber: nextNum,
      recipient: formData.recipient,
      amountUsd: parseFloat(formData.amountUsd),
      concept: formData.concept,
      date: formData.date,
    };

    const docRef = await dbService.addReceipt(newReceipt);
    
    // Refresh
    const res = await dbService.getReceipts();
    setReceipts(res || []);
    setShowForm(false);
    
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
    if (!selectedReceipt || !printRef.current) return;
    try {
      // Capture the element using html2canvas
      const canvas = await html2canvas(printRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      
      // Calculate image dimensions to fit within PDF width with margin
      const margin = 15;
      const printWidth = pdfWidth - margin * 2;
      const printHeight = (canvas.height * printWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', margin, margin, printWidth, printHeight);
      pdf.save(`Recibo_INVEPINCA_${selectedReceipt.receiptNumber}.pdf`);
    } catch (error) {
      console.error('Error generando el PDF', error);
      alert('Hubo un error al generar el PDF. Por favor, intenta de nuevo.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Recibos de Retiro</h2>
          <p className="text-slate-500">Vales de salida de efectivo que afectan CXC.</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          {showForm ? 'Cerrar' : <><Plus size={20} /> Generar Recibo</>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6 no-print">
          {showForm && (
            <div className="card p-6 border-blue-100 bg-blue-50/10">
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
                    <label className="label">Monto (USD)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input 
                        type="number" 
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={formData.amountUsd}
                        onChange={(e) => setFormData({...formData, amountUsd: e.target.value})}
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
                <button type="submit" className="btn-primary w-full h-11 mt-2">
                  Crear y Guardar (Afecta CXC)
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
                    <th className="table-header text-right">Monto</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
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
                      <td className="table-cell text-right font-bold">{formatCurrency(r.amountUsd)}</td>
                      <td className="table-cell text-right">
                        <ChevronRight size={16} className="text-slate-300 ml-auto" />
                      </td>
                    </tr>
                  ))}
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
