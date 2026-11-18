import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../hooks/redux';

type Locale = 'fr' | 'ar' | 'en' | 'zh';
type SlideType = 'category' | 'brand' | 'campaign' | 'product';
type SlideStatus = 'draft' | 'published' | 'archived';

type Cta = {
  label: string; // fr
  label_ar?: string | null;
  label_en?: string | null;
  label_zh?: string | null;
  style: 'primary' | 'secondary';
};

type HeroSlide = {
  id: number;
  type: SlideType;
  status: SlideStatus;
  priority: number;
  locale?: Locale;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string;
  image_alt: string | null;
  title: string; // fr
  title_ar?: string | null;
  title_en?: string | null;
  title_zh?: string | null;
  subtitle: string | null; // fr
  subtitle_ar?: string | null;
  subtitle_en?: string | null;
  subtitle_zh?: string | null;
  description?: string | null; // fr
  description_ar?: string | null;
  description_en?: string | null;
  description_zh?: string | null;
  category_id: number | null;
  brand_id: number | null;
  product_id: number | null;
  variant_id: number | null;
  campaign_id: number | null;
  ctas: Cta[];
  updated_at?: string;
};

type SlideForm = {
  status: SlideStatus;
  type: SlideType;
  priority: number;
  starts_at: string;
  ends_at: string;
  image_alt: string;
  title: string;
  title_ar: string;
  title_en: string;
  title_zh: string;
  subtitle: string;
  subtitle_ar: string;
  subtitle_en: string;
  subtitle_zh: string;
  description: string;
  description_ar: string;
  description_en: string;
  description_zh: string;
  category_id: string;
  brand_id: string;
  product_id: string;
  variant_id: string;
  campaign_id: string;
  ctas: Cta[];
};

type CategoryOption = { id: number; nom: string };
type BrandOption = { id: number; nom: string };
type VariantOption = { id: number; name: string; type?: string | null; available?: boolean | null; stock_quantity?: number | null };
type ProductOption = { id: number; designation: string; has_variants: boolean; variants: VariantOption[] };

const emptyForm = (): SlideForm => ({
  status: 'draft',
  type: 'category',
  priority: 0,
  starts_at: '',
  ends_at: '',
  image_alt: '',
  title: '',
  title_ar: '',
  title_en: '',
  title_zh: '',
  subtitle: '',
  subtitle_ar: '',
  subtitle_en: '',
  subtitle_zh: '',
  description: '',
  description_ar: '',
  description_en: '',
  description_zh: '',
  category_id: '',
  brand_id: '',
  product_id: '',
  variant_id: '',
  campaign_id: '',
  ctas: [],
});

function toInputDateTime(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HeroSlidesPage: React.FC = () => {
  const apiBaseUrl = (import.meta as any)?.env?.VITE_API_BASE_URL || '';
  const API_BASE = apiBaseUrl
    ? String(apiBaseUrl).replace(/\/$/, '') + '/api'
    : '/api';

  const { user } = useAuth();
  const isPdg = user?.role === 'PDG';

  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<'' | SlideStatus>('');

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<HeroSlide | null>(null);
  const [form, setForm] = useState<SlideForm>(emptyForm());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [targetSearch, setTargetSearch] = useState('');

  const selectedProduct = useMemo(() => {
    if (!form.product_id.trim()) return null;
    const id = Number(form.product_id);
    if (!Number.isFinite(id)) return null;
    return products.find((p) => p.id === id) || null;
  }, [form.product_id, products]);

  const buildHeaders = (isMultipart = false): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (!isMultipart) headers['Content-Type'] = 'application/json';
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const fetchSlides = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set('status', filterStatus);

      const res = await fetch(`${API_BASE}/admin/hero-slides?${qs.toString()}`, {
        headers: buildHeaders(),
      });

      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setSlides((json.slides || []) as HeroSlide[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [API_BASE, filterStatus]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const fetchTargets = useCallback(async () => {
    try {
      const [catsRes, brandsRes, prodsRes] = await Promise.all([
        fetch(`${API_BASE}/categories`, { headers: buildHeaders() }),
        fetch(`${API_BASE}/brands`, { headers: buildHeaders() }),
        fetch(`${API_BASE}/ecommerce/products?in_stock_only=false&limit=300&page=1`, { headers: buildHeaders() }),
      ]);

      if (catsRes.ok) {
        const catsJson = await catsRes.json();
        const cats = Array.isArray(catsJson) ? catsJson : (catsJson.categories || catsJson.data || []);
        setCategories(
          (cats as unknown[])
            .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
            .filter((c) => c.id != null)
            .map((c) => {
              const id = Number(c.id);
              const nomRaw = (c.nom ?? c.name ?? `#${id}`) as unknown;
              return { id, nom: String(nomRaw) };
            })
            .sort((a, b) => a.nom.localeCompare(b.nom))
        );
      }

      if (brandsRes.ok) {
        const brandsJson = await brandsRes.json();
        const arr = Array.isArray(brandsJson) ? brandsJson : (brandsJson.brands || brandsJson.data || []);
        setBrands(
          (arr as unknown[])
            .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
            .filter((b) => b.id != null)
            .map((b) => {
              const id = Number(b.id);
              const nomRaw = (b.nom ?? b.name ?? `#${id}`) as unknown;
              return { id, nom: String(nomRaw) };
            })
            .sort((a, b) => a.nom.localeCompare(b.nom))
        );
      }

      if (prodsRes.ok) {
        const prodsJson = await prodsRes.json();
        const arr = Array.isArray(prodsJson) ? prodsJson : (prodsJson.products || []);
        setProducts(
          (arr as unknown[])
            .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
            .filter((p) => p.id != null)
            .map((p) => {
              const id = Number(p.id);
              const designationRaw = (p.designation ?? p.name ?? `#${id}`) as unknown;

              const hasVariants = Boolean(p.has_variants);
              const variantsObj = (p as Record<string, unknown>).variants;
              const variantsAllRaw =
                variantsObj && typeof variantsObj === 'object'
                  ? (variantsObj as Record<string, unknown>).all
                  : undefined;
              const variantsArr: unknown[] = Array.isArray(variantsAllRaw) ? (variantsAllRaw as unknown[]) : [];
              const variants: VariantOption[] = variantsArr
                .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && 'id' in v)
                .filter((v) => v.id != null)
                .map((v) => ({
                  id: Number(v.id),
                  name: String((v.name ?? v.variant_name ?? `#${v.id}`) as unknown),
                  type: v.type != null ? String(v.type) : null,
                  available: v.available != null ? Boolean(v.available) : null,
                  stock_quantity: v.stock_quantity != null ? Number(v.stock_quantity) : null,
                }));

              return { id, designation: String(designationRaw), has_variants: hasVariants, variants };
            })
            .sort((a, b) => a.designation.localeCompare(b.designation))
        );
      }
    } catch {
      // Silent: targets are optional UX helpers; page still works with manual entry.
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchSlides();
  }, [fetchSlides]);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setImageFile(null);
    setImagePreviewUrl(null);
    setTargetSearch('');
    setIsModalOpen(true);
  };

  const openEdit = (s: HeroSlide) => {
    const normalizeLoadedCtas = (raw: unknown): Cta[] => {
      const arr = Array.isArray(raw) ? raw : [];
      return arr
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((x) => {
          const label = String(x.label ?? '').trim();
          return {
            label,
            label_ar: x.label_ar != null ? String(x.label_ar) : null,
            label_en: x.label_en != null ? String(x.label_en) : null,
            label_zh: x.label_zh != null ? String(x.label_zh) : null,
            style: (String(x.style ?? '').trim() === 'secondary' ? 'secondary' : 'primary') as Cta['style'],
          };
        })
        .filter((c) => c.label);
    };

    setEditing(s);
    setForm({
      status: s.status,
      type: s.type,
      priority: Number(s.priority || 0),
      starts_at: toInputDateTime(s.starts_at),
      ends_at: toInputDateTime(s.ends_at),
      image_alt: s.image_alt || '',
      title: s.title || '',
      title_ar: String(s.title_ar || ''),
      title_en: String(s.title_en || ''),
      title_zh: String(s.title_zh || ''),
      subtitle: s.subtitle || '',
      subtitle_ar: String(s.subtitle_ar || ''),
      subtitle_en: String(s.subtitle_en || ''),
      subtitle_zh: String(s.subtitle_zh || ''),
      description: s.description || '',
      description_ar: String(s.description_ar || ''),
      description_en: String(s.description_en || ''),
      description_zh: String(s.description_zh || ''),
      category_id: s.category_id != null ? String(s.category_id) : '',
      brand_id: s.brand_id != null ? String(s.brand_id) : '',
      product_id: s.product_id != null ? String(s.product_id) : '',
      variant_id: s.variant_id != null ? String(s.variant_id) : '',
      campaign_id: s.campaign_id != null ? String(s.campaign_id) : '',
      ctas: normalizeLoadedCtas(s.ctas),
    });
    setImageFile(null);
    setImagePreviewUrl(null);
    setTargetSearch('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setImageFile(null);
    setImagePreviewUrl(null);
    setTargetSearch('');
  };

  const validateBeforeSubmit = (): string | null => {
    if (!form.title.trim()) return 'Titre requis';
    if (!editing && !imageFile) return 'Image requise (upload)';

    if (form.ctas.length > 2) return 'Max 2 CTAs';
    for (const cta of form.ctas) {
      if (!cta.label.trim()) return 'CTA: label requis';
      if (!['primary', 'secondary'].includes(cta.style)) return 'CTA: style invalide';
    }

    const hasPrimary = form.ctas.some((c) => c.style === 'primary' && c.label.trim());
    if (!hasPrimary) return 'CTA primary obligatoire';

    if (form.starts_at && form.ends_at) {
      const a = new Date(form.starts_at);
      const b = new Date(form.ends_at);
      if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && b < a) return 'ends_at doit être après starts_at';
    }

    if (form.type === 'category' && !form.category_id.trim()) return 'category_id requis';
    if (form.type === 'brand' && !form.brand_id.trim()) return 'brand_id requis';
    if (form.type === 'product' && !form.product_id.trim()) return 'product_id requis';

    if (form.type === 'product') {
      const productId = Number(form.product_id);
      const product = Number.isFinite(productId) ? products.find((p) => p.id === productId) : null;
      if (product?.has_variants && product.variants.length > 0 && !form.variant_id.trim()) {
        return 'variant_id requis (produit avec variantes)';
      }
    }

    if (form.type === 'campaign' && !form.campaign_id.trim()) return 'campaign_id requis';

    return null;
  };

  const buildJsonPayload = () => {
    const numOrNull = (s: string) => {
      const t = s.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };

    return {
      status: form.status,
      type: form.type,
      priority: Number(form.priority || 0),
      starts_at: form.starts_at ? form.starts_at : null,
      ends_at: form.ends_at ? form.ends_at : null,
      image_alt: form.image_alt.trim() || null,
      title: form.title.trim(),
      title_ar: form.title_ar.trim() || null,
      title_en: form.title_en.trim() || null,
      title_zh: form.title_zh.trim() || null,
      subtitle: form.subtitle.trim() || null,
      subtitle_ar: form.subtitle_ar.trim() || null,
      subtitle_en: form.subtitle_en.trim() || null,
      subtitle_zh: form.subtitle_zh.trim() || null,
      description: form.description.trim() || null,
      description_ar: form.description_ar.trim() || null,
      description_en: form.description_en.trim() || null,
      description_zh: form.description_zh.trim() || null,
      category_id: numOrNull(form.category_id),
      brand_id: numOrNull(form.brand_id),
      product_id: numOrNull(form.product_id),
      variant_id: numOrNull(form.variant_id),
      campaign_id: numOrNull(form.campaign_id),
      ctas: form.ctas,
    };
  };

  const buildFormDataPayload = () => {
    const fd = new FormData();
    fd.set('status', form.status);
    fd.set('type', form.type);
    fd.set('priority', String(Number(form.priority || 0)));
    fd.set('starts_at', form.starts_at || '');
    fd.set('ends_at', form.ends_at || '');
    fd.set('title', form.title);
    fd.set('title_ar', form.title_ar || '');
    fd.set('title_en', form.title_en || '');
    fd.set('title_zh', form.title_zh || '');
    fd.set('subtitle', form.subtitle || '');
    fd.set('subtitle_ar', form.subtitle_ar || '');
    fd.set('subtitle_en', form.subtitle_en || '');
    fd.set('subtitle_zh', form.subtitle_zh || '');
    fd.set('description', form.description || '');
    fd.set('description_ar', form.description_ar || '');
    fd.set('description_en', form.description_en || '');
    fd.set('description_zh', form.description_zh || '');
    fd.set('image_alt', form.image_alt || '');
    fd.set('category_id', form.category_id || '');
    fd.set('brand_id', form.brand_id || '');
    fd.set('product_id', form.product_id || '');
    fd.set('variant_id', form.variant_id || '');
    fd.set('campaign_id', form.campaign_id || '');
    fd.set('ctas', JSON.stringify(form.ctas || []));
    if (imageFile) fd.set('image', imageFile);
    return fd;
  };

  const save = async () => {
    const v = validateBeforeSubmit();
    if (v) {
      setError(v);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = editing ? `${API_BASE}/admin/hero-slides/${editing.id}` : `${API_BASE}/admin/hero-slides`;
      const method = editing ? 'PUT' : 'POST';

      const useMultipart = !editing || Boolean(imageFile);
      const body: BodyInit = useMultipart ? buildFormDataPayload() : JSON.stringify(buildJsonPayload());
      const headers = buildHeaders(useMultipart);

      const res = await fetch(url, {
        method,
        headers,
        body,
      });

      if (!res.ok) throw new Error(await res.text());
      closeModal();
      await fetchSlides();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (s: HeroSlide) => {
    const ok = confirm(`Supprimer le slide #${s.id} ?`);
    if (!ok) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/hero-slides/${s.id}`, {
        method: 'DELETE',
        headers: buildHeaders(),
      });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());
      await fetchSlides();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const visibleSlides = useMemo(() => {
    return slides.slice().sort((a, b) => {
      const p = (b.priority || 0) - (a.priority || 0);
      if (p !== 0) return p;
      return (b.id || 0) - (a.id || 0);
    });
  }, [slides]);

  const visibleIds = useMemo(() => visibleSlides.map((s) => s.id), [visibleSlides]);
  const allVisibleSelected = useMemo(() => {
    if (visibleIds.length === 0) return false;
    return visibleIds.every((id) => selectedIdSet.has(id));
  }, [visibleIds, selectedIdSet]);

  const toggleOneSelected = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(id);
      else set.delete(id);
      return Array.from(set);
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (checked) {
        visibleIds.forEach((id) => set.add(id));
      } else {
        visibleIds.forEach((id) => set.delete(id));
      }
      return Array.from(set);
    });
  };

  const translateSelected = async () => {
    if (!isPdg) {
      setError('Réservé au PDG');
      return;
    }
    if (selectedIds.length === 0) {
      setError('Sélectionnez au moins un slide à traduire');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ai/hero-slides/translate`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ ids: selectedIds, commit: true, force: false }),
      });
      if (!res.ok) throw new Error(await res.text());

      setSelectedIds([]);
      await fetchSlides();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Erreur traduction');
    } finally {
      setLoading(false);
    }
  };

  const setCta = (idx: number, patch: Partial<Cta>) => {
    setForm((prev) => {
      const next = prev.ctas.slice();
      const cur = next[idx] || { label: '', label_ar: '', label_en: '', label_zh: '', style: 'primary' };
      next[idx] = { ...cur, ...patch } as Cta;
      return { ...prev, ctas: next };
    });
  };

  const addCta = () => {
    setForm((prev) => {
      if (prev.ctas.length >= 2) return prev;
      return { ...prev, ctas: [...prev.ctas, { label: '', label_ar: '', label_en: '', label_zh: '', style: 'primary' }] };
    });
  };

  const removeCta = (idx: number) => {
    setForm((prev) => {
      const next = prev.ctas.slice();
      next.splice(idx, 1);
      return { ...prev, ctas: next };
    });
  };

  const showTargetField = (t: SlideType, field: 'category' | 'brand' | 'product' | 'variant' | 'campaign') => {
    if (field === 'category') return t === 'category';
    if (field === 'brand') return t === 'brand';
    if (field === 'campaign') return t === 'campaign';
    if (field === 'product') return t === 'product';
    if (field === 'variant') return t === 'product';
    return false;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-6 h-6 text-primary-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Slides de l’accueil</h1>
            <p className="text-sm text-gray-500">En haut de l’accueil du site et de l’application mobile. Seuls les slides « Publié » s’affichent, du plus grand ordre au plus petit.</p>
          </div>
        </div>

        {isPdg && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            Nouveau
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white p-4 border rounded-lg">
        <div>
          <label className="block text-sm text-gray-600">Statut</label>
          <select
            className="mt-1 border rounded-md px-3 py-2"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as '' | SlideStatus)}
          >
            <option value="">Tous</option>
            <option value="draft">Brouillon</option>
            <option value="published">Publié</option>
            <option value="archived">Archivé</option>
          </select>
        </div>

        <button
          onClick={fetchSlides}
          className="px-4 py-2 border rounded-md hover:bg-gray-50"
          disabled={loading}
        >
          Rafraîchir
        </button>

        <div className="flex-1" />

        <button
          onClick={translateSelected}
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={loading || !isPdg || selectedIds.length === 0}
          title={!isPdg ? 'Réservé au PDG' : selectedIds.length === 0 ? 'Sélectionnez des slides' : 'Traduire avec IA'}
        >
          Traduire (IA){selectedIds.length ? ` (${selectedIds.length})` : ''}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md whitespace-pre-wrap">{error}</div>
      )}

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => toggleAllVisible(e.target.checked)}
                  disabled={visibleIds.length === 0}
                />
              </th>
              <th className="text-left px-4 py-3">ID</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Type</th>

              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Title_ar</th>
              <th className="text-left px-4 py-3">Title_en</th>
              <th className="text-left px-4 py-3">Title_zh</th>

              <th className="text-left px-4 py-3">Subtitle</th>
              <th className="text-left px-4 py-3">Subtitle_ar</th>
              <th className="text-left px-4 py-3">Subtitle_en</th>
              <th className="text-left px-4 py-3">Subtitle_zh</th>

              <th className="text-left px-4 py-3">Description</th>
              <th className="text-left px-4 py-3">Description_ar</th>
              <th className="text-left px-4 py-3">Description_en</th>
              <th className="text-left px-4 py-3">Description_zh</th>

              <th className="text-left px-4 py-3">Btn</th>
              <th className="text-left px-4 py-3">Btn_ar</th>
              <th className="text-left px-4 py-3">Btn_en</th>
              <th className="text-left px-4 py-3">Btn_zh</th>

              <th className="text-left px-4 py-3">Schedule</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-gray-500" colSpan={22}>Chargement…</td>
              </tr>
            ) : visibleSlides.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-gray-500" colSpan={22}>Aucun slide</td>
              </tr>
            ) : (
              visibleSlides.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(s.id)}
                      onChange={(e) => toggleOneSelected(s.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-3">{s.id}</td>
                  <td className="px-4 py-3">{s.status}</td>
                  <td className="px-4 py-3">{s.type}</td>
                  <td className="px-4 py-3">{s.title || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.title_ar || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.title_en || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.title_zh || '—'}</td>

                  <td className="px-4 py-3 text-gray-600">{s.subtitle || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.subtitle_ar || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.subtitle_en || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.subtitle_zh || '—'}</td>

                  <td className="px-4 py-3 text-gray-600">{s.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.description_ar || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.description_en || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.description_zh || '—'}</td>

                  <td className="px-4 py-3 text-gray-600">
                    {(() => {
                      const arr = Array.isArray(s.ctas) ? s.ctas : [];
                      const primary = arr.find((c) => c?.style === 'primary' && String(c.label || '').trim());
                      return primary?.label || '—';
                    })()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(() => {
                      const arr = Array.isArray(s.ctas) ? s.ctas : [];
                      const primary = arr.find((c) => c?.style === 'primary' && String(c.label || '').trim());
                      return String(primary?.label_ar || '').trim() || '—';
                    })()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(() => {
                      const arr = Array.isArray(s.ctas) ? s.ctas : [];
                      const primary = arr.find((c) => c?.style === 'primary' && String(c.label || '').trim());
                      return String(primary?.label_en || '').trim() || '—';
                    })()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(() => {
                      const arr = Array.isArray(s.ctas) ? s.ctas : [];
                      const primary = arr.find((c) => c?.style === 'primary' && String(c.label || '').trim());
                      return String(primary?.label_zh || '').trim() || '—';
                    })()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>start: {s.starts_at ? new Date(s.starts_at).toLocaleString() : '—'}</div>
                    <div>end: {s.ends_at ? new Date(s.ends_at).toLocaleString() : '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isPdg ? (
                        <>
                          <button
                            className="px-3 py-2 border rounded-md hover:bg-gray-50 inline-flex items-center gap-2"
                            onClick={() => openEdit(s)}
                          >
                            <Edit3 className="w-4 h-4" />
                            Modifier
                          </button>
                          <button
                            className="px-3 py-2 border border-red-200 text-red-600 rounded-md hover:bg-red-50 inline-flex items-center gap-2"
                            onClick={() => remove(s)}
                          >
                            <Trash2 className="w-4 h-4" />
                            Supprimer
                          </button>
                        </>
                      ) : (
                        <div className="text-xs text-gray-400">Lecture seule</div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-[90vw] max-w-[1400px] max-h-[90vh] rounded-lg shadow-lg overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div className="font-semibold text-gray-900">{editing ? `Modifier #${editing.id}` : 'Nouveau slide'}</div>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="p-5 overflow-y-auto min-h-0">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-4">
              {!isPdg && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md">
                  Seul le PDG peut créer / modifier / supprimer des slides.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Statut</label>
                  <select
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as SlideStatus }))}
                  >
                    <option value="draft">Brouillon</option>
                    <option value="published">Publié</option>
                    <option value="archived">Archivé</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-600">Ouvre (au clic sur le slide)</label>
                  <select
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as SlideType }))}
                  >
                    <option value="category">Catégorie</option>
                    <option value="brand">Marque</option>
                    <option value="campaign">Campagne (promotions)</option>
                    <option value="product">Produit</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Début d’affichage (facultatif)</label>
                  <input
                    type="datetime-local"
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.starts_at}
                    onChange={(e) => setForm((p) => ({ ...p, starts_at: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600">Fin d’affichage (facultatif)</label>
                  <input
                    type="datetime-local"
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.ends_at}
                    onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Ordre d’affichage</label>
                  <input
                    type="number"
                    step={1}
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) || 0 }))}
                  />
                  <div className="mt-1 text-xs text-gray-500">Le plus grand passe en premier.</div>
                </div>
              </div>

              <p className="text-xs text-gray-500 -mb-2">Titre : la grande phrase du slide (2 lignes au plus dans l’application).</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Titre (fr) *</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Titre (ar)</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.title_ar}
                    onChange={(e) => setForm((p) => ({ ...p, title_ar: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Titre (en)</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.title_en}
                    onChange={(e) => setForm((p) => ({ ...p, title_en: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Titre (zh)</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.title_zh}
                    onChange={(e) => setForm((p) => ({ ...p, title_zh: e.target.value }))}
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 -mb-2">Surtitre : petite ligne dorée au-dessus du titre (ex. « Univers maison »). Facultatif.</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Surtitre (fr)</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.subtitle}
                    onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Surtitre (ar)</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.subtitle_ar}
                    onChange={(e) => setForm((p) => ({ ...p, subtitle_ar: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Surtitre (en)</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.subtitle_en}
                    onChange={(e) => setForm((p) => ({ ...p, subtitle_en: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Surtitre (zh)</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.subtitle_zh}
                    onChange={(e) => setForm((p) => ({ ...p, subtitle_zh: e.target.value }))}
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 -mb-2">Texte : une ou deux lignes sous le titre. Facultatif.</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Texte (fr)</label>
                  <textarea
                    className="mt-1 border rounded-md px-3 py-2 w-full min-h-[80px]"
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Texte (ar)</label>
                  <textarea
                    className="mt-1 border rounded-md px-3 py-2 w-full min-h-[80px]"
                    value={form.description_ar}
                    onChange={(e) => setForm((p) => ({ ...p, description_ar: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Texte (en)</label>
                  <textarea
                    className="mt-1 border rounded-md px-3 py-2 w-full min-h-[80px]"
                    value={form.description_en}
                    onChange={(e) => setForm((p) => ({ ...p, description_en: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Texte (zh)</label>
                  <textarea
                    className="mt-1 border rounded-md px-3 py-2 w-full min-h-[80px]"
                    value={form.description_zh}
                    onChange={(e) => setForm((p) => ({ ...p, description_zh: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Image *</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setImageFile(f);
                      if (!f) {
                        setImagePreviewUrl(null);
                        return;
                      }
                      const url = URL.createObjectURL(f);
                      setImagePreviewUrl(url);
                    }}
                  />
                  <div className="mt-1 text-xs text-gray-500">
                    Photo en largeur (paysage), au moins 1200 px. Envoyée sans compression.
                  </div>
                  {editing?.image_url && !imagePreviewUrl && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">Image actuelle</div>
                      <img loading="lazy" decoding="async"
                        src={editing.image_url}
                        alt={editing.image_alt || ''}
                        className="h-20 w-auto rounded border"
                      />
                      <div className="text-[11px] text-gray-400 mt-1 break-all">{editing.image_url}</div>
                    </div>
                  )}
                  {imagePreviewUrl && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">Aperçu</div>
                      <img loading="lazy" decoding="async"
                        src={imagePreviewUrl}
                        alt="preview"
                        className="h-20 w-auto rounded border"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Description de l’image (accessibilité)</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.image_alt}
                    onChange={(e) => setForm((p) => ({ ...p, image_alt: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {showTargetField(form.type, 'category') && (
                  <div>
                    <label className="block text-sm text-gray-600">Catégorie</label>
                    <input
                      placeholder="Rechercher..."
                      className="mt-1 border rounded-md px-3 py-2 w-full"
                      value={targetSearch}
                      onChange={(e) => setTargetSearch(e.target.value)}
                    />
                    <select
                      className="mt-2 border rounded-md px-3 py-2 w-full"
                      value={form.category_id}
                      onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
                    >
                      <option value="">-- Choisir une catégorie --</option>
                      {categories
                        .filter((c) => !targetSearch || c.nom.toLowerCase().includes(targetSearch.toLowerCase()))
                        .slice(0, 300)
                        .map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.nom} (#{c.id})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {showTargetField(form.type, 'brand') && (
                  <div>
                    <label className="block text-sm text-gray-600">Marque</label>
                    <input
                      placeholder="Rechercher..."
                      className="mt-1 border rounded-md px-3 py-2 w-full"
                      value={targetSearch}
                      onChange={(e) => setTargetSearch(e.target.value)}
                    />
                    <select
                      className="mt-2 border rounded-md px-3 py-2 w-full"
                      value={form.brand_id}
                      onChange={(e) => setForm((p) => ({ ...p, brand_id: e.target.value }))}
                    >
                      <option value="">-- Choisir une marque --</option>
                      {brands
                        .filter((b) => !targetSearch || b.nom.toLowerCase().includes(targetSearch.toLowerCase()))
                        .slice(0, 300)
                        .map((b) => (
                          <option key={b.id} value={String(b.id)}>
                            {b.nom} (#{b.id})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {showTargetField(form.type, 'campaign') && (
                  <div>
                    <label className="block text-sm text-gray-600">N° de campagne</label>
                    <input
                      className="mt-1 border rounded-md px-3 py-2 w-full"
                      value={form.campaign_id}
                      onChange={(e) => setForm((p) => ({ ...p, campaign_id: e.target.value }))}
                    />
                  </div>
                )}

                {showTargetField(form.type, 'product') && (
                  <div>
                    <label className="block text-sm text-gray-600">Produit</label>
                    <input
                      placeholder="Rechercher..."
                      className="mt-1 border rounded-md px-3 py-2 w-full"
                      value={targetSearch}
                      onChange={(e) => setTargetSearch(e.target.value)}
                    />
                    <select
                      className="mt-2 border rounded-md px-3 py-2 w-full"
                      value={form.product_id}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          product_id: e.target.value,
                          variant_id: '',
                        }))
                      }
                    >
                      <option value="">-- Choisir un produit --</option>
                      {products
                        .filter((p) => !targetSearch || p.designation.toLowerCase().includes(targetSearch.toLowerCase()))
                        .slice(0, 300)
                        .map((p) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.designation} (#{p.id})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {showTargetField(form.type, 'variant') && (
                  <div>
                    <label className="block text-sm text-gray-600">
                      variant_id {selectedProduct?.has_variants ? '(requis)' : '(optionnel)'}
                    </label>

                    {selectedProduct?.has_variants && selectedProduct.variants.length > 0 ? (
                      <select
                        className="mt-1 border rounded-md px-3 py-2 w-full"
                        value={form.variant_id}
                        onChange={(e) => setForm((p) => ({ ...p, variant_id: e.target.value }))}
                      >
                        <option value="">-- Choisir une variante --</option>
                        {selectedProduct.variants.map((v) => {
                          const meta = [v.type, v.available === false ? 'rupture' : null]
                            .filter(Boolean)
                            .join(' • ');
                          return (
                            <option key={v.id} value={String(v.id)}>
                              {v.name} (#{v.id}){meta ? ` — ${meta}` : ''}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <input
                        className="mt-1 border rounded-md px-3 py-2 w-full"
                        value={form.variant_id}
                        onChange={(e) => setForm((p) => ({ ...p, variant_id: e.target.value }))}
                        placeholder={selectedProduct?.has_variants ? 'Chargement des variantes…' : 'Optionnel'}
                      />
                    )}

                    {selectedProduct?.has_variants && selectedProduct.variants.length === 0 && (
                      <div className="mt-1 text-xs text-gray-500">
                        Ce produit a des variantes, mais aucune variante n'a été chargée (vérifie l'API produits).
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">Boutons (2 au plus)</div>
                    <div className="text-xs text-gray-500">Un bouton « Principal » est obligatoire ; c’est lui qui s’affiche dans l’application.</div>
                  </div>
                  <button
                    className="px-3 py-2 border rounded-md hover:bg-gray-50"
                    onClick={addCta}
                    disabled={form.ctas.length >= 2}
                  >
                    Ajouter un bouton
                  </button>
                </div>

                {form.ctas.length === 0 ? (
                  <div className="text-sm text-gray-500">Aucun bouton</div>
                ) : (
                  <div className="space-y-3">
                    {form.ctas.map((cta, idx) => (
                      <div key={idx} className="border rounded-lg p-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-sm text-gray-600">Texte du bouton (fr)</label>
                            <input
                              className="mt-1 border rounded-md px-3 py-2 w-full"
                              value={cta.label}
                              onChange={(e) => setCta(idx, { label: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600">Texte du bouton (ar)</label>
                            <input
                              className="mt-1 border rounded-md px-3 py-2 w-full"
                              value={String(cta.label_ar || '')}
                              onChange={(e) => setCta(idx, { label_ar: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600">Texte du bouton (en)</label>
                            <input
                              className="mt-1 border rounded-md px-3 py-2 w-full"
                              value={String(cta.label_en || '')}
                              onChange={(e) => setCta(idx, { label_en: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600">Texte du bouton (zh)</label>
                            <input
                              className="mt-1 border rounded-md px-3 py-2 w-full"
                              value={String(cta.label_zh || '')}
                              onChange={(e) => setCta(idx, { label_zh: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                          <div>
                            <label className="block text-sm text-gray-600">Rôle</label>
                            <select
                              className="mt-1 border rounded-md px-3 py-2 w-full"
                              value={cta.style}
                              onChange={(e) => setCta(idx, { style: e.target.value as Cta['style'] })}
                            >
                              <option value="primary">Principal</option>
                              <option value="secondary">Secondaire</option>
                            </select>
                          </div>
                          <div className="md:col-span-3">
                            <button
                              className="px-3 py-2 border border-red-200 text-red-600 rounded-md hover:bg-red-50 w-full"
                              onClick={() => removeCta(idx)}
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
              <AppSlidePreview
                image={imagePreviewUrl || editing?.image_url || null}
                eyebrow={form.subtitle}
                title={form.title}
                text={form.description}
                cta={form.ctas.find((cta) => cta.style === 'primary')?.label || ''}
              />
              </div>
            </div>

            <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
              <button onClick={closeModal} className="px-4 py-2 border rounded-md hover:bg-gray-50">Annuler</button>
              <button
                onClick={save}
                disabled={loading || !isPdg}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
              >
                {editing ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** The slide as the mobile app shows it at the top of its home (same layout and line limits, French texts). */
function AppSlidePreview({ image, eyebrow, title, text, cta }: { image: string | null; eyebrow: string; title: string; text: string; cta: string }) {
  return (
    <aside className="lg:sticky lg:top-0 self-start">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Aperçu dans l’application</div>
      <div className="rounded-[28px] bg-black p-3 shadow-lg">
        <div className="relative h-[250px] overflow-hidden rounded-[20px] bg-neutral-900">
          {image
            ? <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            : <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500">Ajoutez une image</div>}
          <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/25 to-black/85" />
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4">
            {eyebrow.trim() && <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-[#F1D27F]">{eyebrow}</div>}
            <div className="line-clamp-2 text-xl font-extrabold leading-tight text-white">{title.trim() || 'Titre du slide'}</div>
            {text.trim() && <div className="line-clamp-2 text-xs leading-snug text-white/80">{text}</div>}
            <div className="!mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-br from-[#F1D27F] to-[#A97D1E] px-3.5 text-xs font-bold text-[#1A1405]">{cta.trim() || 'Découvrir'} →</div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-gray-500">Le titre et le texte sont coupés à 2 lignes. Sur le site, le slide garde le même contenu dans sa propre mise en page.</p>
    </aside>
  );
}

export default HeroSlidesPage;
