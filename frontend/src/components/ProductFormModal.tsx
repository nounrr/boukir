import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import type { Product, ProductVariant, ProductUnit } from '../types';
import { useFormik, FieldArray, FormikProvider } from 'formik';
import * as Yup from 'yup';
import { Plus, Trash2, X, Save, ChevronDown, ChevronRight, Package } from 'lucide-react';
// Switch to backend mutations
import { useCreateProductMutation, useUpdateProductMutation, useGetProductQuery, useUpdateSnapshotsMutation } from '../store/api/productsApi';
import { useGetCategoriesQuery } from '../store/api/categoriesApi';
import { useGetBrandsQuery } from '../store/api/brandsApi';
import { showSuccess } from '../utils/notifications';
import { toBackendUrl } from '../utils/url';
import { CategoryTreeSelect } from './CategoryTreeSelect';

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

const asStringError = (err: unknown): string | null => {
  return typeof err === 'string' ? err : null;
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
      variant_name_ar: Yup.string().nullable().optional(),
      variant_name_en: Yup.string().nullable().optional(),
      variant_name_zh: Yup.string().nullable().optional(),
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
      prix_vente: Yup.number()
        .nullable()
        .transform((val, originalVal) => (originalVal === '' || originalVal === null || originalVal === undefined ? null : val))
        .min(0, 'Prix vente >= 0')
        .optional(),
      facteur_isNormal: Yup.number().oneOf([0, 1]).optional(),
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
  // When editing, fetch full product to include variant galleries
  const { data: fullProduct } = useGetProductQuery((editingProduct as any)?.id as number, {
    skip: !editingProduct?.id,
  });
  const authToken = useSelector((s: RootState) => (s as any)?.auth?.token);

  const [createProduct] = useCreateProductMutation();
  const [updateProductMutation] = useUpdateProductMutation();
  const [updateSnapshots] = useUpdateSnapshotsMutation();

  // Editable snapshot state: keyed by snapshot id
  const [snapshotEdits, setSnapshotEdits] = useState<Record<number, any>>({});
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<number>>(new Set());
  const [savingSnapshots, setSavingSnapshots] = useState(false);

  const toggleSnapshotExpanded = (id: number) => {
    setExpandedSnapshots(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getSnapshotEditValue = (snap: any, field: string) => {
    const edit = snapshotEdits[snap.id];
    if (edit && edit[field] !== undefined) return edit[field];
    return snap[field] ?? '';
  };

  const setSnapshotEditField = (snapId: number, field: string, value: string) => {
    setSnapshotEdits(prev => ({
      ...prev,
      [snapId]: { ...(prev[snapId] || {}), [field]: value }
    }));
  };

  const hasSnapshotChanges = Object.keys(snapshotEdits).length > 0;

  const handleSaveSnapshots = async () => {
    const entries = Object.entries(snapshotEdits);
    if (entries.length === 0) return;
    setSavingSnapshots(true);
    try {
      const snapshots = entries.map(([idStr, edits]) => {
        const obj: any = { id: Number(idStr) };
        for (const [k, v] of Object.entries(edits as Record<string, string>)) {
          obj[k] = v === '' ? 0 : Number(String(v).replace(',', '.')) || 0;
        }
        return obj;
      });
      await updateSnapshots({ snapshots }).unwrap();
      showSuccess(`${snapshots.length} snapshot(s) mis à jour`);
      setSnapshotEdits({});
    } catch (e) {
      console.error('Snapshot save failed', e);
      alert('Erreur lors de la mise à jour des snapshots');
    } finally {
      setSavingSnapshots(false);
    }
  };
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [deletedGalleryIds, setDeletedGalleryIds] = useState<number[]>([]);
  const [variantMainImages, setVariantMainImages] = useState<Record<number, File>>({});
  const [variantGalleryFilesMap, setVariantGalleryFilesMap] = useState<Record<number, File[]>>({});
  const [variantDeletedGalleryIdsMap, setVariantDeletedGalleryIdsMap] = useState<Record<number, number[]>>({});
  const [variantUseProductRemise, setVariantUseProductRemise] = useState<Record<number, boolean>>({});
  
  // Files for technical sheets
  // Long text technical sheets per language (no files)
  const [ficheFr, setFicheFr] = useState<string>('');
  const [ficheAr, setFicheAr] = useState<string>('');
  const [ficheEn, setFicheEn] = useState<string>('');
  const [ficheZh, setFicheZh] = useState<string>('');

  // Active language tab
  const [activeLang, setActiveLang] = useState<'fr' | 'ar' | 'en' | 'zh'>('fr');

  // Désactiver le scroll de la souris sur les inputs number
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
        e.preventDefault();
      }
    };
    
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleGalleryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length) {
      setGalleryFiles((prev) => [...prev, ...files]);
    }
  };

  const removeNewGalleryFile = (index: number) => {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleDeleteExistingGallery = (id: number) => {
    setDeletedGalleryIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  // Variant media handlers (for existing variants only)
  const onVariantMainImageChange = (variantId: number | undefined, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!variantId) return;
    const file = e.target.files?.[0];
    if (file) setVariantMainImages((prev) => ({ ...prev, [variantId]: file }));
  };
  const onVariantGalleryChange = (variantId: number | undefined, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!variantId) return;
    const files = Array.from(e.target.files || []);
    if (files.length) setVariantGalleryFilesMap((prev) => ({ ...prev, [variantId]: [...(prev[variantId] || []), ...files] }));
  };
  const removeNewVariantGalleryFile = (variantId: number, index: number) => {
    setVariantGalleryFilesMap((prev) => ({ ...prev, [variantId]: (prev[variantId] || []).filter((_, i) => i !== index) }));
  };
  const toggleDeleteExistingVariantGallery = (variantId: number, imageId: number) => {
    setVariantDeletedGalleryIdsMap((prev) => {
      const cur = prev[variantId] || [];
      return { ...prev, [variantId]: cur.includes(imageId) ? cur.filter((x) => x !== imageId) : [...cur, imageId] };
    });
  };

  const uploadVariantMedia = async (productId: number, variants: ProductVariant[]) => {
    for (const v of variants) {
      if (!v.id) continue;
      // main image
      if (variantMainImages[v.id]) {
        const fd = new FormData();
        fd.append('image', variantMainImages[v.id]);
        await fetch(`/api/products/${productId}/variants/${v.id}/image`, {
          method: 'POST',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          body: fd,
        });
      }
      // gallery
      const galleryFiles = variantGalleryFilesMap[v.id] || [];
      const deletedIds = variantDeletedGalleryIdsMap[v.id] || [];
      if (galleryFiles.length > 0 || deletedIds.length > 0) {
        const fdG = new FormData();
        for (const f of galleryFiles) fdG.append('gallery', f);
        if (deletedIds.length > 0) fdG.append('deleted_gallery_ids', JSON.stringify(deletedIds));
        await fetch(`/api/products/${productId}/variants/${v.id}/gallery`, {
          method: 'PUT',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          body: fdG,
        });
      }
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
    brand_id: undefined as number | undefined,
    quantite: 0,
    kg: undefined as number | undefined,
    prix_achat: 0,
    cout_revient_pourcentage: 2,
    prix_gros_pourcentage: 10,
    prix_vente_pourcentage: 25,
    est_service: false,
    remise_client: 0,
    remise_artisan: 0,
    description: '',
    description_ar: '',
    description_en: '',
    description_zh: '',
    pourcentage_promo: 0,
    ecom_published: false,
    stock_partage_ecom: false,
    stock_partage_ecom_qty: 0,
    isObligatoireVariant: false,
    variants: [] as ProductVariant[],
    units: [] as ProductUnit[],
    base_unit: 'u',
    categorie_base: 'Maison' as any,
    created_by: 1, // À adapter selon le système d'authentification
  };

  const baseEdit = editingProduct ? { ...(editingProduct as any), ...((fullProduct as any) || {}) } : null;
  const productSnapshotRows = (baseEdit as any)?.snapshot_rows || null;
  const formik = useFormik({
    initialValues: baseEdit
      ? {
          ...baseEdit,
          designation_ar: (baseEdit as any).designation_ar ?? '',
          designation_en: (baseEdit as any).designation_en ?? '',
          designation_zh: (baseEdit as any).designation_zh ?? '',
          categorie_id: (baseEdit as any).categorie_id ?? ((baseEdit as any).categorie ? (baseEdit as any).categorie.id : 0),
          brand_id: (baseEdit as any).brand_id ?? ((baseEdit as any).brand ? (baseEdit as any).brand.id : undefined),
          quantite: (baseEdit as any).quantite ?? 0,
          kg: (baseEdit as any).kg ?? undefined,
          prix_achat: (baseEdit as any).prix_achat ?? 0,
          cout_revient_pourcentage: (baseEdit as any).cout_revient_pourcentage ?? 2,
          prix_gros_pourcentage: (baseEdit as any).prix_gros_pourcentage ?? 10,
          prix_vente_pourcentage: (baseEdit as any).prix_vente_pourcentage ?? 25,
          est_service: (baseEdit as any).est_service ?? false,
          remise_client: (baseEdit as any).remise_client ?? 0,
          remise_artisan: (baseEdit as any).remise_artisan ?? 0,
          description: (baseEdit as any).description ?? '',
          description_ar: (baseEdit as any).description_ar ?? '',
          description_en: (baseEdit as any).description_en ?? '',
          description_zh: (baseEdit as any).description_zh ?? '',
          pourcentage_promo: (baseEdit as any).pourcentage_promo ?? 0,
          ecom_published: (baseEdit as any).ecom_published ?? false,
          stock_partage_ecom: (baseEdit as any).stock_partage_ecom ?? false,
          stock_partage_ecom_qty: (baseEdit as any).stock_partage_ecom_qty ?? 0,
          isObligatoireVariant: (baseEdit as any).isObligatoireVariant ?? (baseEdit as any).is_obligatoire_variant ?? false,
          variants: (baseEdit as any).variants ?? [],
          units: (baseEdit as any).units ?? [],
          base_unit: (baseEdit as any).base_unit ?? 'u',
          categorie_base: (baseEdit as any).categorie_base ?? 'Maison',
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
      const prixAchatRaw = values.prix_achat;
      const hasPrixAchatInput = !(prixAchatRaw === null || prixAchatRaw === undefined || String(prixAchatRaw).trim() === '');
      const prixAchatNum = hasPrixAchatInput
        ? toNum(prixAchatRaw)
        : (editingProduct ? toNum((editingProduct as any).prix_achat) : 0);
      const kgNum = values.kg !== undefined && values.kg !== null ? toNum(values.kg) : null;
      const crPctNum = toNum(values.cout_revient_pourcentage);
      const pgPctNum = toNum(values.prix_gros_pourcentage);
      const pvPctNum = toNum(values.prix_vente_pourcentage);
      const promoPctNum = toNum(values.pourcentage_promo);
      const qteNum = values.est_service ? 0 : toNum(values.quantite);

      const computed = calculatePrices(prixAchatNum, crPctNum, pgPctNum, pvPctNum);

      const unit0 = Array.isArray(values.units) ? values.units[0] : undefined;
      const lockVariantPrixVente =
        Array.isArray(values.units) &&
        values.units.length === 1 &&
        Number((unit0 as any)?.facteur_isNormal ?? 1) === 0;

      const lockedVariantPrixVente = (() => {
        if (!lockVariantPrixVente) return null;
        const pvRaw = (unit0 as any)?.prix_vente;
        const pvHas = !(pvRaw === '' || pvRaw === null || pvRaw === undefined);
        const pvUnit = pvHas ? toNum(pvRaw) : null;
        const conv = toNum((unit0 as any)?.conversion_factor ?? 1);
        const convVal = conv > 0 ? conv : 1;
        return pvUnit !== null ? pvUnit : (computed.prix_vente * convVal);
      })();

      const variantsNormalized = Array.isArray(values.variants)
        ? values.variants.map((v: any) => {
            if (!lockVariantPrixVente) return v;
            return {
              ...v,
              prix_vente_pourcentage: 0,
              prix_vente: Number(lockedVariantPrixVente ?? 0),
            } as any;
          })
        : values.variants;

      const variantsSanitized = Array.isArray(variantsNormalized)
        ? variantsNormalized.map((v: any) => ({
            id: v.id,
            variant_name: v.variant_name,
            variant_name_ar: v.variant_name_ar ?? null,
            variant_name_en: v.variant_name_en ?? null,
            variant_name_zh: v.variant_name_zh ?? null,
            variant_type: v.variant_type,
            reference: v.reference,
            prix_achat: toNum(v.prix_achat),
            cout_revient: toNum(v.cout_revient),
            cout_revient_pourcentage: toNum(v.cout_revient_pourcentage),
            prix_gros: toNum(v.prix_gros),
            prix_gros_pourcentage: toNum(v.prix_gros_pourcentage),
            prix_vente_pourcentage: toNum(v.prix_vente_pourcentage),
            prix_vente: toNum(v.prix_vente),
            stock_quantity: toNum(v.stock_quantity),
            remise_client: toNum(v.remise_client ?? 0),
            remise_artisan: toNum(v.remise_artisan ?? 0),
          }))
        : variantsNormalized;

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
        brand_id: values.brand_id ? Number(values.brand_id) : null,
        ecom_published: values.ecom_published,
        stock_partage_ecom: values.stock_partage_ecom,
        stock_partage_ecom_qty: values.stock_partage_ecom_qty ?? 0,
        remise_client: Number((values as any)?.remise_client ?? 0),
        remise_artisan: Number((values as any)?.remise_artisan ?? 0),
        variants: variantsSanitized as any,
        units: values.units,
        base_unit: values.base_unit,
        categorie_base: (values as any).categorie_base,
        isObligatoireVariant: Boolean((values as any).isObligatoireVariant) && Array.isArray(values.variants) && values.variants.length > 0,
      };

      try {
        if (editingProduct) {
          const formData = new FormData();
          formData.append('designation', productData.designation || '');
          formData.append('designation_ar', productData.designation_ar || '');
          formData.append('designation_en', productData.designation_en || '');
          formData.append('designation_zh', productData.designation_zh || '');
          formData.append('categorie_id', String(productData.categorie_id || 0));
          if (productData.brand_id) formData.append('brand_id', String(productData.brand_id));
          formData.append('quantite', String(qteNum));
          if (kgNum !== null && kgNum !== undefined) formData.append('kg', String(kgNum));
          // IMPORTANT: ne pas modifier prix_achat automatiquement.
          // Si l'utilisateur laisse le champ vide, on n'envoie pas prix_achat => le backend garde l'ancien prix.
          if (hasPrixAchatInput) {
            formData.append('prix_achat', String(prixAchatNum));
          }
          formData.append('cout_revient_pourcentage', String(crPctNum));
          formData.append('prix_gros_pourcentage', String(pgPctNum));
          formData.append('prix_vente_pourcentage', String(pvPctNum));
          formData.append('est_service', productData.est_service ? '1' : '0');
          formData.append('remise_client', String((productData as any).remise_client ?? 0));
          formData.append('remise_artisan', String((productData as any).remise_artisan ?? 0));
          formData.append('description', productData.description || '');
          formData.append('description_ar', productData.description_ar || '');
          formData.append('description_en', productData.description_en || '');
          formData.append('description_zh', productData.description_zh || '');
          formData.append('pourcentage_promo', String(promoPctNum));
          formData.append('ecom_published', productData.ecom_published ? '1' : '0');
          formData.append('stock_partage_ecom', productData.stock_partage_ecom ? '1' : '0');
          formData.append('stock_partage_ecom_qty', String(productData.stock_partage_ecom_qty ?? 0));
          formData.append('is_obligatoire_variant', (productData as any).isObligatoireVariant ? '1' : '0');
          formData.append('updated_by', '1');
          formData.append('categorie_base', String((productData as any).categorie_base || 'Maison'));
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
          // New gallery files
          if (galleryFiles && galleryFiles.length > 0) {
            for (const f of galleryFiles) formData.append('gallery', f);
          }
          // Mark deletions for existing gallery
          if (deletedGalleryIds.length > 0) {
            formData.append('deleted_gallery_ids', JSON.stringify(deletedGalleryIds));
          }
          // Long text fiche fields
          formData.append('fiche_technique', ficheFr || '');
          formData.append('fiche_technique_ar', ficheAr || '');
          formData.append('fiche_technique_en', ficheEn || '');
          formData.append('fiche_technique_zh', ficheZh || '');

          const res = await updateProductMutation({ id: editingProduct.id, data: formData } as any).unwrap();

          // Upload per-variant media if any
          if (res && (res as any).id && Array.isArray((res as any).variants)) {
            try {
              await uploadVariantMedia((res as any).id, (res as any).variants);
            } catch (e) {
              console.warn('Variant media upload failed (update)', e);
              // Non-bloquant: on poursuit l'enregistrement produit
            }
          }

          showSuccess('Produit mis à jour avec succès !');
          if (onProductUpdated) onProductUpdated(res);
        } else {
          const formData = new FormData();
          formData.append('designation', productData.designation || '');
          formData.append('designation_ar', productData.designation_ar || '');
          formData.append('designation_en', productData.designation_en || '');
          formData.append('designation_zh', productData.designation_zh || '');
          formData.append('categorie_id', String(productData.categorie_id || 0));
          if (productData.brand_id) formData.append('brand_id', String(productData.brand_id));
          formData.append('quantite', String(qteNum));
          if (kgNum !== null && kgNum !== undefined) formData.append('kg', String(kgNum));
          formData.append('prix_achat', String(prixAchatNum));
          formData.append('cout_revient_pourcentage', String(crPctNum));
          formData.append('prix_gros_pourcentage', String(pgPctNum));
          formData.append('prix_vente_pourcentage', String(pvPctNum));
          formData.append('est_service', productData.est_service ? '1' : '0');
          formData.append('remise_client', String((productData as any).remise_client ?? 0));
          formData.append('remise_artisan', String((productData as any).remise_artisan ?? 0));
          formData.append('description', productData.description || '');
          formData.append('description_ar', productData.description_ar || '');
          formData.append('description_en', productData.description_en || '');
          formData.append('description_zh', productData.description_zh || '');
          formData.append('pourcentage_promo', String(promoPctNum));
          formData.append('ecom_published', productData.ecom_published ? '1' : '0');
          formData.append('stock_partage_ecom', productData.stock_partage_ecom ? '1' : '0');
          formData.append('stock_partage_ecom_qty', String(productData.stock_partage_ecom_qty ?? 0));
          formData.append('created_by', '1');
          formData.append('is_obligatoire_variant', (productData as any).isObligatoireVariant ? '1' : '0');
          formData.append('has_variants', String(productData.variants && productData.variants.length > 0));
          formData.append('base_unit', productData.base_unit || 'u');
          formData.append('categorie_base', String((productData as any).categorie_base || 'Maison'));
          
          if (productData.variants && productData.variants.length > 0) {
            formData.append('variants', JSON.stringify(productData.variants));
          }
          if (productData.units && productData.units.length > 0) {
            formData.append('units', JSON.stringify(productData.units));
          }

          if (selectedFile) {
            formData.append('image', selectedFile);
          }
          // New gallery files
          if (galleryFiles && galleryFiles.length > 0) {
            for (const f of galleryFiles) formData.append('gallery', f);
          }
          formData.append('fiche_technique', ficheFr || '');
          formData.append('fiche_technique_ar', ficheAr || '');
          formData.append('fiche_technique_en', ficheEn || '');
          formData.append('fiche_technique_zh', ficheZh || '');

          console.debug('Creating product payload (FormData)');
          const res = await createProduct(formData as any).unwrap();
          // After creation, upload variant media if present
          if (res && (res as any).id && Array.isArray((res as any).variants)) {
            try {
              await uploadVariantMedia((res as any).id, (res as any).variants);
            } catch (e) {
              console.warn('Variant media upload failed (create)', e);
            }
          }
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
      setGalleryFiles([]);
      setDeletedGalleryIds([]);
      setVariantMainImages({});
      setVariantGalleryFilesMap({});
      setVariantDeletedGalleryIdsMap({});
      setSnapshotEdits({});
      setExpandedSnapshots(new Set());
      setFicheFr('');
      setFicheAr('');
      setFicheEn('');
      setFicheZh('');
    },
  });

  const variantPrixVenteLock = useMemo(() => {
    const units = (formik.values as any)?.units;
    if (!Array.isArray(units) || units.length !== 1) return { lock: false, forcedPrixVente: null };
    const u0 = units[0] || {};
    const flag = Number(u0?.facteur_isNormal ?? 1);
    const pvRaw = u0?.prix_vente;
    const pvHas = !(pvRaw === '' || pvRaw === null || pvRaw === undefined);
    const pvUnit = pvHas ? toNum(pvRaw) : null;
    const isManual = flag === 0;
    if (!isManual) return { lock: false, forcedPrixVente: null };
    const conv = toNum(u0?.conversion_factor ?? 1);
    const convVal = conv > 0 ? conv : 1;
    const forcedPrixVente = pvUnit !== null ? pvUnit : (dynamicPrices.prix_vente * convVal);
    return { lock: true, forcedPrixVente };
  }, [formik.values.units, dynamicPrices.prix_vente]);

  useEffect(() => {
    if (!variantPrixVenteLock.lock) return;
    if (!Array.isArray(formik.values.variants) || formik.values.variants.length === 0) return;
    const forced = Number(variantPrixVenteLock.forcedPrixVente ?? 0);
    const needsUpdate = formik.values.variants.some((v: any) => Number(v?.prix_vente ?? 0) !== forced || Number(v?.prix_vente_pourcentage ?? 0) !== 0);
    if (!needsUpdate) return;

    for (let i = 0; i < formik.values.variants.length; i++) {
      formik.setFieldValue(`variants.${i}.prix_vente_pourcentage`, 0, false);
      formik.setFieldValue(`variants.${i}.prix_vente`, forced, false);
    }
  }, [variantPrixVenteLock.lock, variantPrixVenteLock.forcedPrixVente, formik.values.variants.length]);

  // When opening in "new" mode, hard-reset all states to ensure empty form
  useEffect(() => {
    if (isOpen && !editingProduct) {
      formik.resetForm({ values: initialValues as any });
      setSelectedFile(null);
      setGalleryFiles([]);
      setDeletedGalleryIds([]);
      setVariantMainImages({});
      setVariantGalleryFilesMap({});
      setVariantDeletedGalleryIdsMap({});
      setVariantUseProductRemise({});
      setFicheFr('');
      setFicheAr('');
      setFicheEn('');
      setFicheZh('');
      setActiveLang('fr');
      setSnapshotEdits({});
      setExpandedSnapshots(new Set());
      const prices = calculatePrices(
        toNum(initialValues.prix_achat),
        toNum(initialValues.cout_revient_pourcentage as any),
        toNum(initialValues.prix_gros_pourcentage as any),
        toNum(initialValues.prix_vente_pourcentage as any)
      );
      setDynamicPrices(prices);
      setPriceRaw({ cout_revient: '', prix_gros: '', prix_vente: '' });
    }
  }, [isOpen, editingProduct]);

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

  // (Retiré) Le prix de vente par unité n'est plus stocké; affichage calculé côté liste

  // Keep variant remises in sync if checkbox enabled (after formik is initialized)
  useEffect(() => {
    formik.setValues((prev: any) => {
      const updated = { ...prev };
      if (Array.isArray(updated.variants)) {
        updated.variants = updated.variants.map((v: any, idx: number) => {
          const key = v.id ?? idx;
          if (variantUseProductRemise[key]) {
            return {
              ...v,
              remise_client: Number(updated.remise_client ?? 0),
              remise_artisan: Number(updated.remise_artisan ?? 0),
            };
          }
          return v;
        });
      }
      return updated;
    });
  }, [ (formik.values as any)?.remise_client, (formik.values as any)?.remise_artisan, variantUseProductRemise ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-200">
        <div className="sticky top-0 z-20 bg-gradient-to-r from-blue-700 to-blue-500 px-6 py-5 rounded-t-2xl flex items-center justify-between gap-4 shadow-md">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white/60"
            aria-label="Fermer"
            title="Fermer"
          >
            <X size={22} />
          </button>
        </div>

        <form onSubmit={formik.handleSubmit} className="p-6 space-y-6">
          {/* Language Tabs */}
          <div className="flex space-x-1 mb-0 border-b-2 border-gray-200 pb-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveLang('fr')}
              className={`px-4 py-2.5 rounded-t-lg font-semibold text-sm whitespace-nowrap transition-colors -mb-[2px] ${
                activeLang === 'fr' ? 'bg-white text-blue-700 border-2 border-gray-200 border-b-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              Français
            </button>
            <button
              type="button"
              onClick={() => setActiveLang('ar')}
              className={`px-4 py-2.5 rounded-t-lg font-semibold text-sm whitespace-nowrap transition-colors -mb-[2px] ${
                activeLang === 'ar' ? 'bg-white text-blue-700 border-2 border-gray-200 border-b-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              Arabe
            </button>
            <button
              type="button"
              onClick={() => setActiveLang('en')}
              className={`px-4 py-2.5 rounded-t-lg font-semibold text-sm whitespace-nowrap transition-colors -mb-[2px] ${
                activeLang === 'en' ? 'bg-white text-blue-700 border-2 border-gray-200 border-b-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setActiveLang('zh')}
              className={`px-4 py-2.5 rounded-t-lg font-semibold text-sm whitespace-nowrap transition-colors -mb-[2px] ${
                activeLang === 'zh' ? 'bg-white text-blue-700 border-2 border-gray-200 border-b-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              Chinois
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Désignation (Multi-lang) */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
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
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
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
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
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
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
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
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  placeholder="Ex: 笔记本电脑"
                />
              )}
              {activeLang === 'fr' && formik.touched.designation && !!asStringError(formik.errors.designation) && (
                <p className="text-red-500 text-sm mt-1">{asStringError(formik.errors.designation)}</p>
              )}
            </div>

            {/* Catégories (Arbre) */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Catégorie
              </label>
              <CategoryTreeSelect
                categories={categories}
                selectedId={formik.values.categorie_id || null}
                onChange={(id) => {
                  formik.setFieldValue('categorie_id', id);
                  // Clear legacy array if needed, or sync it
                  formik.setFieldValue('categories', [id]);
                }}
              />
              {formik.touched.categorie_id && formik.errors.categorie_id && (
                <p className="text-red-500 text-sm mt-1">{asStringError(formik.errors.categorie_id)}</p>
              )}
            </div>

            {/* Marque */}
            <div>
              <label htmlFor="brand_id" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Marque
              </label>
              <select
                id="brand_id"
                name="brand_id"
                value={String(formik.values.brand_id ?? '')}
                onChange={(e) => formik.setFieldValue('brand_id', e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
              >
                <option value="">Sélectionner une marque</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.nom}
                  </option>
                ))}
              </select>
            </div>

            {/* Catégorie de base */}
            <div>
              <label htmlFor="categorie_base" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Catégorie de base
              </label>
              <select
                id="categorie_base"
                name="categorie_base"
                value={(formik.values as any).categorie_base || 'Maison'}
                onChange={(e) => formik.setFieldValue('categorie_base', e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
              >
                <option value="Maison">Maison</option>
                <option value="Professionel">Professionel</option>
              </select>
            </div>

            {/* Quantité (peut être 0) */}
            <div>
              <label htmlFor="quantite" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
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
                disabled={true}
                title="La quantité est gérée automatiquement par les snapshots et bons de commande."
                className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-gray-100/80 disabled:text-gray-500 placeholder:text-gray-400"
                placeholder="0"
              />
              {formik.touched.quantite && !!asStringError(formik.errors.quantite) && (
                <p className="text-red-500 text-sm mt-1">{asStringError(formik.errors.quantite)}</p>
              )}
            </div>

            {/* Poids (kg) - optionnel */}
            <div>
              <label htmlFor="kg" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
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
                className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
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
              <label htmlFor="image" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Image du produit
              </label>
              <input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
              />
              {/* Aperçu image principale (nouvelle sélection ou existante) */}
              <div className="mt-3">
                {selectedFile ? (
                  <div className="inline-block relative border rounded p-1">
                    <img
                      src={URL.createObjectURL(selectedFile)}
                      alt="aperçu principale"
                      className="w-24 h-24 object-cover rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="absolute top-1 right-1 text-xs px-1.5 py-0.5 rounded bg-red-600 text-white"
                      title="Retirer la nouvelle image"
                    >
                      Retirer
                    </button>
                  </div>
                ) : (
                  editingProduct && (editingProduct as any).image_url ? (
                    <div className="inline-block border rounded p-1">
                      <img
                        src={toBackendUrl((editingProduct as any).image_url)}
                        alt="image principale"
                        className="w-24 h-24 object-cover rounded"
                      />
                    </div>
                  ) : null
                )}
              </div>
            </div>

            {/* Galerie d'images */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Galerie d'images</label>
              {(
                (editingProduct && (editingProduct as any).image_url) ||
                (editingProduct && Array.isArray((editingProduct as any).gallery) && (editingProduct as any).gallery.length > 0)
              ) && (
                <div className="mb-3">
                  <div className="text-xs text-gray-600 mb-1">Images existantes</div>
                  <div className="flex flex-wrap gap-3">
                    {editingProduct && (editingProduct as any).image_url && (
                      <div className="relative border rounded p-1">
                        <img
                          src={toBackendUrl((editingProduct as any).image_url)}
                          alt="image principale"
                          className="w-24 h-24 object-cover rounded"
                        />
                        <div className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white rounded px-1">Principale</div>
                      </div>
                    )}
                    {Array.isArray((editingProduct as any)?.gallery) && (editingProduct as any).gallery.map((img: any) => {
                      const isMarked = deletedGalleryIds.includes(img.id);
                      return (
                        <div key={img.id} className={`relative border rounded p-1 ${isMarked ? 'opacity-50' : ''}`}>
                          <img
                            src={toBackendUrl(img.image_url)}
                            alt="product"
                            className="w-24 h-24 object-cover rounded"
                          />
                          <button
                            type="button"
                            onClick={() => toggleDeleteExistingGallery(img.id)}
                            className={`absolute top-1 right-1 text-xs px-1.5 py-0.5 rounded ${isMarked ? 'bg-gray-600 text-white' : 'bg-red-600 text-white'}`}
                            title={isMarked ? 'Annuler la suppression' : 'Supprimer cette image'}
                          >
                            {isMarked ? 'Annuler' : 'Suppr'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mb-2">
                <input
                  id="gallery"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleGalleryChange}
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                />
              </div>
              {galleryFiles.length > 0 && (
                <div>
                  <div className="text-xs text-gray-600 mb-1">Nouvelles images sélectionnées</div>
                  <div className="flex flex-wrap gap-3">
                    {galleryFiles.map((file, idx) => (
                      <div key={idx} className="relative border rounded p-1">
                        <img
                          src={URL.createObjectURL(file)}
                          alt="new"
                          className="w-24 h-24 object-cover rounded"
                        />
                        <button
                          type="button"
                          onClick={() => removeNewGalleryFile(idx)}
                          className="absolute top-1 right-1 text-xs px-1.5 py-0.5 rounded bg-red-600 text-white"
                          title="Retirer cette image"
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Remises produit (montant) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:col-span-2 p-4 rounded-xl border-2 border-gray-200 bg-gray-50/30">
              <h4 className="md:col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Remises</h4>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Remise client (montant)</label>
                <input
                  type="number"
                  step="0.01"
                  name="remise_client"
                  value={(formik.values as any).remise_client as any}
                  onChange={formik.handleChange}
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Remise artisan (montant)</label>
                <input
                  type="number"
                  step="0.01"
                  name="remise_artisan"
                  value={(formik.values as any).remise_artisan as any}
                  onChange={formik.handleChange}
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Fiche technique (Multi-lang, long text) */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Fiche technique ({activeLang.toUpperCase()})
              </label>
              {activeLang === 'fr' && (
                <textarea
                  id="fiche_technique"
                  value={ficheFr}
                  onChange={(e) => handleFicheTextChange(e.target.value, 'fr')}
                  rows={4}
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  placeholder="Texte long de la fiche technique (FR)"
                />
              )}
              {activeLang === 'ar' && (
                <textarea
                  id="fiche_technique_ar"
                  value={ficheAr}
                  onChange={(e) => handleFicheTextChange(e.target.value, 'ar')}
                  rows={4}
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
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
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  placeholder="Long text tech sheet (EN)"
                />
              )}
              {activeLang === 'zh' && (
                <textarea
                  id="fiche_technique_zh"
                  value={ficheZh}
                  onChange={(e) => handleFicheTextChange(e.target.value, 'zh')}
                  rows={4}
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  placeholder="技术资料长文本 (ZH)"
                />
              )}
            </div>

            {/* Description (Multi-lang) */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
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
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
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
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
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
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
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
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  placeholder="详细产品说明..."
                />
              )}
            </div>

            {/* Pourcentage Promo */}
            <div>
              <label htmlFor="pourcentage_promo" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
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
                className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                placeholder="0"
              />
            </div>

            {/* Prix d'achat — masqué si snapshots existent (déjà dans l'accordion) */}
            {!(editingProduct && Array.isArray(productSnapshotRows) && productSnapshotRows.length > 0) && (
            <div>
              <label htmlFor="prix_achat" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Prix d'achat (DH) <span className="text-xs text-gray-500">(optionnel)</span>
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
                className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                placeholder="0"
              />
            </div>
            )}

            {/* Snapshot accordion produit — masqué si variantes obligatoires */}
            {editingProduct && !(formik.values as any).isObligatoireVariant && (
                <div className="mt-4 md:col-span-2 w-full rounded-xl border-2 border-blue-300 bg-gradient-to-b from-blue-50 to-white p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-base font-bold text-blue-900 flex items-center gap-2">
                      <Package size={18} />
                      Historique des achats <span className="text-sm font-normal text-blue-600">({Array.isArray(productSnapshotRows) ? productSnapshotRows.length : 0})</span>
                    </h4>
                    {hasSnapshotChanges && (
                      <button
                        type="button"
                        onClick={handleSaveSnapshots}
                        disabled={savingSnapshots}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                      >
                        <Save size={14} />
                        {savingSnapshots ? 'Enregistrement...' : 'Sauvegarder'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {Array.isArray(productSnapshotRows) && productSnapshotRows.length > 0 ? productSnapshotRows.map((s: any) => {
                      const isOpen = expandedSnapshots.has(s.id);
                      const hasEdits = !!snapshotEdits[s.id];
                      return (
                        <div key={String(s.id)} className={`rounded-lg border-2 transition-all ${
                          hasEdits ? 'border-orange-400 bg-orange-50/50 shadow-md' : 'border-gray-200 bg-white shadow-sm'
                        }`}>
                          <button
                            type="button"
                            onClick={() => toggleSnapshotExpanded(s.id)}
                            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-50/40 rounded-t-lg transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-wrap">
                              {isOpen ? <ChevronDown size={18} className="text-blue-600" /> : <ChevronRight size={18} className="text-gray-400" />}
                              <span className="text-sm font-bold text-gray-800">{s.bon_commande_id ? `Bon #${s.bon_commande_id}` : `Snapshot #${s.id}`}</span>
                              <span className="text-sm text-gray-500">{String(s.created_at ?? '').slice(0, 10)}</span>
                              <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                                Qte: {formatNumber(Number(getSnapshotEditValue(s, 'quantite')))}
                              </span>
                              <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                                Achat: {formatNumber(Number(getSnapshotEditValue(s, 'prix_achat')))} DH
                              </span>
                              {hasEdits && <span className="px-2 py-0.5 bg-orange-200 text-orange-800 rounded-full text-xs font-bold">modifié</span>}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="px-4 pb-4 pt-2 border-t-2 border-gray-100">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                  { key: 'quantite', label: 'Quantité' },
                                  { key: 'prix_achat', label: 'Prix Achat' },
                                  { key: 'prix_vente', label: 'Prix Vente' },
                                  { key: 'prix_vente_pourcentage', label: '% Vente' },
                                  { key: 'cout_revient', label: 'Coût Revient' },
                                  { key: 'cout_revient_pourcentage', label: '% Coût Rev.' },
                                  { key: 'prix_gros', label: 'Prix Gros' },
                                  { key: 'prix_gros_pourcentage', label: '% Gros' },
                                ].map(({ key, label }) => (
                                  <div key={key}>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={getSnapshotEditValue(s, key)}
                                      onChange={(e) => setSnapshotEditField(s.id, key, e.target.value)}
                                      className={`w-full px-3 py-2 text-sm font-medium border-2 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors ${
                                        snapshotEdits[s.id]?.[key] !== undefined ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
                                      }`}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }) : (
                      <div className="text-center py-6 text-gray-400">
                        <Package size={32} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Aucun historique d'achat</p>
                        <p className="text-xs mt-1">Les snapshots seront créés lors de la validation d'un bon de commande</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* Options & Paramètres */}
            <div className="md:col-span-2 mt-2 p-4 rounded-xl border-2 border-gray-200 bg-gray-50/30">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Options</h4>
              <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2.5 cursor-pointer px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-all">
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
                  className="w-4 h-4 text-blue-600 border-2 border-gray-300 rounded focus:ring-blue-500 transition-colors"
                />
                <span className="text-sm font-medium text-gray-700">Service</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-all">
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
                  className="w-4 h-4 text-blue-600 border-2 border-gray-300 rounded focus:ring-blue-500 transition-colors"
                />
                <span className="text-sm font-medium text-gray-700">Publié E-com</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-all">
                <input
                  type="checkbox"
                  name="stock_partage_ecom"
                  checked={formik.values.stock_partage_ecom}
                  onChange={formik.handleChange}
                  className="w-4 h-4 text-blue-600 border-2 border-gray-300 rounded focus:ring-blue-500 transition-colors"
                />
                <span className="text-sm font-medium text-gray-700">Stock partagé E-com</span>
              </label>
              </div>
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
                      className="w-24 px-2.5 py-1.5 text-sm font-medium border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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

          {/* Calculs automatiques des prix — masqué si snapshots existent */}
          {!(editingProduct && Array.isArray(productSnapshotRows) && productSnapshotRows.length > 0) && (
          <div className="mt-6 p-5 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 mb-4">Calculs automatiques des prix</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Coût de revient */}
              <div className="space-y-2">
                <label htmlFor="cout_revient_pourcentage" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
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
                    className="w-20 px-2.5 py-1.5 text-sm font-medium border-2 border-gray-200 rounded-lg bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
                <div className="text-lg font-semibold text-gray-900 bg-white px-3 py-2 rounded-xl border-2 border-gray-200 shadow-sm">
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
                <label htmlFor="prix_gros_pourcentage" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
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
                    className="w-20 px-2.5 py-1.5 text-sm font-medium border-2 border-gray-200 rounded-lg bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
                <div className="text-lg font-semibold text-gray-900 bg-white px-3 py-2 rounded-xl border-2 border-gray-200 shadow-sm">
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
                <label htmlFor="prix_vente_pourcentage" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
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
                    className="w-20 px-2.5 py-1.5 text-sm font-medium border-2 border-gray-200 rounded-lg bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
                <div className="text-lg font-semibold text-gray-900 bg-white px-3 py-2 rounded-xl border-2 border-gray-200 shadow-sm">
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
          )}

          {/* Unités de mesure */}
          <div className="mt-6 p-5 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-gray-900">Unités de mesure</h3>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Unité de base:</label>
                <select
                  name="base_unit"
                  value={formik.values.base_unit}
                  onChange={formik.handleChange}
                  className="px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                      formik.values.units.map((unit: any, index: number) => (
                        <div key={index} className="flex gap-4 items-start bg-white p-4 rounded-xl border-2 border-gray-200 shadow-sm">
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Nom (ex: Sac 25kg)</label>
                              <input
                                name={`units.${index}.unit_name`}
                                value={unit.unit_name}
                                onChange={formik.handleChange}
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="1.0"
                                step="0.0001"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Prix vente ({unit.unit_name || 'unité'})</label>
                              {(() => {
                                const isAuto = (unit as any).prix_vente === '' || (unit as any).prix_vente === null || (unit as any).prix_vente === undefined;
                                const factor = toNum((unit as any).conversion_factor) || 1;
                                const basePv = Number((dynamicPrices as any).prix_vente || 0) || 0;
                                const computed = Number((basePv * factor).toFixed(2));
                                return (
                                  <div className="flex flex-col gap-1">
                                    <label className="inline-flex items-center gap-2 text-xs text-gray-600 select-none">
                                      <input
                                        type="checkbox"
                                        checked={isAuto}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            formik.setFieldValue(`units.${index}.prix_vente`, '');
                                            formik.setFieldValue(`units.${index}.facteur_isNormal`, 1);
                                          } else {
                                            formik.setFieldValue(`units.${index}.prix_vente`, String(computed));
                                            formik.setFieldValue(`units.${index}.facteur_isNormal`, 0);
                                          }
                                        }}
                                      />
                                      Auto (prix = base × facteur)
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        name={`units.${index}.prix_vente`}
                                        value={isAuto ? computed : ((unit as any).prix_vente ?? '')}
                                        onChange={(e) => {
                                          // When user types manually => switch off auto by storing a value
                                          formik.setFieldValue(`units.${index}.prix_vente`, e.target.value);
                                          formik.setFieldValue(`units.${index}.facteur_isNormal`, 0);
                                        }}
                                        disabled={isAuto}
                                        className={`w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg transition-all ${isAuto ? 'bg-gray-100/80 text-gray-600' : 'bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'}`}
                                        placeholder="Auto"
                                        step="0.01"
                                        min={0}
                                      />
                                      <span className="text-xs text-gray-500">DH</span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            
                          </div>
                          <button
                            type="button"
                            onClick={() => arrayHelpers.remove(index)}
                            className="text-red-400 hover:text-red-600 mt-6 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
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
                      onClick={() => {
                        arrayHelpers.push({
                          unit_name: '',
                          conversion_factor: 1,
                          prix_vente: '',
                          facteur_isNormal: 1,
                          is_default: false
                        });
                      }}
                      className="flex items-center gap-2 text-sm text-white bg-blue-600 hover:bg-blue-700 font-semibold mt-3 px-4 py-2 rounded-lg shadow-sm transition-colors"
                    >
                      <Plus size={16} /> Ajouter une unité
                    </button>
                  </div>
                )}
              />
            </FormikProvider>
          </div>

          {/* Variantes */}
          <div className="mt-6 p-5 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-gray-900">Variantes du produit</h3>
              <label className="flex items-center gap-2 text-sm text-gray-700 font-semibold">
                <input
                  type="checkbox"
                  checked={!!(formik.values as any).isObligatoireVariant}
                  disabled={!Array.isArray(formik.values.variants) || formik.values.variants.length === 0}
                  onChange={(e) => formik.setFieldValue('isObligatoireVariant', e.target.checked)}
                />
                Variante obligatoire dans les bons
              </label>
            </div>
            
            <FormikProvider value={formik}>
              <FieldArray
                name="variants"
                render={arrayHelpers => (
                  <div className="space-y-4">
                    {formik.values.variants && formik.values.variants.length > 0 ? (
                      formik.values.variants.map((variant: any, index: number) => (
                        <div key={index} className="flex flex-col gap-4 bg-white p-5 rounded-xl border-2 border-gray-200 relative shadow-sm hover:shadow-md transition-shadow">
                          <button
                            type="button"
                            onClick={() => arrayHelpers.remove(index)}
                            className="absolute top-3 right-3 text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
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
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                                disabled={!editingProduct}
                                title={!editingProduct ? "La quantité initiale est gérée par la création d'un bon de commande." : ""}
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-gray-100/80 disabled:text-gray-500"
                                placeholder="0"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pr-8">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Nom AR</label>
                              <input
                                name={`variants.${index}.variant_name_ar`}
                                value={(variant as any).variant_name_ar || ''}
                                onChange={formik.handleChange}
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="العربية"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Nom EN</label>
                              <input
                                name={`variants.${index}.variant_name_en`}
                                value={(variant as any).variant_name_en || ''}
                                onChange={formik.handleChange}
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="English"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Nom ZH</label>
                              <input
                                name={`variants.${index}.variant_name_zh`}
                                value={(variant as any).variant_name_zh || ''}
                                onChange={formik.handleChange}
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="中文"
                              />
                            </div>
                          </div>

                          {/* Ligne 2: Prix et Calculs */}
                          {editingProduct && Array.isArray((variant as any)?.snapshot_rows) && ((variant as any).snapshot_rows.length > 0) && (
                            <div className="mt-4 rounded-xl border-2 border-indigo-300 bg-gradient-to-b from-indigo-50 to-white p-4 shadow-sm">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                                  <Package size={16} />
                                  Historique achats variante <span className="text-xs font-normal text-indigo-600">({(variant as any).snapshot_rows.length})</span>
                                </h4>
                                {hasSnapshotChanges && (
                                  <button
                                    type="button"
                                    onClick={handleSaveSnapshots}
                                    disabled={savingSnapshots}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                                  >
                                    <Save size={12} />
                                    {savingSnapshots ? '...' : 'Sauvegarder'}
                                  </button>
                                )}
                              </div>
                              <div className="space-y-2">
                                {(variant as any).snapshot_rows.map((s: any) => {
                                  const isOpen = expandedSnapshots.has(s.id);
                                  const hasEdits = !!snapshotEdits[s.id];
                                  return (
                                    <div key={String(s.id)} className={`rounded-lg border-2 transition-all ${
                                      hasEdits ? 'border-orange-400 bg-orange-50/50 shadow-md' : 'border-gray-200 bg-white shadow-sm'
                                    }`}>
                                      <button
                                        type="button"
                                        onClick={() => toggleSnapshotExpanded(s.id)}
                                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-indigo-50/40 rounded-t-lg transition-colors"
                                      >
                                        <div className="flex items-center gap-3 flex-wrap">
                                          {isOpen ? <ChevronDown size={16} className="text-indigo-600" /> : <ChevronRight size={16} className="text-gray-400" />}
                                          <span className="text-sm font-bold text-gray-800">{s.bon_commande_id ? `Bon #${s.bon_commande_id}` : `Snapshot #${s.id}`}</span>
                                          <span className="text-sm text-gray-500">{String(s.created_at ?? '').slice(0, 10)}</span>
                                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-semibold">
                                            Qte: {formatNumber(Number(getSnapshotEditValue(s, 'quantite')))}
                                          </span>
                                          <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                                            Achat: {formatNumber(Number(getSnapshotEditValue(s, 'prix_achat')))} DH
                                          </span>
                                          {hasEdits && <span className="px-2 py-0.5 bg-orange-200 text-orange-800 rounded-full text-xs font-bold">modifié</span>}
                                        </div>
                                      </button>
                                      {isOpen && (
                                        <div className="px-4 pb-4 pt-2 border-t-2 border-gray-100">
                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {[
                                              { key: 'quantite', label: 'Quantité' },
                                              { key: 'prix_achat', label: 'Prix Achat' },
                                              { key: 'prix_vente', label: 'Prix Vente' },
                                              { key: 'prix_vente_pourcentage', label: '% Vente' },
                                              { key: 'cout_revient', label: 'Coût Revient' },
                                              { key: 'cout_revient_pourcentage', label: '% Coût Rev.' },
                                              { key: 'prix_gros', label: 'Prix Gros' },
                                              { key: 'prix_gros_pourcentage', label: '% Gros' },
                                            ].map(({ key, label }) => (
                                              <div key={key}>
                                                <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                                                <input
                                                  type="text"
                                                  inputMode="decimal"
                                                  value={getSnapshotEditValue(s, key)}
                                                  onChange={(e) => setSnapshotEditField(s.id, key, e.target.value)}
                                                  className={`w-full px-3 py-2 text-sm font-medium border-2 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors ${
                                                    snapshotEdits[s.id]?.[key] !== undefined ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
                                                  }`}
                                                />
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Prix et calculs variante — masqué si snapshots variante existent */}
                          {!(editingProduct && Array.isArray((variant as any)?.snapshot_rows) && (variant as any).snapshot_rows.length > 0) && (
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-gray-100">
                            {/* Prix Achat */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-medium text-gray-500">Prix Achat</label>
                                <label className="flex items-center gap-1 cursor-pointer" title="Copier les prix du produit parent">
                                  <input
                                    type="checkbox"
                                    className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    disabled={variantPrixVenteLock.lock}
                                    checked={
                                      variantPrixVenteLock.lock
                                        ? true
                                        : (
                                            variant.prix_achat == formik.values.prix_achat &&
                                            variant.prix_vente == dynamicPrices.prix_vente &&
                                            (formik.values.prix_achat !== '' || dynamicPrices.prix_vente !== 0)
                                          )
                                    }
                                    onChange={(e) => {
                                      if (variantPrixVenteLock.lock) return;
                                      if (e.target.checked) {
                                        formik.setFieldValue(`variants.${index}.prix_achat`, formik.values.prix_achat);
                                        formik.setFieldValue(`variants.${index}.cout_revient_pourcentage`, formik.values.cout_revient_pourcentage);
                                        formik.setFieldValue(`variants.${index}.cout_revient`, dynamicPrices.cout_revient);
                                        formik.setFieldValue(`variants.${index}.prix_gros_pourcentage`, formik.values.prix_gros_pourcentage);
                                        formik.setFieldValue(`variants.${index}.prix_gros`, dynamicPrices.prix_gros);
                                        formik.setFieldValue(
                                          `variants.${index}.prix_vente_pourcentage`,
                                          formik.values.prix_vente_pourcentage
                                        );
                                        formik.setFieldValue(
                                          `variants.${index}.prix_vente`,
                                          dynamicPrices.prix_vente
                                        );
                                      }
                                    }}
                                  />
                                  <span className="text-[10px] text-blue-600 whitespace-nowrap">
                                    Même prix{variantPrixVenteLock.lock ? ' (obligatoire)' : ''}
                                  </span>
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
                                  if (variantPrixVenteLock.lock) {
                                    formik.setFieldValue(`variants.${index}.prix_vente`, Number(variantPrixVenteLock.forcedPrixVente ?? 0));
                                  } else {
                                    formik.setFieldValue(`variants.${index}.prix_vente`, Number((pa * (1 + pvp/100)).toFixed(2)));
                                  }
                                }}
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                                  className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                                  className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-gray-50/80 text-gray-600"
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
                                  className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                                  className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-gray-50/80 text-gray-600"
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
                                  disabled={variantPrixVenteLock.lock}
                                  onChange={(e) => {
                                    if (variantPrixVenteLock.lock) {
                                      formik.setFieldValue(`variants.${index}.prix_vente_pourcentage`, 0);
                                      formik.setFieldValue(`variants.${index}.prix_vente`, Number(variantPrixVenteLock.forcedPrixVente ?? 0));
                                      return;
                                    }
                                    formik.handleChange(e);
                                    const pct = Number(e.target.value);
                                    const pa = Number(variant.prix_achat || 0);
                                    formik.setFieldValue(`variants.${index}.prix_vente`, Number((pa * (1 + pct/100)).toFixed(2)));
                                  }}
                                  className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                  placeholder="%"
                                />
                              </div>
                              <div className="w-2/3">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Prix Vente</label>
                                <input
                                  type="number"
                                  name={`variants.${index}.prix_vente`}
                                  value={variant.prix_vente}
                                  onChange={formik.handleChange}
                                  disabled={variantPrixVenteLock.lock}
                                  className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>
                          )}

                          {/* Ligne 3: Remises */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                            <div className="col-span-1 md:col-span-3">
                              <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={variantUseProductRemise[(variant.id as number) ?? index] || false}
                                  onChange={(e) => {
                                    const key = (variant.id as number) ?? index;
                                    setVariantUseProductRemise(prev => ({ ...prev, [key]: e.target.checked }));
                                    if (e.target.checked) {
                                      formik.setFieldValue(`variants.${index}.remise_client`, Number((formik.values as any).remise_client ?? 0));
                                      formik.setFieldValue(`variants.${index}.remise_artisan`, Number((formik.values as any).remise_artisan ?? 0));
                                    }
                                  }}
                                  className="w-3 h-3"
                                />
                                Même remises que le produit
                              </label>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Remise client (montant)</label>
                              <input
                                type="number"
                                step="0.01"
                                name={`variants.${index}.remise_client`}
                                value={(variant as any).remise_client ?? 0}
                                onChange={formik.handleChange}
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                disabled={variantUseProductRemise[(variant.id as number) ?? index]}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Remise artisan (montant)</label>
                              <input
                                type="number"
                                step="0.01"
                                name={`variants.${index}.remise_artisan`}
                                value={(variant as any).remise_artisan ?? 0}
                                onChange={formik.handleChange}
                                className="w-full px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                disabled={variantUseProductRemise[(variant.id as number) ?? index]}
                              />
                            </div>
                          </div>

                          {/* Médias de la variante (non partagés) */}
                          {variant.id && (
                            <div className="pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Image principale de la variante */}
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Image de la variante</label>
                                <div className="flex items-center gap-3">
                                  {variantMainImages[variant.id as number] ? (
                                    <div className="relative inline-block">
                                      <img
                                        src={URL.createObjectURL(variantMainImages[variant.id as number])}
                                        alt="aperçu variante"
                                        className="w-16 h-16 object-cover rounded border"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setVariantMainImages(prev => {
                                          const copy = { ...prev } as Record<number, File>;
                                          delete copy[variant.id as number];
                                          return copy;
                                        })}
                                        className="absolute -top-1 -right-1 text-[10px] px-1 py-0.5 rounded bg-red-600 text-white"
                                      >
                                        Retirer
                                      </button>
                                    </div>
                                  ) : (
                                    variant.image_url ? (
                                      <img
                                        src={toBackendUrl(variant.image_url)}
                                        alt="variant"
                                        className="w-16 h-16 object-cover rounded border"
                                      />
                                    ) : null
                                  )}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => onVariantMainImageChange(variant.id as number, e)}
                                    className="text-sm"
                                  />
                                </div>
                              </div>

                              {/* Galerie de la variante */}
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Galerie de la variante</label>
                                {(variant.image_url || (Array.isArray((variant as any).gallery) && (variant as any).gallery.length > 0)) && (
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    {variant.image_url && (
                                      <div className="relative border rounded p-1">
                                        <img src={toBackendUrl(variant.image_url)} alt="v-principale" className="w-16 h-16 object-cover rounded" />
                                        <div className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white rounded px-1">Principale</div>
                                      </div>
                                    )}
                                    {Array.isArray((variant as any)?.gallery) && (variant as any).gallery.map((img: any) => {
                                      const marked = (variantDeletedGalleryIdsMap[variant.id as number] || []).includes(img.id);
                                      return (
                                        <div key={img.id} className={`relative border rounded p-1 ${marked ? 'opacity-50' : ''}`}>
                                          <img src={toBackendUrl(img.image_url)} alt="v-img" className="w-16 h-16 object-cover rounded" />
                                          <button
                                            type="button"
                                            onClick={() => toggleDeleteExistingVariantGallery(variant.id as number, img.id)}
                                            className={`absolute top-1 right-1 text-[10px] px-1 py-0.5 rounded ${marked ? 'bg-gray-600 text-white' : 'bg-red-600 text-white'}`}
                                          >
                                            {marked ? 'Annuler' : 'Suppr'}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <input
                                  type="file"
                                  multiple
                                  accept="image/*"
                                  onChange={(e) => onVariantGalleryChange(variant.id as number, e)}
                                  className="text-sm"
                                />
                                {(variantGalleryFilesMap[variant.id as number] || []).length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {(variantGalleryFilesMap[variant.id as number] || []).map((f, i) => (
                                      <div key={i} className="relative border rounded p-1">
                                        <img src={URL.createObjectURL(f)} alt="new-v" className="w-16 h-16 object-cover rounded" />
                                        <button
                                          type="button"
                                          onClick={() => removeNewVariantGalleryFile(variant.id as number, i)}
                                          className="absolute top-1 right-1 text-[10px] px-1 py-0.5 rounded bg-red-600 text-white"
                                        >
                                          Retirer
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 italic">Aucune variante ajoutée.</p>
                    )}
                    
                    <button
                      type="button"
                      onClick={() => arrayHelpers.push({
                        variant_name: '',
                        variant_name_ar: '',
                        variant_name_en: '',
                        variant_name_zh: '',
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
                      className="flex items-center gap-2 text-sm text-white bg-blue-600 hover:bg-blue-700 font-semibold mt-3 px-4 py-2 rounded-lg shadow-sm transition-colors"
                    >
                      <Plus size={16} /> Ajouter une variante
                    </button>
                  </div>
                )}
              />
            </FormikProvider>
          </div>

          {/* Boutons */}
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                onClose();
                formik.resetForm();
              }}
              className="px-6 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={formik.isSubmitting}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
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
