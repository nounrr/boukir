import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, Search, Upload, XCircle } from 'lucide-react';
import {
  useApplyProductNameCorrectionsMutation,
  useBulkSetProductNameCorrectionsCheckedMutation,
  useGetProductNameCorrectionsQuery,
  useRematchProductNameCorrectionsMutation,
  useSetProductNameCorrectionCheckedMutation,
  useUploadProductNameCorrectionsMutation,
  type ProductNameCorrectionRow,
} from '../store/api/productNameCorrectionsApi';

type TabKey = 'initial' | 'correct' | 'false';

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

const ProductNameCorrectionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('initial');
  const [q, setQ] = useState('');
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const [transitionedIds, setTransitionedIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const { data, isLoading, isFetching } = useGetProductNameCorrectionsQuery({
    status: 'all',
    review_status: activeTab,
    q: q || undefined,
    page,
    limit,
  });
  const [uploadCorrections, { isLoading: isUploading }] = useUploadProductNameCorrectionsMutation();
  const [rematch, { isLoading: isRematching }] = useRematchProductNameCorrectionsMutation();
  const [setChecked] = useSetProductNameCorrectionCheckedMutation();
  const [bulkSetChecked, { isLoading: isBulkUpdating }] = useBulkSetProductNameCorrectionsCheckedMutation();
  const [applyCorrections, { isLoading: isApplying }] = useApplyProductNameCorrectionsMutation();

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

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab, q, page, limit]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, q, limit]);

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
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Rechercher référence, ancien nom, nouveau nom, variante..."
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
          <div className="flex flex-wrap items-center gap-2">
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

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
        <div className="responsive-table-container">
          <table className="min-w-[1320px] w-full divide-y divide-gray-200 text-sm">
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
                    <td className="px-3 py-3 align-top text-gray-800">{fmt(row.ancienne_designation)}</td>
                    <td className="px-3 py-3 align-top text-gray-900">{fmt(row.designation_fr_pro)}</td>
                    <td className="px-3 py-3 align-top text-gray-900" dir="rtl">{fmt(row.designation_ar_pro)}</td>
                    <td className="px-3 py-3 align-top text-gray-700">{fmt(row.variante_originale)}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="text-gray-900">{fmt(row.variante_fr_pro)}</div>
                      <div className="mt-1 text-gray-900" dir="rtl">{fmt(row.variante_ar_pro)}</div>
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
                  <td colSpan={11} className="px-6 py-10 text-center text-sm text-gray-500">
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
              <select
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
                <option value={200}>200 / page</option>
              </select>
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
