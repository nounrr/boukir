import React, { useState, useEffect, useMemo } from 'react';
import type { Product, Category, ProductVariant, ProductUnit } from '../types';
import { useFormik, FieldArray, FormikProvider } from 'formik';
import * as Yup from 'yup';
import { Plus, Trash2, Ruler } from 'lucide-react';
// Switch to backend mutations
import { useCreateProductMutation, useUpdateProductMutation } from '../store/api/productsApi';
import { useGetCategoriesQuery } from '../store/api/categoriesApi';
import { useGetBrandsQuery } from '../store/api/brandsApi';
import { showSuccess } from '../utils/notifications';
import { CategorySelector } from './CategorySelector';

const VARIANT_SUGGESTIONS: Record<string, string[]> = {
  Couleur: ['Rouge', 'Bleu', 'Vert', 'Jaune', 'Noir', 'Blanc', 'Gris', 'Orange', 'Violet', 'Rose', 'Marron', 'Beige', 'Argent', 'Or'],
  Taille: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '36', '38', '40', '42', '44', '46', '48'],
  Poids: ['1kg', '2kg', '5kg', '10kg', '25kg', '50kg', '100g', '250g', '500g'],
  Unité: ['Pièce', 'Boîte', 'Carton', 'Paquet', 'Palette', 'Lot', 'Sac', 'Bidon'],
  Autre: []
};

// Helper to parse numbers with either ',' or '.'
const toNum = (v: any) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Schema de validation (tous champs optionnels, qte >= 0)
const validationSchema = Yup.object({
  designation: Yup.string().optional(),
  categorie_id: Yup.number().optional(),
  brand_id: Yup.number().nullable().optional(),
  quantite: Yup.number().min(0, 'La quantité ne peut pas être négative').optional(),
  kg: Yup.number().min(0, 'Le poids ne peut pas être négatif').optional(),
  prix_achat: Yup.number().min(0, 'Le prix ne peut pas être négatif').optional(),
  cout_revient_pourcentage: Yup.number().min(0, 'Le pourcentage ne peut pas être négatif').optional(),
  prix_gros_pourcentage: Yup.number().min(0, 'Le pourcentage ne peut pas être négatif').optional(),
  prix_vente_pourcentage: Yup.number().min(0, 'Le pourcentage ne peut pas être négatif').optional(),
  est_service: Yup.boolean(),
  ecom_published: Yup.boolean().optional(),
  stock_partage_ecom: Yup.boolean().optional(),
  stock_partage_ecom_qty: Yup.number()
    .optional()
    .test(
      'not-greater-than-quantite',
      'La quantité partagée ne peut pas dépasser la quantité totale',
      function (value) {
        const parent: any = this.parent || {};
        const shouldValidate = !!(parent.stock_partage_ecom || parent.ecom_published);
        if (!shouldValidate) return true; // only enforce when share/publish active
        const qte = !!parent.est_service ? 0 : toNum(parent.quantite);
        const v = Number(value || 0);
        return v <= qte;
      }
    ),
  variants: Yup.array().of(
    Yup.object({
      variant_name: Yup.string().required('Nom requis'),
      variant_type: Yup.string().required('Type requis'),
      reference: Yup.string().optional(),
      prix_achat: Yup.number().min(0).required('Prix achat requis'),
      cout_revient: Yup.number().min(0).optional(),
      cout_revient_pourcentage: Yup.number().min(0).optional(),
      prix_gros: Yup.number().min(0).optional(),
      prix_gros_pourcentage: Yup.number().min(0).optional(),
      prix_vente_pourcentage: Yup.number().min(0).optional(),
      prix_vente: Yup.number().min(0).required('Prix vente requis'),
      stock_quantity: Yup.number().min(0).required('Quantité requise'),
    })
  ).optional(),
  units: Yup.array().of(
    Yup.object({
      unit_name: Yup.string().required('Nom requis'),
      conversion_factor: Yup.number().min(0.0001, 'Facteur > 0').required('Facteur requis'),
      prix_vente: Yup.number().nullable().optional(),
      is_default: Yup.boolean().optional(),
    })
  ).optional(),
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
  const { data: brands = [] } = useGetBrandsQuery();

  const organizedCategories = useMemo(() => {
    const roots = categories.filter(c => !c.parent_id);
    const childrenMap = new Map<number, Category[]>();
    categories.forEach(c => {
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

  const [createProduct] = useCreateProductMutation();
  const [updateProductMutation] = useUpdateProductMutation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Files for technical sheets
  // Long text technical sheets per language (no files)
  const [ficheFr, setFicheFr] = useState<string>('');
  const [ficheAr, setFicheAr] = useState<string>('');
  const [ficheEn, setFicheEn] = useState<string>('');
  const [ficheZh, setFicheZh] = useState<string>('');

  // Active language tab
  const [activeLang, setActiveLang] = useState<'fr' | 'ar' | 'en' | 'zh'>('fr');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleFicheTextChange = (value: string, lang: 'fr' | 'ar' | 'en' | 'zh' = 'fr') => {
    if (lang === 'fr') setFicheFr(value);
    else if (lang === 'ar') setFicheAr(value);
    else if (lang === 'en') setFicheEn(value);
    else if (lang === 'zh') setFicheZh(value);
  };

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
    designation_ar: '',
    designation_en: '',
    designation_zh: '',
    categorie_id: 0,
    categories: [] as number[],
    brand_id: undefined as number | undefined,
    quantite: 0,
    kg: undefined as number | undefined,
    prix_achat: 0,
    cout_revient_pourcentage: 2,
    prix_gros_pourcentage: 10,
    prix_vente_pourcentage: 25,
    est_service: false,
    description: '',
    description_ar: '',
    description_en: '',
    description_zh: '',
    pourcentage_promo: 0,
    ecom_published: false,
    stock_partage_ecom: false,
    stock_partage_ecom_qty: 0,
    variants: [] as ProductVariant[],
    units: [] as ProductUnit[],
    base_unit: 'u',
    created_by: 1, // À adapter selon le système d'authentification
  };

  const formik = useFormik({
    initialValues: editingProduct
      ? {
          ...editingProduct,
          designation_ar: (editingProduct as any).designation_ar || '',
          designation_en: (editingProduct as any).designation_en || '',
          designation_zh: (editingProduct as any).designation_zh || '',
          categorie_id: editingProduct.categorie_id ?? (editingProduct.categorie ? editingProduct.categorie.id : 0),
          categories: (editingProduct as any).categories && (editingProduct as any).categories.length > 0
            ? (editingProduct as any).categories.map((c: any) => c.id)
            : (editingProduct.categorie_id ? [editingProduct.categorie_id] : (editingProduct.categorie ? [editingProduct.categorie.id] : [])),
          brand_id: editingProduct.brand_id ?? (editingProduct.brand ? editingProduct.brand.id : undefined),
          quantite: editingProduct.quantite || 0,
          kg: (editingProduct as any).kg ?? undefined,
          prix_achat: editingProduct.prix_achat || 0,
          cout_revient_pourcentage: editingProduct.cout_revient_pourcentage || 2,
          prix_gros_pourcentage: editingProduct.prix_gros_pourcentage || 10,
          prix_vente_pourcentage: editingProduct.prix_vente_pourcentage || 25,
          est_service: editingProduct.est_service || false,
          description: editingProduct.description || '',
          description_ar: (editingProduct as any).description_ar || '',
          description_en: (editingProduct as any).description_en || '',
          description_zh: (editingProduct as any).description_zh || '',
          pourcentage_promo: editingProduct.pourcentage_promo || 0,
          ecom_published: editingProduct.ecom_published || false,
          stock_partage_ecom: editingProduct.stock_partage_ecom || false,
          stock_partage_ecom_qty: (editingProduct as any).stock_partage_ecom_qty ?? 0,
          variants: editingProduct.variants || [],
          units: editingProduct.units || [],
          base_unit: editingProduct.base_unit || 'u',
        }
      : initialValues,
    enableReinitialize: true,
    validationSchema,
    onSubmit: async (values) => {
      console.log('ProductFormModal submit handler called', { values });
      console.debug('Current formik errors before submit:', formik.errors);
      // Hard guard: prevent submission if shared qty exceeds total (even if button is force-enabled)
      const totalQtyGuard = values.est_service ? 0 : toNum(values.quantite);
      const shareQtyGuard = toNum(values.stock_partage_ecom_qty);
      const mustValidateGuard = !!(values.stock_partage_ecom || values.ecom_published);
      if (mustValidateGuard && shareQtyGuard > totalQtyGuard) {
        formik.setFieldError('stock_partage_ecom_qty', 'La quantité partagée ne peut pas dépasser la quantité totale');
        return;
      }
      const prixAchatNum = toNum(values.prix_achat);
      const kgNum = values.kg !== undefined && values.kg !== null ? toNum(values.kg) : null;
      const crPctNum = toNum(values.cout_revient_pourcentage);
      const pgPctNum = toNum(values.prix_gros_pourcentage);
      const pvPctNum = toNum(values.prix_vente_pourcentage);
      const promoPctNum = toNum(values.pourcentage_promo);
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
        categories: values.categories as any,
        brand_id: values.brand_id ? Number(values.brand_id) : null,
        ecom_published: values.ecom_published,
        stock_partage_ecom: values.stock_partage_ecom,
        stock_partage_ecom_qty: values.stock_partage_ecom_qty ?? 0,
        variants: values.variants,
        units: values.units,
        base_unit: values.base_unit,
      };

      try {
        if (editingProduct) {
          const formData = new FormData();
          formData.append('designation', productData.designation || '');
          formData.append('designation_ar', productData.designation_ar || '');
          formData.append('designation_en', productData.designation_en || '');
          formData.append('designation_zh', productData.designation_zh || '');
          formData.append('categorie_id', String(productData.categorie_id || 0));
          if (productData.categories && productData.categories.length > 0) {
            formData.append('categories', JSON.stringify(productData.categories));
          }
          if (productData.brand_id) formData.append('brand_id', String(productData.brand_id));
          formData.append('quantite', String(qteNum));
          if (kgNum !== null && kgNum !== undefined) formData.append('kg', String(kgNum));
          formData.append('prix_achat', String(prixAchatNum));
          formData.append('cout_revient_pourcentage', String(crPctNum));
          formData.append('prix_gros_pourcentage', String(pgPctNum));
          formData.append('prix_vente_pourcentage', String(pvPctNum));
          formData.append('est_service', productData.est_service ? '1' : '0');
          formData.append('description', productData.description || '');
          formData.append('description_ar', productData.description_ar || '');
          formData.append('description_en', productData.description_en || '');
          formData.append('description_zh', productData.description_zh || '');
          formData.append('pourcentage_promo', String(promoPctNum));
          formData.append('ecom_published', productData.ecom_published ? '1' : '0');
          formData.append('stock_partage_ecom', productData.stock_partage_ecom ? '1' : '0');
          formData.append('stock_partage_ecom_qty', String(productData.stock_partage_ecom_qty ?? 0));
          formData.append('updated_by', '1');
          formData.append('has_variants', String(productData.variants && productData.variants.length > 0));
          formData.append('base_unit', productData.base_unit || 'u');
          
          if (productData.variants && productData.variants.length > 0) {
            formData.append('variants', JSON.stringify(productData.variants));
          }
          if (productData.units && productData.units.length > 0) {
            formData.append('units', JSON.stringify(productData.units));
          }

          if (selectedFile) {
            formData.append('image', selectedFile);
          }
          // Long text fiche fields
          formData.append('fiche_technique', ficheFr || '');
          formData.append('fiche_technique_ar', ficheAr || '');
          formData.append('fiche_technique_en', ficheEn || '');
          formData.append('fiche_technique_zh', ficheZh || '');

          const res = await updateProductMutation({ id: editingProduct.id, data: formData } as any).unwrap();

          showSuccess('Produit mis à jour avec succès !');
          if (onProductUpdated) onProductUpdated(res);
        } else {
          const formData = new FormData();
          formData.append('designation', productData.designation || '');
          formData.append('designation_ar', productData.designation_ar || '');
          formData.append('designation_en', productData.designation_en || '');
          formData.append('designation_zh', productData.designation_zh || '');
          formData.append('categorie_id', String(productData.categorie_id || 0));
          if (productData.categories && productData.categories.length > 0) {
            formData.append('categories', JSON.stringify(productData.categories));
          }
          if (productData.brand_id) formData.append('brand_id', String(productData.brand_id));
          formData.append('quantite', String(qteNum));
          if (kgNum !== null && kgNum !== undefined) formData.append('kg', String(kgNum));
          formData.append('prix_achat', String(prixAchatNum));
          formData.append('cout_revient_pourcentage', String(crPctNum));
          formData.append('prix_gros_pourcentage', String(pgPctNum));
          formData.append('prix_vente_pourcentage', String(pvPctNum));
          formData.append('est_service', productData.est_service ? '1' : '0');
          formData.append('description', productData.description || '');
          formData.append('description_ar', productData.description_ar || '');
          formData.append('description_en', productData.description_en || '');
          formData.append('description_zh', productData.description_zh || '');
          formData.append('pourcentage_promo', String(promoPctNum));
          formData.append('ecom_published', productData.ecom_published ? '1' : '0');
          formData.append('stock_partage_ecom', productData.stock_partage_ecom ? '1' : '0');
          formData.append('stock_partage_ecom_qty', String(productData.stock_partage_ecom_qty ?? 0));
          formData.append('created_by', '1');
          formData.append('has_variants', String(productData.variants && productData.variants.length > 0));
          formData.append('base_unit', productData.base_unit || 'u');
          
          if (productData.variants && productData.variants.length > 0) {
            formData.append('variants', JSON.stringify(productData.variants));
          }
          if (productData.units && productData.units.length > 0) {
            formData.append('units', JSON.stringify(productData.units));
          }

          if (selectedFile) {
            formData.append('image', selectedFile);
          }
          formData.append('fiche_technique', ficheFr || '');
          formData.append('fiche_technique_ar', ficheAr || '');
          formData.append('fiche_technique_en', ficheEn || '');
          formData.append('fiche_technique_zh', ficheZh || '');

          console.debug('Creating product payload (FormData)');
          const res = await createProduct(formData as any).unwrap();
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
              description: res?.description ?? productData.description ?? '',
              pourcentage_promo: res?.pourcentage_promo ?? promoPctNum ?? 0,
              ecom_published: res?.ecom_published ?? productData.ecom_published ?? false,
              stock_partage_ecom: res?.stock_partage_ecom ?? productData.stock_partage_ecom ?? false,
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
      setSelectedFile(null);
      setFicheFr('');
      setFicheAr('');
      setFicheEn('');
      setFicheZh('');
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
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="bg-blue-600 px-6 py-4 rounded-t-lg">
          <h2 className="text-xl font-bold text-white">
            {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
          </h2>
        </div>

        <form onSubmit={formik.handleSubmit} className="p-6">
          {/* Language Tabs */}
          <div className="flex space-x-2 mb-4 border-b pb-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveLang('fr')}
              className={`px-4 py-2 rounded-t-lg font-medium whitespace-nowrap ${
                activeLang === 'fr' ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Français
            </button>
            <button
              type="button"
              onClick={() => setActiveLang('ar')}
              className={`px-4 py-2 rounded-t-lg font-medium whitespace-nowrap ${
                activeLang === 'ar' ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Arabe
            </button>
            <button
              type="button"
              onClick={() => setActiveLang('en')}
              className={`px-4 py-2 rounded-t-lg font-medium whitespace-nowrap ${
                activeLang === 'en' ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setActiveLang('zh')}
              className={`px-4 py-2 rounded-t-lg font-medium whitespace-nowrap ${
                activeLang === 'zh' ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Chinois
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Désignation (Multi-lang) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Désignation ({activeLang.toUpperCase()})
              </label>
              {activeLang === 'fr' && (
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
              )}
              {activeLang === 'ar' && (
                <input
                  id="designation_ar"
                  type="text"
                  name="designation_ar"
                  value={formik.values.designation_ar}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ex: حاسوب محمول"
                  dir="rtl"
                />
              )}
              {activeLang === 'en' && (
                <input
                  id="designation_en"
                  type="text"
                  name="designation_en"
                  value={formik.values.designation_en}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ex: Laptop"
                />
              )}
              {activeLang === 'zh' && (
                <input
                  id="designation_zh"
                  type="text"
                  name="designation_zh"
                  value={formik.values.designation_zh}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ex: 笔记本电脑"
                />
              )}
              {activeLang === 'fr' && formik.touched.designation && formik.errors.designation && (
                <p className="text-red-500 text-sm mt-1">{formik.errors.designation}</p>
              )}
            </div>

            {/* Catégories (Multi-select avec Drag & Drop) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Catégories
              </label>
              <CategorySelector
                selectedIds={formik.values.categories || []}
                categories={organizedCategories}
                onChange={(newIds) => {
                  formik.setFieldValue('categories', newIds);
                  // Also set the primary category to the first selected one for backward compatibility
                  if (newIds.length > 0) {
                    formik.setFieldValue('categorie_id', newIds[0]);
                  } else {
                    formik.setFieldValue('categorie_id', 0);
                  }
                }}
              />
              {formik.touched.categorie_id && formik.errors.categorie_id && (
                <p className="text-red-500 text-sm mt-1">{formik.errors.categorie_id}</p>
              )}
            </div>

            {/* Marque */}
            <div>
              <label htmlFor="brand_id" className="block text-sm font-medium text-gray-700 mb-1">
                Marque
              </label>
              <select
                id="brand_id"
                name="brand_id"
                value={String(formik.values.brand_id ?? '')}
                onChange={(e) => formik.setFieldValue('brand_id', e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Sélectionner une marque</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.nom}
                  </option>
                ))}
              </select>
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
                onChange={(e) => {
                  formik.setFieldValue('quantite', e.target.value);
                  // Revalider la quantité partagée quand la quantité totale change
                  const newTotalQty = toNum(e.target.value);
                  const shareQty = toNum(formik.values.stock_partage_ecom_qty);
                  if ((formik.values.stock_partage_ecom || formik.values.ecom_published) && shareQty > newTotalQty) {
                    formik.setFieldError('stock_partage_ecom_qty', 'La quantité partagée ne peut pas dépasser la quantité totale');
                  } else {
                    formik.setFieldError('stock_partage_ecom_qty', undefined);
                  }
                }}
                onBlur={() => {
                  formik.setFieldValue('quantite', toNum(formik.values.quantite));
                  // Revalider après blur aussi
                  const totalQty = toNum(formik.values.quantite);
                  const shareQty = toNum(formik.values.stock_partage_ecom_qty);
                  if ((formik.values.stock_partage_ecom || formik.values.ecom_published) && shareQty > totalQty) {
                    formik.setFieldError('stock_partage_ecom_qty', 'La quantité partagée ne peut pas dépasser la quantité totale');
                  } else {
                    formik.setFieldError('stock_partage_ecom_qty', undefined);
                  }
                }}
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

            {/* Image du produit */}
            <div>
              <label htmlFor="image" className="block text-sm font-medium text-gray-700 mb-1">
                Image du produit
              </label>
              <input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Fiche technique (Multi-lang, long text) */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fiche technique ({activeLang.toUpperCase()})
              </label>
              {activeLang === 'fr' && (
                <textarea
                  id="fiche_technique"
                  value={ficheFr}
                  onChange={(e) => handleFicheTextChange(e.target.value, 'fr')}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Texte long de la fiche technique (FR)"
                />
              )}
              {activeLang === 'ar' && (
                <textarea
                  id="fiche_technique_ar"
                  value={ficheAr}
                  onChange={(e) => handleFicheTextChange(e.target.value, 'ar')}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="نص البطاقة التقنية (AR)"
                  dir="rtl"
                />
              )}
              {activeLang === 'en' && (
                <textarea
                  id="fiche_technique_en"
                  value={ficheEn}
                  onChange={(e) => handleFicheTextChange(e.target.value, 'en')}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Long text tech sheet (EN)"
                />
              )}
              {activeLang === 'zh' && (
                <textarea
                  id="fiche_technique_zh"
                  value={ficheZh}
                  onChange={(e) => handleFicheTextChange(e.target.value, 'zh')}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="技术资料长文本 (ZH)"
                />
              )}
            </div>

            {/* Description (Multi-lang) */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description ({activeLang.toUpperCase()})
              </label>
              {activeLang === 'fr' && (
                <textarea
                  id="description"
                  name="description"
                  value={formik.values.description}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Description détaillée du produit..."
                />
              )}
              {activeLang === 'ar' && (
                <textarea
                  id="description_ar"
                  name="description_ar"
                  value={formik.values.description_ar}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="وصف مفصل للمنتج..."
                  dir="rtl"
                />
              )}
              {activeLang === 'en' && (
                <textarea
                  id="description_en"
                  name="description_en"
                  value={formik.values.description_en}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Detailed product description..."
                />
              )}
              {activeLang === 'zh' && (
                <textarea
                  id="description_zh"
                  name="description_zh"
                  value={formik.values.description_zh}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="详细产品说明..."
                />
              )}
            </div>

            {/* Pourcentage Promo */}
            <div>
              <label htmlFor="pourcentage_promo" className="block text-sm font-medium text-gray-700 mb-1">
                Pourcentage Promo (%)
              </label>
              <input
                id="pourcentage_promo"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                name="pourcentage_promo"
                value={String(formik.values.pourcentage_promo ?? '')}
                onChange={(e) => formik.setFieldValue('pourcentage_promo', e.target.value)}
                onBlur={() => formik.setFieldValue('pourcentage_promo', toNum(formik.values.pourcentage_promo))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0"
              />
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
            <div className="flex flex-col gap-3 mt-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="est_service"
                  checked={formik.values.est_service}
                  onChange={(e) => {
                    formik.handleChange(e);
                    // Si c'est un service, la quantité devient 0, donc revalider
                    const isService = e.target.checked;
                    const shareQty = toNum(formik.values.stock_partage_ecom_qty);
                    if ((formik.values.stock_partage_ecom || formik.values.ecom_published) && isService && shareQty > 0) {
                      formik.setFieldError('stock_partage_ecom_qty', 'La quantité partagée ne peut pas dépasser la quantité totale');
                    } else if (!isService) {
                      // Revalider avec la quantité actuelle si on décoche service
                      const totalQty = toNum(formik.values.quantite ?? 0);
                      if ((formik.values.stock_partage_ecom || formik.values.ecom_published) && shareQty > totalQty) {
                        formik.setFieldError('stock_partage_ecom_qty', 'La quantité partagée ne peut pas dépasser la quantité totale');
                      } else {
                        formik.setFieldError('stock_partage_ecom_qty', undefined);
                      }
                    }
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Il s'agit d'un service (pas de gestion de stock)
                </span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="ecom_published"
                  checked={formik.values.ecom_published}
                  onChange={(e) => {
                    const checked = e.currentTarget.checked;
                    formik.setFieldValue('ecom_published', checked);
                    // Si publié sur e-com, activer automatiquement le partage et afficher quantité
                    if (checked) {
                      formik.setFieldValue('stock_partage_ecom', true);
                    }
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Publié sur E-com
                </span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="stock_partage_ecom"
                  checked={formik.values.stock_partage_ecom}
                  onChange={formik.handleChange}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Stock partagé avec E-com
                </span>
              </label>
              {(formik.values.stock_partage_ecom || formik.values.ecom_published) && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <label htmlFor="stock_partage_ecom_qty" className="text-sm text-gray-700">
                      Quantité partagée
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      id="stock_partage_ecom_qty"
                      name="stock_partage_ecom_qty"
                      value={String(formik.values.stock_partage_ecom_qty ?? 0)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!/^\d*$/.test(v)) return;
                        const newQty = v ? Number(v) : 0;
                        formik.setFieldValue('stock_partage_ecom_qty', newQty);
                        formik.setFieldTouched('stock_partage_ecom_qty', true, false);
                        
                        // Valider immédiatement et afficher l'erreur
                        const totalQty = formik.values.est_service ? 0 : toNum(formik.values.quantite ?? 0);
                        if (newQty > totalQty) {
                          formik.setFieldError('stock_partage_ecom_qty', 'La quantité partagée ne peut pas dépasser la quantité totale');
                        } else {
                          formik.setFieldError('stock_partage_ecom_qty', undefined);
                        }
                      }}
                      onBlur={() => formik.setFieldTouched('stock_partage_ecom_qty', true)}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-600">
                      / {formik.values.est_service ? 0 : toNum(formik.values.quantite)} disponible
                    </span>
                  </div>
                  {formik.errors.stock_partage_ecom_qty && (
                    <span className="text-xs text-red-600">
                      {String(formik.errors.stock_partage_ecom_qty)}
                    </span>
                  )}
                </div>
              )}
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

          {/* Unités de mesure */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Unités de mesure</h3>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Unité de base:</label>
                <select
                  name="base_unit"
                  value={formik.values.base_unit}
                  onChange={formik.handleChange}
                  className="px-2 py-1 text-sm border rounded"
                >
                  <option value="u">Unité (u)</option>
                  <option value="kg">Kilogramme (kg)</option>
                  <option value="m3">Mètre cube (m3)</option>
                  <option value="l">Litre (l)</option>
                  <option value="m">Mètre (m)</option>
                  <option value="m2">Mètre carré (m2)</option>
                </select>
              </div>
            </div>
            
            <FormikProvider value={formik}>
              <FieldArray
                name="units"
                render={arrayHelpers => (
                  <div className="space-y-4">
                    {formik.values.units && formik.values.units.length > 0 ? (
                      formik.values.units.map((unit, index) => (
                        <div key={index} className="flex gap-4 items-start bg-white p-4 rounded border border-gray-200">
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Nom (ex: Sac 25kg)</label>
                              <input
                                name={`units.${index}.unit_name`}
                                value={unit.unit_name}
                                onChange={formik.handleChange}
                                className="w-full px-2 py-1 text-sm border rounded"
                                placeholder="Nom de l'unité"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Facteur de conversion (1 {unit.unit_name || 'unité'} = {unit.conversion_factor || '...'} {formik.values.base_unit})
                              </label>
                              <input
                                type="number"
                                name={`units.${index}.conversion_factor`}
                                value={unit.conversion_factor}
                                onChange={formik.handleChange}
                                className="w-full px-2 py-1 text-sm border rounded"
                                placeholder="1.0"
                                step="0.0001"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Prix Vente (Optionnel)</label>
                              <input
                                type="number"
                                name={`units.${index}.prix_vente`}
                                value={unit.prix_vente || ''}
                                onChange={formik.handleChange}
                                className="w-full px-2 py-1 text-sm border rounded"
                                placeholder="Calculé auto si vide"
                              />
                            </div>
                            <div className="flex items-center pt-6">
                              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  name={`units.${index}.is_default`}
                                  checked={unit.is_default}
                                  onChange={formik.handleChange}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Par défaut
                              </label>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => arrayHelpers.remove(index)}
                            className="text-red-500 hover:text-red-700 mt-6"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 italic">Aucune unité supplémentaire définie.</p>
                    )}
                    
                    <button
                      type="button"
                      onClick={() => arrayHelpers.push({
                        unit_name: '',
                        conversion_factor: 1,
                        prix_vente: null,
                        is_default: false
                      })}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium mt-2"
                    >
                      <Plus size={16} /> Ajouter une unité
                    </button>
                  </div>
                )}
              />
            </FormikProvider>
          </div>

          {/* Variantes */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Variantes du produit</h3>
            </div>
            
            <FormikProvider value={formik}>
              <FieldArray
                name="variants"
                render={arrayHelpers => (
                  <div className="space-y-4">
                    {formik.values.variants && formik.values.variants.length > 0 ? (
                      formik.values.variants.map((variant, index) => (
                        <div key={index} className="flex flex-col gap-4 bg-white p-4 rounded border border-gray-200 relative">
                          <button
                            type="button"
                            onClick={() => arrayHelpers.remove(index)}
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                            title="Supprimer la variante"
                          >
                            <Trash2 size={18} />
                          </button>

                          {/* Ligne 1: Infos de base */}
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pr-8">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                              <select
                                name={`variants.${index}.variant_type`}
                                value={variant.variant_type || 'Autre'}
                                onChange={formik.handleChange}
                                className="w-full px-2 py-1 text-sm border rounded"
                              >
                                <option value="Couleur">Couleur</option>
                                <option value="Taille">Taille</option>
                                <option value="Poids">Poids</option>
                                <option value="Unité">Unité</option>
                                <option value="Autre">Autre</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Nom (ex: Rouge, XL)</label>
                              <input
                                list={`suggestions-${index}`}
                                name={`variants.${index}.variant_name`}
                                value={variant.variant_name}
                                onChange={formik.handleChange}
                                className="w-full px-2 py-1 text-sm border rounded"
                                placeholder="Nom"
                              />
                              <datalist id={`suggestions-${index}`}>
                                {(VARIANT_SUGGESTIONS[variant.variant_type || 'Autre'] || []).map((s) => (
                                  <option key={s} value={s} />
                                ))}
                              </datalist>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Référence</label>
                              <input
                                name={`variants.${index}.reference`}
                                value={variant.reference || ''}
                                onChange={formik.handleChange}
                                className="w-full px-2 py-1 text-sm border rounded"
                                placeholder="Réf"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Stock</label>
                              <input
                                type="number"
                                name={`variants.${index}.stock_quantity`}
                                value={variant.stock_quantity}
                                onChange={formik.handleChange}
                                className="w-full px-2 py-1 text-sm border rounded"
                                placeholder="0"
                              />
                            </div>
                          </div>

                          {/* Ligne 2: Prix et Calculs */}
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-gray-100">
                            {/* Prix Achat */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-medium text-gray-500">Prix Achat</label>
                                <label className="flex items-center gap-1 cursor-pointer" title="Copier les prix du produit parent">
                                  <input
                                    type="checkbox"
                                    className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    checked={
                                      variant.prix_achat == formik.values.prix_achat && 
                                      variant.prix_vente == dynamicPrices.prix_vente &&
                                      (formik.values.prix_achat !== '' || dynamicPrices.prix_vente !== 0)
                                    }
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        formik.setFieldValue(`variants.${index}.prix_achat`, formik.values.prix_achat);
                                        formik.setFieldValue(`variants.${index}.cout_revient_pourcentage`, formik.values.cout_revient_pourcentage);
                                        formik.setFieldValue(`variants.${index}.cout_revient`, dynamicPrices.cout_revient);
                                        formik.setFieldValue(`variants.${index}.prix_gros_pourcentage`, formik.values.prix_gros_pourcentage);
                                        formik.setFieldValue(`variants.${index}.prix_gros`, dynamicPrices.prix_gros);
                                        formik.setFieldValue(`variants.${index}.prix_vente_pourcentage`, formik.values.prix_vente_pourcentage);
                                        formik.setFieldValue(`variants.${index}.prix_vente`, dynamicPrices.prix_vente);
                                      }
                                    }}
                                  />
                                  <span className="text-[10px] text-blue-600 whitespace-nowrap">Même prix</span>
                                </label>
                              </div>
                              <input
                                type="number"
                                name={`variants.${index}.prix_achat`}
                                value={variant.prix_achat}
                                onChange={(e) => {
                                  formik.handleChange(e);
                                  const pa = Number(e.target.value);
                                  const crp = Number(variant.cout_revient_pourcentage || 0);
                                  const pgp = Number(variant.prix_gros_pourcentage || 0);
                                  const pvp = Number(variant.prix_vente_pourcentage || 0);
                                  formik.setFieldValue(`variants.${index}.cout_revient`, Number((pa * (1 + crp/100)).toFixed(2)));
                                  formik.setFieldValue(`variants.${index}.prix_gros`, Number((pa * (1 + pgp/100)).toFixed(2)));
                                  formik.setFieldValue(`variants.${index}.prix_vente`, Number((pa * (1 + pvp/100)).toFixed(2)));
                                }}
                                className="w-full px-2 py-1 text-sm border rounded"
                                placeholder="0.00"
                              />
                            </div>

                            {/* Coût Revient */}
                            <div className="flex gap-2">
                              <div className="w-1/3">
                                <label className="block text-xs font-medium text-gray-500 mb-1">% Marge</label>
                                <input
                                  type="number"
                                  name={`variants.${index}.cout_revient_pourcentage`}
                                  value={variant.cout_revient_pourcentage}
                                  onChange={(e) => {
                                    formik.handleChange(e);
                                    const pct = Number(e.target.value);
                                    const pa = Number(variant.prix_achat || 0);
                                    formik.setFieldValue(`variants.${index}.cout_revient`, Number((pa * (1 + pct/100)).toFixed(2)));
                                  }}
                                  className="w-full px-2 py-1 text-sm border rounded"
                                  placeholder="%"
                                />
                              </div>
                              <div className="w-2/3">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Coût Revient</label>
                                <input
                                  type="number"
                                  name={`variants.${index}.cout_revient`}
                                  value={variant.cout_revient}
                                  readOnly
                                  className="w-full px-2 py-1 text-sm border rounded bg-gray-50"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>

                            {/* Prix Gros */}
                            <div className="flex gap-2">
                              <div className="w-1/3">
                                <label className="block text-xs font-medium text-gray-500 mb-1">% Gros</label>
                                <input
                                  type="number"
                                  name={`variants.${index}.prix_gros_pourcentage`}
                                  value={variant.prix_gros_pourcentage}
                                  onChange={(e) => {
                                    formik.handleChange(e);
                                    const pct = Number(e.target.value);
                                    const pa = Number(variant.prix_achat || 0);
                                    formik.setFieldValue(`variants.${index}.prix_gros`, Number((pa * (1 + pct/100)).toFixed(2)));
                                  }}
                                  className="w-full px-2 py-1 text-sm border rounded"
                                  placeholder="%"
                                />
                              </div>
                              <div className="w-2/3">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Prix Gros</label>
                                <input
                                  type="number"
                                  name={`variants.${index}.prix_gros`}
                                  value={variant.prix_gros}
                                  readOnly
                                  className="w-full px-2 py-1 text-sm border rounded bg-gray-50"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>

                            {/* Prix Vente */}
                            <div className="flex gap-2">
                              <div className="w-1/3">
                                <label className="block text-xs font-medium text-gray-500 mb-1">% Vente</label>
                                <input
                                  type="number"
                                  name={`variants.${index}.prix_vente_pourcentage`}
                                  value={variant.prix_vente_pourcentage}
                                  onChange={(e) => {
                                    formik.handleChange(e);
                                    const pct = Number(e.target.value);
                                    const pa = Number(variant.prix_achat || 0);
                                    formik.setFieldValue(`variants.${index}.prix_vente`, Number((pa * (1 + pct/100)).toFixed(2)));
                                  }}
                                  className="w-full px-2 py-1 text-sm border rounded"
                                  placeholder="%"
                                />
                              </div>
                              <div className="w-2/3">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Prix Vente</label>
                                <input
                                  type="number"
                                  name={`variants.${index}.prix_vente`}
                                  value={variant.prix_vente}
                                  onChange={(e) => {
                                    formik.handleChange(e);
                                    // Optional: Reverse calculate percentage if price is edited directly
                                    const pv = Number(e.target.value);
                                    const pa = Number(variant.prix_achat || 0);
                                    if (pa > 0) {
                                      const pct = ((pv - pa) / pa) * 100;
                                      formik.setFieldValue(`variants.${index}.prix_vente_pourcentage`, Number(pct.toFixed(2)));
                                    }
                                  }}
                                  className="w-full px-2 py-1 text-sm border rounded"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 italic">Aucune variante ajoutée.</p>
                    )}
                    
                    <button
                      type="button"
                      onClick={() => arrayHelpers.push({
                        variant_name: '',
                        variant_type: 'Couleur',
                        reference: '',
                        prix_achat: 0,
                        cout_revient: 0,
                        cout_revient_pourcentage: 0,
                        prix_gros: 0,
                        prix_gros_pourcentage: 0,
                        prix_vente_pourcentage: 0,
                        prix_vente: 0,
                        stock_quantity: 0
                      })}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium mt-2"
                    >
                      <Plus size={16} /> Ajouter une variante
                    </button>
                  </div>
                )}
              />
            </FormikProvider>
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
              disabled={
                formik.isSubmitting ||
                !!formik.errors.stock_partage_ecom_qty
              }
              className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors"
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
