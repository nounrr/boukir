import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, DollarSign, Download, Package, Search, TrendingUp, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as XLSX from 'xlsx';
import { useAuth } from '../hooks/redux';
import { useGetCategoriesQuery } from '../store/api/categoriesApi';
import { useCreateSnapshotMutation, useGetSnapshotQuery, useImportSnapshotExcelMutation, useListSnapshotsQuery } from '../store/api/inventoryApi';
import { useGetProductsQuery } from '../store/api/productsApi';
import { formatDateTimeWithHour } from '../utils/dateUtils';
import { showError, showSuccess } from '../utils/notifications';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500];

interface PaginationControlsProps {
  idPrefix: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({
  idPrefix,
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onLimitChange,
}) => {
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="font-medium text-slate-700" aria-live="polite">
        <span className="text-slate-950">{rangeStart}–{rangeEnd}</span> sur {total} inventaire{total !== 1 ? 's' : ''}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${idPrefix}-page-size`} className="text-slate-600">Afficher</label>
        <select
          id={`${idPrefix}-page-size`}
          value={limit}
          onChange={(event) => onLimitChange(Number(event.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option} / page</option>
          ))}
        </select>
        <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || total === 0}
            className="p-2 text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Page précédente"
            title="Page précédente"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[7.5rem] border-x border-slate-200 px-3 py-2 text-center font-medium text-slate-700">
            Page {totalPages === 0 ? 0 : page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={totalPages === 0 || page >= totalPages}
            className="p-2 text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Page suivante"
            title="Page suivante"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

const InventoryPage: React.FC = () => {
  const { user } = useAuth();
  const initialDate = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [filterDate, setFilterDate] = useState('');
  const [creationDate, setCreationDate] = useState(initialDate);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(100);
  const { data, refetch, isFetching, isError } = useListSnapshotsQuery({
    date: filterDate || undefined,
    page,
    limit,
  });
  const [createSnapshot, { isLoading }] = useCreateSnapshotMutation();
  const [importSnapshotExcel, { isLoading: isImporting }] = useImportSnapshotExcelMutation();
  const [importFile, setImportFile] = useState<File | null>(null);

  const canCreate = user?.role === 'PDG' || user?.role === 'ManagerPlus';

  const handleCreate = async () => {
    try {
      const res = await createSnapshot({ date: creationDate }).unwrap();
      showSuccess(`Inventaire enregistré: #${res.id}`);
      refetch();
    } catch (e: any) {
      showError(e?.data?.message || e?.message || 'Échec de l\'enregistrement d\'inventaire');
    }
  };

  const handleImportExcel = async () => {
    try {
      if (!importFile) {
        showError('Veuillez sélectionner un fichier Excel');
        return;
      }
      if (!creationDate) {
        showError('Veuillez choisir une date');
        return;
      }

      const res = await importSnapshotExcel({ date: creationDate, file: importFile }).unwrap();
      const missing = Array.isArray((res as any)?.missingIds) ? (res as any).missingIds : [];

      if (missing.length > 0) {
        showSuccess(`Snapshot importé: #${res.id} (produits manquants: ${missing.length})`);
      } else {
        showSuccess(`Snapshot importé: #${res.id}`);
      }

      setImportFile(null);
      refetch();
    } catch (e: any) {
      showError(e?.data?.message || e?.message || 'Échec import Excel');
    }
  };

  const snapshots = useMemo(() => data?.snapshots || [], [data?.snapshots]);
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 0;
  const latestSnapshot = snapshots[0] || null;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedSnapshotDate, setSelectedSnapshotDate] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'charts'>('table');
  const [chartType, setChartType] = useState<'snapshots' | 'products' | 'categories'>('snapshots');

  useEffect(() => {
    setPage(1);
  }, [filterDate, limit]);

  useEffect(() => {
    if (data?.page && data.page !== page) setPage(data.page);
  }, [data?.page, page]);

  useEffect(() => {
    if (latestSnapshot) {
      setSelectedId(latestSnapshot.id);
      setSelectedSnapshotDate(latestSnapshot.date);
    } else {
      setSelectedId(null);
      setSelectedSnapshotDate('');
    }
  }, [latestSnapshot]);

  const { data: snapshotDetail } = useGetSnapshotQuery(
    selectedId != null ? { id: String(selectedId), date: selectedSnapshotDate } : { id: '', date: undefined },
    { skip: selectedId == null }
  );

  // Filters like Stock page
  const { data: productsApiData } = useGetProductsQuery();
  const { data: categoriesApiData } = useGetCategoriesQuery();
  const products = useMemo(() => productsApiData || [], [productsApiData]);
  const categories = useMemo(() => categoriesApiData || [], [categoriesApiData]);

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
    const chronologicalSnapshots = [...snapshots].sort((a, b) => {
      const timeDifference = Date.parse(a.created_at || '') - Date.parse(b.created_at || '');
      if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
      return a.id - b.id;
    });
    const data = chronologicalSnapshots.map((s, idx, arr) => {
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
          Date: snapshotCreatedAt ? formatDateTimeWithHour(snapshotCreatedAt) : selectedSnapshotDate,
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
          Date: snapshotCreatedAt ? formatDateTimeWithHour(snapshotCreatedAt) : selectedSnapshotDate,
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

      const safeDate = String(selectedSnapshotDate || initialDate).replace(/[^0-9-]/g, '');
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
  }, [categories, filterCategory, initialDate, productById, searchTerm, selectedId, selectedSnapshotDate, snapshotDetail, totalAchatSnapshot]);

  return (
    <div className="space-y-6 bg-slate-50/60 p-4 sm:p-6">
      {/* Header with stats cards */}
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Inventaire</h1>
            <p className="mt-1 text-sm text-slate-600">Consultez, comparez et exportez les états de stock enregistrés.</p>
          </div>
          <div className={`mt-2 inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold sm:mt-0 ${filterDate ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            <CalendarDays size={17} aria-hidden="true" />
            {filterDate ? `Date : ${filterDate}` : 'Toutes les dates'}
          </div>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="inventory-filter-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h2 id="inventory-filter-title" className="text-sm font-semibold text-slate-900">Périmètre de consultation</h2>
              <p className="mt-1 text-xs text-slate-500">Laissez la date vide pour parcourir tout l’historique.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div>
                <label htmlFor="inventory-filter-date" className="mb-1 block text-xs font-medium text-slate-600">Filtrer par date</label>
                <input
                  id="inventory-filter-date"
                  type="date"
                  value={filterDate}
                  onChange={(event) => setFilterDate(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-auto"
                />
              </div>
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <X size={16} aria-hidden="true" />
                  Toutes les dates
                </button>
              )}
            </div>
          </div>
        </section>

        {canCreate && (
          <section className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4" aria-labelledby="inventory-create-title">
            <div className="mb-3">
              <h2 id="inventory-create-title" className="text-sm font-semibold text-indigo-950">Créer ou importer un inventaire</h2>
              <p className="mt-1 text-xs text-indigo-700">Cette date est indépendante du filtre de consultation.</p>
            </div>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
              <div>
                <label htmlFor="inventory-creation-date" className="mb-1 block text-xs font-medium text-indigo-900">Date de création / import</label>
              <input
                id="inventory-creation-date"
                type="date"
                value={creationDate}
                onChange={(event) => setCreationDate(event.target.value)}
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-auto"
              />
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="inventory-import-file" className="mb-1 block text-xs font-medium text-indigo-900">Fichier Excel ou CSV</label>
                <input
                  id="inventory-import-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="block w-full rounded-lg border border-indigo-200 bg-white text-sm text-slate-600 shadow-sm file:mr-3 file:border-0 file:border-r file:border-indigo-100 file:bg-indigo-50 file:px-3 file:py-2 file:font-medium file:text-indigo-800 hover:file:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleImportExcel}
                  disabled={isImporting || !importFile || !creationDate}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Importer un Excel (colonne référence) pour créer un snapshot à la date choisie"
                >
                  {isImporting ? 'Import...' : 'Importer Excel'}
                </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={isLoading || !creationDate}
                className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Package size={18} aria-hidden="true" />
                {isLoading ? 'Enregistrement...' : 'Enregistrer inventaire'}
              </button>
              </div>
            </div>
          </section>
        )}

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
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="inventory-history-title">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="inventory-history-title" className="text-lg font-semibold text-slate-950">Historique des inventaires</h2>
              <p className="mt-1 text-sm text-slate-500">
                {filterDate ? `Inventaires enregistrés le ${filterDate}` : 'Inventaires de toutes les dates, du plus récent au plus ancien'}
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {total} résultat{total !== 1 ? 's' : ''}
            </span>
          </div>
          <PaginationControls
            idPrefix="inventory-top"
            page={page}
            limit={limit}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </div>
        <div className="p-4 sm:p-5">
          {isFetching ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Chargement des inventaires">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center">
              <p className="font-medium text-red-800">Impossible de charger les inventaires.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Réessayer
              </button>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
              <CalendarDays className="mx-auto text-slate-400" size={30} aria-hidden="true" />
              <p className="mt-3 font-medium text-slate-700">Aucun inventaire enregistré{filterDate ? ' pour cette date' : ''}.</p>
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="mt-3 text-sm font-semibold text-indigo-700 hover:text-indigo-900 focus:outline-none focus:underline"
                >
                  Afficher toutes les dates
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {snapshots.map((s) => (
                <article
                  key={`${s.date}-${s.id}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === s.id && selectedSnapshotDate === s.date}
                  className={`cursor-pointer rounded-lg border p-4 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                    selectedId === s.id && selectedSnapshotDate === s.date
                      ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                  onClick={() => {
                    setSelectedId(s.id);
                    setSelectedSnapshotDate(s.date);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(s.id);
                      setSelectedSnapshotDate(s.date);
                    }
                  }}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0 font-semibold text-slate-950">Inventaire #{s.id}</div>
                    {selectedId === s.id && selectedSnapshotDate === s.date && (
                      <span className="px-2 py-1 text-xs bg-indigo-600 text-white rounded">Sélectionné</span>
                    )}
                  </div>
                  <div className="mb-3 text-xs text-slate-500">{formatDateTimeWithHour(s.created_at)}</div>
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
                    <CalendarDays size={13} aria-hidden="true" />
                    {s.date}
                  </div>
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s.files.map((f) => (
                      <a
                        key={f.url}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {f.type.toUpperCase()}
                      </a>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        {snapshots.length > 0 && !isFetching && !isError && (
          <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:px-5">
            <PaginationControls
              idPrefix="inventory-bottom"
              page={page}
              limit={limit}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </div>
        )}
      </section>

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
