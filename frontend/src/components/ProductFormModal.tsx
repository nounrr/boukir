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
  kg: Yup.number().min(0, 'Le poids ne peut pas être négatif').optional(),
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
    const round2 = (v: number) => Number(parseFloat((v || 0).toFixed(2)));
    return {
      cout_revient: round2(prixAchat * (1 + coutPct / 100)),
      prix_gros: round2(prixAchat * (1 + grosPct / 100)),
      prix_vente: round2(prixAchat * (1 + ventePct / 100)),
    };
  };

  // Format number: round to 2 decimals but remove unnecessary trailing zeros (e.g. 12.00 -> "12")
  const formatNumber = (n: number) => {
    // Ensure finite number
    if (!isFinite(n)) return '0';
    // Round to 2 decimals then remove trailing zeros
    // parseFloat('12.00') -> 12
    return String(parseFloat(n.toFixed(2)));
  };

  const initialValues = {
    designation: '',
    categorie_id: 0,
    quantite: 0,
    kg: undefined,
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
      categorie_id: (editingProduct.categorie_id !== undefined && editingProduct.categorie_id !== null)
        ? editingProduct.categorie_id
        : (editingProduct.categorie ? editingProduct.categorie.id : 0),
      quantite: editingProduct.quantite || 0,
      kg: (editingProduct as any).kg ?? undefined,
      prix_achat: editingProduct.prix_achat || 0,
      cout_revient_pourcentage: editingProduct.cout_revient_pourcentage || 2,
      prix_gros_pourcentage: editingProduct.prix_gros_pourcentage || 10,
      prix_vente_pourcentage: editingProduct.prix_vente_pourcentage || 25,
      est_service: editingProduct.est_service || false,
    } : initialValues,
  enableReinitialize: true,
    validationSchema,
  onSubmit: async (values) => {
    console.log('ProductFormModal submit handler called', { values });
    console.debug('Current formik errors before submit:', formik.errors);
    const productData: Partial<Product> = {
        ...values,
  prix_achat: Number(values.prix_achat ?? 0),
  kg: values.kg !== undefined && values.kg !== null ? Number(values.kg) : null,
        cout_revient: dynamicPrices.cout_revient,
        prix_gros: dynamicPrices.prix_gros,
        prix_vente: dynamicPrices.prix_vente,
        cout_revient_pourcentage: Number(values.cout_revient_pourcentage ?? 0),
        prix_gros_pourcentage: Number(values.prix_gros_pourcentage ?? 0),
        prix_vente_pourcentage: Number(values.prix_vente_pourcentage ?? 0),
        quantite: values.est_service ? 0 : Number(values.quantite ?? 0),
        categorie_id: Number(values.categorie_id || 0),
      };

      try {
        if (editingProduct) {
          const payload = { id: editingProduct.id, updated_by: 1, ...productData } as Partial<Product> & { id: number; updated_by: number };
          console.debug('Updating product payload:', payload);
          const res = await updateProductMutation(payload).unwrap();
          showSuccess('Produit mis à jour avec succès !');
          if (onProductUpdated) onProductUpdated(res);
        } else {
          const payload = {
            designation: productData.designation || undefined,
            categorie_id: productData.categorie_id ?? undefined,
            quantite: productData.quantite ?? undefined,
            kg: productData.kg ?? undefined,
            prix_achat: productData.prix_achat ?? undefined,
            cout_revient_pourcentage: productData.cout_revient_pourcentage ?? undefined,
            prix_gros_pourcentage: productData.prix_gros_pourcentage ?? undefined,
            prix_vente_pourcentage: productData.prix_vente_pourcentage ?? undefined,
            est_service: !!productData.est_service,
            created_by: 1,
          } as any;
          console.debug('Creating product payload:', payload);
          const res = await createProduct(payload).unwrap();
          showSuccess('Produit ajouté avec succès !');
          if (onProductAdded) onProductAdded(res);
        }
      } catch (err: any) {
        console.error('Product save failed', err);
        // Provide a visible feedback; keep simple alert so user sees the error
        alert(err?.data?.message || err?.message || 'Erreur lors de l\u0027enregistrement du produit');
        return; // don't close modal on error
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
                value={String(formik.values.categorie_id ?? 0)}
                onChange={(e) => formik.setFieldValue('categorie_id', Number(e.target.value))}
                onBlur={formik.handleBlur}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={String(0)}>Sélectionner une catégorie</option>
                {categories.map((category: Category) => (
                  <option key={category.id} value={String(category.id)}>{category.nom}</option>
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

      {/* Poids (kg) - optionnel */}
            <div>
              <label htmlFor="kg" className="block text-sm font-medium text-gray-700 mb-1">
        Poids (kg) - optionnel
              </label>
              <input
                id="kg"
                type="number"
                step="0.01"
                name="kg"
                value={formik.values.kg ?? ''}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ex: 1.5"
              />
              {formik.touched.kg && formik.errors.kg && (
                <p className="text-red-500 text-sm mt-1">{String(formik.errors.kg)}</p>
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
                  <input
                    type="number"
                    step="0.01"
                    value={formatNumber(Number(dynamicPrices.cout_revient))}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value || '0') || 0;
                      // compute percentage relative to prix_achat
                      const prixA = Number(formik.values.prix_achat) || 0;
                      if (prixA > 0) {
                        const pct = (val / prixA - 1) * 100;
                        formik.setFieldValue('cout_revient_pourcentage', Number(pct.toFixed(4)));
                      }
                      setDynamicPrices(prev => ({ ...prev, cout_revient: val }));
                    }}
                    className="w-full text-right bg-transparent border-0 focus:outline-none"
                  />
                  <div className="text-xs text-gray-500">DH</div>
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
                  <input
                    type="number"
                    step="0.01"
                    value={formatNumber(Number(dynamicPrices.prix_gros))}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value || '0') || 0;
                      const prixA = Number(formik.values.prix_achat) || 0;
                      if (prixA > 0) {
                        const pct = (val / prixA - 1) * 100;
                        formik.setFieldValue('prix_gros_pourcentage', Number(pct.toFixed(4)));
                      }
                      setDynamicPrices(prev => ({ ...prev, prix_gros: val }));
                    }}
                    className="w-full text-right bg-transparent border-0 focus:outline-none"
                  />
                  <div className="text-xs text-gray-500">DH</div>
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
                  <input
                    type="number"
                    step="0.01"
                    value={formatNumber(Number(dynamicPrices.prix_vente))}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value || '0') || 0;
                      const prixA = Number(formik.values.prix_achat) || 0;
                      if (prixA > 0) {
                        const pct = (val / prixA - 1) * 100;
                        formik.setFieldValue('prix_vente_pourcentage', Number(pct.toFixed(4)));
                      }
                      setDynamicPrices(prev => ({ ...prev, prix_vente: val }));
                    }}
                    className="w-full text-right bg-transparent border-0 focus:outline-none"
                  />
                  <div className="text-xs text-gray-500">DH</div>
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
