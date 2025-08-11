import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { X } from 'lucide-react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import type { Product, Category } from '../types';
import { selectCategories } from '../store/slices/categoriesSlice';
import { addProduct, updateProduct } from '../store/slices/productsSlice';
import { showError, showSuccess } from '../utils/notifications';
import { generateProductReference } from '../utils/referenceUtils';

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

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingProduct?: Product | null;
  onProductAdded?: (product: Product) => void;
}

const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  editingProduct = null,
  onProductAdded
}) => {
  const dispatch = useDispatch();
  const categories = useSelector(selectCategories);

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
  reference: editingProduct?.reference || String(editingProduct?.id ?? ''),
      designation: editingProduct?.designation || '',
      categorie_id: editingProduct?.categorie_id || '',
      quantite: editingProduct?.quantite || 0,
      prix_achat: editingProduct?.prix_achat || 0,
      cout_revient: editingProduct?.cout_revient || 0,
      cout_revient_pourcentage: editingProduct?.cout_revient_pourcentage || 0,
      prix_gros: editingProduct?.prix_gros || 0,
      prix_gros_pourcentage: editingProduct?.prix_gros_pourcentage || 0,
      prix_vente: editingProduct?.prix_vente || 0,
      prix_vente_pourcentage: editingProduct?.prix_vente_pourcentage || 0,
      est_service: editingProduct?.est_service || false,
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const prices = calculatePrices(
          values.prix_achat,
          values.cout_revient_pourcentage,
          values.prix_gros_pourcentage,
          values.prix_vente_pourcentage
        );

        const productData = {
          ...values,
          categorie_id: Number(values.categorie_id), // Conversion en nombre
          cout_revient: prices.cout_revient,
          prix_gros: prices.prix_gros,
          prix_vente: prices.prix_vente,
          created_at: editingProduct ? editingProduct.created_at : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (editingProduct) {
          dispatch(updateProduct({ ...productData, id: editingProduct.id }));
          showSuccess('Produit mis à jour avec succès');
        } else {
          const newProduct = {
            ...productData,
            id: Date.now(), // ID temporaire
          };
          dispatch(addProduct(newProduct));
          showSuccess('Produit créé avec succès');
          
          // Callback pour informer le parent
          if (onProductAdded) {
            onProductAdded(newProduct);
          }
        }

        onClose();
      } catch (error) {
        showError('Erreur lors de la sauvegarde du produit');
      }
    },
  });

  // Calcul automatique des prix quand les valeurs changent
  useEffect(() => {
    if (formik.values.prix_achat > 0) {
      const prices = calculatePrices(
        formik.values.prix_achat,
        formik.values.cout_revient_pourcentage,
        formik.values.prix_gros_pourcentage,
        formik.values.prix_vente_pourcentage
      );
      setDynamicPrices(prices);
      
      // Mettre à jour les valeurs Formik
      formik.setFieldValue('cout_revient', prices.cout_revient);
      formik.setFieldValue('prix_gros', prices.prix_gros);
      formik.setFieldValue('prix_vente', prices.prix_vente);
    }
  }, [
    formik.values.prix_achat,
    formik.values.cout_revient_pourcentage,
    formik.values.prix_gros_pourcentage,
    formik.values.prix_vente_pourcentage
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="bg-blue-600 px-6 py-4 rounded-t-lg flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">
            {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300"
          >
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={formik.handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ID (affiché) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ID (auto)
              </label>
              <input
                type="text"
                value={editingProduct ? String(editingProduct.id) : 'Auto'}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
              />
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
                placeholder="Nom du produit"
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
                  <option key={category.id} value={category.id}>
                    {category.nom}
                  </option>
                ))}
              </select>
              {formik.touched.categorie_id && formik.errors.categorie_id && (
                <p className="text-red-500 text-sm mt-1">{formik.errors.categorie_id}</p>
              )}
            </div>

            {/* Est un service */}
            <div className="flex items-center">
              <input
                id="est_service"
                type="checkbox"
                name="est_service"
                checked={formik.values.est_service}
                onChange={formik.handleChange}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="est_service" className="ml-2 block text-sm text-gray-700">
                C'est un service (pas de gestion de stock)
              </label>
            </div>

            {/* Quantité (seulement si ce n'est pas un service) */}
            {!formik.values.est_service && (
              <div>
                <label htmlFor="quantite" className="block text-sm font-medium text-gray-700 mb-1">
                  Quantité en stock *
                </label>
                <input
                  id="quantite"
                  type="number"
                  name="quantite"
                  value={formik.values.quantite}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {formik.touched.quantite && formik.errors.quantite && (
                  <p className="text-red-500 text-sm mt-1">{formik.errors.quantite}</p>
                )}
              </div>
            )}

            {/* Prix d'achat */}
            <div>
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
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {formik.touched.prix_achat && formik.errors.prix_achat && (
                <p className="text-red-500 text-sm mt-1">{formik.errors.prix_achat}</p>
              )}
            </div>
          </div>

          {/* Section Prix calculés */}
          <div className="mt-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Calcul des prix</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Coût de revient */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Coût de revient
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    name="cout_revient_pourcentage"
                    value={formik.values.cout_revient_pourcentage}
                    onChange={formik.handleChange}
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                    placeholder="%"
                  />
                  <span className="text-sm text-gray-500">%</span>
                  <span className="text-sm font-medium text-green-600">
                    = {dynamicPrices.cout_revient.toFixed(2)} DH
                  </span>
                </div>
              </div>

              {/* Prix de gros */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prix de gros
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    name="prix_gros_pourcentage"
                    value={formik.values.prix_gros_pourcentage}
                    onChange={formik.handleChange}
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                    placeholder="%"
                  />
                  <span className="text-sm text-gray-500">%</span>
                  <span className="text-sm font-medium text-blue-600">
                    = {dynamicPrices.prix_gros.toFixed(2)} DH
                  </span>
                </div>
              </div>

              {/* Prix de vente */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prix de vente
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    name="prix_vente_pourcentage"
                    value={formik.values.prix_vente_pourcentage}
                    onChange={formik.handleChange}
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                    placeholder="%"
                  />
                  <span className="text-sm text-gray-500">%</span>
                  <span className="text-sm font-medium text-purple-600">
                    = {dynamicPrices.prix_vente.toFixed(2)} DH
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Boutons */}
          <div className="flex justify-end space-x-4 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={formik.isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {formik.isSubmitting ? 'En cours...' : (editingProduct ? 'Modifier' : 'Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductModal;
