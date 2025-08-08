import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { Product, Category } from '../types';
import { Plus, Edit, Trash2, Search, Package, Settings } from 'lucide-react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { selectProducts, addProduct, updateProduct, deleteProduct } from '../store/slices/productsSlice';
import { selectCategories, addCategory } from '../store/slices/categoriesSlice';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';

const validationSchema = Yup.object({
  reference: Yup.string().required('Référence requise'),
  designation: Yup.string().required('Désignation requise'),
  categorie_id: Yup.number().required('Catégorie requise'),
  quantite: Yup.number().min(0, 'La quantité ne peut pas être négative').required('Quantité requise'),
  prix_achat: Yup.number().positive('Le prix doit être positif').required('Prix d\'achat requis'),
  cout_revient_pourcentage: Yup.number().min(0, 'Le pourcentage ne peut pas être négatif').required('Pourcentage requis'),
  prix_gros_pourcentage: Yup.number().min(0, 'Le pourcentage ne peut pas être négatif').required('Pourcentage requis'),
  prix_vente_pourcentage: Yup.number().min(0, 'Le pourcentage ne peut pas être négatif').required('Pourcentage requis'),
  est_service: Yup.boolean(),
});

const categoryValidationSchema = Yup.object({
  nom: Yup.string().required('Nom de la catégorie requis'),
  description: Yup.string(),
});

const StockPage: React.FC = () => {
  const dispatch = useDispatch();
  const products = useSelector(selectProducts);
  const categories = useSelector(selectCategories);
  const [isLoading, setIsLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // États pour les calculs dynamiques
  const [dynamicPrices, setDynamicPrices] = useState({
    cout_revient: 0,
    prix_gros: 0,
    prix_vente: 0,
  });

  const calculatePrices = (prixAchat: number, coutPct: number, grosPct: number, ventePct: number) => {
    return {
      cout_revient: prixAchat * (1 + coutPct / 100),
      prix_gros: prixAchat * (1 + grosPct / 100),
      prix_vente: prixAchat * (1 + ventePct / 100),
    };
  };

  const formik = useFormik({
    initialValues: {
      reference: '',
      designation: '',
      categorie_id: 0,
      quantite: 0,
      prix_achat: 0,
      cout_revient_pourcentage: 2,
      prix_gros_pourcentage: 10,
      prix_vente_pourcentage: 25,
      est_service: false,
    },
    validationSchema,
    onSubmit: (values, { resetForm }) => {
      try {
        // Calcul des prix basé sur les pourcentages
        const prix_achat = parseFloat(values.prix_achat.toString());
        const cout_revient = prix_achat * (1 + parseFloat(values.cout_revient_pourcentage.toString()) / 100);
        const prix_gros = prix_achat * (1 + parseFloat(values.prix_gros_pourcentage.toString()) / 100);
        const prix_vente = prix_achat * (1 + parseFloat(values.prix_vente_pourcentage.toString()) / 100);
        
        if (editingProduct) {
          const updatedProduct: Product = {
            ...editingProduct,
            ...values,
            cout_revient,
            prix_gros,
            prix_vente,
            updated_by: 1,
            updated_at: new Date().toISOString()
          };
          dispatch(updateProduct(updatedProduct));
        } else {
          const newProduct: Product = {
            id: Date.now(),
            ...values,
            cout_revient,
            prix_gros,
            prix_vente,
            created_by: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          dispatch(addProduct(newProduct));
        }
        setIsModalOpen(false);
        setEditingProduct(null);
        resetForm();
        console.log('Produit sauvegardé avec Redux Persist!');
      } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
      }
    },
  });

  const categoryFormik = useFormik({
    initialValues: {
      nom: '',
      description: '',
    },
    validationSchema: categoryValidationSchema,
    onSubmit: (values, { resetForm }) => {
      try {
        const newCategory: Category = {
          id: Date.now(),
          ...values,
          created_by: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        dispatch(addCategory(newCategory));
        setIsCategoryModalOpen(false);
        resetForm();
        console.log('Catégorie créée avec succès via Redux Persist');
      } catch (error) {
        console.error('Erreur lors de la création de la catégorie:', error);
      }
    },
  });

  // Recalculer les prix automatiquement
  useEffect(() => {
    const prices = calculatePrices(
      formik.values.prix_achat,
      formik.values.cout_revient_pourcentage,
      formik.values.prix_gros_pourcentage,
      formik.values.prix_vente_pourcentage
    );
    setDynamicPrices(prices);
  }, [formik.values.prix_achat, formik.values.cout_revient_pourcentage, formik.values.prix_gros_pourcentage, formik.values.prix_vente_pourcentage]);

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    formik.setValues({
      reference: product.reference,
      designation: product.designation,
      categorie_id: product.categorie_id,
      quantite: product.quantite,
      prix_achat: product.prix_achat,
      cout_revient_pourcentage: product.cout_revient_pourcentage,
      prix_gros_pourcentage: product.prix_gros_pourcentage,
      prix_vente_pourcentage: product.prix_vente_pourcentage,
      est_service: product.est_service,
    });
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
        dispatch(deleteProduct(id));
        showSuccess('Produit supprimé avec succès');
        console.log('Produit supprimé via Redux Persist');
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        showError('Erreur lors de la suppression du produit');
      }
    }
  };

  const filteredProducts = products.filter((product: Product) => {
    const matchesSearch = product.designation.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.reference.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !filterCategory || product.categorie_id.toString() === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Chargement...</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion du Stock</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            <Settings size={20} />
            Nouvelle Catégorie
          </button>
          <button
            onClick={() => {
              setEditingProduct(null);
              formik.resetForm();
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
            placeholder="Rechercher par référence ou désignation..."
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
          {categories.map((category: Category) => (
            <option key={category.id} value={category.id.toString()}>{category.nom}</option>
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

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Référence</th>
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
              {filteredProducts.map((product: Product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{product.reference}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{product.designation}</div>
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
                    {product.prix_achat.toFixed(2)} DH
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.cout_revient.toFixed(2)} DH
                    <span className="text-xs text-gray-500 ml-1">({product.cout_revient_pourcentage}%)</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.prix_gros.toFixed(2)} DH
                    <span className="text-xs text-gray-500 ml-1">({product.prix_gros_pourcentage}%)</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.prix_vente.toFixed(2)} DH
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
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nouveau/Modifier Produit */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-blue-600 px-6 py-4 rounded-t-lg">
              <h2 className="text-xl font-bold text-white">
                {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
              </h2>
            </div>
            
            <form onSubmit={formik.handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Référence */}
                <div>
                  <label htmlFor="reference" className="block text-sm font-medium text-gray-700 mb-1">
                    Référence *
                  </label>
                  <input
                    id="reference"
                    type="text"
                    name="reference"
                    value={formik.values.reference}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: PROD001"
                  />
                  {formik.touched.reference && formik.errors.reference && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.reference}</p>
                  )}
                </div>

                {/* Désignation */}
                <div>
                  <label htmlFor="designation" className="block text-sm font-medium text-gray-700 mb-1">
                    Désignation *
                  </label>
                  <input
                    id="designation"
                    type="text"
                    name="designation"
                    value={formik.values.designation}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: Ordinateur portable"
                  />
                  {formik.touched.designation && formik.errors.designation && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.designation}</p>
                  )}
                </div>

                {/* Catégorie */}
                <div>
                  <label htmlFor="categorie_id" className="block text-sm font-medium text-gray-700 mb-1">
                    Catégorie *
                  </label>
                  <select
                    id="categorie_id"
                    name="categorie_id"
                    value={formik.values.categorie_id}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Sélectionner une catégorie</option>
                    {categories.map((category: Category) => (
                      <option key={category.id} value={category.id}>{category.nom}</option>
                    ))}
                  </select>
                  {formik.touched.categorie_id && formik.errors.categorie_id && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.categorie_id}</p>
                  )}
                </div>

                {/* Quantité */}
                <div>
                  <label htmlFor="quantite" className="block text-sm font-medium text-gray-700 mb-1">
                    Quantité *
                  </label>
                  <input
                    id="quantite"
                    type="number"
                    name="quantite"
                    value={formik.values.quantite}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    disabled={formik.values.est_service}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder="0"
                  />
                  {formik.touched.quantite && formik.errors.quantite && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.quantite}</p>
                  )}
                </div>

                {/* Prix d'achat */}
                <div className="md:col-span-2">
                  <label htmlFor="prix_achat" className="block text-sm font-medium text-gray-700 mb-1">
                    Prix d'achat (DH) *
                  </label>
                  <input
                    id="prix_achat"
                    type="number"
                    step="0.01"
                    name="prix_achat"
                    value={formik.values.prix_achat}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                  {formik.touched.prix_achat && formik.errors.prix_achat && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.prix_achat}</p>
                  )}
                </div>

                {/* Service Checkbox */}
                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      name="est_service"
                      checked={formik.values.est_service}
                      onChange={formik.handleChange}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Il s'agit d'un service (pas de gestion de stock)
                    </span>
                  </label>
                </div>
              </div>

              {/* Prix calculés dynamiquement */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Calculs automatiques des prix</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Coût de revient */}
                  <div className="space-y-2">
                    <label htmlFor="cout_revient_pourcentage" className="block text-sm font-medium text-gray-700">
                      Coût de revient
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.01"
                        id="cout_revient_pourcentage"
                        name="cout_revient_pourcentage"
                        value={formik.values.cout_revient_pourcentage}
                        onChange={formik.handleChange}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-600">%</span>
                    </div>
                    <div className="text-lg font-medium text-gray-900 bg-white px-2 py-1 rounded border">
                      {dynamicPrices.cout_revient.toFixed(2)} DH
                    </div>
                  </div>

                  {/* Prix gros */}
                  <div className="space-y-2">
                    <label htmlFor="prix_gros_pourcentage" className="block text-sm font-medium text-gray-700">
                      Prix gros
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.01"
                        id="prix_gros_pourcentage"
                        name="prix_gros_pourcentage"
                        value={formik.values.prix_gros_pourcentage}
                        onChange={formik.handleChange}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-600">%</span>
                    </div>
                    <div className="text-lg font-medium text-gray-900 bg-white px-2 py-1 rounded border">
                      {dynamicPrices.prix_gros.toFixed(2)} DH
                    </div>
                  </div>

                  {/* Prix de vente */}
                  <div className="space-y-2">
                    <label htmlFor="prix_vente_pourcentage" className="block text-sm font-medium text-gray-700">
                      Prix de vente
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.01"
                        id="prix_vente_pourcentage"
                        name="prix_vente_pourcentage"
                        value={formik.values.prix_vente_pourcentage}
                        onChange={formik.handleChange}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-600">%</span>
                    </div>
                    <div className="text-lg font-medium text-gray-900 bg-white px-2 py-1 rounded border">
                      {dynamicPrices.prix_vente.toFixed(2)} DH
                    </div>
                  </div>
                </div>
              </div>

              {/* Boutons */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingProduct(null);
                    formik.resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  {editingProduct ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nouvelle Catégorie */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="bg-green-600 px-6 py-4 rounded-t-lg">
              <h2 className="text-xl font-bold text-white">Nouvelle catégorie</h2>
            </div>
            
            <form onSubmit={categoryFormik.handleSubmit} className="p-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="nom" className="block text-sm font-medium text-gray-700 mb-1">
                    Nom de la catégorie *
                  </label>
                  <input
                    id="nom"
                    type="text"
                    name="nom"
                    value={categoryFormik.values.nom}
                    onChange={categoryFormik.handleChange}
                    onBlur={categoryFormik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Ex: Électronique"
                  />
                  {categoryFormik.touched.nom && categoryFormik.errors.nom && (
                    <p className="text-red-500 text-sm mt-1">{categoryFormik.errors.nom}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={categoryFormik.values.description}
                    onChange={categoryFormik.handleChange}
                    onBlur={categoryFormik.handleBlur}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Description de la catégorie..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsCategoryModalOpen(false);
                    categoryFormik.resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockPage;
