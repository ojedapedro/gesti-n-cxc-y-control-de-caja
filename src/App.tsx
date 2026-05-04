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
  X
} from 'lucide-react';
import { dbService } from './services/db';
import Dashboard from './components/Dashboard';
import Incomes from './components/Incomes';
import CXCAccounts from './components/CXCAccounts';
import Expenses from './components/Expenses';
import Receipts from './components/Receipts';
import Settings from './components/Settings';

type View = 'dashboard' | 'incomes' | 'cxc' | 'expenses' | 'cashflow' | 'reports' | 'settings';

import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { LoginScreen, UserMenu } from './components/Auth';
import { type Settings as SettingsType } from './types';
import CashFlow from './components/CashFlow';
import Reports from './components/Reports';

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [globalSettings, setGlobalSettings] = useState<SettingsType | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });

    const unsubSettings = dbService.subscribeToSettings(setGlobalSettings);

    return () => {
      unsubAuth();
      unsubSettings();
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
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'incomes', label: 'Ingresos Caja', icon: Wallet },
    { id: 'cxc', label: 'Cuentas por Cobrar', icon: Contact },
    { id: 'expenses', label: 'Egresos y Retiros', icon: TrendingDown },
    { id: 'cashflow', label: 'Flujo de Caja', icon: Activity },
    { id: 'reports', label: 'Reportes', icon: BarChart2 },
    { id: 'settings', label: 'Configuración', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen flex text-slate-900">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-[#0a0a0a] text-white p-5 fixed h-full border-r border-[#262626]">
        <div className="mb-10 px-2 mt-4 text-center">
          <img src="https://i.ibb.co/NgSYhpq5/logo-Azul-Iinvepinca.jpg" alt="Logo Invepinca" className="w-24 h-auto mx-auto rounded-xl shadow-lg border border-slate-700 mb-4" />
          <h1 className="text-xl font-bold tracking-tight text-white">GESTIÓN CXC</h1>
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
                <h1 className="text-xl font-bold text-white tracking-tight">GESTIÓN CXC</h1>
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
        {activeView === 'dashboard' && <div key="dashboard"><Dashboard exchangeRate={globalSettings?.exchangeRate} /></div>}
        {activeView === 'incomes' && <div key="incomes"><Incomes exchangeRate={globalSettings?.exchangeRate} /></div>}
        {activeView === 'cxc' && <div key="cxc"><CXCAccounts exchangeRate={globalSettings?.exchangeRate} /></div>}
        {activeView === 'expenses' && <div key="expenses"><Expenses exchangeRate={globalSettings?.exchangeRate} /></div>}
        {activeView === 'cashflow' && <div key="cashflow"><CashFlow exchangeRate={globalSettings?.exchangeRate} /></div>}
        {activeView === 'reports' && <div key="reports"><Reports exchangeRate={globalSettings?.exchangeRate} /></div>}
        {activeView === 'settings' && <div key="settings"><Settings /></div>}
      </main>
    </div>
  );
}
