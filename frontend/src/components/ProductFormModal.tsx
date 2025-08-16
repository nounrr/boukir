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

  // Helper to parse numbers with either ',' or '.'
  const toNum = (v: any) =>
    typeof v === 'string' ? (parseFloat(String(v).replace(',', '.')) || 0) : (Number(v) || 0);

  // Helpers spécifiques à la saisie
  const normalizeDecimal = (s: string) => s.replace(/\s+/g, '').replace(',', '.');
  const isDecimalLike = (s: string) => /^[0-9]*[.,]?[0-9]*$/.test(s);

  // États pour les calculs dynamiques
  const [dynamicPrices, setDynamicPrices] = useState({
    cout_revient: 0,
    prix_gros: 0,
    prix_vente: 0,
  });

  // Valeurs brutes tapées par l'utilisateur pour ne pas casser la saisie de "." ou ","
  const [priceRaw, setPriceRaw] = useState({
    cout_revient: '',
    prix_gros: '',
    prix_vente: '',
  });

  const calculatePrices = (prixAchat: number, coutPct: number, grosPct: number, ventePct: number) => {
    const round2 = (v: number) => Number(parseFloat((v || 0).toFixed(2)));
    return {
      cout_revient: round2(prixAchat * (1 + (coutPct || 0) / 100)),
      prix_gros: round2(prixAchat * (1 + (grosPct || 0) / 100)),
      prix_vente: round2(prixAchat * (1 + (ventePct || 0) / 100)),
    };
  };

  // Format number: round to 2 decimals but remove unnecessary trailing zeros (e.g. 12.00 -> "12")
  const formatNumber = (n: number) => {
    if (!isFinite(n)) return '0';
    return String(parseFloat((n || 0).toFixed(2)));
  };

  const initialValues = {
    designation: '',
    categorie_id: 0,
    quantite: 0,
    kg: undefined as number | undefined,
    prix_achat: 0,
    cout_revient_pourcentage: 2,
    prix_gros_pourcentage: 10,
    prix_vente_pourcentage: 25,
    est_service: false,
    created_by: 1, // À adapter selon le système d'authentification
  };

  const formik = useFormik({
    initialValues: editingProduct
      ? {
          ...editingProduct,
          categorie_id: editingProduct.categorie_id ?? (editingProduct.categorie ? editingProduct.categorie.id : 0),
          quantite: editingProduct.quantite || 0,
          kg: (editingProduct as any).kg ?? undefined,
          prix_achat: editingProduct.prix_achat || 0,
          cout_revient_pourcentage: editingProduct.cout_revient_pourcentage || 2,
          prix_gros_pourcentage: editingProduct.prix_gros_pourcentage || 10,
          prix_vente_pourcentage: editingProduct.prix_vente_pourcentage || 25,
          est_service: editingProduct.est_service || false,
        }
      : initialValues,
    enableReinitialize: true,
    validationSchema,
    onSubmit: async (values) => {
      console.log('ProductFormModal submit handler called', { values });
      console.debug('Current formik errors before submit:', formik.errors);
      const prixAchatNum = toNum(values.prix_achat);
      const kgNum = values.kg !== undefined && values.kg !== null ? toNum(values.kg) : null;
      const crPctNum = toNum(values.cout_revient_pourcentage);
      const pgPctNum = toNum(values.prix_gros_pourcentage);
      const pvPctNum = toNum(values.prix_vente_pourcentage);
      const qteNum = values.est_service ? 0 : toNum(values.quantite);

      const computed = calculatePrices(prixAchatNum, crPctNum, pgPctNum, pvPctNum);

      const productData: Partial<Product> = {
        ...values,
        prix_achat: prixAchatNum,
        kg: kgNum as any,
        cout_revient: computed.cout_revient,
        prix_gros: computed.prix_gros,
        prix_vente: computed.prix_vente,
        cout_revient_pourcentage: crPctNum,
        prix_gros_pourcentage: pgPctNum,
        prix_vente_pourcentage: pvPctNum,
        quantite: qteNum,
        categorie_id: Number(values.categorie_id || 0),
      };

      try {
        if (editingProduct) {
          const payload = { id: editingProduct.id, updated_by: 1, ...productData } as Partial<Product> & {
            id: number;
            updated_by: number;
          };
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
          if (onProductAdded) {
            const created: any = {
              ...res,
              designation: res?.designation ?? productData.designation ?? '',
              categorie_id: res?.categorie_id ?? productData.categorie_id ?? 0,
              quantite: res?.quantite ?? qteNum ?? 0,
              kg: res?.kg ?? (kgNum ?? 0),
              prix_achat: res?.prix_achat ?? prixAchatNum ?? 0,
              cout_revient: res?.cout_revient ?? computed.cout_revient ?? 0,
              prix_gros: res?.prix_gros ?? computed.prix_gros ?? 0,
              prix_vente: res?.prix_vente ?? computed.prix_vente ?? 0,
              reference: res?.reference ?? String(res?.id ?? ''),
            };
            onProductAdded(created);
          }
        }
      } catch (err: any) {
        console.error('Product save failed', err);
        alert(err?.data?.message || err?.message || "Erreur lors de l'enregistrement du produit");
        return;
      }

      onClose();
      formik.resetForm();
    },
  });

  // Recalculer et synchroniser l'affichage dès que les pourcentages ou le prix d'achat changent
  useEffect(() => {
    const prices = calculatePrices(
      toNum(formik.values.prix_achat),
      toNum(formik.values.cout_revient_pourcentage),
      toNum(formik.values.prix_gros_pourcentage),
      toNum(formik.values.prix_vente_pourcentage)
    );
    setDynamicPrices(prices);
  }, [
    formik.values.prix_achat,
    formik.values.cout_revient_pourcentage,
    formik.values.prix_gros_pourcentage,
    formik.values.prix_vente_pourcentage,
  ]);

  // Quand les valeurs calculées changent, on met à jour l'affichage brut (sans casser la saisie)
  useEffect(() => {
    setPriceRaw({
      cout_revient: formatNumber(dynamicPrices.cout_revient),
      prix_gros: formatNumber(dynamicPrices.prix_gros),
      prix_vente: formatNumber(dynamicPrices.prix_vente),
    });
  }, [dynamicPrices.cout_revient, dynamicPrices.prix_gros, dynamicPrices.prix_vente]);

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
                  <option key={category.id} value={String(category.id)}>
                    {category.nom}
                  </option>
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
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                name="quantite"
                value={String(formik.values.quantite ?? '')}
                onChange={(e) => formik.setFieldValue('quantite', e.target.value)}
                onBlur={() => formik.setFieldValue('quantite', toNum(formik.values.quantite))}
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
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                name="kg"
                value={String(formik.values.kg ?? '')}
                onChange={(e) => formik.setFieldValue('kg', e.target.value)}
                onBlur={() =>
                  formik.setFieldValue(
                    'kg',
                    formik.values.kg === '' || formik.values.kg == null ? '' : toNum(formik.values.kg)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ex: 1.5"
              />
              {formik.touched.kg && formik.errors.kg && (
                <p className="text-red-500 text-sm mt-1">
                  {typeof formik.errors.kg === 'string' ? formik.errors.kg : 'Valeur invalide'}
                </p>
              )}
            </div>

            {/* Prix d'achat (optionnel) */}
            <div className="">
              <label htmlFor="prix_achat" className="block text-sm font-medium text-gray-700 mb-1">
                Prix d'achat (DH)
              </label>
              <input
                id="prix_achat"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                name="prix_achat"
                value={String(formik.values.prix_achat ?? '')}
                onChange={(e) => formik.setFieldValue('prix_achat', e.target.value)}
                onBlur={() => formik.setFieldValue('prix_achat', toNum(formik.values.prix_achat))}
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
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    id="cout_revient_pourcentage"
                    name="cout_revient_pourcentage"
                    value={String(formik.values.cout_revient_pourcentage ?? '')}
                    onChange={(e) => formik.setFieldValue('cout_revient_pourcentage', e.target.value)}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
                <div className="text-lg font-medium text-gray-900 bg-white px-2 py-1 rounded border">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceRaw.cout_revient}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!isDecimalLike(v)) return;
                      setPriceRaw((prev) => ({ ...prev, cout_revient: v }));
                    }}
                    onBlur={() => {
                      const val = parseFloat(normalizeDecimal(priceRaw.cout_revient)) || 0;
                      const prixA = toNum(formik.values.prix_achat) || 0;
                      if (prixA > 0) {
                        const pct = (val / prixA - 1) * 100;
                        formik.setFieldValue('cout_revient_pourcentage', Number(pct.toFixed(4)));
                      }
                      setDynamicPrices((prev) => ({ ...prev, cout_revient: val }));
                      setPriceRaw((prev) => ({ ...prev, cout_revient: formatNumber(val) }));
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
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    id="prix_gros_pourcentage"
                    name="prix_gros_pourcentage"
                    value={String(formik.values.prix_gros_pourcentage ?? '')}
                    onChange={(e) => formik.setFieldValue('prix_gros_pourcentage', e.target.value)}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
                <div className="text-lg font-medium text-gray-900 bg-white px-2 py-1 rounded border">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceRaw.prix_gros}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!isDecimalLike(v)) return;
                      setPriceRaw((prev) => ({ ...prev, prix_gros: v }));
                    }}
                    onBlur={() => {
                      const val = parseFloat(normalizeDecimal(priceRaw.prix_gros)) || 0;
                      const prixA = toNum(formik.values.prix_achat) || 0;
                      if (prixA > 0) {
                        const pct = (val / prixA - 1) * 100;
                        formik.setFieldValue('prix_gros_pourcentage', Number(pct.toFixed(4)));
                      }
                      setDynamicPrices((prev) => ({ ...prev, prix_gros: val }));
                      setPriceRaw((prev) => ({ ...prev, prix_gros: formatNumber(val) }));
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
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    id="prix_vente_pourcentage"
                    name="prix_vente_pourcentage"
                    value={String(formik.values.prix_vente_pourcentage ?? '')}
                    onChange={(e) => formik.setFieldValue('prix_vente_pourcentage', e.target.value)}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
                <div className="text-lg font-medium text-gray-900 bg-white px-2 py-1 rounded border">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceRaw.prix_vente}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!isDecimalLike(v)) return;
                      setPriceRaw((prev) => ({ ...prev, prix_vente: v }));
                    }}
                    onBlur={() => {
                      const val = parseFloat(normalizeDecimal(priceRaw.prix_vente)) || 0;
                      const prixA = toNum(formik.values.prix_achat) || 0;
                      if (prixA > 0) {
                        const pct = (val / prixA - 1) * 100;
                        formik.setFieldValue('prix_vente_pourcentage', Number(pct.toFixed(4)));
                      }
                      setDynamicPrices((prev) => ({ ...prev, prix_vente: val }));
                      setPriceRaw((prev) => ({ ...prev, prix_vente: formatNumber(val) }));
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
