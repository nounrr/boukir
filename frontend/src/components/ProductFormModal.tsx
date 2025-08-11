import React, { useState, useEffect } from 'react';
import type { Product, Category } from '../types';
import { useFormik } from 'formik';
import * as Yup from 'yup';
// Switch to backend mutations
import { useCreateProductMutation, useUpdateProductMutation } from '../store/api/productsApi';
import { useGetCategoriesQuery } from '../store/api/categoriesApi';
import { showSuccess } from '../utils/notifications';

// Schema de validation (tous champs optionnels, qte >= 0)
const validationSchema = Yup.object({
  designation: Yup.string().optional(),
  categorie_id: Yup.number().optional(),
  quantite: Yup.number().min(0, 'La quantité ne peut pas être négative').optional(),
  prix_achat: Yup.number().min(0, 'Le prix ne peut pas être négatif').optional(),
  cout_revient_pourcentage: Yup.number().min(0, 'Le pourcentage ne peut pas être négatif').optional(),
  prix_gros_pourcentage: Yup.number().min(0, 'Le pourcentage ne peut pas être négatif').optional(),
  prix_vente_pourcentage: Yup.number().min(0, 'Le pourcentage ne peut pas être négatif').optional(),
  est_service: Yup.boolean(),
});

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductAdded?: (product: Product) => void;
  onProductUpdated?: (product: Product) => void;
  editingProduct?: Product | null;
}

const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onProductAdded,
  onProductUpdated,
  editingProduct = null,
}) => {
  const { data: categories = [] } = useGetCategoriesQuery();
  const [createProduct] = useCreateProductMutation();
  const [updateProductMutation] = useUpdateProductMutation();

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

  const initialValues = {
    designation: '',
    categorie_id: 0,
    quantite: 0,
    prix_achat: 0,
    cout_revient_pourcentage: 2,
    prix_gros_pourcentage: 10,
    prix_vente_pourcentage: 25,
    est_service: false,
    created_by: 1, // À adapter selon le système d'authentification
  };

  const formik = useFormik({
    initialValues: editingProduct ? {
      ...editingProduct,
      categorie_id: editingProduct.categorie_id || 0,
      quantite: editingProduct.quantite || 0,
      prix_achat: editingProduct.prix_achat || 0,
      cout_revient_pourcentage: editingProduct.cout_revient_pourcentage || 2,
      prix_gros_pourcentage: editingProduct.prix_gros_pourcentage || 10,
      prix_vente_pourcentage: editingProduct.prix_vente_pourcentage || 25,
      est_service: editingProduct.est_service || false,
    } : initialValues,
  enableReinitialize: true,
    validationSchema,
    onSubmit: async (values) => {
  const productData: Partial<Product> = {
        ...values,
        prix_achat: Number(values.prix_achat ?? 0),
        cout_revient: dynamicPrices.cout_revient,
        prix_gros: dynamicPrices.prix_gros,
        prix_vente: dynamicPrices.prix_vente,
        cout_revient_pourcentage: Number(values.cout_revient_pourcentage ?? 0),
        prix_gros_pourcentage: Number(values.prix_gros_pourcentage ?? 0),
        prix_vente_pourcentage: Number(values.prix_vente_pourcentage ?? 0),
        quantite: values.est_service ? 0 : Number(values.quantite ?? 0),
        categorie_id: Number(values.categorie_id || 0),
      };

      if (editingProduct) {
        const payload = { id: editingProduct.id, updated_by: 1, ...productData } as Partial<Product> & { id: number; updated_by: number };
        const res = await updateProductMutation(payload).unwrap();
        showSuccess('Produit mis à jour avec succès !');
        if (onProductUpdated) onProductUpdated(res);
  } else {
        const res = await createProduct({
          designation: productData.designation || undefined,
          categorie_id: productData.categorie_id ?? undefined,
          quantite: productData.quantite ?? undefined,
          prix_achat: productData.prix_achat ?? undefined,
          cout_revient_pourcentage: productData.cout_revient_pourcentage ?? undefined,
          prix_gros_pourcentage: productData.prix_gros_pourcentage ?? undefined,
          prix_vente_pourcentage: productData.prix_vente_pourcentage ?? undefined,
          est_service: !!productData.est_service,
          created_by: 1,
        } as any).unwrap();
        showSuccess('Produit ajouté avec succès !');
        if (onProductAdded) onProductAdded(res);
      }

      onClose();
      formik.resetForm();
    },
  });

  // Mettre à jour les prix calculés lorsque les pourcentages ou le prix d'achat changent
  useEffect(() => {
    const prices = calculatePrices(
      Number(formik.values.prix_achat),
      Number(formik.values.cout_revient_pourcentage),
      Number(formik.values.prix_gros_pourcentage),
      Number(formik.values.prix_vente_pourcentage)
    );
    setDynamicPrices(prices);
  }, [
    formik.values.prix_achat,
    formik.values.cout_revient_pourcentage,
    formik.values.prix_gros_pourcentage,
    formik.values.prix_vente_pourcentage,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="bg-blue-600 px-6 py-4 rounded-t-lg">
          <h2 className="text-xl font-bold text-white">
            {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
          </h2>
        </div>
        
        <form onSubmit={formik.handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Désignation (optionnelle) */}
            <div>
              <label htmlFor="designation" className="block text-sm font-medium text-gray-700 mb-1">
        Désignation
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

      {/* Catégorie (optionnelle, défaut backend) */}
            <div>
              <label htmlFor="categorie_id" className="block text-sm font-medium text-gray-700 mb-1">
        Catégorie
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

      {/* Quantité (peut être 0) */}
            <div>
              <label htmlFor="quantite" className="block text-sm font-medium text-gray-700 mb-1">
        Quantité
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

      {/* Prix d'achat (optionnel) */}
            <div className="">
              <label htmlFor="prix_achat" className="block text-sm font-medium text-gray-700 mb-1">
        Prix d'achat (DH)
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
                onClose();
                formik.resetForm();
              }}
              className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              {editingProduct ? 'Mettre à jour' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductFormModal;
