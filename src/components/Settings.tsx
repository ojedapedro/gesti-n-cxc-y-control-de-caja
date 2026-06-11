import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { type Settings } from '../types';
import { 
  Save, 
  RefreshCcw, 
  DollarSign, 
  TrendingUp, 
  Database, 
  Download, 
  Trash2, 
  ShieldCheck, 
  ShieldAlert, 
  Calendar, 
  Sparkles, 
  Loader2, 
  FileJson, 
  Clock, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { backupService, type BackupConfig, type SavedBackupEntry } from '../services/backup';

export default function Settings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rate, setRate] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  // Backup state
  const [backupConfig, setBackupConfig] = useState<BackupConfig>({
    enabled: false,
    frequency: 'daily',
    actionType: 'download'
  });
  const [localBackups, setLocalBackups] = useState<SavedBackupEntry[]>([]);
  const [exportingNow, setExportingNow] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState(false);

  useEffect(() => {
    // Subscribe to settings
    const unsub = dbService.subscribeToSettings((s) => {
      if (s) {
        setSettings(s);
        setRate(s.exchangeRate.toString());
      }
    });

    // Load backup configuration
    setBackupConfig(backupService.getBackupConfig());
    setLocalBackups(backupService.getSavedBackupsList());

    return () => unsub();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await dbService.updateExchangeRate(parseFloat(rate), date);
    setSaving(false);
  };

  const handleToggleBackups = () => {
    const updated = { ...backupConfig, enabled: !backupConfig.enabled };
    backupService.saveBackupConfig(updated);
    setBackupConfig(updated);
    triggerConfigSuccess();
  };

  const handleChangeFrequency = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const updated = { ...backupConfig, frequency: e.target.value as any };
    backupService.saveBackupConfig(updated);
    setBackupConfig(updated);
    triggerConfigSuccess();
  };

  const handleChangeActionType = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const updated = { ...backupConfig, actionType: e.target.value as any };
    backupService.saveBackupConfig(updated);
    setBackupConfig(updated);
    triggerConfigSuccess();
  };

  const triggerConfigSuccess = () => {
    setConfigSuccess(true);
    setTimeout(() => setConfigSuccess(false), 3000);
  };

  const handleManualExport = async () => {
    setExportingNow(true);
    setBackupSuccess(null);
    try {
      // Simulate slight delay for professional feel (gives visual progress feedback)
      await new Promise(resolve => setTimeout(resolve, 800));

      const jsonData = await backupService.exportFirestoreToJSON();
      const dateStr = format(new Date(), 'yyyyMMdd_HHmm');
      const filename = `respaldo_liquidez_completo_${dateStr}.json`;

      // 1. Download file
      backupService.triggerDownload(jsonData, filename);

      // 2. Cache it locally in browser
      backupService.saveBackupToBrowser(filename, jsonData);

      // Update local listing
      setLocalBackups(backupService.getSavedBackupsList());

      // Update last backup timestamp
      const updatedConfig = { 
        ...backupConfig, 
        lastBackupAt: new Date().toISOString() 
      };
      backupService.saveBackupConfig(updatedConfig);
      setBackupConfig(updatedConfig);

      setBackupSuccess("Copia de seguridad generada y descargada con éxito.");
      setTimeout(() => setBackupSuccess(null), 5000);
    } catch (error) {
      console.error("Manual export error", error);
      alert("Error exportando datos: " + String(error));
    } finally {
      setExportingNow(false);
    }
  };

  const handleDownloadSaved = (entry: SavedBackupEntry) => {
    const data = backupService.getBackupData(entry.id);
    if (data) {
      backupService.triggerDownload(data, entry.filename);
    } else {
      alert("No se pudo recuperar el archivo de respaldo seleccionado del historial del navegador.");
    }
  };

  const handleDeleteSaved = (id: string, name: string) => {
    if (window.confirm(`¿Está seguro que desea eliminar la copia de seguridad "${name}" de la memoria del navegador?`)) {
      backupService.deleteBackup(id);
      setLocalBackups(backupService.getSavedBackupsList());
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Configuración General</h2>
        <p className="text-slate-500">Administra las variables globales del sistema y resguarda la información de tu negocio.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Daily Exchange Rate and Quick Actions */}
        <div className="space-y-6">
          <div className="card p-6 border-blue-100 bg-white">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                <RefreshCcw size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Tasa de Cambio Diaria</h3>
                <p className="text-sm text-slate-500">Relación de conversión oficial (BS / USD).</p>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label text-slate-600 text-xs font-semibold">Fecha de Aplicación</label>
                  <input 
                    type="date" 
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="input-field py-2 text-sm"
                  />
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between items-end mb-1">
                    <label className="label mb-0 text-slate-600 text-xs font-semibold">Tasa Oficial</label>
                    <button 
                      type="button" 
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
                          const data = await res.json();
                          if (data && data.promedio) {
                            setRate(data.promedio.toString());
                            await dbService.updateExchangeRate(data.promedio, date);
                            triggerConfigSuccess();
                          }
                        } catch (error) {
                          console.error("Error fetching official rate", error);
                          alert("No se pudo obtener la tasa oficial de la API Pública. Por favor introduce manualmente.");
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                      className="text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-black px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <RefreshCcw size={10} className={saving ? "animate-spin" : ""} />
                      CONSULTAR BCV
                    </button>
                  </div>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      placeholder="0.00"
                      className="input-field pl-10 py-2 text-sm font-bold text-blue-600"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Última Actualización</span>
                  <span className="text-slate-600">
                    {settings?.lastUpdated ? format(settings.lastUpdated.toDate(), "dd 'de' MMMM, yyyy - p", { locale: es }) : 'Nunca'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Conversión de Referencia: 100$ equivalen a</span>
                  <span className="font-extrabold text-blue-700">{new Intl.NumberFormat('es-VE').format((parseFloat(rate) || 0) * 100)} BS</span>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={saving}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-100 hover:shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {saving ? 'Guardando...' : 'Aplicar Tasa de Cambio'}
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5 bg-slate-900 text-white border-none shadow-xl">
              <TrendingUp className="text-emerald-400 mb-3" size={28} />
              <h4 className="font-bold text-sm mb-1 text-white">Sincronización Dual</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Esta tasa se asocia a ingresos, retiros de caja y cobros pendientes logrando un análisis financiero integrado de tu flujo neto.
              </p>
            </div>
            <div className="card p-5 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-center">
              <Sparkles className="text-violet-500 mb-2" size={24} />
              <h4 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-1">Módulos Inteligentes</h4>
              <p className="text-[10px] text-slate-400">Control de flujo, vendedores destacados y cuadre binacional diario.</p>
            </div>
          </div>
        </div>

        {/* Local Security and Firestore Backup Panel */}
        <div className="space-y-6">
          <div className="card p-6 border-emerald-100 bg-white">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                  <Database size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Seguridad y Respaldos</h3>
                  <p className="text-sm text-slate-500">Automatiza copias JSON para protección de datos local.</p>
                </div>
              </div>
              {configSuccess && (
                <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 animate-pulse">
                  <CheckCircle2 size={12} /> GUARDADO
                </span>
              )}
            </div>

            <div className="space-y-5">
              
              {/* Toggle Enable Backup */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="space-y-0.5">
                  <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer" onClick={handleToggleBackups}>
                    Respaldos Automáticos
                  </label>
                  <p className="text-[11px] text-slate-500">Ejecuta el protocolo de seguridad de forma regular.</p>
                </div>
                <button 
                  type="button" 
                  onClick={handleToggleBackups}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${backupConfig.enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${backupConfig.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Advanced Configurations - visible when enabled */}
              <div className={`space-y-4 overflow-hidden transition-all duration-300 ${backupConfig.enabled ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">Frecuencia de Exportación</label>
                    <select 
                      value={backupConfig.frequency}
                      onChange={handleChangeFrequency}
                      className="input-field py-2 text-xs text-slate-700 bg-white"
                    >
                      <option value="daily">Diario (Cada 24 horas)</option>
                      <option value="weekly">Semanal (Cada 7 días)</option>
                      <option value="monthly">Mensual (Cada 30 días)</option>
                      <option value="closure">Al registrar Cierre de Caja</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">Acción de Seguridad</label>
                    <select 
                      value={backupConfig.actionType}
                      onChange={handleChangeActionType}
                      className="input-field py-2 text-xs text-slate-700 bg-white"
                    >
                      <option value="download">Descargar archivo .json</option>
                      <option value="browser">Guardar local (en este navegador)</option>
                      <option value="both">Ambas opciones (Descargar y guardar)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[11px] text-indigo-700">
                  <Clock size={16} className="shrink-0" />
                  <div>
                    <span className="font-bold">Ciclo Activo:</span> El sistema validará su estado en segundo plano y guardará los datos sin interrumpir tu experiencia de venta.
                  </div>
                </div>
              </div>

              {/* Status information */}
              <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="flex items-center gap-1">
                  <Calendar size={13} /> Última copia automática: 
                </span>
                <span className="font-bold text-slate-600">
                  {backupConfig.lastBackupAt 
                    ? format(new Date(backupConfig.lastBackupAt), "dd 'de' MMMM, yyyy - p", { locale: es }) 
                    : 'Aún no programada'}
                </span>
              </div>

              {/* Manual Trigger Backup Now */}
              <div className="space-y-2 border-t border-slate-100 pt-5">
                <button 
                  type="button" 
                  disabled={exportingNow}
                  onClick={handleManualExport}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-100 hover:shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  {exportingNow ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Procesando Base de Datos...
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      Exportar y Descargar JSON Ahora
                    </>
                  )}
                </button>

                {backupSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-center text-xs font-black flex items-center justify-center gap-1.5 animate-pulse">
                    <ShieldCheck size={16} />
                    {backupSuccess}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Browser Local Backups List */}
      <div className="card p-6 border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-50 text-slate-700 rounded-xl flex items-center justify-center shrink-0">
              <FileJson size={20} />
            </div>
            <div>
              <h3 className="text-md font-bold text-slate-900">Historial del Navegador</h3>
              <p className="text-xs text-slate-500">Últimas copias resguardadas en la memoria local de este dispositivo.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 self-start md:self-auto">
            <AlertCircle size={14} className="text-amber-500" />
            <span>Capacidad máx: 5 versiones</span>
          </div>
        </div>

        {localBackups.length === 0 ? (
          <div className="border border-dashed border-slate-100 p-8 text-center rounded-2xl bg-slate-25">
            <span className="text-slate-300 font-bold text-xs uppercase tracking-wider block mb-1">Sin Respaldos en Caché</span>
            <p className="text-xs text-slate-400">Haz clic en "Exportar" para generar tu primera copia física de datos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold bg-slate-50">
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Nombre de Archivo de Copia</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Fecha del Registro</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Tamaño</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {localBackups.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-25/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></div>
                      <span className="truncate max-w-xs">{entry.filename}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {format(new Date(entry.timestamp), "dd 'de' MMM, yyyy - p", { locale: es })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600 font-bold">
                      {formatSize(entry.sizeBytes)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => handleDownloadSaved(entry)}
                          className="p-1 px-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-bold flex items-center gap-1 transition-colors"
                          title="Descargar archivo JSON a disco duro"
                        >
                          <Download size={12} />
                          Guardar
                        </button>
                        <button 
                          onClick={() => handleDeleteSaved(entry.id, entry.filename)}
                          className="p-1 px-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-colors"
                          title="Eliminar de la memoria del navegador"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 p-4 bg-amber-50/50 border border-amber-100 rounded-xl flex gap-3 text-xs text-amber-800">
          <ShieldAlert size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold block text-[13px] mb-0.5 text-amber-900">Aviso Práctico de Seguridad Local:</span>
            Las copias guardadas en el navegador son muy convenientes para recuperaciones rápidas, pero pueden borrarse si limpias los datos de tu navegador o formateas tu dispositivo. <span className="font-extrabold">Te sugerimos siempre descargar el archivo JSON a un pendrive o guardarlo en tu cuenta de Google Drive para máxima tranquilidad.</span>
          </div>
        </div>
      </div>

    </div>
  );
}
