import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../hooks/redux';
import { useCreateSnapshotMutation, useListSnapshotsQuery, useGetSnapshotQuery } from '../store/api/inventoryApi';
import { showSuccess, showError } from '../utils/notifications';
import { formatDateTimeWithHour } from '../utils/dateUtils';
import { useGetProductsQuery } from '../store/api/productsApi';
import { useGetCategoriesQuery } from '../store/api/categoriesApi';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Package, DollarSign, BarChart3, Search, Filter } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const InventoryPage: React.FC = () => {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0,10);
  const { data, refetch, isFetching } = useListSnapshotsQuery({ date: today });
  const [createSnapshot, { isLoading }] = useCreateSnapshotMutation();

  const canCreate = user?.role === 'PDG' || user?.role === 'ManagerPlus';

  const handleCreate = async () => {
    try {
      const res = await createSnapshot().unwrap();
      showSuccess(`Inventaire enregistré: #${res.id}`);
      refetch();
    } catch (e: any) {
      showError(e?.data?.message || e?.message || 'Échec de l\'enregistrement d\'inventaire');
    }
  };

  const snapshots = data?.snapshots || [];
  
  useEffect(() => {
    console.log('[InventoryPage] Snapshots received:', snapshots);
    snapshots.forEach(s => {
      console.log(`  Snapshot #${s.id}:`, {
        created_at: s.created_at,
        totals: s.totals,
        files: s.files
      });
    });
  }, [snapshots]);
  
  const latestId = useMemo(() => {
    if (!snapshots.length) return null;
    return snapshots.reduce((max, s) => (s.id > max ? s.id : max), snapshots[0].id);
  }, [snapshots]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'charts'>('table');
  const [chartType, setChartType] = useState<'snapshots' | 'products' | 'categories'>('snapshots');
  const [compareSnapshotIds, setCompareSnapshotIds] = useState<number[]>([]);

  useEffect(() => {
    // Auto-select latest snapshot when list changes
    if (latestId != null) setSelectedId(latestId);
  }, [latestId]);

  const { data: snapshotDetail, isFetching: loadingDetail } = useGetSnapshotQuery(
    selectedId != null ? { id: String(selectedId), date: today } : { id: '', date: today },
    { skip: selectedId == null }
  );

  // Filters like Stock page
  const { data: productsApiData } = useGetProductsQuery();
  const { data: categoriesApiData } = useGetCategoriesQuery();
  const products = productsApiData || [];
  const categories = categoriesApiData || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [topProductsCount, setTopProductsCount] = useState(10);

  const categoryChildrenMap = useMemo(() => {
    const map = new Map<number, any[]>();
    categories.forEach((c: any) => {
      if (c.parent_id) {
        const list = map.get(c.parent_id) || [];
        list.push(c);
        map.set(c.parent_id, list);
      }
    });
    return map;
  }, [categories]);

  const organizedCategories = useMemo(() => {
    const roots = categories.filter((c: any) => !c.parent_id);
    const result: { id: number; nom: string; level: number }[] = [];
    const traverse = (cats: any[], level: number) => {
      cats.forEach((c) => {
        result.push({ id: c.id, nom: c.nom, level });
        const children = categoryChildrenMap.get(c.id);
        if (children) traverse(children, level + 1);
      });
    };
    traverse(roots, 0);
    return result;
  }, [categories, categoryChildrenMap]);

  const categoryFilterIds = useMemo(() => {
    if (!filterCategory) return null;
    const rootId = Number(filterCategory);
    if (!Number.isFinite(rootId)) return null;
    const ids = new Set<number>();
    const walk = (id: number) => {
      ids.add(id);
      const children = categoryChildrenMap.get(id) || [];
      children.forEach((c: any) => walk(c.id));
    };
    walk(rootId);
    return ids;
  }, [filterCategory, categoryChildrenMap]);

  const productById = useMemo(() => {
    const map = new Map<number, any>();
    (products || []).forEach((p: any) => {
      map.set(Number(p.id), p);
    });
    return map;
  }, [products]);

  const filteredItems = useMemo(() => {
    const items = snapshotDetail?.snapshot?.items || [];
    const term = (searchTerm || '').toLowerCase();
    return items.filter((it: any) => {
      const matchesSearch = !term || String(it.designation || '').toLowerCase().includes(term) || String(it.id).includes(term);
      if (!matchesSearch) return false;
      if (!categoryFilterIds) return true;
      const prod = productById.get(Number(it.id));
      if (!prod) return false;
      // New categories array or legacy single id
      if (Array.isArray(prod.categories) && prod.categories.length > 0) {
        return prod.categories.some((c: any) => categoryFilterIds.has(Number(c.id)));
      }
      const cid = Number(prod.categorie_id);
      return Number.isFinite(cid) ? categoryFilterIds.has(cid) : false;
    });
  }, [snapshotDetail, searchTerm, categoryFilterIds, productById]);

  // Chart data: Compare snapshots
  const snapshotComparisonData = useMemo(() => {
    const data = snapshots.map((s) => ({
      name: `#${s.id}`,
      id: s.id,
      date: formatDateTimeWithHour(s.created_at),
      produits: s.totals?.totalProducts || 0,
      quantité: Number(s.totals?.totalQty || 0),
      valeurCoût: Number(s.totals?.totalCost || 0),
      valeurVente: Number(s.totals?.totalSale || 0),
    }));
    console.log('[InventoryPage] Snapshot comparison data:', data);
    return data;
  }, [snapshots]);

  // Chart data: Top products by value in selected snapshot
  const topProductsData = useMemo(() => {
    const items = filteredItems || [];
    const sorted = [...items].sort((a, b) => Number(b.valeur_sale || 0) - Number(a.valeur_sale || 0));
    return sorted.slice(0, topProductsCount).map((it) => ({
      name: it.designation?.slice(0, 30) || `#${it.id}`,
      id: it.id,
      quantité: Number(it.quantite || 0),
      valeurCoût: Number(it.valeur_cost || 0),
      valeurVente: Number(it.valeur_sale || 0),
    }));
  }, [filteredItems, topProductsCount]);

  // Chart data: Category breakdown in selected snapshot
  const categoryData = useMemo(() => {
    const items = snapshotDetail?.snapshot?.items || [];
    const catMap = new Map<string, { cost: number; sale: number; qty: number; count: number }>();
    
    items.forEach((it: any) => {
      const prod = productById.get(Number(it.id));
      let catName = 'Sans catégorie';
      if (prod) {
        if (Array.isArray(prod.categories) && prod.categories.length > 0) {
          catName = prod.categories[0].nom || 'Sans catégorie';
        } else {
          const cat = categories.find((c: any) => Number(c.id) === Number(prod.categorie_id));
          if (cat) catName = cat.nom;
        }
      }
      const existing = catMap.get(catName) || { cost: 0, sale: 0, qty: 0, count: 0 };
      existing.cost += Number(it.valeur_cost || 0);
      existing.sale += Number(it.valeur_sale || 0);
      existing.qty += Number(it.quantite || 0);
      existing.count += 1;
      catMap.set(catName, existing);
    });

    return Array.from(catMap.entries()).map(([name, data]) => ({
      name,
      valeurVente: data.sale,
      valeurCoût: data.cost,
      quantité: data.qty,
      produits: data.count,
    })).sort((a, b) => b.valeurVente - a.valeurVente);
  }, [snapshotDetail, productById, categories]);

  return (
    <div className="p-6 space-y-6">
      {/* Header with stats cards */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Inventaire du jour</h1>
          <div className="flex items-center gap-3">
            {canCreate && (
              <button
                onClick={handleCreate}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Package size={18} />
                {isLoading ? 'Enregistrement...' : 'Enregistrer inventaire'}
              </button>
            )}
          </div>
        </div>

        {/* Stats overview */}
        {snapshotDetail?.snapshot?.totals && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">Total Produits</span>
                <Package className="text-blue-600" size={20} />
              </div>
              <div className="text-2xl font-bold text-blue-900">{snapshotDetail.snapshot.totals.totalProducts}</div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-900">Quantité Totale</span>
                <TrendingUp className="text-green-600" size={20} />
              </div>
              <div className="text-2xl font-bold text-green-900">{Number(snapshotDetail.snapshot.totals.totalQty).toFixed(2)}</div>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-orange-900">Valeur Coût</span>
                <DollarSign className="text-orange-600" size={20} />
              </div>
              <div className="text-2xl font-bold text-orange-900">{Number(snapshotDetail.snapshot.totals.totalCost).toFixed(2)} DH</div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-900">Valeur Vente</span>
                <DollarSign className="text-purple-600" size={20} />
              </div>
              <div className="text-2xl font-bold text-purple-900">{Number(snapshotDetail.snapshot.totals.totalSale).toFixed(2)} DH</div>
            </div>
          </div>
        )}
      </div>

      {/* Snapshots list */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Snapshots du {today}</h2>
        </div>
        <div className="p-4">
          {isFetching ? (
            <div className="text-gray-500">Chargement...</div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Aucun inventaire enregistré aujourd'hui.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {snapshots.map((s) => (
                <div
                  key={s.id}
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                    selectedId === s.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-semibold text-lg text-gray-900">Snapshot #{s.id}</div>
                    {selectedId === s.id && (
                      <span className="px-2 py-1 text-xs bg-indigo-600 text-white rounded">Sélectionné</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-3">{formatDateTimeWithHour(s.created_at)}</div>
                  {s?.totals && (
                    <div className="space-y-1 text-xs text-gray-700">
                      <div className="flex justify-between">
                        <span>Produits:</span>
                        <span className="font-medium">{s.totals.totalProducts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Quantité:</span>
                        <span className="font-medium">{Number(s.totals.totalQty).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Valeur vente:</span>
                        <span className="font-medium text-green-700">{Number(s.totals.totalSale).toFixed(2)} DH</span>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    {s.files.map((f) => (
                      <a
                        key={f.url}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        {f.type.toUpperCase()}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Snapshot details with tabs */}
      {selectedId != null && snapshotDetail?.snapshot && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Détails Snapshot #{selectedId}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-4 py-2 text-sm rounded-lg ${
                    viewMode === 'table'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Search size={16} className="inline mr-1" />
                  Tableau
                </button>
                <button
                  onClick={() => setViewMode('charts')}
                  className={`px-4 py-2 text-sm rounded-lg ${
                    viewMode === 'charts'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <BarChart3 size={16} className="inline mr-1" />
                  Graphiques
                </button>
              </div>
            </div>
          </div>

          <div className="p-4">
            {viewMode === 'table' ? (
              <>
                {/* Filters */}
                <div className="mb-4 flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-gray-700 mb-1">Recherche</label>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Référence ou désignation"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-64"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-gray-700 mb-1">Catégorie</label>
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-64"
                    >
                      <option value="">Toutes les catégories</option>
                      {organizedCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {`${'— '.repeat(c.level)}${c.nom}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-700">
                    {filteredItems.length} éléments
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Produit</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Qté</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Prix achat</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Prix vente</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Valeur coût</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Valeur vente</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredItems.map((it: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div className="font-medium">{it.designation}</div>
                            <div className="text-xs text-gray-500">Ref: #{it.id}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-700">{Number(it.quantite).toFixed(3)}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-700">{Number(it.prix_achat).toFixed(2)} DH</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-700">{Number(it.prix_vente).toFixed(2)} DH</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-orange-700">{Number(it.valeur_cost).toFixed(2)} DH</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-green-700">{Number(it.valeur_sale).toFixed(2)} DH</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                {/* Chart type selector */}
                <div className="mb-6">
                  <div className="flex gap-2 border-b">
                    <button
                      onClick={() => setChartType('snapshots')}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        chartType === 'snapshots'
                          ? 'border-indigo-600 text-indigo-600'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Comparer Snapshots
                    </button>
                    <button
                      onClick={() => setChartType('products')}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        chartType === 'products'
                          ? 'border-indigo-600 text-indigo-600'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Top Produits
                    </button>
                    <button
                      onClick={() => setChartType('categories')}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        chartType === 'categories'
                          ? 'border-indigo-600 text-indigo-600'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Par Catégorie
                    </button>
                  </div>
                </div>

                {/* Charts */}
                {chartType === 'snapshots' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-gray-900">Comparaison des Snapshots</h3>
                    {snapshotComparisonData.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        Aucune donnée disponible pour la comparaison. Créez au moins 2 snapshots.
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-gray-600 mb-4">
                          {snapshotComparisonData.length} snapshot(s) disponible(s) pour comparaison
                        </div>

                        {/* Tableau de comparaison */}
                        <div className="overflow-x-auto border rounded-lg mb-6">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Snapshot</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Nombre Produits</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Stock Total (Qté)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Valeur Coût (DH)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Valeur Vente (DH)</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {snapshotComparisonData.map((s, idx) => (
                                <tr key={s.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.name}</td>
                                  <td className="px-4 py-3 text-sm text-gray-600">{s.date}</td>
                                  <td className="px-4 py-3 text-sm text-right font-medium text-blue-700">{s.produits}</td>
                                  <td className="px-4 py-3 text-sm text-right font-medium text-green-700">{s.quantité.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm text-right font-medium text-orange-700">{s.valeurCoût.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm text-right font-medium text-purple-700">{s.valeurVente.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Graphique: Nombre de Produits */}
                        <div>
                          <h4 className="text-md font-semibold text-gray-800 mb-3">Nombre de Produits par Snapshot</h4>
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={snapshotComparisonData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip 
                                formatter={(value: any) => {
                                  return [`${value} produits`, 'Nombre'];
                                }}
                              />
                              <Legend />
                              <Bar dataKey="produits" fill="#3b82f6" name="Nombre de Produits" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Graphique: Stock Total (Quantité) */}
                        <div>
                          <h4 className="text-md font-semibold text-gray-800 mb-3">Stock Total (Quantité) par Snapshot</h4>
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={snapshotComparisonData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip 
                                formatter={(value: any) => {
                                  if (typeof value === 'number') return [`${value.toFixed(2)} unités`, 'Quantité'];
                                  return value;
                                }}
                              />
                              <Legend />
                              <Bar dataKey="quantité" fill="#10b981" name="Stock Total" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Graphique: Évolution des Valeurs */}
                        <div>
                          <h4 className="text-md font-semibold text-gray-800 mb-3">Évolution des Valeurs Financières</h4>
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={snapshotComparisonData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis 
                                tickFormatter={(value) => {
                                  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                                  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
                                  return value.toFixed(0);
                                }}
                              />
                              <Tooltip 
                                formatter={(value: any, name: any) => {
                                  if (typeof value === 'number') {
                                    return [value.toFixed(2) + ' DH', name];
                                  }
                                  return [value, name];
                                }}
                              />
                              <Legend />
                              <Line type="monotone" dataKey="valeurCoût" stroke="#f59e0b" name="Valeur Coût" strokeWidth={2} dot={{ r: 4 }} />
                              <Line type="monotone" dataKey="valeurVente" stroke="#8b5cf6" name="Valeur Vente" strokeWidth={2} dot={{ r: 4 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Statistiques de comparaison */}
                        {snapshotComparisonData.length >= 2 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                              <h5 className="text-sm font-semibold text-blue-900 mb-2">Différence Produits</h5>
                              <div className="text-2xl font-bold text-blue-700">
                                {(() => {
                                  const first = snapshotComparisonData[0].produits;
                                  const last = snapshotComparisonData[snapshotComparisonData.length - 1].produits;
                                  const diff = last - first;
                                  const pct = first > 0 ? ((diff / first) * 100).toFixed(1) : '0';
                                  return `${diff > 0 ? '+' : ''}${diff} (${pct}%)`;
                                })()}
                              </div>
                              <div className="text-xs text-blue-700 mt-1">
                                Premier vs Dernier snapshot
                              </div>
                            </div>

                            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                              <h5 className="text-sm font-semibold text-green-900 mb-2">Différence Stock Total</h5>
                              <div className="text-2xl font-bold text-green-700">
                                {(() => {
                                  const first = snapshotComparisonData[0].quantité;
                                  const last = snapshotComparisonData[snapshotComparisonData.length - 1].quantité;
                                  const diff = last - first;
                                  const pct = first > 0 ? ((diff / first) * 100).toFixed(1) : '0';
                                  return `${diff > 0 ? '+' : ''}${diff.toFixed(2)} (${pct}%)`;
                                })()}
                              </div>
                              <div className="text-xs text-green-700 mt-1">
                                Premier vs Dernier snapshot
                              </div>
                            </div>

                            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                              <h5 className="text-sm font-semibold text-orange-900 mb-2">Différence Valeur Coût</h5>
                              <div className="text-2xl font-bold text-orange-700">
                                {(() => {
                                  const first = snapshotComparisonData[0].valeurCoût;
                                  const last = snapshotComparisonData[snapshotComparisonData.length - 1].valeurCoût;
                                  const diff = last - first;
                                  const pct = first > 0 ? ((diff / first) * 100).toFixed(1) : '0';
                                  return `${diff > 0 ? '+' : ''}${diff.toFixed(2)} DH (${pct}%)`;
                                })()}
                              </div>
                              <div className="text-xs text-orange-700 mt-1">
                                Premier vs Dernier snapshot
                              </div>
                            </div>

                            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                              <h5 className="text-sm font-semibold text-purple-900 mb-2">Différence Valeur Vente</h5>
                              <div className="text-2xl font-bold text-purple-700">
                                {(() => {
                                  const first = snapshotComparisonData[0].valeurVente;
                                  const last = snapshotComparisonData[snapshotComparisonData.length - 1].valeurVente;
                                  const diff = last - first;
                                  const pct = first > 0 ? ((diff / first) * 100).toFixed(1) : '0';
                                  return `${diff > 0 ? '+' : ''}${diff.toFixed(2)} DH (${pct}%)`;
                                })()}
                              </div>
                              <div className="text-xs text-purple-700 mt-1">
                                Premier vs Dernier snapshot
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {chartType === 'products' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Top Produits par Valeur</h3>
                      <select
                        value={topProductsCount}
                        onChange={(e) => setTopProductsCount(Number(e.target.value))}
                        className="px-3 py-2 border rounded-lg"
                      >
                        <option value={5}>Top 5</option>
                        <option value={10}>Top 10</option>
                        <option value={20}>Top 20</option>
                        <option value={50}>Top 50</option>
                      </select>
                    </div>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={topProductsData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={150} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="valeurVente" fill="#10b981" name="Valeur Vente (DH)" />
                        <Bar dataKey="valeurCoût" fill="#f59e0b" name="Valeur Coût (DH)" />
                      </BarChart>
                    </ResponsiveContainer>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={topProductsData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name.slice(0, 20)}`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="valeurVente"
                        >
                          {topProductsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {chartType === 'categories' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-gray-900">Distribution par Catégorie</h3>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={categoryData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="valeurVente" fill="#10b981" name="Valeur Vente (DH)" />
                        <Bar dataKey="valeurCoût" fill="#f59e0b" name="Valeur Coût (DH)" />
                      </BarChart>
                    </ResponsiveContainer>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => entry.name}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="valeurVente"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500">Cette page affiche uniquement les inventaires enregistrés, sans modifier le stock actuel.</p>
    </div>
  );
};

export default InventoryPage;
