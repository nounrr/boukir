/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { BarChart3, DollarSign, Download, Package, Search, TrendingUp } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as XLSX from 'xlsx';
import { useAuth } from '../hooks/redux';
import { useGetCategoriesQuery } from '../store/api/categoriesApi';
import { useCreateSnapshotMutation, useGetSnapshotQuery, useListSnapshotsQuery } from '../store/api/inventoryApi';
import { useGetProductsQuery } from '../store/api/productsApi';
import { formatDateTimeWithHour } from '../utils/dateUtils';
import { showError, showSuccess } from '../utils/notifications';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const InventoryPage: React.FC = () => {
  const { user } = useAuth();
  const today = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);
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

  useEffect(() => {
    // Auto-select latest snapshot when list changes
    if (latestId != null) setSelectedId(latestId);
  }, [latestId]);

  const { data: snapshotDetail } = useGetSnapshotQuery(
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

  const totalAchatSnapshot = useMemo(() => {
    const items = snapshotDetail?.snapshot?.items || [];
    return items.reduce((sum: number, it: any) => {
      const qte = Number(it?.quantite || 0);
      const pa = Number(it?.prix_achat || 0);
      return sum + qte * pa;
    }, 0);
  }, [snapshotDetail]);

  // Chart data: Compare snapshots
  const snapshotComparisonData = useMemo(() => {
    const data = snapshots.map((s, idx, arr) => {
      const produits = s.totals?.totalProducts || 0;
      const quantité = Number(s.totals?.totalQty || 0);
      const totalAchat = Number(s.totals?.totalCost || 0);
      
      // Calculate deltas from previous snapshot
      const prev = idx > 0 ? arr[idx - 1] : null;
      const prevProduits = prev?.totals?.totalProducts || produits;
      const prevQuantité = Number(prev?.totals?.totalQty || quantité);
      const prevTotalAchat = Number(prev?.totals?.totalCost || totalAchat);
      
      return {
        name: `#${s.id}`,
        id: s.id,
        date: formatDateTimeWithHour(s.created_at),
        produits,
        quantité,
        totalAchat,
        // Deltas
        deltaProduits: produits - prevProduits,
        deltaQuantité: quantité - prevQuantité,
        deltaTotalAchat: totalAchat - prevTotalAchat,
        // Percentage changes
        pctProduits: prevProduits > 0 ? ((produits - prevProduits) / prevProduits) * 100 : 0,
        pctQuantité: prevQuantité > 0 ? ((quantité - prevQuantité) / prevQuantité) * 100 : 0,
        pctTotalAchat: prevTotalAchat > 0 ? ((totalAchat - prevTotalAchat) / prevTotalAchat) * 100 : 0,
      };
    });
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

  const downloadExcel = React.useCallback(() => {
    try {
      if (!snapshotDetail?.snapshot) {
        showError('Aucun snapshot sélectionné');
        return;
      }

      const snapshotId = selectedId != null ? selectedId : snapshotDetail?.snapshot?.id;
      const snapshotCreatedAt = snapshotDetail?.snapshot?.created_at || '';

      const sourceItems = snapshotDetail?.snapshot?.items || [];
      const rows = (sourceItems || []).map((it: any) => {
        const qte = Number(it?.quantite || 0);
        const pa = Number(it?.prix_achat || 0);
        const pv = Number(it?.prix_vente || 0);
        const totalAchat = qte * pa;
        const totalVente = qte * pv;

        const prod = productById.get(Number(it?.id));
        let categorie = 'Sans catégorie';
        if (prod) {
          if (Array.isArray((prod as any).categories) && (prod as any).categories.length > 0) {
            categorie = String((prod as any).categories[0]?.nom || categorie);
          } else {
            const cat = categories.find((c: any) => Number(c.id) === Number((prod as any).categorie_id));
            if (cat) categorie = String(cat.nom || categorie);
          }
        }

        return {
          SnapshotId: snapshotId,
          Date: snapshotCreatedAt ? formatDateTimeWithHour(snapshotCreatedAt) : today,
          ProduitId: it?.id,
          Designation: it?.designation,
          Categorie: categorie,
          Quantite: qte,
          PrixAchat: pa,
          PrixVente: pv,
          TotalAchat: totalAchat,
          TotalVente: totalVente,
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Lignes');

      const totals = snapshotDetail?.snapshot?.totals || {};
      const resumeRows = [
        {
          SnapshotId: snapshotId,
          Date: snapshotCreatedAt ? formatDateTimeWithHour(snapshotCreatedAt) : today,
          TotalProduits: Number(totals?.totalProducts || 0),
          TotalQuantite: Number(totals?.totalQty || 0),
          TotalVente: Number(totals?.totalSale || 0),
          TotalAchat: Number(totals?.totalCost || 0),
          TotalAchatRecalcule: Number(totalAchatSnapshot || 0),
          ExportMode: 'all',
          Search: searchTerm || '',
          FilterCategory: filterCategory || '',
        },
      ];
      const ws2 = XLSX.utils.json_to_sheet(resumeRows);
      XLSX.utils.book_append_sheet(wb, ws2, 'Résumé');

      const safeDate = String(today || '').replace(/[^0-9\-]/g, '');
      const fileName = `inventaire_${safeDate}_snapshot_${snapshotId}.xlsx`;

      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      console.error('[InventoryPage] Excel export failed', e);
      showError(e?.message || 'Échec export Excel');
    }
  }, [categories, filterCategory, productById, searchTerm, selectedId, snapshotDetail, today, totalAchatSnapshot]);

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <span className="text-sm font-medium text-orange-900">Total Achat</span>
                <DollarSign className="text-orange-600" size={20} />
              </div>
              <div className="text-2xl font-bold text-orange-900">{Number(totalAchatSnapshot).toFixed(2)} DH</div>
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
                  onClick={() => downloadExcel()}
                  className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                  title="Télécharger un fichier Excel (.xlsx) de toutes les lignes du snapshot"
                >
                  <Download size={16} className="inline mr-1" />
                  Excel
                </button>
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
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Total achat</th>
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
                          <td className="px-4 py-3 text-sm text-right font-medium text-orange-700">{(Number(it.quantite || 0) * Number(it.prix_achat || 0)).toFixed(2)} DH</td>
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
                        {/* Statistiques de comparaison en haut */}
                        {snapshotComparisonData.length >= 2 && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                              <h5 className="text-sm font-semibold text-blue-900 mb-2">Δ Produits</h5>
                              <div className="flex items-baseline gap-2">
                                <span className={`text-2xl font-bold ${snapshotComparisonData[snapshotComparisonData.length - 1].deltaProduits >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {snapshotComparisonData[snapshotComparisonData.length - 1].deltaProduits >= 0 ? '+' : ''}
                                  {snapshotComparisonData[snapshotComparisonData.length - 1].deltaProduits}
                                </span>
                                <span className="text-sm text-gray-500">
                                  ({snapshotComparisonData[snapshotComparisonData.length - 1].pctProduits.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="text-xs text-blue-700 mt-1">vs snapshot précédent</div>
                            </div>

                            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                              <h5 className="text-sm font-semibold text-green-900 mb-2">Δ Quantité Stock</h5>
                              <div className="flex items-baseline gap-2">
                                <span className={`text-2xl font-bold ${snapshotComparisonData[snapshotComparisonData.length - 1].deltaQuantité >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {snapshotComparisonData[snapshotComparisonData.length - 1].deltaQuantité >= 0 ? '+' : ''}
                                  {snapshotComparisonData[snapshotComparisonData.length - 1].deltaQuantité.toFixed(2)}
                                </span>
                                <span className="text-sm text-gray-500">
                                  ({snapshotComparisonData[snapshotComparisonData.length - 1].pctQuantité.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="text-xs text-green-700 mt-1">vs snapshot précédent</div>
                            </div>

                            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                              <h5 className="text-sm font-semibold text-orange-900 mb-2">Δ Total Achat</h5>
                              <div className="flex items-baseline gap-2">
                                <span className={`text-2xl font-bold ${snapshotComparisonData[snapshotComparisonData.length - 1].deltaTotalAchat >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {snapshotComparisonData[snapshotComparisonData.length - 1].deltaTotalAchat >= 0 ? '+' : ''}
                                  {snapshotComparisonData[snapshotComparisonData.length - 1].deltaTotalAchat.toFixed(2)} DH
                                </span>
                                <span className="text-sm text-gray-500">
                                  ({snapshotComparisonData[snapshotComparisonData.length - 1].pctTotalAchat.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="text-xs text-orange-700 mt-1">vs snapshot précédent</div>
                            </div>
                          </div>
                        )}

                        {/* Tableau de comparaison enrichi */}
                        <div className="overflow-x-auto border rounded-lg mb-6">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Snapshot</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Produits</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Δ</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Stock (Qté)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Δ</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Total Achat</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Δ</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {snapshotComparisonData.map((s, idx) => (
                                <tr key={s.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.name}</td>
                                  <td className="px-4 py-3 text-sm text-gray-600">{s.date}</td>
                                  <td className="px-4 py-3 text-sm text-right font-medium text-blue-700">{s.produits}</td>
                                  <td className="px-4 py-3 text-sm text-right">
                                    {idx > 0 && (
                                      <span className={`font-medium ${s.deltaProduits >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {s.deltaProduits >= 0 ? '+' : ''}{s.deltaProduits}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-right font-medium text-green-700">{s.quantité.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm text-right">
                                    {idx > 0 && (
                                      <span className={`font-medium ${s.deltaQuantité >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {s.deltaQuantité >= 0 ? '+' : ''}{s.deltaQuantité.toFixed(2)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-right font-medium text-orange-700">{s.totalAchat.toFixed(2)} DH</td>
                                  <td className="px-4 py-3 text-sm text-right">
                                    {idx > 0 && (
                                      <span className={`font-medium ${s.deltaTotalAchat >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {s.deltaTotalAchat >= 0 ? '+' : ''}{s.deltaTotalAchat.toFixed(2)}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Graphique combiné: Évolution globale */}
                        <div className="bg-white border rounded-lg p-4">
                          <h4 className="text-md font-semibold text-gray-800 mb-4">Évolution Globale</h4>
                          <ResponsiveContainer width="100%" height={350}>
                            <BarChart data={snapshotComparisonData} barCategoryGap="20%">
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                              <YAxis 
                                yAxisId="left" 
                                orientation="left" 
                                tick={{ fontSize: 12 }}
                                tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                              />
                              <YAxis 
                                yAxisId="right" 
                                orientation="right" 
                                tick={{ fontSize: 12 }}
                              />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                                formatter={(value: any, name: any) => {
                                  if (name === 'Total Achat (DH)') return [`${Number(value).toFixed(2)} DH`, name];
                                  if (typeof value === 'number') return [value.toFixed(2), name];
                                  return [value, name];
                                }}
                              />
                              <Legend wrapperStyle={{ paddingTop: '10px' }} />
                              <Bar yAxisId="right" dataKey="produits" fill="#3b82f6" name="Produits" radius={[4, 4, 0, 0]} />
                              <Bar yAxisId="right" dataKey="quantité" fill="#10b981" name="Quantité" radius={[4, 4, 0, 0]} />
                              <Bar yAxisId="left" dataKey="totalAchat" fill="#f59e0b" name="Total Achat (DH)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Graphique: Évolution Total Achat avec ligne de tendance */}
                        <div className="bg-white border rounded-lg p-4">
                          <h4 className="text-md font-semibold text-gray-800 mb-4">Évolution Total Achat</h4>
                          <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={snapshotComparisonData}>
                              <defs>
                                <linearGradient id="colorTotalAchat" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                              <YAxis 
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => {
                                  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                                  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
                                  return value.toFixed(0);
                                }}
                              />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                                formatter={(value: any) => [`${Number(value).toFixed(2)} DH`, 'Total Achat']}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="totalAchat" 
                                stroke="#f59e0b" 
                                strokeWidth={3} 
                                dot={{ r: 6, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }}
                                activeDot={{ r: 8, fill: '#f59e0b' }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Graphique: Variations (deltas) */}
                        {snapshotComparisonData.length >= 2 && (
                          <div className="bg-white border rounded-lg p-4">
                            <h4 className="text-md font-semibold text-gray-800 mb-4">Variations entre Snapshots</h4>
                            <ResponsiveContainer width="100%" height={280}>
                              <BarChart data={snapshotComparisonData.slice(1)}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                                  formatter={(value: any, name: any) => {
                                    const prefix = Number(value) >= 0 ? '+' : '';
                                    if (name.includes('Achat')) return [`${prefix}${Number(value).toFixed(2)} DH`, name];
                                    return [`${prefix}${Number(value).toFixed(2)}`, name];
                                  }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                <Bar dataKey="deltaProduits" name="Δ Produits" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="deltaQuantité" name="Δ Quantité" fill="#10b981" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* Résumé Premier vs Dernier */}
                        {snapshotComparisonData.length >= 2 && (
                          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-5">
                            <h4 className="text-md font-semibold text-indigo-900 mb-4">📊 Résumé: Premier → Dernier Snapshot</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="text-center">
                                <div className="text-sm text-gray-600 mb-1">Produits</div>
                                <div className="text-lg font-semibold text-gray-900">
                                  {snapshotComparisonData[0].produits} → {snapshotComparisonData[snapshotComparisonData.length - 1].produits}
                                </div>
                                <div className={`text-sm font-medium ${snapshotComparisonData[snapshotComparisonData.length - 1].produits - snapshotComparisonData[0].produits >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {snapshotComparisonData[snapshotComparisonData.length - 1].produits - snapshotComparisonData[0].produits >= 0 ? '↑' : '↓'}
                                  {' '}{Math.abs(snapshotComparisonData[snapshotComparisonData.length - 1].produits - snapshotComparisonData[0].produits)}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm text-gray-600 mb-1">Quantité Stock</div>
                                <div className="text-lg font-semibold text-gray-900">
                                  {snapshotComparisonData[0].quantité.toFixed(0)} → {snapshotComparisonData[snapshotComparisonData.length - 1].quantité.toFixed(0)}
                                </div>
                                <div className={`text-sm font-medium ${snapshotComparisonData[snapshotComparisonData.length - 1].quantité - snapshotComparisonData[0].quantité >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {snapshotComparisonData[snapshotComparisonData.length - 1].quantité - snapshotComparisonData[0].quantité >= 0 ? '↑' : '↓'}
                                  {' '}{Math.abs(snapshotComparisonData[snapshotComparisonData.length - 1].quantité - snapshotComparisonData[0].quantité).toFixed(2)}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm text-gray-600 mb-1">Total Achat</div>
                                <div className="text-lg font-semibold text-gray-900">
                                  {snapshotComparisonData[0].totalAchat.toFixed(0)} → {snapshotComparisonData[snapshotComparisonData.length - 1].totalAchat.toFixed(0)} DH
                                </div>
                                <div className={`text-sm font-medium ${snapshotComparisonData[snapshotComparisonData.length - 1].totalAchat - snapshotComparisonData[0].totalAchat >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {snapshotComparisonData[snapshotComparisonData.length - 1].totalAchat - snapshotComparisonData[0].totalAchat >= 0 ? '↑' : '↓'}
                                  {' '}{Math.abs(snapshotComparisonData[snapshotComparisonData.length - 1].totalAchat - snapshotComparisonData[0].totalAchat).toFixed(2)} DH
                                </div>
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
                      <h3 className="text-lg font-semibold text-gray-900">Top Produits par Total Achat</h3>
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
                    
                    {/* Bar chart horizontal */}
                    <div className="bg-white border rounded-lg p-4">
                      <ResponsiveContainer width="100%" height={Math.max(300, topProductsCount * 35)}>
                        <BarChart data={topProductsData} layout="vertical" barCategoryGap="15%">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis 
                            type="number" 
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                          />
                          <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                            formatter={(value: any) => [`${Number(value).toFixed(2)} DH`, 'Total Achat']}
                          />
                          <Bar dataKey="valeurCoût" fill="#f59e0b" name="Total Achat (DH)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Pie chart */}
                    <div className="bg-white border rounded-lg p-4">
                      <h4 className="text-md font-semibold text-gray-800 mb-4 text-center">Répartition par Produit</h4>
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie
                            data={topProductsData}
                            cx="50%"
                            cy="50%"
                            labelLine={true}
                            label={(entry: any) => `${String(entry?.name ?? '').slice(0, 15)}...`}
                            outerRadius={100}
                            innerRadius={40}
                            fill="#8884d8"
                            dataKey="valeurCoût"
                            paddingAngle={2}
                          >
                            {topProductsData.map((_entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                            formatter={(value: any) => [`${Number(value).toFixed(2)} DH`, 'Total Achat']}
                          />
                          <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {chartType === 'categories' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-gray-900">Distribution par Catégorie</h3>
                    
                    {/* Bar chart par catégorie */}
                    <div className="bg-white border rounded-lg p-4">
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={categoryData} barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis 
                            dataKey="name" 
                            angle={-35} 
                            textAnchor="end" 
                            height={80} 
                            tick={{ fontSize: 11 }}
                            interval={0}
                          />
                          <YAxis 
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                            formatter={(value: any, name: any) => [`${Number(value).toFixed(2)} DH`, name]}
                          />
                          <Legend wrapperStyle={{ paddingTop: '10px' }} />
                          <Bar dataKey="valeurCoût" fill="#f59e0b" name="Total Achat (DH)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Pie + Stats */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="bg-white border rounded-lg p-4">
                        <h4 className="text-md font-semibold text-gray-800 mb-4 text-center">Répartition Total Achat</h4>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={categoryData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={(entry: any) => `${((entry.percent || 0) * 100).toFixed(0)}%`}
                              outerRadius={90}
                              innerRadius={45}
                              fill="#8884d8"
                              dataKey="valeurCoût"
                              paddingAngle={2}
                            >
                              {categoryData.map((_entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                              formatter={(value: any) => [`${Number(value).toFixed(2)} DH`, 'Total Achat']}
                            />
                            <Legend layout="vertical" verticalAlign="middle" align="right" />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      
                      <div className="bg-white border rounded-lg p-4">
                        <h4 className="text-md font-semibold text-gray-800 mb-4">Détails par Catégorie</h4>
                        <div className="space-y-3 max-h-[280px] overflow-y-auto">
                          {categoryData.map((cat, idx) => (
                            <div key={cat.name} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold text-orange-700">{cat.valeurCoût.toFixed(2)} DH</div>
                                <div className="text-xs text-gray-500">{cat.produits} produits • {cat.quantité.toFixed(0)} unités</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
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
