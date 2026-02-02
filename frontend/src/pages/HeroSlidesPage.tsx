import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../hooks/redux';

type Locale = 'fr' | 'ar';
type SlideType = 'category' | 'brand' | 'campaign' | 'product';
type SlideStatus = 'draft' | 'published' | 'archived';

type Cta = {
  label: string;
  style: 'primary' | 'secondary';
};

type HeroSlide = {
  id: number;
  type: SlideType;
  status: SlideStatus;
  priority: number;
  locale: Locale;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string;
  image_alt: string | null;
  title: string;
  subtitle: string | null;
  category_id: number | null;
  brand_id: number | null;
  product_id: number | null;
  variant_id: number | null;
  campaign_id: number | null;
  ctas: Cta[];
  updated_at?: string;
};

type SlideForm = {
  locale: Locale;
  status: SlideStatus;
  type: SlideType;
  priority: number;
  starts_at: string;
  ends_at: string;
  image_alt: string;
  title: string;
  subtitle: string;
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
  locale: 'fr',
  status: 'draft',
  type: 'category',
  priority: 0,
  starts_at: '',
  ends_at: '',
  image_alt: '',
  title: '',
  subtitle: '',
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

  const [filterLocale, setFilterLocale] = useState<Locale>('fr');
  const [filterStatus, setFilterStatus] = useState<'' | SlideStatus>('');

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
      qs.set('locale', filterLocale);
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
  }, [API_BASE, filterLocale, filterStatus]);

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
            style: (String(x.style ?? '').trim() === 'secondary' ? 'secondary' : 'primary') as Cta['style'],
          };
        })
        .filter((c) => c.label);
    };

    setEditing(s);
    setForm({
      locale: s.locale,
      status: s.status,
      type: s.type,
      priority: Number(s.priority || 0),
      starts_at: toInputDateTime(s.starts_at),
      ends_at: toInputDateTime(s.ends_at),
      image_alt: s.image_alt || '',
      title: s.title || '',
      subtitle: s.subtitle || '',
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
      locale: form.locale,
      status: form.status,
      type: form.type,
      priority: Number(form.priority || 0),
      starts_at: form.starts_at ? form.starts_at : null,
      ends_at: form.ends_at ? form.ends_at : null,
      image_alt: form.image_alt.trim() || null,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
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
    fd.set('locale', form.locale);
    fd.set('status', form.status);
    fd.set('type', form.type);
    fd.set('priority', String(Number(form.priority || 0)));
    fd.set('starts_at', form.starts_at || '');
    fd.set('ends_at', form.ends_at || '');
    fd.set('title', form.title);
    fd.set('subtitle', form.subtitle || '');
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

  const setCta = (idx: number, patch: Partial<Cta>) => {
    setForm((prev) => {
      const next = prev.ctas.slice();
      const cur = next[idx] || { label: '', style: 'primary' };
      next[idx] = { ...cur, ...patch } as Cta;
      return { ...prev, ctas: next };
    });
  };

  const addCta = () => {
    setForm((prev) => {
      if (prev.ctas.length >= 2) return prev;
      return { ...prev, ctas: [...prev.ctas, { label: '', style: 'primary' }] };
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
          <h1 className="text-2xl font-bold text-gray-900">Hero Slides</h1>
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
          <label className="block text-sm text-gray-600">Locale</label>
          <select
            className="mt-1 border rounded-md px-3 py-2"
            value={filterLocale}
            onChange={(e) => setFilterLocale(e.target.value as Locale)}
          >
            <option value="fr">fr</option>
            <option value="ar">ar</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-600">Status</label>
          <select
            className="mt-1 border rounded-md px-3 py-2"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as '' | SlideStatus)}
          >
            <option value="">Tous</option>
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </div>

        <button
          onClick={fetchSlides}
          className="px-4 py-2 border rounded-md hover:bg-gray-50"
          disabled={loading}
        >
          Rafraîchir
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md whitespace-pre-wrap">{error}</div>
      )}

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left px-4 py-3">ID</th>
              <th className="text-left px-4 py-3">Locale</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Priority</th>
              <th className="text-left px-4 py-3">Titre</th>
              <th className="text-left px-4 py-3">Schedule</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-gray-500" colSpan={8}>Chargement…</td>
              </tr>
            ) : visibleSlides.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-gray-500" colSpan={8}>Aucun slide</td>
              </tr>
            ) : (
              visibleSlides.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3">{s.id}</td>
                  <td className="px-4 py-3">{s.locale}</td>
                  <td className="px-4 py-3">{s.status}</td>
                  <td className="px-4 py-3">{s.type}</td>
                  <td className="px-4 py-3">{s.priority}</td>
                  <td className="px-4 py-3">{s.title}</td>
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-lg shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div className="font-semibold text-gray-900">{editing ? `Modifier #${editing.id}` : 'Nouveau slide'}</div>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {!isPdg && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md">
                  Seul le PDG peut créer / modifier / supprimer des slides.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Locale</label>
                  <select
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.locale}
                    onChange={(e) => setForm((p) => ({ ...p, locale: e.target.value as Locale }))}
                  >
                    <option value="fr">fr</option>
                    <option value="ar">ar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-600">Status</label>
                  <select
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as SlideStatus }))}
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                    <option value="archived">archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-600">Type</label>
                  <select
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as SlideType }))}
                  >
                    <option value="category">category</option>
                    <option value="brand">brand</option>
                    <option value="campaign">campaign</option>
                    <option value="product">product</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Priority</label>
                  <input
                    type="number"
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600">Starts at</label>
                  <input
                    type="datetime-local"
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.starts_at}
                    onChange={(e) => setForm((p) => ({ ...p, starts_at: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600">Ends at</label>
                  <input
                    type="datetime-local"
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.ends_at}
                    onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Titre</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Sous-titre</label>
                  <input
                    className="mt-1 border rounded-md px-3 py-2 w-full"
                    value={form.subtitle}
                    onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Image (upload)</label>
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
                    Upload direct (sans compression) pour garder la même qualité.
                  </div>
                  {editing?.image_url && !imagePreviewUrl && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">Image actuelle</div>
                      <img
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
                      <img
                        src={imagePreviewUrl}
                        alt="preview"
                        className="h-20 w-auto rounded border"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Image ALT</label>
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
                    <label className="block text-sm text-gray-600">campaign_id</label>
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
                  <div className="font-medium text-gray-900">CTAs (max 2)</div>
                  <button
                    className="px-3 py-2 border rounded-md hover:bg-gray-50"
                    onClick={addCta}
                    disabled={form.ctas.length >= 2}
                  >
                    Ajouter CTA
                  </button>
                </div>

                {form.ctas.length === 0 ? (
                  <div className="text-sm text-gray-500">Aucun CTA</div>
                ) : (
                  <div className="space-y-3">
                    {form.ctas.map((cta, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                        <div className="md:col-span-2">
                          <label className="block text-sm text-gray-600">Label</label>
                          <input
                            className="mt-1 border rounded-md px-3 py-2 w-full"
                            value={cta.label}
                            onChange={(e) => setCta(idx, { label: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600">Style</label>
                          <select
                            className="mt-1 border rounded-md px-3 py-2 w-full"
                            value={cta.style}
                            onChange={(e) => setCta(idx, { style: e.target.value as Cta['style'] })}
                          >
                            <option value="primary">primary</option>
                            <option value="secondary">secondary</option>
                          </select>
                        </div>
                        <div>
                          <button
                            className="px-3 py-2 border border-red-200 text-red-600 rounded-md hover:bg-red-50 w-full"
                            onClick={() => removeCta(idx)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

export default HeroSlidesPage;
