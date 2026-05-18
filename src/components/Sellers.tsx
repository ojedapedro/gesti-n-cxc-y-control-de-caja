import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { type Seller } from '../types';
import { 
  Users, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  X, 
  MapPin, 
  Percent, 
  IdCard,
  User
} from 'lucide-react';
import { format } from 'date-fns';

export default function Sellers() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [rubros, setRubros] = useState<{name: string, commission: string}[]>([]);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    region: '',
    commissionPercentage: ''
  });

  useEffect(() => {
    const unsub = dbService.subscribeToSellers(setSellers);
    return () => unsub();
  }, []);

  const handleEdit = (seller: Seller) => {
    setEditingSeller(seller);
    setFormData({
      id: seller.id,
      name: seller.name,
      region: seller.region,
      commissionPercentage: seller.commissionPercentage.toString()
    });
    setRubros(seller.rubros?.map(r => ({ name: r.name, commission: r.commissionPercentage.toString() })) || []);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este vendedor?')) {
      await dbService.deleteSeller(id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const seller: Seller = {
      id: formData.id.trim(),
      name: formData.name.trim().toUpperCase(),
      region: formData.region.trim().toUpperCase(),
      commissionPercentage: parseFloat(formData.commissionPercentage) || 0,
      rubros: rubros
        .filter(r => r.name.trim() !== '')
        .map(r => ({
          name: r.name.trim().toUpperCase(),
          commissionPercentage: parseFloat(r.commission) || 0
        })),
      createdAt: editingSeller?.createdAt || null
    };

    await dbService.addOrUpdateSeller(seller);
    setShowForm(false);
    setEditingSeller(null);
    setFormData({ id: '', name: '', region: '', commissionPercentage: '' });
    setRubros([]);
  };

  const filteredSellers = sellers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.id.includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tight">Perfiles de Vendedores</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Gestión de vendedores y sus porcentajes de comisión.</p>
        </div>
                <button 
          onClick={() => {
            setEditingSeller(null);
            setFormData({ id: '', name: '', region: '', commissionPercentage: '' });
            setRubros([]);
            setShowForm(true);
          }}
          className="btn-primary"
        >
          <Plus size={18} /> Nuevo Vendedor
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Statistics/Search */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card p-5 bg-white border-slate-200 shadow-sm">
            <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-widest mb-4">Filtrar Vendedores</h3>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Nombre o C.I..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 font-medium">Total Registrados:</span>
                <span className="font-black text-slate-900">{sellers.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sellers Grid */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSellers.map((seller) => (
            <div key={seller.id} className="card p-6 bg-white border-slate-200 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xl shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    {seller.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 tracking-tight leading-tight uppercase">{seller.name}</h4>
                    <p className="text-xs text-slate-400 font-bold flex items-center gap-1 mt-0.5">
                      <IdCard size={12} className="text-slate-300" /> C.I. {seller.id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleEdit(seller)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Edit size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(seller.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <MapPin size={10} /> Región
                  </p>
                  <p className="text-xs font-bold text-slate-700 truncate">{seller.region}</p>
                </div>
                <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Percent size={10} /> Comisión Base
                  </p>
                  <p className="text-sm font-black text-blue-700">{seller.commissionPercentage}%</p>
                </div>
              </div>

              {seller.rubros && seller.rubros.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Comisiones por Rubro</p>
                  <div className="flex flex-wrap gap-2">
                    {seller.rubros.map((r, i) => (
                      <div key={i} className="px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600 flex items-center gap-1">
                        <span>{r.name}:</span>
                        <span className="text-blue-600">{r.commissionPercentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {filteredSellers.length === 0 && (
            <div className="md:col-span-2 card p-12 text-center border-dashed border-slate-200">
              <Users size={48} className="mx-auto text-slate-200 mb-4" />
              <p className="text-slate-400 italic">No se encontraron vendedores.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <User className="text-blue-500" size={20} />
                {editingSeller ? 'Editar Vendedor' : 'Nuevo Perfil de Vendedor'}
              </h3>
              <button 
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="label">Cédula de Identidad (ID)</label>
                <input 
                  type="text" 
                  required
                  disabled={!!editingSeller}
                  placeholder="Ej: 12345678"
                  value={formData.id}
                  onChange={(e) => setFormData({...formData, id: e.target.value})}
                  className="input-field disabled:bg-slate-50 disabled:text-slate-400" 
                />
              </div>

              <div className="space-y-1">
                <label className="label">Nombre y Apellido</label>
                <input 
                  type="text" 
                  required
                  placeholder="NOMBRE COMPLETO"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value.toUpperCase()})}
                  className="input-field uppercase" 
                />
              </div>

              <div className="space-y-1">
                <label className="label">Región</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: DISTRITO CAPITAL"
                  value={formData.region}
                  onChange={(e) => setFormData({...formData, region: e.target.value.toUpperCase()})}
                  className="input-field uppercase" 
                />
              </div>

              <div className="space-y-1">
                <label className="label">Porcentaje de Comisión (%)</label>
                <div className="relative">
                  <Percent className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input 
                    type="number" 
                    step="0.01" 
                    required
                    placeholder="0.00"
                    value={formData.commissionPercentage}
                    onChange={(e) => setFormData({...formData, commissionPercentage: e.target.value})}
                    className="input-field pl-10" 
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-medium">Este porcentaje se aplicará al monto de CXC si no se especifica un rubro.</p>
              </div>

              <div className="space-y-3 pt-2">
                <label className="text-[12px] font-black text-slate-700 uppercase tracking-widest flex items-center justify-between">
                  Rubros Específicos (Comisión por Rubro)
                  <button 
                    type="button" 
                    onClick={() => setRubros([...rubros, {name: '', commission: ''}])}
                    className="text-blue-600 hover:text-blue-700 p-1 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </label>
                <div className="max-h-40 overflow-y-auto pr-2 space-y-2">
                  {rubros.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic text-center py-2 bg-slate-50 rounded-lg">No hay rubros específicos agregados.</p>
                  )}
                  {rubros.map((rubro, idx) => (
                    <div key={idx} className="flex gap-2 items-end group bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <div className="flex-1 space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Rubro (Ej: Pintura)</label>
                        <input 
                          placeholder="NOMBRE DEL RUBRO" 
                          value={rubro.name}
                          onChange={(e) => {
                            const newRubros = [...rubros];
                            newRubros[idx].name = e.target.value.toUpperCase();
                            setRubros(newRubros);
                          }}
                          className="input-field text-[11px] h-8 uppercase"
                        />
                      </div>
                      <div className="w-16 space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">%</label>
                        <input 
                          type="number"
                          placeholder="%" 
                          value={rubro.commission}
                          onChange={(e) => {
                            const newRubros = [...rubros];
                            newRubros[idx].commission = e.target.value;
                            setRubros(newRubros);
                          }}
                          className="input-field text-[11px] h-8 px-2"
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setRubros(rubros.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)} 
                  className="px-5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {editingSeller ? 'Guardar Cambios' : 'Crear Vendedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
