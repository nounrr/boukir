import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Pencil, RefreshCw, Search, Upload, XCircle } from 'lucide-react';
import {
  useApplyProductNameCorrectionsMutation,
  useBulkSetProductNameCorrectionsCheckedMutation,
  useGetProductNameCorrectionsQuery,
  useRematchProductNameCorrectionsMutation,
  useSetProductNameCorrectionCheckedMutation,
  useUpdateProductCorrectionNamesMutation,
  useUpdateProductCorrectionCategoryMutation,
  useUploadProductNameCorrectionsMutation,
  type ProductNameCorrectionRow,
} from '../store/api/productNameCorrectionsApi';
import { useGetCategoriesQuery } from '../store/api/categoriesApi';

type TabKey = 'initial' | 'correct' | 'false';

const PAGE_SIZE_STORAGE_KEY = 'productNameCorrections.pageSize';
const PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const;

function getStoredPageSize() {
  try {
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return PAGE_SIZE_OPTIONS.includes(stored as (typeof PAGE_SIZE_OPTIONS)[number]) ? stored : 50;
  } catch {
    return 50;
  }
}

const PageSizeSelect: React.FC<{
  value: number;
  onChange: (value: number) => void;
}> = ({ value, onChange }) => (
  <label className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-gray-600">
    <span>Afficher</span>
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      aria-label="Nombre de produits par page"
    >
      {PAGE_SIZE_OPTIONS.map((size) => (
        <option key={size} value={size}>{size} produits</option>
      ))}
    </select>
    <span>/ page</span>
  </label>
);

const statusLabel: Record<string, string> = {
  all: 'Tous',
  matched: 'Match OK',
  variant_no_match: 'Variante no match',
  product_no_match: 'Produit no match',
  ambiguous: 'Ambigu',
  not_checked: 'Non vérifié',
};

const statusClass: Record<string, string> = {
  matched: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  variant_no_match: 'bg-red-100 text-red-800 border-red-200',
  product_no_match: 'bg-red-100 text-red-800 border-red-200',
  ambiguous: 'bg-amber-100 text-amber-800 border-amber-200',
  not_checked: 'bg-gray-100 text-gray-700 border-gray-200',
};

function fmt(value: unknown) {
  const text = String(value ?? '').trim();
  return text || '-';
}

function getErrorMessage(error: any) {
  return String(error?.data?.message || error?.message || 'Erreur inconnue');
}

const EditableCorrectionName: React.FC<{
  value: string | null;
  label: string;
  dir?: 'ltr' | 'rtl';
  disabled?: boolean;
  onSave: (value: string | null) => Promise<void>;
}> = ({ value, label, dir = 'ltr', disabled = false, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [displayValue, setDisplayValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    const nextValue = value || '';
    setDraft(nextValue);
    setDisplayValue(nextValue);
  }, [value]);

  const startEditing = () => {
    if (disabled || savingRef.current) return;
    setDraft(displayValue);
    setEditing(true);
  };

  const cancelEditing = () => {
    if (savingRef.current) return;
    setDraft(displayValue);
    setEditing(false);
  };

  const commit = async () => {
    if (savingRef.current) return;
    const normalized = draft.trim();
    if (normalized === displayValue.trim()) {
      setEditing(false);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(normalized || null);
      setDisplayValue(normalized);
      setDraft(normalized);
      setEditing(false);
    } catch {
      // Keep the input open so the user can adjust or retry the staged value.
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="relative min-w-[180px]">
        <input
          autoFocus
          value={draft}
          dir={dir}
          maxLength={255}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelEditing();
            } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void commit();
            }
          }}
          className="w-full rounded-md border border-emerald-500 bg-white px-2 py-1.5 pr-8 text-sm text-gray-900 outline-none ring-2 ring-emerald-100 disabled:bg-gray-100"
          aria-label={`Modifier ${label}`}
        />
        {saving && <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-emerald-700" />}
      </div>
    );
  }

  return (
    <button
      type="button"
      dir={dir}
      onDoubleClick={startEditing}
      disabled={disabled}
      title={disabled ? undefined : `Double-cliquer pour modifier ${label}`}
      className="group flex min-h-8 w-full min-w-[180px] items-start justify-between gap-2 rounded px-1 py-1 text-left text-gray-900 hover:bg-emerald-50 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <span className={!displayValue.trim() ? 'text-gray-400' : ''}>{fmt(displayValue)}</span>
      {!disabled && <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 group-hover:opacity-100" />}
    </button>
  );
};

const ProductNameCorrectionsPage: React.FC = () => {
  const authToken = useSelector((state: any) => state.auth?.token);
  const [activeTab, setActiveTab] = useState<TabKey>('initial');
  const [qAncienne, setQAncienne] = useState('');
  const [qFr, setQFr] = useState('');
  const [qAr, setQAr] = useState('');
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const [transitionedIds, setTransitionedIds] = useState<Set<number>>(new Set());
  const [categoryValues, setCategoryValues] = useState<Record<number, number | null>>({});
  const [savingCategoryProductIds, setSavingCategoryProductIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(getStoredPageSize);
  const [exportingReviewStatus, setExportingReviewStatus] = useState<'correct' | 'false' | null>(null);
  const exportInProgressRef = useRef(false);

  const { data, isLoading, isFetching } = useGetProductNameCorrectionsQuery({
    status: 'all',
    review_status: activeTab,
    q_ancienne: qAncienne || undefined,
    q_fr: qFr || undefined,
    q_ar: qAr || undefined,
    page,
    limit,
  });
  const [uploadCorrections, { isLoading: isUploading }] = useUploadProductNameCorrectionsMutation();
  const [rematch, { isLoading: isRematching }] = useRematchProductNameCorrectionsMutation();
  const [setChecked] = useSetProductNameCorrectionCheckedMutation();
  const [bulkSetChecked, { isLoading: isBulkUpdating }] = useBulkSetProductNameCorrectionsCheckedMutation();
  const [updateCorrectionNames] = useUpdateProductCorrectionNamesMutation();
  const [applyCorrections, { isLoading: isApplying }] = useApplyProductNameCorrectionsMutation();
  const [updateProductCategory] = useUpdateProductCorrectionCategoryMutation();
  const {
    data: categories = [],
    isLoading: isCategoriesLoading,
    isError: isCategoriesError,
  } = useGetCategoriesQuery();

  const rows = useMemo(() => data?.rows || [], [data?.rows]);
  const summary = data?.summary;
  const meta = data?.meta;

  const visibleRows = useMemo(
    () => activeTab === 'initial' ? rows.filter((row) => !transitionedIds.has(row.id)) : rows,
    [activeTab, rows, transitionedIds]
  );

  const visibleIds = useMemo(() => visibleRows.map((row) => row.id), [visibleRows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const selectedRows = useMemo(() => rows.filter((row) => selectedIds.has(row.id)), [rows, selectedIds]);
  const parentCategoryIds = useMemo(
    () => new Set(categories.map((category) => category.parent_id).filter((id): id is number => id != null)),
    [categories]
  );
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [categories]
  );

  const handleSearchChange = (
    field: 'ancienne' | 'fr' | 'ar',
    value: string
  ) => {
    setPage(1);
    setSelectedIds(new Set());

    if (field === 'ancienne') setQAncienne(value);
    else if (field === 'fr') setQFr(value);
    else setQAr(value);
  };

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab, page, limit]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, limit]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(limit));
    } catch {
      // Storage can be unavailable in private/restricted browser contexts.
    }
  }, [limit]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    try {
      const result = await uploadCorrections(file).unwrap();
      setMessage(`Import terminé: ${result.imported} lignes enregistrées.`);
    } catch (error: any) {
      setMessage(`Import échoué: ${getErrorMessage(error)}`);
    }
  };

  const handleExportExcel = async (reviewStatus: 'correct' | 'false') => {
    if (exportInProgressRef.current) return;

    exportInProgressRef.current = true;
    setExportingReviewStatus(reviewStatus);
    setMessage('');
    try {
      const params = new URLSearchParams({
        review_status: reviewStatus,
        q_ancienne: qAncienne,
        q_fr: qFr,
        q_ar: qAr,
      });
      const response = await fetch(`/api/product-name-corrections/export-excel?${params.toString()}`, {
        headers: authToken ? { authorization: `Bearer ${authToken}` } : undefined,
      });

      if (!response.ok) {
        let errorMessage = `Export impossible (HTTP ${response.status}).`;
        try {
          const errorData = await response.json();
          if (typeof errorData?.message === 'string' && errorData.message.trim()) {
            errorMessage = errorData.message;
          }
        } catch {
          // Keep the HTTP fallback when the server did not return JSON.
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      try {
        const statusLabel = reviewStatus === 'correct' ? 'corrects' : 'faux';
        link.href = objectUrl;
        link.download = `correction-noms-${statusLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        setMessage(
          `Téléchargement des corrections ${reviewStatus === 'correct' ? 'correctes' : 'fausses'} lancé.`
        );
      } finally {
        link.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
      }
    } catch (error: any) {
      setMessage(`Export Excel échoué : ${getErrorMessage(error)}`);
    } finally {
      exportInProgressRef.current = false;
      setExportingReviewStatus(null);
    }
  };

  const handleRematch = async () => {
    setMessage('');
    try {
      const result = await rematch().unwrap();
      setMessage(`Vérification terminée: ${result.checked} lignes contrôlées.`);
    } catch (error: any) {
      setMessage(`Vérification échouée: ${getErrorMessage(error)}`);
    }
  };

  const handleApply = async () => {
    setMessage('');
    try {
      const result = await applyCorrections({}).unwrap();
      setMessage(
        `Remplacement terminé: ${result.rows} lignes, ${result.productsUpdated} produits, ${result.variantsUpdated} variantes.`
      );
    } catch (error: any) {
      setMessage(`Remplacement échoué: ${getErrorMessage(error)}`);
    }
  };

  const getProductCategoryValue = (row: ProductNameCorrectionRow) => {
    const productId = row.matched_product_id;
    if (!productId) return null;
    if (Object.prototype.hasOwnProperty.call(categoryValues, productId)) {
      return categoryValues[productId];
    }
    const categoryId = Number(row.product_categorie_id);
    return Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null;
  };

  const changeProductCategory = async (row: ProductNameCorrectionRow, categoryId: number | null) => {
    const productId = row.matched_product_id;
    if (!productId || row.is_variant_row || savingCategoryProductIds.has(productId)) return;

    const previousCategoryId = getProductCategoryValue(row);
    if (previousCategoryId === categoryId) return;

    setMessage('');
    setCategoryValues((previous) => ({ ...previous, [productId]: categoryId }));
    setSavingCategoryProductIds((previous) => new Set(previous).add(productId));
    try {
      await updateProductCategory({ productId, categoryId }).unwrap();
      setMessage(`Catégorie du produit ${productId} mise à jour.`);
    } catch (error: any) {
      setCategoryValues((previous) => ({ ...previous, [productId]: previousCategoryId }));
      setMessage(`Mise à jour de la catégorie échouée: ${getErrorMessage(error)}`);
    } finally {
      setSavingCategoryProductIds((previous) => {
        const next = new Set(previous);
        next.delete(productId);
        return next;
      });
    }
  };

  const saveCorrectionName = async (
    row: ProductNameCorrectionRow,
    field: 'designation_fr_pro' | 'designation_ar_pro',
    value: string | null
  ) => {
    setMessage('');
    try {
      await updateCorrectionNames({ id: row.id, [field]: value }).unwrap();
      setMessage(
        `${field === 'designation_fr_pro' ? 'Nom FR Pro' : 'Nom AR Pro'} enregistré dans la correction. Le produit original reste inchangé jusqu'au clic sur Corriger.`
      );
    } catch (error: any) {
      setMessage(`Enregistrement du nom échoué : ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const markRow = async (row: ProductNameCorrectionRow, checked: boolean) => {
    if (row.applied_at || processingIds.has(row.id)) return;
    setMessage('');
    setProcessingIds((prev) => new Set(prev).add(row.id));
    try {
      await setChecked({ id: row.id, checked }).unwrap();
      setTransitionedIds((prev) => new Set(prev).add(row.id));
      if (checked) {
        const result = await applyCorrections({ ids: [row.id] }).unwrap();
        setMessage(
          `Correction appliquée: ${result.productsUpdated} produit(s), ${result.variantsUpdated} variante(s).`
        );
      } else {
        setMessage('Ligne marquée comme fausse.');
      }
    } catch (error: any) {
      setMessage(`Mise à jour échouée: ${getErrorMessage(error)}`);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const toggleSelectRow = (id: number, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllVisible = (selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visibleIds.forEach((id) => {
        if (selected) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const markSelected = async (checked: boolean) => {
    const ids = selectedRows
      .filter((row) => !row.applied_at)
      .map((row) => row.id);
    if (!ids.length) return;
    setMessage('');
    setProcessingIds((prev) => new Set([...prev, ...ids]));
    try {
      const result = await bulkSetChecked({ ids, checked }).unwrap();
      setTransitionedIds((prev) => new Set([...prev, ...ids]));
      setSelectedIds(new Set());
      if (checked) {
        const applied = await applyCorrections({ ids }).unwrap();
        setMessage(
          `Correction appliquée: ${applied.productsUpdated} produit(s), ${applied.variantsUpdated} variante(s) sur ${result.updated} ligne(s).`
        );
      } else {
        setMessage(`Fausse: ${result.updated} lignes mises à jour.`);
      }
    } catch (error: any) {
      setMessage(`Mise à jour échouée: ${getErrorMessage(error)}`);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'initial', label: 'Initial', count: Number(summary?.initial || 0) },
    { key: 'correct', label: 'Attachés correct', count: Number(summary?.correct || 0) },
    { key: 'false', label: 'Non attachés / fausse', count: Number(summary?.false_count || 0) },
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-7 w-7 text-emerald-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Correction noms produits</h1>
            <p className="text-sm text-gray-600">
              Import Excel unique, contrôle des produits/variantes, puis remplacement des noms validés.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50">
            <Upload className="h-4 w-4" />
            <span>{isUploading ? 'Import...' : 'Uploader Excel'}</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={isUploading}
              onChange={handleFile}
            />
          </label>
          <button
            type="button"
            onClick={() => void handleExportExcel('correct')}
            disabled={exportingReviewStatus !== null}
            title="Télécharger toutes les corrections correctes correspondant aux recherches"
            aria-label="Télécharger les produits corrects au format Excel"
            className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-emerald-800 shadow-sm ring-1 ring-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:ring-gray-300"
          >
            {exportingReviewStatus === 'correct' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Télécharger corrects
          </button>
          <button
            type="button"
            onClick={() => void handleExportExcel('false')}
            disabled={exportingReviewStatus !== null}
            title="Télécharger toutes les corrections fausses correspondant aux recherches"
            aria-label="Télécharger les produits faux au format Excel"
            className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm ring-1 ring-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:ring-gray-300"
          >
            {exportingReviewStatus === 'false' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Télécharger faux
          </button>
          <button
            type="button"
            onClick={handleRematch}
            disabled={isRematching || isUploading}
            className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
          >
            <RefreshCw className="h-4 w-4" />
            Vérifier match
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying || Number(summary?.ready_apply || 0) === 0}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:bg-gray-300"
          >
            <CheckCircle2 className="h-4 w-4" />
            Remplacer cochés ({Number(summary?.ready_apply || 0)})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Total</div>
          <div className="text-xl font-semibold text-gray-900">{Number(summary?.total || 0)}</div>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs text-emerald-700">Match OK</div>
          <div className="text-xl font-semibold text-emerald-900">{Number(summary?.matched || 0)}</div>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <div className="text-xs text-red-700">No match</div>
          <div className="text-xl font-semibold text-red-900">{Number(summary?.issues || 0)}</div>
        </div>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
          <div className="text-xs text-blue-700">Cochés</div>
          <div className="text-xl font-semibold text-blue-900">{Number(summary?.checked || 0)}</div>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Appliqués</div>
          <div className="text-xl font-semibold text-gray-900">{Number(summary?.applied || 0)}</div>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-white">
        <div className="flex flex-wrap border-b border-gray-200">
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium ${
                  active
                    ? 'border-b-2 border-emerald-700 text-emerald-800'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>
        <div className="space-y-4 p-4">
          <fieldset className="rounded-md border border-gray-200 bg-gray-50/70 px-3 pb-3 pt-2">
            <legend className="px-1 text-xs font-semibold text-gray-700">Rechercher par colonne</legend>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                Chaque champ cible uniquement la colonne indiquée.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                Filtres combinés avec
                <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-800">
                  ET
                </span>
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-gray-700">
                  <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-gray-500">
                    ANCIENNE
                  </span>
                  Ancienne désignation
                </span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={qAncienne}
                    onChange={(event) => handleSearchChange('ancienne', event.target.value)}
                    placeholder="Rechercher l’ancienne désignation"
                    className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-gray-700">
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700">
                    FR PRO
                  </span>
                  Désignation française
                </span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={qFr}
                    onChange={(event) => handleSearchChange('fr', event.target.value)}
                    placeholder="Rechercher la désignation FR Pro"
                    className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-gray-700">
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700">
                    AR PRO
                  </span>
                  Désignation arabe
                </span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={qAr}
                    onChange={(event) => handleSearchChange('ar', event.target.value)}
                    placeholder="ابحث في التسمية العربية المهنية"
                    dir="rtl"
                    className="w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-9 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </span>
              </label>
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PageSizeSelect value={limit} onChange={setLimit} />
            <span className="text-sm text-gray-600">{selectedIds.size} sélection</span>
            <button
              type="button"
              onClick={() => markSelected(true)}
              disabled={selectedIds.size === 0 || isBulkUpdating || isApplying}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:bg-gray-300"
            >
              <CheckCircle2 className="h-4 w-4" />
              Corriger et enregistrer
            </button>
            <button
              type="button"
              onClick={() => markSelected(false)}
              disabled={selectedIds.size === 0 || isBulkUpdating || isApplying}
              className="inline-flex items-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:bg-gray-300"
            >
              <XCircle className="h-4 w-4" />
              Fausse
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-600">
        <Pencil className="h-3.5 w-3.5" />
        Double-cliquez sur un nom FR Pro ou AR Pro pour le modifier. Le produit original ne change qu'après validation avec le bouton Corriger.
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
        <div className="responsive-table-container">
          <table className="min-w-[1500px] w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = !allVisibleSelected && someVisibleSelected;
                    }}
                    onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                    disabled={processingIds.size > 0}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600"
                    aria-label="Sélectionner les lignes visibles"
                  />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Action</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Ref</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Ref var</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Ancienne désignation</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Désignation FR pro</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Désignation AR pro</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Catégorie</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Variante originale</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Variante FR/AR pro</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Match système</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {visibleRows.map((row) => {
                const isIssue = row.match_status !== 'matched';
                const isProcessing = processingIds.has(row.id);
                const isVariantRow = row.is_variant_row;
                const productId = row.matched_product_id;
                const isSavingCategory = Boolean(productId && savingCategoryProductIds.has(productId));
                return (
                  <tr key={row.id} className={isIssue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}>
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        disabled={Boolean(row.applied_at) || isProcessing}
                        onChange={(event) => toggleSelectRow(row.id, event.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-40"
                        aria-label={`Sélectionner ligne ${row.id}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => markRow(row, true)}
                          disabled={Boolean(row.applied_at) || isProcessing}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                          title="Marquer correct"
                          aria-label={`Marquer la ligne ${row.id} correcte`}
                        >
                          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => markRow(row, false)}
                          disabled={Boolean(row.applied_at) || isProcessing}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40"
                          title="Marquer fausse"
                          aria-label={`Marquer la ligne ${row.id} fausse`}
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top font-medium text-gray-900">{fmt(row.reference)}</td>
                    <td className="px-3 py-3 align-top text-gray-700">{fmt(row.ref_variant)}</td>
                    <td className="px-3 py-3 align-top text-gray-800">{isVariantRow ? '-' : fmt(row.ancienne_designation)}</td>
                    <td className="px-3 py-3 align-top text-gray-900">
                      {isVariantRow ? '-' : (
                        <EditableCorrectionName
                          value={row.designation_fr_pro}
                          label="le nom FR Pro"
                          disabled={Boolean(row.applied_at) || isProcessing}
                          onSave={(value) => saveCorrectionName(row, 'designation_fr_pro', value)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-gray-900">
                      {isVariantRow ? '-' : (
                        <EditableCorrectionName
                          value={row.designation_ar_pro}
                          label="le nom AR Pro"
                          dir="rtl"
                          disabled={Boolean(row.applied_at) || isProcessing}
                          onSave={(value) => saveCorrectionName(row, 'designation_ar_pro', value)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {!isVariantRow && productId ? (
                        <div className="flex min-w-[190px] items-center gap-2">
                          <select
                            value={getProductCategoryValue(row) ?? 0}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              void changeProductCategory(row, value > 0 ? value : null);
                            }}
                            disabled={isSavingCategory || isCategoriesLoading || isCategoriesError}
                            className={`w-full rounded-md border px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-1 disabled:bg-gray-100 disabled:text-gray-500 ${
                              isSavingCategory
                                ? 'border-emerald-400 bg-emerald-50 focus:border-emerald-500 focus:ring-emerald-500'
                                : 'border-gray-300 focus:border-emerald-500 focus:ring-emerald-500'
                            }`}
                            aria-label={`Catégorie du produit ${productId}`}
                          >
                            <option value={0}>Uncategorized</option>
                            {sortedCategories.map((category) => (
                              <option
                                key={category.id}
                                value={category.id}
                                disabled={parentCategoryIds.has(category.id)}
                              >
                                {category.nom}
                              </option>
                            ))}
                          </select>
                          {isSavingCategory && (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-700" aria-label="Enregistrement" />
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-gray-700">{isVariantRow ? fmt(row.variante_originale) : '-'}</td>
                    <td className="px-3 py-3 align-top">
                      {isVariantRow ? (
                        <>
                          <div className="text-gray-900">{fmt(row.variante_fr_pro)}</div>
                          <div className="mt-1 text-gray-900" dir="rtl">{fmt(row.variante_ar_pro)}</div>
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass[row.match_status] || statusClass.not_checked}`}>
                          {statusLabel[row.match_status] || row.match_status}
                        </span>
                        <span className="text-xs text-gray-600">
                          P: {fmt(row.matched_product_id)} / V: {fmt(row.matched_variant_id)}
                        </span>
                        <span className="text-xs text-gray-500">
                          Revue: {row.review_status === 'correct' ? 'correct' : row.review_status === 'false' ? 'fausse' : 'initial'}
                        </span>
                        {row.applied_at && <span className="text-xs font-medium text-emerald-700">Déjà remplacé</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[220px] text-xs text-gray-700">
                        {isIssue && <AlertTriangle className="mb-1 h-4 w-4 text-red-700" />}
                        {fmt(row.match_message)}
                        {row.note_controle && <div className="mt-1 text-gray-500">{row.note_controle}</div>}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!isLoading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-6 py-10 text-center text-sm text-gray-500">
                    Aucune ligne enregistrée. Uploadez le fichier Excel pour démarrer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(isLoading || isFetching) && (
          <div className="border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
            Chargement...
          </div>
        )}
        {meta && (
          <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-700 md:flex-row md:items-center md:justify-between">
            <div>
              Page {meta.page} / {meta.totalPages} - {meta.total} lignes
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PageSizeSelect value={limit} onChange={setLimit} />
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={meta.page <= 1}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
              >
                Précédent
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}
                disabled={meta.page >= meta.totalPages}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductNameCorrectionsPage;
