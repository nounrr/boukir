import React, { useEffect, useMemo, useState } from 'react';
import type { Product } from '../types';
import { useGenerateSpecsMutation, useGetProductsPaginatedQuery, useTranslateProductsMutation } from '../store/api/productsApi';
import { useGetCategoriesQuery } from '../store/api/categoriesApi';
import { useGetBrandsQuery } from '../store/api/brandsApi';
import { ChevronDown, ChevronUp, Languages, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { TechnicalSheet } from '../components/TechnicalSheet';

type LangKey = 'fr' | 'en' | 'ar' | 'zh';

const LANGS: Array<{ key: LangKey; label: string; dir?: 'ltr' | 'rtl' }> = [
  { key: 'fr', label: 'Français', dir: 'ltr' },
  { key: 'en', label: 'English', dir: 'ltr' },
  { key: 'ar', label: 'العربية', dir: 'rtl' },
  { key: 'zh', label: '中文', dir: 'ltr' },
];

function getDesignation(p: Product, lang: LangKey): string {
  if (lang === 'fr') return String(p.designation ?? '');
  if (lang === 'en') return String(p.designation_en ?? '');
  if (lang === 'ar') return String(p.designation_ar ?? '');
  return String(p.designation_zh ?? '');
}

function getDescription(p: Product, lang: LangKey): string {
  if (lang === 'fr') return String(p.description ?? '');
  if (lang === 'en') return String(p.description_en ?? '');
  if (lang === 'ar') return String(p.description_ar ?? '');
  return String(p.description_zh ?? '');
}

function getFiche(p: Product, lang: LangKey): string | null {
  if (lang === 'fr') return (p.fiche_technique ?? null) as any;
  if (lang === 'en') return (p.fiche_technique_en ?? null) as any;
  if (lang === 'ar') return (p.fiche_technique_ar ?? null) as any;
  return (p.fiche_technique_zh ?? null) as any;
}

const cellValue = (v: string) => (v && v.trim().length ? v : '—');

const isFilled = (v: unknown) => {
  const s = String(v ?? '').trim();
  return s.length > 0;
};

const isFicheFilled = (v: unknown) => {
  if (v === null || v === undefined) return false;
  const s = String(v ?? '').trim();
  return s.length > 0;
};

const isProductFullyTranslated = (p: Product) => {
  return (
    isFilled(p.designation) &&
    isFilled(p.designation_en) &&
    isFilled(p.designation_ar) &&
    isFilled(p.designation_zh) &&
    isFilled(p.description) &&
    isFilled((p as any).description_en) &&
    isFilled((p as any).description_ar) &&
    isFilled((p as any).description_zh) &&
    isFicheFilled((p as any).fiche_technique) &&
    isFicheFilled((p as any).fiche_technique_en) &&
    isFicheFilled((p as any).fiche_technique_ar) &&
    isFicheFilled((p as any).fiche_technique_zh)
  );
};

const ProductsTranslatePage: React.FC = () => {
  // Filters State
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [brandId, setBrandId] = useState<string>('');
  const [missingLang, setMissingLang] = useState<string>('');

  // Queries
  const { data: productsData, isLoading, isFetching } = useGetProductsPaginatedQuery({
    page,
    limit,
    q: search || undefined,
    category_id: categoryId || undefined,
    brand_id: brandId || undefined,
    missing_lang: missingLang || undefined,
  });

  const { data: categories } = useGetCategoriesQuery();
  const { data: brands } = useGetBrandsQuery();

  const products = productsData?.data || [];
  const meta = productsData?.meta;

  const [openId, setOpenId] = useState<number | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectedCount = selectedIds.size;

  const [translateProducts, { isLoading: isTranslatingTitles }] = useTranslateProductsMutation();
  const [generateSpecs, { isLoading: isGeneratingSpecs }] = useGenerateSpecsMutation();

  const [actionMessage, setActionMessage] = useState<string>('');

  useEffect(() => {
    // Keep selection simple: selection is per current page/filters.
    setSelectedIds(new Set());
  }, [page, limit, search, categoryId, brandId, missingLang]);

  const visibleIds = useMemo(() => products.map((p) => Number(p.id)).filter((n) => Number.isFinite(n)), [products]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const getSelectedIdArray = () => Array.from(selectedIds.values()).sort((a, b) => a - b);

  const runTranslateTitles = async () => {
    const ids = getSelectedIdArray();
    if (ids.length === 0) return;
    setActionMessage('');
    try {
      const res = await translateProducts({ ids, commit: true, force: false }).unwrap();
      setActionMessage(`Titre: ${res?.ok ? 'OK' : 'Erreur'} (${ids.length} produits)`);
    } catch (e: any) {
      setActionMessage(`Titre: erreur (${String(e?.data?.message || e?.message || 'unknown')})`);
    }
  };

  const runGenerateSpecsAndTranslate = async () => {
    const ids = getSelectedIdArray();
    if (ids.length === 0) return;
    setActionMessage('');
    try {
      const res = await generateSpecs({ ids, force: false, translate: true }).unwrap();
      setActionMessage(`Fiche+Description+Traduction: ${res?.ok ? 'OK' : 'Erreur'} (${ids.length} produits)`);
    } catch (e: any) {
      setActionMessage(`Fiche+Description+Traduction: erreur (${String(e?.data?.message || e?.message || 'unknown')})`);
    }
  };

  const runAll = async () => {
    const ids = getSelectedIdArray();
    if (ids.length === 0) return;
    setActionMessage('');
    try {
      const [r1, r2] = await Promise.all([
        translateProducts({ ids, commit: true, force: false }).unwrap(),
        generateSpecs({ ids, force: false, translate: true }).unwrap(),
      ]);
      const ok = Boolean(r1?.ok) && Boolean(r2?.ok);
      setActionMessage(`Tout: ${ok ? 'OK' : 'Erreur'} (${ids.length} produits)`);
    } catch (e: any) {
      setActionMessage(`Tout: erreur (${String(e?.data?.message || e?.message || 'unknown')})`);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Reset to page 1 on search
  };

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <Languages className="w-7 h-7 text-blue-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Produits Translate</h1>
            <p className="text-sm text-gray-600">Tableau des désignations + accordéon (description & fiche technique) par langue.</p>
          </div>
        </div>
        <div className="text-sm text-gray-700">
          {isLoading || isFetching ? 'Chargement...' : `${meta?.total || 0} produits trouvés`}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="text-sm text-gray-700">
          Sélection: <span className="font-semibold">{selectedCount}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
            disabled={selectedCount === 0 || isTranslatingTitles || isGeneratingSpecs}
            onClick={runTranslateTitles}
          >
            Traduire titre
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
            disabled={selectedCount === 0 || isGeneratingSpecs || isTranslatingTitles}
            onClick={runGenerateSpecsAndTranslate}
          >
            Get fiche + traduire direct
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:bg-gray-300"
            disabled={selectedCount === 0 || isGeneratingSpecs || isTranslatingTitles}
            onClick={runAll}
          >
            Tout (titre + fiche + description)
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="mb-6 text-sm text-gray-700">
          {actionMessage}
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Rechercher..."
            className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            value={search}
            onChange={handleSearchChange}
          />
        </div>

        <div>
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            value={categoryId}
            onChange={handleFilterChange(setCategoryId)}
          >
            <option value="">Toutes catégories</option>
            {categories?.map((c: any) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            value={brandId}
            onChange={handleFilterChange(setBrandId)}
          >
            <option value="">Toutes marques</option>
            {brands?.map((b: any) => (
              <option key={b.id} value={b.id}>{b.nom}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            value={missingLang}
            onChange={handleFilterChange(setMissingLang)}
          >
            <option value="">Tous statuts</option>
            <option value="ar">Manque Arabe</option>
            <option value="en">Manque Anglais</option>
            <option value="zh">Manque Chinois</option>
            <option value="desc">Manque Description</option>
            <option value="fiche">Manque Fiche Tech</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
                    }}
                    onChange={toggleSelectAllVisible}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Sélectionner tous les produits de la page"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">FR</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">EN</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AR</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ZH</th>
                <th className="px-6 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.map((p) => {
                const isOpen = openId === p.id;
                const isChecked = selectedIds.has(Number(p.id));
                const isComplete = isProductFullyTranslated(p);
                return (
                  <React.Fragment key={p.id}>
                    <tr
                      className={
                        (isComplete
                          ? 'bg-green-50 hover:bg-green-100'
                          : 'hover:bg-gray-50') +
                        ' cursor-pointer transition-colors'
                      }
                      onClick={() => setOpenId((prev) => (prev === p.id ? null : p.id))}
                      title="Cliquer pour ouvrir la description + fiche technique"
                    >
                      <td className="px-4 py-4 align-top" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(Number(p.id))}
                          aria-label={`Sélectionner le produit ${p.id}`}
                        />
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="text-sm font-medium text-gray-900">{cellValue(getDesignation(p, 'fr'))}</div>
                        <div className="text-xs text-gray-500 mt-1">{p.reference !== String(p.id) ? `Ref: ${p.reference}` : `ID: ${p.id}`}</div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="text-sm text-gray-900">{cellValue(getDesignation(p, 'en'))}</div>
                      </td>
                      <td className="px-6 py-4 align-top" dir="rtl">
                        <div className="text-sm text-gray-900">{cellValue(getDesignation(p, 'ar'))}</div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="text-sm text-gray-900">{cellValue(getDesignation(p, 'zh'))}</div>
                      </td>
                      <td className="px-6 py-4 align-top text-right">
                        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500 inline" /> : <ChevronDown className="w-4 h-4 text-gray-500 inline" />}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-gray-50/40">
                        <td className="px-6 py-5" colSpan={6} onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-5">
                            <div>
                              <h2 className="text-sm font-semibold text-gray-900 mb-3">Descriptions (toutes langues)</h2>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {LANGS.map((lang) => (
                                  <div key={lang.key} className="rounded-lg border border-gray-200 bg-white p-4">
                                    <div className="text-xs font-semibold text-gray-600 mb-2">{lang.label}</div>
                                    <div 
                                      className="text-sm text-gray-800 whitespace-pre-wrap max-h-60 overflow-y-auto" 
                                      dir={lang.dir}
                                      dangerouslySetInnerHTML={{ __html: getDescription(p, lang.key) }} 
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h2 className="text-sm font-semibold text-gray-900 mb-3">Fiche technique (toutes langues)</h2>
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                {LANGS.map((lang) => {
                                  const fiche = getFiche(p, lang.key);
                                  return (
                                    <div key={lang.key} className="rounded-lg border border-gray-200 bg-white p-4">
                                      <div className="text-xs font-semibold text-gray-600 mb-3">{lang.label}</div>
                                      {fiche ? (
                                        <TechnicalSheet fiche={fiche} defaultExpanded />
                                      ) : (
                                        <div className="text-sm text-gray-500 italic">Aucune fiche technique</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {!isLoading && products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
                    Aucun produit trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Affichage de <span className="font-medium">{(meta.page - 1) * meta.limit + 1}</span> à <span className="font-medium">{Math.min(meta.page * meta.limit, meta.total)}</span> sur <span className="font-medium">{meta.total}</span> résultats
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <span className="sr-only">Précédent</span>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                    Page {meta.page} / {meta.totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                    disabled={page >= meta.totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <span className="sr-only">Suivant</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductsTranslatePage;
