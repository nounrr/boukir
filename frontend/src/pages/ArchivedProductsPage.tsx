import React, { useMemo, useState } from 'react';
import { useGetArchivedProductsQuery, useRestoreProductMutation } from '../store/api/productsApi';
import { Search, RotateCcw } from 'lucide-react';
import { showError, showSuccess } from '../utils/notifications';

const ArchivedProductsPage: React.FC = () => {
  const { data: archived = [], isLoading, refetch } = useGetArchivedProductsQuery();
  const [restore] = useRestoreProductMutation();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = (search || '').toLowerCase();
    return archived.filter((p: any) =>
      String(p.id || '').toLowerCase().includes(q) ||
      String(p.designation || '').toLowerCase().includes(q)
    );
  }, [archived, search]);

  if (isLoading) return <div className="p-6">Chargement...</div>;

  return (
    <div className="w-screen max-w-screen overflow-x-hidden box-border p-4 sm:p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Produits archivés</h1>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            className="w-full pl-10 pr-3 py-2 border rounded"
            placeholder="Rechercher par ID ou désignation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Liste mobile (cartes) */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-5 text-center text-gray-500">Aucun produit archivé</div>
        ) : (
          filtered.map((p: any) => (
            <div key={p.id} className="bg-white rounded-lg shadow p-4 border border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-500">ID</div>
                  <div className="text-base font-semibold text-gray-900">{p.id}</div>
                  <div className="mt-1 text-sm text-gray-700">{p.designation || '-'}</div>
                  <div className="text-xs text-gray-500">Catégorie: {p.categorie?.nom || '-'}</div>
                </div>
                <div className="text-right">
                  <button
                    className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={async () => {
                      try {
                        await restore({ id: p.id }).unwrap();
                        showSuccess('Produit restauré');
                        refetch();
                      } catch (e) {
                        console.error(e);
                        showError('Erreur lors de la restauration');
                      }
                    }}
                  >
                    <RotateCcw size={16} />
                    Restaurer
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Grille desktop (cartes) */}
      <div className="hidden sm:block mt-2">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Aucun produit archivé</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((p: any) => (
              <div key={p.id} className="bg-white rounded-lg shadow p-4 border border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-gray-500">ID</div>
                    <div className="text-lg font-semibold text-gray-900">{p.id}</div>
                    <div className="mt-1 text-sm text-gray-700 truncate" title={p.designation || ''}>{p.designation || '-'}</div>
                    <div className="text-xs text-gray-500">Catégorie: {p.categorie?.nom || '-'}</div>
                  </div>
                  <div className="text-right">
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={async () => {
                        try {
                          await restore({ id: p.id }).unwrap();
                          showSuccess('Produit restauré');
                          refetch();
                        } catch (e) {
                          console.error(e);
                          showError('Erreur lors de la restauration');
                        }
                      }}
                    >
                      <RotateCcw size={16} />
                      Restaurer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArchivedProductsPage;
