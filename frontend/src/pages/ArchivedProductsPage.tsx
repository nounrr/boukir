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
    <div className="p-6">
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

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Désignation</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catégorie</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.map((p: any) => (
              <tr key={p.id}>
                <td className="px-6 py-4 whitespace-nowrap">{p.id}</td>
                <td className="px-6 py-4">{p.designation || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">{p.categorie?.nom || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
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
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="px-6 py-8 text-center text-gray-500" colSpan={4}>Aucun produit archivé</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ArchivedProductsPage;
