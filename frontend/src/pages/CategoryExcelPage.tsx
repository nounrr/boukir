import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, FileSpreadsheet, Search } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useApplyCategoryExcelMutation, usePreviewCategoryExcelMutation } from '../store/api/categoryExcelApi';
import type { CategoryExcelPreview, CategoryExcelRow } from '../store/api/categoryExcelApi';

const resultTabs = [
  { key: 'recognized', label: 'Correspondances', empty: 'Aucune correspondance complète.' },
  { key: 'unknownProducts', label: 'Produits non reconnus', empty: 'Tous les produits ont été reconnus.' },
  { key: 'unknownCategories', label: 'Catégories non reconnues', empty: 'Toutes les catégories cibles ont été reconnues.' },
] as const;
const pageSize = 30;
const numberFormat = new Intl.NumberFormat('fr-FR');

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
      return data.message;
    }
  }
  return fallback;
}

function ResultsTable({ rows, empty, showStatus }: { rows: CategoryExcelRow[]; empty: string; showStatus: boolean }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  if (!rows.length) return <p className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600">{empty}</p>;

  const term = search.trim().toLowerCase();
  const filtered = rows.filter(row =>
    [row.product, row.productId, row.variant, row.current, row.target, row.reason].some(value =>
      String(value ?? '').toLowerCase().includes(term),
    ),
  );
  const first = page * pageSize;
  const visible = filtered.slice(first, first + pageSize);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <label className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 text-gray-500">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          type="search"
          aria-label="Rechercher dans les résultats"
          placeholder="Rechercher un produit ou une catégorie"
          value={search}
          onChange={event => { setSearch(event.target.value); setPage(0); }}
          className="w-full rounded-md border-gray-200 text-sm"
        />
      </label>
      {visible.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[710px] text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
              <tr>
                <th scope="col" className="px-4 py-3">Ligne Excel</th>
                <th scope="col" className="px-4 py-3">Produit</th>
                <th scope="col" className="px-4 py-3">Catégorie actuelle</th>
                <th scope="col" className="px-4 py-3">Catégorie cible</th>
                <th scope="col" className="px-4 py-3">{showStatus ? 'État' : 'Motif'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((row, index) => (
                <tr key={first + index} className="align-top">
                  <td className="px-4 py-3 tabular-nums text-gray-600">
                    {row.row}
                    <span className="block text-xs text-gray-500">{row.sheet}</span>
                  </td>
                  <td className="min-w-40 px-4 py-3 font-medium text-gray-900">
                    {row.product}
                    {row.variant && <span className="block text-xs font-normal text-gray-600">{row.variant}</span>}
                    {row.productId && <span className="block text-xs font-normal text-gray-500">#{row.productId}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.current || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.target || '—'}</td>
                  <td className="min-w-28 px-4 py-3 text-gray-600">
                    {showStatus ? (row.changed ? 'À corriger' : 'Déjà correcte') : row.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p-5 text-sm text-gray-600">Aucun résultat pour cette recherche.</p>}
      {filtered.length > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm">
          <span className="text-gray-600">
            {numberFormat.format(first + 1)}–{numberFormat.format(first + visible.length)} sur {numberFormat.format(filtered.length)}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button>
            <Button size="sm" variant="outline" disabled={first + pageSize >= filtered.length} onClick={() => setPage(page + 1)}>Suivant</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CategoryExcelPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CategoryExcelPreview | null>(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<number | null>(null);
  const [analyze, { isLoading: analyzing }] = usePreviewCategoryExcelMutation();
  const [apply, { isLoading: applying }] = useApplyCategoryExcelMutation();
  const busy = analyzing || applying;

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setError('');
    setUpdated(null);
    setPreview(null);
    try {
      const result = await analyze(file).unwrap();
      setPreview({
        ...result,
        recognized: [...result.recognized].sort((a, b) => Number(b.changed) - Number(a.changed)),
      });
    } catch (cause) {
      setError(errorMessage(cause, 'Impossible d’analyser ce fichier Excel.'));
    }
  }

  async function handleApply() {
    if (!file || !preview?.updates || busy) return;
    setError('');
    try {
      const result = await apply({ file, token: preview.token }).unwrap();
      setUpdated(result.updated);
      setPreview({
        ...preview,
        updates: 0,
        recognized: preview.recognized.map(row => row.changed
          ? { ...row, current: row.target, changed: false }
          : row),
      });
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'status' in cause && cause.status === 409) setPreview(null);
      setError(errorMessage(cause, 'Impossible d’appliquer les corrections.'));
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Catégorie Excel</h1>
        <p className="mt-1 text-sm text-gray-600">Importez un classeur pour mettre à jour les catégories principales des produits du catalogue.</p>
      </header>

      <form onSubmit={handleAnalyze} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <label htmlFor="category-excel-file" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <FileSpreadsheet className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          Fichier Excel
        </label>
        <p id="category-excel-help" className="mt-2 text-sm text-gray-600">
          La colonne « correction » est prioritaire. Si elle est vide, l’analyse utilise la colonne « Catégorie ».
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            id="category-excel-file"
            aria-describedby="category-excel-help"
            type="file"
            accept=".xlsx,.xls"
            disabled={busy}
            onChange={event => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setError('');
              setUpdated(null);
            }}
            className="block w-full min-w-0 max-w-md rounded-md border border-gray-200 text-sm text-gray-700 file:mr-3 file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:font-medium file:text-gray-900"
          />
          <Button type="submit" variant="outline" disabled={!file || busy}>
            {analyzing ? 'Analyse en cours…' : 'Analyser'}
          </Button>
        </div>
      </form>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {updated !== null && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          {numberFormat.format(updated)} {updated === 1 ? 'produit corrigé' : 'produits corrigés'}.
        </p>
      )}

      {preview && (
        <section aria-label="Résultats de l’analyse Excel" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <div aria-live="polite">
              <h2 className="font-semibold text-gray-900">{numberFormat.format(preview.totalRows)} lignes analysées</h2>
              <p className="mt-1 text-sm text-gray-600">{numberFormat.format(preview.updates)} {preview.updates === 1 ? 'produit à corriger' : 'produits à corriger'}</p>
            </div>
            <Button disabled={!preview.updates || busy} onClick={handleApply} className="bg-emerald-700 hover:bg-emerald-800">
              {applying ? 'Correction en cours…' : 'Corriger'}
            </Button>
          </div>
          <Tabs defaultValue="recognized">
            <TabsList aria-label="Résultats du rapprochement" className="h-auto flex-wrap justify-start gap-1">
              {resultTabs.map(tab => (
                <TabsTrigger key={tab.key} value={tab.key}>
                  {tab.label} ({numberFormat.format(preview[tab.key].length)})
                </TabsTrigger>
              ))}
            </TabsList>
            {resultTabs.map(tab => (
              <TabsContent key={tab.key} value={tab.key}>
                <ResultsTable rows={preview[tab.key]} empty={tab.empty} showStatus={tab.key === 'recognized'} />
              </TabsContent>
            ))}
          </Tabs>
        </section>
      )}
    </div>
  );
}
