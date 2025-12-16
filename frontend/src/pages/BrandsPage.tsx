import React, { useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Search, Tag } from 'lucide-react';
import type { Brand } from '../types';
import {
  useGetBrandsQuery,
  useDeleteBrandMutation,
} from '../store/api/brandsApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';
import BrandFormModal from '../components/BrandFormModal';

const BrandsPage: React.FC = () => {
  const { data: brands = [], isLoading } = useGetBrandsQuery();
  const [deleteBrand] = useDeleteBrandMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return brands;
    return brands.filter((b) =>
      (b.nom || '').toLowerCase().includes(q) || (b.description || '').toLowerCase().includes(q)
    );
  }, [brands, search]);

  const handleAdd = () => {
    setEditingBrand(null);
    setIsModalOpen(true);
  };

  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'Suppression définitive',
      'Voulez-vous vraiment supprimer cette marque ? Cette action est irréversible.',
      'Oui, supprimer',
      'Annuler'
    );
    if (!result.isConfirmed) return;
    try {
      await deleteBrand({ id }).unwrap();
      showSuccess('Marque supprimée');
    } catch (e: any) {
      showError(e?.data?.message || e?.message || 'Erreur lors de la suppression');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Tag className="text-purple-600" size={28} />
          <h1 className="text-2xl font-bold text-gray-900">Marques</h1>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
        >
          <Plus size={18} /> Nouvelle marque
        </button>
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher par nom ou description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">Chargement...</td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">Aucune marque trouvée</td>
                </tr>
              )}
              {filtered.map((brand) => (
                <tr key={brand.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {brand.image_url ? (
                      <img 
                        src={`http://localhost:3001${brand.image_url}`} 
                        alt={brand.nom} 
                        className="h-10 w-10 object-contain rounded-full border"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                        <Tag size={16} />
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{brand.nom}</td>
                  <td className="px-6 py-4 text-gray-500 max-w-xs truncate">{brand.description || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleEdit(brand)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Modifier"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(brand.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Supprimer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <BrandFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialValues={editingBrand || {}}
      />
    </div>
  );
};

export default BrandsPage;
