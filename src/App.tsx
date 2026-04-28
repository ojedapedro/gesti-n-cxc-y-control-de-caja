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
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { dbService } from './services/db';
import Dashboard from './components/Dashboard';
import Incomes from './components/Incomes';
import CXCAccounts from './components/CXCAccounts';
import Expenses from './components/Expenses';
import Receipts from './components/Receipts';
import Settings from './components/Settings';

type View = 'dashboard' | 'incomes' | 'cxc' | 'expenses' | 'receipts' | 'settings';

import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { LoginScreen, UserMenu } from './components/Auth';
import { type Settings as SettingsType } from './types';

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
    { id: 'expenses', label: 'Gastos', icon: TrendingDown },
    { id: 'receipts', label: 'Recibos / Retiros', icon: FileText },
    { id: 'settings', label: 'Configuración', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen flex text-slate-900">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-slate-900 text-white p-4 fixed h-full">
        <div className="mb-10 px-4">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <TrendingDown className="text-blue-400" />
            <span className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">GESTIÓN CXC</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">Invepinca CA</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id as View)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  activeView === item.id 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <UserMenu user={user} />
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-slate-800 tracking-tighter">INVEPINCA CA</h1>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-600">
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <div key="mobile-nav-container">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black z-40 md:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-3/4 max-w-xs bg-slate-900 z-50 p-6 md:hidden flex flex-col"
            >
              <div className="mb-10">
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  <TrendingDown className="text-blue-400" />
                  GESTIÓN CXC
                </h1>
              </div>
              <nav className="flex-1 space-y-4 overflow-y-auto">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveView(item.id as View);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-4 text-lg ${
                        activeView === item.id ? 'text-blue-400' : 'text-slate-400'
                      }`}
                    >
                      <Icon size={24} />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="mt-8 border-t border-slate-800 pt-4">
                <UserMenu user={user} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 bg-slate-50 min-h-screen">
        <div key={activeView} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {activeView === 'dashboard' && <Dashboard />}
          {activeView === 'incomes' && <Incomes exchangeRate={globalSettings?.exchangeRate} />}
          {activeView === 'cxc' && <CXCAccounts />}
          {activeView === 'expenses' && <Expenses exchangeRate={globalSettings?.exchangeRate} />}
          {activeView === 'receipts' && <Receipts />}
          {activeView === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}
