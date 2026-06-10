import React, { useState } from 'react';
import IncomesRegistro from './IncomesRegistro';
import IncomesCierre from './IncomesCierre';
import { FileText, Lock } from 'lucide-react';

export default function Incomes({ exchangeRate, globalSearch = '' }: { exchangeRate?: number; globalSearch?: string }) {
  const [activeTab, setActiveTab] = useState<'registro' | 'cierre'>('registro');

  return (
    <div className="space-y-6">
      <div className="flex border-b border-slate-200 gap-8 mb-2 overflow-x-auto scrollbar-hide">
        <button 
          onClick={() => setActiveTab('registro')}
          className={`pb-3 font-bold text-[15px] flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'registro' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <FileText size={18} />
          <span>Registro y Reporte</span>
        </button>
        <button 
          onClick={() => setActiveTab('cierre')}
          className={`pb-3 font-bold text-[15px] flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'cierre' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <Lock size={18} />
          <span>Cierre de Caja</span>
        </button>
      </div>

      <div className="mt-4">
        {activeTab === 'registro' ? (
          <IncomesRegistro exchangeRate={exchangeRate} globalSearch={globalSearch} />
        ) : (
          <IncomesCierre exchangeRate={exchangeRate} />
        )}
      </div>
    </div>
  );
}
