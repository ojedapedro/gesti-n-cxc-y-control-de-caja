import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Wallet, 
  Contact, 
  TrendingDown, 
  FileText, 
  Settings as SettingsIcon,
  PlusCircle,
  Menu,
  Activity,
  BarChart2,
  X,
  Search,
  ShieldCheck
} from 'lucide-react';
import { dbService } from './services/db';
import { backupService } from './services/backup';
import Dashboard from './components/Dashboard';
import Incomes from './components/Incomes';
import CXCAccounts from './components/CXCAccounts';
import Expenses from './components/Expenses';
import Receipts from './components/Receipts';
import Settings from './components/Settings';
import Sellers from './components/Sellers';
import Reports from './components/Reports';
import QuickActionFAB from './components/QuickActionFAB';
import PrintReceiptComponent from './components/PrintReceiptComponent';

type View = 'dashboard' | 'incomes' | 'cxc' | 'expenses' | 'settings' | 'sellers' | 'reports';

import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { LoginScreen, UserMenu } from './components/Auth';
import { type Settings as SettingsType } from './types';
import CashFlow from './components/CashFlow';

export default function App() {
  const [activeView, setActiveView] = useState<View>('settings');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [globalSettings, setGlobalSettings] = useState<SettingsType | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [backupToast, setBackupToast] = useState<string | null>(null);
  const [printTarget, setPrintTarget] = useState<{ type: 'receipt' | 'transaction' | 'expense'; data: any } | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });

    return () => {
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (user) {
      const unsubSettings = dbService.subscribeToSettings(setGlobalSettings);
      
      // Check for scheduled background local backups
      const backupTimeout = setTimeout(() => {
        backupService.runScheduledBackupCheck()
          .then((res) => {
            if (res.executed) {
              setBackupToast(`Copia de seguridad ejecutada automáticamente vía: ${res.method || 'almacenamiento local'}`);
              setTimeout(() => setBackupToast(null), 8000);
            }
          })
          .catch((err) => console.error("Error executing scheduled backup:", err));
      }, 5000);

      return () => {
        unsubSettings();
        clearTimeout(backupTimeout);
      };
    }
  }, [user]);

  useEffect(() => {
    (window as any).triggerPrintReceipt = (type: 'receipt' | 'transaction' | 'expense', data: any) => {
      setPrintTarget({ type, data });
      setTimeout(() => {
        window.print();
        setPrintTarget(null);
      }, 150);
    };
    return () => {
      delete (window as any).triggerPrintReceipt;
    };
  }, []);

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 bg-blue-200 rounded-full mb-4"></div>
          <div className="h-4 w-48 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard Caja Principal', icon: LayoutDashboard },
    { id: 'incomes', label: 'Ingresos Caja Principal', icon: Wallet },
    { id: 'cxc', label: 'Ingreso Cuentas por Cobrar (CXC)', icon: Contact },
    { id: 'sellers', label: 'Registro Vendedores', icon: PlusCircle },
    { id: 'expenses', label: 'Caja y Egresos Efectivo', icon: Activity },
    { id: 'reports', label: 'Módulo de Reportes', icon: FileText },
    { id: 'settings', label: 'Configuración', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen flex text-slate-900">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-[#0a0a0a] text-white p-5 fixed h-full border-r border-[#262626]">
        <div className="mb-10 px-2 mt-4 text-center">
          <img src="https://i.ibb.co/NgSYhpq5/logo-Azul-Iinvepinca.jpg" alt="Logo Invepinca" className="w-24 h-auto mx-auto rounded-xl shadow-lg border border-slate-700 mb-4" />
          <h1 className="text-xl font-bold tracking-tight text-white">GESTIÓN CUENTAS POR COBRAR (CXC)</h1>
          <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-[0.2em] font-medium">Invepinca CA</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id as View)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                  activeView === item.id 
                    ? 'bg-white/10 text-white' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="pt-4 mt-4 border-t border-[#262626]">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <img src="https://i.ibb.co/NgSYhpq5/logo-Azul-Iinvepinca.jpg" alt="Logo Invepinca" className="w-8 h-8 rounded-lg" />
           <h1 className="font-bold text-slate-800 tracking-tighter">INVEPINCA CA</h1>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-600">
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div 
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />
          <div className="absolute left-0 top-0 bottom-0 w-3/4 max-w-xs bg-[#0a0a0a] p-6 flex flex-col shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="mb-10 flex items-start justify-between">
              <div>
                <img src="https://i.ibb.co/NgSYhpq5/logo-Azul-Iinvepinca.jpg" alt="Logo Invepinca" className="w-16 h-auto rounded-xl shadow-md border border-slate-700 mb-3" />
                <h1 className="text-xl font-bold text-white tracking-tight">GESTIÓN CUENTAS POR COBRAR (CXC)</h1>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400">
                <X size={24} />
              </button>
            </div>
            <nav className="flex-1 space-y-2 overflow-y-auto">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveView(item.id as View);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-4 text-sm font-medium px-4 py-3 rounded-xl ${
                      activeView === item.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon size={20} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="mt-8 border-t border-[#262626] pt-4">
              <UserMenu user={user} />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 bg-slate-50 min-h-screen">
        {/* Búsqueda Global */}
        {['dashboard', 'incomes', 'cxc', 'expenses', 'reports'].includes(activeView) && (
          <div className="mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Búsqueda Global</h2>
              <p className="text-xs font-medium text-slate-500 font-sans">Busca clientes, conceptos u observaciones en tiempo real across views</p>
            </div>
            <div className="relative w-full sm:max-w-md">
              <span className="absolute left-3.5 top-3 text-slate-400">
                <Search size={18} />
              </span>
              <input 
                type="text" 
                placeholder="Buscar cliente, concepto, detalle..." 
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-slate-50 text-slate-800 placeholder-slate-400 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
              />
              {globalSearch && (
                <button 
                  onClick={() => setGlobalSearch('')}
                  className="absolute right-3 top-1.5 text-slate-400 hover:text-slate-600 font-bold transition-colors text-lg"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        )}

        {activeView === 'dashboard' && <div key="dashboard"><Dashboard exchangeRate={globalSettings?.exchangeRate} globalSearch={globalSearch} /></div>}
        {activeView === 'incomes' && <div key="incomes"><Incomes exchangeRate={globalSettings?.exchangeRate} globalSearch={globalSearch} /></div>}
        {activeView === 'cxc' && <div key="cxc"><CXCAccounts exchangeRate={globalSettings?.exchangeRate} globalSearch={globalSearch} /></div>}
        {activeView === 'expenses' && <div key="expenses"><Expenses exchangeRate={globalSettings?.exchangeRate} globalSearch={globalSearch} /></div>}
        {activeView === 'sellers' && <div key="sellers"><Sellers /></div>}
        {activeView === 'reports' && <div key="reports"><Reports exchangeRate={globalSettings?.exchangeRate} globalSearch={globalSearch} /></div>}
        {activeView === 'settings' && <div key="settings"><Settings /></div>}
      </main>

      {/* Backup Floating Toast Notification */}
      {backupToast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3 animate-fade-in max-w-sm z-50">
          <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h5 className="text-[11px] font-black uppercase tracking-wider text-emerald-400">Protección de Datos</h5>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-normal">{backupToast}</p>
          </div>
          <button onClick={() => setBackupToast(null)} className="text-slate-400 hover:text-white ml-2 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Global Quick Action Floating Button (FAB) */}
      <QuickActionFAB exchangeRate={globalSettings?.exchangeRate} />

      {/* Global Print View (Invisible on screen, styled beautifully on printed paper) */}
      {printTarget && (
        <PrintReceiptComponent 
          type={printTarget.type} 
          data={printTarget.data} 
          exchangeRate={globalSettings?.exchangeRate} 
        />
      )}
    </div>
  );
}
