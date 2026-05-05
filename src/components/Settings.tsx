import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { type Settings } from '../types';
import { Save, RefreshCcw, DollarSign, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Settings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rate, setRate] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return dbService.subscribeToSettings((s) => {
      if (s) {
        setSettings(s);
        setRate(s.exchangeRate.toString());
      }
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await dbService.updateExchangeRate(parseFloat(rate));
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Configuración</h2>
        <p className="text-slate-500">Administra las variables globales del sistema.</p>
      </div>

      <div className="card p-8 border-blue-100">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <RefreshCcw size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Tasa de Cambio Diaria</h3>
            <p className="text-sm text-slate-500">Establece la relación de conversión oficial (BS / USD).</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between items-end mb-2">
              <label className="label mb-0">Tasa Oficial (Venta)</label>
              <button 
                type="button" 
                onClick={async () => {
                  setSaving(true);
                  try {
                    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
                    const data = await res.json();
                    if (data && data.promedio) {
                      setRate(data.promedio.toString());
                      await dbService.updateExchangeRate(data.promedio);
                    }
                  } catch (error) {
                    console.error("Error fetching official rate", error);
                    alert("No se pudo obtener la tasa oficial. Por favor intente manualmente.");
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-bold px-3 py-1.5 rounded flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <RefreshCcw size={14} className={saving ? "animate-spin" : ""} />
                Obtener Oficial (BCV)
              </button>
            </div>
            <div className="relative">
              <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="number" 
                step="0.01"
                required
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0.00"
                className="w-full text-3xl font-black bg-slate-50 border-2 border-slate-200 rounded-2xl px-12 py-6 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-blue-600"
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-400">BS / $</span>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
              <span>Última Actualización</span>
              <span className="text-slate-600">
                {settings?.lastUpdated ? format(settings.lastUpdated.toDate(), "dd 'de' MMMM, yyyy - p", { locale: es }) : 'Nunca'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Referencia: 100$ equivalen a</span>
              <span className="font-bold text-slate-800">{new Intl.NumberFormat('es-VE').format((parseFloat(rate) || 0) * 100)} BS</span>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={saving}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-black text-lg rounded-2xl shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3"
          >
            <Save size={24} />
            {saving ? 'Guardando...' : 'Actualizar Tasa de Cambio'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6 bg-slate-900 text-white">
          <TrendingUp className="text-blue-400 mb-4" size={32} />
          <h4 className="font-bold mb-2">Uso Automático</h4>
          <p className="text-sm text-slate-400 leading-relaxed">
            Esta tasa se aplicará automáticamente en los formularios de ingresos, gastos y reportes para mantener consistencia en el balance.
          </p>
        </div>
        <div className="card p-6 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
            <h4 className="font-bold text-slate-400 mb-2 uppercase text-xs tracking-tighter">Próximas Configuraciones</h4>
            <p className="text-xs text-slate-300">Categorías de gastos editables, usuarios y permisos.</p>
        </div>
      </div>
    </div>
  );
}
