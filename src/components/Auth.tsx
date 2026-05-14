import React from 'react';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LogIn, LogOut, ShieldCheck } from 'lucide-react';

export function LoginScreen() {
  const handleLogin = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(error => {
      console.error("Error signing in", error);
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-10 text-center">
        <img src="https://i.ibb.co/NgSYhpq5/logo-Azul-Iinvepinca.jpg" alt="Logo Invepinca" className="w-24 h-auto mx-auto rounded-xl shadow-lg border border-slate-100 mb-6" />
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Gestión de Caja y Cuentas por Cobrar (CXC)</h1>
        <p className="text-slate-500 mb-8">Inicia sesión con tu cuenta corporativa para acceder al panel de control.</p>
        
        <button 
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg"
        >
          <LogIn size={20} />
          Continuar con Google
        </button>
        
        <p className="mt-8 text-xs text-slate-400 uppercase tracking-widest font-semibold">Acceso Protegido</p>
      </div>
    </div>
  );
}

export function UserMenu({ user }: { user: any }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-800 mt-2">
      <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full border border-slate-700" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{user.displayName}</p>
        <button 
          onClick={() => signOut(auth)}
          className="text-[10px] text-slate-400 hover:text-rose-400 font-bold uppercase flex items-center gap-1 transition-colors"
        >
          <LogOut size={10} /> Cerrar Sesión
        </button>
      </div>
    </div>
  );
}
