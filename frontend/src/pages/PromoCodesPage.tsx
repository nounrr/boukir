import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Percent, Plus, Search, ToggleLeft, ToggleRight, Trash2, Edit3 } from 'lucide-react';

interface PromoCode {
  id: number;
  code: string;
  description?: string;
  type: 'percentage' | 'fixed';
  value: number;
  max_discount_amount?: number | null;
  min_order_amount?: number | null;
  max_redemptions?: number | null;
  redeemed_count: number;
  active: number;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

type PromoForm = {
  code: string;
  description: string;
  type: 'percentage' | 'fixed';
  value: number;
  max_discount_amount: number | null;
  min_order_amount: number | null;
  max_redemptions: number | null;
  active: number;
  start_date: string;
  end_date: string;
};

const PromoCodesPage: React.FC = () => {
  const apiBaseUrl = (import.meta as any)?.env?.VITE_API_BASE_URL || '';
  const API_BASE = apiBaseUrl
    ? String(apiBaseUrl).replace(/\/$/, '') + '/api'
    : '/api';

  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [form, setForm] = useState<PromoForm>({
    code: '',
    description: '',
    type: 'percentage',
    value: 10,
    max_discount_amount: null,
    min_order_amount: null,
    max_redemptions: null,
    active: 1,
    start_date: '',
    end_date: ''
  });

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/promo-codes`, {
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setCodes(json.codes || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => { void fetchCodes(); }, [fetchCodes]);

  const filtered = useMemo(() => {
    const t = search.toLowerCase();
    return codes.filter(c =>
      c.code.toLowerCase().includes(t) || (c.description || '').toLowerCase().includes(t)
    );
  }, [codes, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      code: '', description: '', type: 'percentage', value: 10,
      max_discount_amount: null, min_order_amount: null, max_redemptions: null,
      active: 1, start_date: '', end_date: ''
    });
    setIsModalOpen(true);
  };

  const openEdit = (c: PromoCode) => {
    setEditing(c);
    setForm({
      code: c.code,
      description: c.description || '',
      type: c.type,
      value: c.value,
      max_discount_amount: c.max_discount_amount ?? null,
      min_order_amount: c.min_order_amount ?? null,
      max_redemptions: c.max_redemptions ?? null,
      active: c.active,
      start_date: c.start_date ? c.start_date.slice(0, 16) : '',
      end_date: c.end_date ? c.end_date.slice(0, 16) : ''
    });
    setIsModalOpen(true);
  };

  const saveForm = async () => {
    try {
      const payload = {
        code: form.code,
        description: form.description || null,
        type: form.type,
        value: Number(form.value),
        max_discount_amount: form.max_discount_amount ? Number(form.max_discount_amount) : null,
        min_order_amount: form.min_order_amount ? Number(form.min_order_amount) : null,
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
        active: form.active ? 1 : 0,
        start_date: form.start_date || null,
        end_date: form.end_date || null
      };

      const url = editing ? `${API_BASE}/promo-codes/${editing.id}` : `${API_BASE}/promo-codes`;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: buildHeaders(),
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      setIsModalOpen(false);
      setEditing(null);
      await fetchCodes();
      alert('Code promo sauvegardé');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || 'Erreur de sauvegarde');
    }
  };

  const toggleActive = async (c: PromoCode, active: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/promo-codes/${c.id}/toggle`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ active })
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchCodes();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || 'Erreur activation/désactivation');
    }
  };

  const removeCode = async (c: PromoCode) => {
    if (!confirm(`Supprimer le code ${c.code} ?`)) return;
    try {
      const res = await fetch(`${API_BASE}/promo-codes/${c.id}`, {
        method: 'DELETE',
        headers: buildHeaders()
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchCodes();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || 'Erreur de suppression');
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Percent size={24} className="text-primary-600" /> Codes Promo
        </h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
        >
          <Plus size={18} /> Nouveau Code
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="mb-4 flex items-center gap-2">
        <Search size={18} className="text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par code ou description..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type / Valeur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plafond / Min</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Utilisations</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Période</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td className="px-6 py-4" colSpan={7}>Chargement...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-center text-gray-500" colSpan={7}>
                    Aucun code trouvé. Cliquez sur "Nouveau Code" pour en créer un.
                  </td>
                </tr>
              ) : filtered.map(c => (
                <tr key={c.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{c.code}</div>
                    <div className="text-xs text-gray-500">{c.description || ''}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {c.type === 'percentage' ? `${c.value}%` : `${c.value} MAD`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(c.max_discount_amount ?? '-') + ' / ' + (c.min_order_amount ?? '-')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(c.redeemed_count ?? 0) + (c.max_redemptions ? ` / ${c.max_redemptions}` : '')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(c.start_date ? new Date(c.start_date).toLocaleString() : '-') + ' → ' + (c.end_date ? new Date(c.end_date).toLocaleString() : '-')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${c.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {c.active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button className="px-2 py-1 border rounded hover:bg-gray-50" onClick={() => openEdit(c)}>
                        <Edit3 size={16} />
                      </button>
                      <button className="px-2 py-1 border rounded hover:bg-gray-50" onClick={() => toggleActive(c, !c.active)}>
                        {c.active ? <ToggleLeft size={16} /> : <ToggleRight size={16} />}
                      </button>
                      <button className="px-2 py-1 border rounded hover:bg-red-50 text-red-600" onClick={() => removeCode(c)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xl p-6">
            <h2 className="text-xl font-semibold mb-4">{editing ? 'Modifier le code' : 'Nouveau code'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className="border rounded px-3 py-2" placeholder="Code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              <input className="border rounded px-3 py-2" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              <select
                className="border rounded px-3 py-2"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as 'percentage' | 'fixed' })}
              >
                <option value="percentage">Pourcentage</option>
                <option value="fixed">Fixe</option>
              </select>
              <input className="border rounded px-3 py-2" type="number" placeholder="Valeur" value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })} />
              <input className="border rounded px-3 py-2" type="number" placeholder="Plafond remise (MAD)" value={form.max_discount_amount ?? ''} onChange={e => setForm({ ...form, max_discount_amount: e.target.value ? Number(e.target.value) : null })} />
              <input className="border rounded px-3 py-2" type="number" placeholder="Montant minimum (MAD)" value={form.min_order_amount ?? ''} onChange={e => setForm({ ...form, min_order_amount: e.target.value ? Number(e.target.value) : null })} />
              <input className="border rounded px-3 py-2" type="number" placeholder="Utilisations max" value={form.max_redemptions ?? ''} onChange={e => setForm({ ...form, max_redemptions: e.target.value ? Number(e.target.value) : null })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.active} onChange={e => setForm({ ...form, active: e.target.checked ? 1 : 0 })} /> Actif</label>
              <input className="border rounded px-3 py-2" type="datetime-local" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              <input className="border rounded px-3 py-2" type="datetime-local" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="px-4 py-2 border rounded" onClick={() => { setIsModalOpen(false); setEditing(null); }}>Annuler</button>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded" onClick={saveForm}>Sauvegarder</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromoCodesPage;
