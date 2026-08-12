import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Save, Search, XCircle } from 'lucide-react';
import {
  useGetSolverCategoriesQuery,
  useResolveDesignationsMutation,
  useAssignCategoryMutation,
} from '../store/api/categorySolverApi';
import type { SolverResolveRow } from '../store/api/categorySolverApi';
import { showError, showSuccess } from '../utils/notifications';

const SolverCategoriePage: React.FC = () => {
  const [text, setText] = useState('');
  const [categorieId, setCategorieId] = useState<number | ''>('');
  const [categorySearch, setCategorySearch] = useState('');
  const [rows, setRows] = useState<SolverResolveRow[]>([]);
  // Produits retenus pour l'affectation. Pour une ligne ambiguë, l'utilisateur
  // choisit lui-même lequel des homonymes garder.
  const [chosen, setChosen] = useState<Record<string, number>>({});

  const { data: categories = [], isFetching: loadingCategories, refetch } = useGetSolverCategoriesQuery();
  const [resolveDesignations, { isLoading: isResolving }] = useResolveDesignationsMutation();
  const [assignCategory, { isLoading: isAssigning }] = useAssignCategoryMutation();

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.chemin.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categorieId) || null,
    [categories, categorieId]
  );

  const lines = useMemo(
    () => text.split('\n').map((l) => l.trim()).filter(Boolean),
    [text]
  );

  const handleAnalyse = async () => {
    if (!lines.length) {
      showError('Collez au moins une désignation');
      return;
    }
    try {
      const res = await resolveDesignations({ designations: lines }).unwrap();
      const results = res.results || [];
      setRows(results);

      // Pré-sélection : les lignes non ambiguës sont retenues d'office.
      const next: Record<string, number> = {};
      for (const row of results) {
        if (row.status === 'ok' && row.matches[0]) next[row.designation] = row.matches[0].id;
      }
      setChosen(next);

      const found = results.filter((r) => r.status !== 'not_found').length;
      showSuccess(`${found}/${results.length} désignation(s) trouvée(s)`);
    } catch (e: any) {
      showError(e?.data?.message || "Erreur lors de l'analyse");
    }
  };

  const selectedProductIds = useMemo(
    () => [...new Set(Object.values(chosen))].filter((id) => Number.isInteger(id) && id > 0),
    [chosen]
  );

  const handleAssign = async () => {
    if (!categorieId) {
      showError('Choisissez une catégorie');
      return;
    }
    if (!selectedProductIds.length) {
      showError('Aucun produit sélectionné');
      return;
    }
    try {
      const res = await assignCategory({
        categorie_id: Number(categorieId),
        product_ids: selectedProductIds,
      }).unwrap();
      showSuccess(res.message);
      // On relance l'analyse pour refléter la nouvelle catégorie affichée.
      const refreshed = await resolveDesignations({ designations: lines }).unwrap();
      setRows(refreshed.results || []);
    } catch (e: any) {
      showError(e?.data?.message || "Erreur lors de l'affectation");
    }
  };

  const counts = useMemo(
    () => ({
      ok: rows.filter((r) => r.status === 'ok').length,
      ambiguous: rows.filter((r) => r.status === 'ambiguous').length,
      notFound: rows.filter((r) => r.status === 'not_found').length,
    }),
    [rows]
  );

  const toggleChoice = (designation: string, productId: number) => {
    setChosen((prev) => {
      const next = { ...prev };
      if (next[designation] === productId) delete next[designation];
      else next[designation] = productId;
      return next;
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solver Catégorie</h1>
          <p className="text-sm text-gray-500">
            Collez des désignations (une par ligne) et affectez-leur une catégorie en masse.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loadingCategories ? 'animate-spin' : ''}`} />
          Recharger catégories
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Zone de collage des désignations */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <label className="block text-sm font-semibold text-gray-700">
            Désignations produits — une par ligne
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            spellCheck={false}
            placeholder={'CHAISE BUREAU NOIR\nTABLE REUNION 180\nARMOIRE METALLIQUE'}
            className="w-full rounded-lg border border-gray-300 p-3 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="text-xs text-gray-500">{lines.length} ligne(s) non vide(s)</div>
        </div>

        {/* Choix de la catégorie cible */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <label className="block text-sm font-semibold text-gray-700">Catégorie à affecter</label>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Filtrer par parent ou nom…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={categorieId}
            onChange={(e) => setCategorieId(e.target.value ? Number(e.target.value) : '')}
            size={10}
            className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— Choisir une catégorie —</option>
            {filteredCategories.map((c) => (
              // Le chemin "Parent > Enfant" lève l'ambiguïté entre homonymes.
              <option key={c.id} value={c.id}>
                {c.chemin} ({c.product_count})
              </option>
            ))}
          </select>

          {selectedCategory && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Cible : <strong>{selectedCategory.chemin}</strong>
              {selectedCategory.parent_nom && (
                <span className="ml-1 text-blue-600">(parent : {selectedCategory.parent_nom})</span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleAnalyse}
              disabled={isResolving || !lines.length}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              {isResolving ? 'Analyse…' : 'Analyser'}
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={isAssigning || !categorieId || !selectedProductIds.length}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isAssigning ? 'Affectation…' : `Affecter (${selectedProductIds.length})`}
            </button>
          </div>
        </div>
      </div>

      {/* Résultat de l'analyse */}
      {rows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-4 border-b border-gray-200 px-4 py-3 text-sm">
            <span className="inline-flex items-center gap-1 text-green-700">
              <CheckCircle2 className="h-4 w-4" /> {counts.ok} trouvé(s)
            </span>
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-4 w-4" /> {counts.ambiguous} ambigu(s)
            </span>
            <span className="inline-flex items-center gap-1 text-red-700">
              <XCircle className="h-4 w-4" /> {counts.notFound} introuvable(s)
            </span>
            <span className="ml-auto text-gray-500">{selectedProductIds.length} produit(s) sélectionné(s)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Désignation collée</th>
                  <th className="px-4 py-2">Statut</th>
                  <th className="px-4 py-2">Produit(s) correspondant(s)</th>
                  <th className="px-4 py-2">Catégorie actuelle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.designation} className="align-top">
                    <td className="px-4 py-3 font-mono text-xs text-gray-800">{row.designation}</td>
                    <td className="px-4 py-3">
                      {row.status === 'ok' && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">OK</span>
                      )}
                      {row.status === 'ambiguous' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          {row.matches.length} homonymes
                        </span>
                      )}
                      {row.status === 'not_found' && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">Introuvable</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.matches.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <div className="space-y-1">
                          {row.matches.map((m) => (
                            <label key={m.id} className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={chosen[row.designation] === m.id}
                                onChange={() => toggleChoice(row.designation, m.id)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300"
                              />
                              <span className="text-gray-800">
                                #{m.id} — {m.designation}
                                {m.reference && <span className="ml-1 text-gray-500">({m.reference})</span>}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.matches.length === 0
                        ? '—'
                        : row.matches.map((m) => (
                            <div key={m.id}>{m.categorie_chemin || <span className="text-gray-400">aucune</span>}</div>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SolverCategoriePage;
