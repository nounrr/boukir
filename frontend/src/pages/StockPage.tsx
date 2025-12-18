import React, { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { Product, Category } from '../types';
import { Plus, Edit, Trash2, Search, Package, Settings } from 'lucide-react';
import { selectProducts } from '../store/slices/productsSlice';
import { selectCategories } from '../store/slices/categoriesSlice';
import { useGetCategoriesQuery } from '../store/api/categoriesApi';
import { useGetProductsQuery, useDeleteProductMutation, useTranslateProductsMutation } from '../store/api/productsApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';
import ProductFormModal from '../components/ProductFormModal';
import CategoryFormModal from '../components/CategoryFormModal';
import * as XLSX from 'xlsx';

const StockPage: React.FC = () => {
  // const dispatch = useDispatch();
  // Load from backend
  const { data: productsApiData, refetch: refetchProducts } = useGetProductsQuery();
  const { data: categoriesApiData } = useGetCategoriesQuery();
  // Keep legacy selectors as fallback during transition
  const productsState = useSelector(selectProducts);
  const categoriesState = useSelector(selectCategories);
  const products = productsApiData ?? productsState;
  const categories = categoriesApiData ?? categoriesState;

  const organizedCategories = useMemo(() => {
    const roots = categories.filter((c: Category) => !c.parent_id);
    const childrenMap = new Map<number, Category[]>();
    categories.forEach((c: Category) => {
      if (c.parent_id) {
        const list = childrenMap.get(c.parent_id) || [];
        list.push(c);
        childrenMap.set(c.parent_id, list);
      }
    });

    const result: { id: number; nom: string; level: number }[] = [];
    
    const traverse = (cats: Category[], level: number) => {
      cats.forEach(c => {
        result.push({ id: c.id, nom: c.nom, level });
        const children = childrenMap.get(c.id);
        if (children) {
          traverse(children, level + 1);
        }
      });
    };

    traverse(roots, 0);
    return result;
  }, [categories]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [deleteProductMutation] = useDeleteProductMutation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isTranslating, setIsTranslating] = useState(false);
  // translation mutation
  const [translateProducts] = useTranslateProductsMutation();

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  const handleEdit = (product: any) => {
    const realProduct = product.isVariantRow 
      ? products.find((p: any) => p.id === product.originalId) 
      : product;
    setEditingProduct(realProduct || product);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
      'Êtes-vous sûr de vouloir supprimer ce produit ?',
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        await deleteProductMutation({ id }).unwrap();
        showSuccess('Produit supprimé avec succès');
        console.log('Produit supprimé via Redux Persist');
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        showError('Erreur lors de la suppression du produit');
      }
    }
  };

  const flattenedProducts = useMemo(() => {
    const rows: any[] = [];
    const source = products || [];
    source.forEach((product: any) => {
      if (product.is_deleted === 1) return;

      // Add main product
      rows.push(product);

      // Add variants
      if (product.variants && Array.isArray(product.variants)) {
        product.variants.forEach((variant: any) => {
          rows.push({
            ...product,
            id: `var-${variant.id}`,
            originalId: product.id,
            designation: `${product.designation} - ${variant.variant_name}`,
            reference: variant.reference || product.reference,
            prix_achat: variant.prix_achat,
            prix_vente: variant.prix_vente,
            quantite: variant.stock_quantity,
            isVariantRow: true,
            // Inherit other props
          });
        });
      }
    });
    return rows;
  }, [products]);

  const filteredProducts = flattenedProducts.filter((product: any) => {
    const term = (searchTerm ?? '').toLowerCase();
    const refStr = String(product.reference ?? product.id ?? '').toLowerCase();
    const designation = String(product.designation ?? '').toLowerCase();
    const matchesSearch = designation.includes(term) || refStr.includes(term);
    
    const matchesCategory = !filterCategory || (() => {
      // Check if the selected filter category exists in the product's categories list
      if (product.categories && Array.isArray(product.categories) && product.categories.length > 0) {
        return product.categories.some((c: any) => String(c.id) === filterCategory);
      }
      // Fallback to legacy single category check
      return String(product.categorie_id ?? '') === filterCategory;
    })();

    return matchesSearch && matchesCategory;
  });

  const handleExportExcel = () => {
    try {
      // Filter out services
      const exportableProducts = filteredProducts.filter((p: any) => !p.est_service);

      const rows = exportableProducts.map((p: any, index: number) => {
        const pa = Number(p.prix_achat) || 0;
        return {
          'N°': index + 1,
          'Référence': p.reference ?? p.id,
          'Désignation': p.designation ?? '',
          'Quantité': '', // Laisser vide pour saisie
          'Prix Achat': pa,
          'Total Achat': '' // Sera remplacé par une formule
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);

      // Ajouter les formules pour chaque ligne produit
      // Les données commencent à la ligne 2 (index 1) car la ligne 1 est l'en-tête
      exportableProducts.forEach((_, index) => {
        const rowNum = index + 2; // Excel row number (1-based)
        const qtyCell = `D${rowNum}`; // Colonne Quantité
        const priceCell = `E${rowNum}`; // Colonne Prix Achat
        
        // Formule: Quantité * Prix Achat
        const cellRef = XLSX.utils.encode_cell({ r: index + 1, c: 5 }); // Colonne F (index 5)
        ws[cellRef] = { t: 'n', f: `${qtyCell}*${priceCell}`, v: 0 };
      });

      // Ajouter la ligne TOTAL
      const totalRowIndex = rows.length + 1; // 0-based index for the new row
      const totalRowNum = totalRowIndex + 1; // 1-based Excel row number
      
      XLSX.utils.sheet_add_json(ws, [{
        'N°': 'TOTAL',
        'Référence': '',
        'Désignation': '',
        'Quantité': '',
        'Prix Achat': '',
        'Total Achat': ''
      }], { skipHeader: true, origin: -1 });

      // Formule Somme Prix Achat (Colonne E)
      const sumPriceRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 4 });
      ws[sumPriceRef] = { t: 'n', f: `SUM(E2:E${totalRowNum - 1})` };

      // Formule Somme Total Achat (Colonne F)
      const sumTotalRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 5 });
      ws[sumTotalRef] = { t: 'n', f: `SUM(F2:F${totalRowNum - 1})` };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Stock');
      XLSX.writeFile(wb, `export-stock-${new Date().toISOString().slice(0,10)}.xlsx`);
      showSuccess('Export Excel généré avec formules');
    } catch (e) {
      console.error(e);
      showError('Erreur lors de la génération du fichier Excel');
    }
  };

  // Pagination
  const totalItems = filteredProducts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Réinitialiser la page quand on change les filtres
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion du Stock</h1>
        <div className="flex gap-3">
          {/* Traduire button */}
          <button
            onClick={async () => {
              if (selectedIds.size === 0) return;
              setIsTranslating(true);
              try {
                const ids = Array.from(selectedIds);
                const res = await translateProducts({
                  ids,
                  commit: true,
                  force: true,
                  models: { clean: 'gpt-4o-mini', translate: 'gpt-4o-mini' },
                }).unwrap();

                // Summarize results
                const ok = res?.results?.filter((r: any) => r.status === 'ok').length ?? 0;
                const errs = res?.results?.filter((r: any) => r.status === 'error').length ?? 0;
                const skipped = res?.results?.filter((r: any) => r.status === 'skipped').length ?? 0;
                showSuccess(`Traduction: ${ok} ok, ${skipped} ignoré(s), ${errs} erreur(s)`);
                setSelectedIds(new Set());
                refetchProducts?.();
              } catch (e) {
                console.error(e);
                showError('Erreur lors de la traduction');
              } finally {
                setIsTranslating(false);
              }
            }}
            disabled={selectedIds.size === 0 || isTranslating}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50"
            title="Traduire les désignations sélectionnées"
          >
            {isTranslating ? 'Traduction...' : 'Traduire'}
          </button>
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            <Settings size={20} />
            Nouvelle Catégorie
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            Exporter Excel
          </button>
          <button
            onClick={() => {
              setEditingProduct(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            <Plus size={20} />
            Nouveau Produit
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher par ID ou désignation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Toutes les catégories</option>
          {organizedCategories.map((category) => (
            <option key={category.id} value={category.id.toString()}>
              {'\u00A0'.repeat(category.level * 4)}{category.nom}
            </option>
          ))}
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <Package className="text-blue-600" size={32} />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Produits</p>
              <p className="text-3xl font-bold text-gray-900">{products.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <Settings className="text-green-600" size={32} />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Services</p>
              <p className="text-3xl font-bold text-gray-900">
                {products.filter(p => p.est_service).length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <Package className="text-purple-600" size={32} />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Catégories</p>
              <p className="text-3xl font-bold text-gray-900">{categories.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Contrôles de pagination */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700">
            Affichage de {startIndex + 1} à {Math.min(endIndex, totalItems)} sur {totalItems} produits
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Produits par page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3">
                  {/* Select all on current page (main products only) */}
                  <input
                    type="checkbox"
                    checked={paginatedProducts.every((p: any) => p.isVariantRow ? true : selectedIds.has(p.id)) && paginatedProducts.some((p: any) => !p.isVariantRow)}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) {
                        paginatedProducts.forEach((p: any) => {
                          if (!p.isVariantRow) next.add(p.id);
                        });
                      } else {
                        paginatedProducts.forEach((p: any) => {
                          if (!p.isVariantRow) next.delete(p.id);
                        });
                      }
                      setSelectedIds(next);
                    }}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Désignation</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catégorie</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantité</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix d'achat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coût de revient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix gros</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix vente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedProducts.map((product: any) => (
                <tr key={product.id} className={`hover:bg-gray-50 ${product.isVariantRow ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {!product.isVariantRow && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(product.id);
                          else next.delete(product.id);
                          setSelectedIds(next);
                        }}
                      />
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {product.isVariantRow ? (
                      <div className="flex items-center justify-center h-10 w-10 text-gray-400">
                        <span className="text-xl">↳</span>
                      </div>
                    ) : (
                      product.image_url ? (
                        <img src={product.image_url} alt={product.designation} className="h-10 w-10 object-cover rounded" />
                      ) : (
                        <div className="h-10 w-10 bg-gray-200 rounded flex items-center justify-center text-gray-400">
                          <Package size={20} />
                        </div>
                      )
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{product.reference ?? product.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {product.designation}
                      {product.isVariantRow && <span className="ml-2 text-xs text-blue-600 font-normal">(Variante)</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {product.categorie?.nom || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.est_service ? '-' : product.quantite}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.prix_achat} DH
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.cout_revient} DH
                    <span className="text-xs text-gray-500 ml-1">({product.cout_revient_pourcentage}%)</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.prix_gros} DH
                    <span className="text-xs text-gray-500 ml-1">({product.prix_gros_pourcentage}%)</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.prix_vente} DH
                    <span className="text-xs text-gray-500 ml-1">({product.prix_vente_pourcentage}%)</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      product.est_service
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {product.est_service ? 'Service' : 'Produit'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(product)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Modifier"
                      >
                        <Edit size={16} />
                      </button>
                      {!product.isVariantRow && (
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation de pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center items-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Précédent
          </button>
          
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-2 border rounded-md ${
                    currentPage === pageNum
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Suivant
          </button>
        </div>
      )}

      {/* Modal Nouveau/Modifier Produit */}
      <ProductFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProduct(null);
        }}
        editingProduct={editingProduct}
        onProductAdded={(newProduct) => {
          console.log('Nouveau produit ajouté:', newProduct);
          showSuccess('Produit ajouté avec succès !');
        }}
        onProductUpdated={(updatedProduct) => {
          console.log('Produit mis à jour:', updatedProduct);
          showSuccess('Produit mis à jour avec succès !');
        }}
      />

      {/* Modal Nouvelle Catégorie */}
      <CategoryFormModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSaved={() => {
          setIsCategoryModalOpen(false);
          showSuccess('Catégorie créée');
        }}
      />
    </div>
  );
};

export default StockPage;
