import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Aperture, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, ImageOff, ImageUp, Loader2, RefreshCw, RotateCcw, Search, Sparkles, X, ZoomIn } from 'lucide-react';
import type { AiImageModel, AiImageQuality } from '../store/api/productPhotosApi';
import {
  type EnhancementImage,
  type ImageEnhancementTab,
  type ImageUsageKind,
  useEnhanceImagesMutation,
  useGetEnhancementImagesQuery,
  useMarkImagesTreatedMutation,
  useUnmarkImagesTreatedMutation,
} from '../store/api/productImageEnhancementApi';
import { useGetCategoriesQuery } from '../store/api/categoriesApi';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
import { toBackendUrl } from '../utils/url';

const PAGE_SIZES = [24, 48, 96, 200] as const;
// La page détail produit du site affiche l'image principale en carré, object-contain, fond blanc (~560 px).
const SITE_DETAIL_SIZE = 560;
const TILE_SIZES = [
  { id: 'small', label: 'Petite', px: 170 },
  { id: 'medium', label: 'Moyenne', px: 260 },
  { id: 'site', label: 'Taille site', px: SITE_DETAIL_SIZE },
] as const;
type TileSize = (typeof TILE_SIZES)[number]['id'];
// En dessous, l'image est agrandie par le navigateur sur la page détail et paraît floue.
const LOW_RESOLUTION_PX = 800;

const kindLabels: Record<ImageUsageKind, string> = {
  product: 'Principale',
  product_gallery: 'Galerie',
  variant: 'Variante',
  variant_gallery: 'Galerie variante',
};

const QUALITY_HELP: Record<AiImageQuality, string> = {
  low: 'Traitement le plus économique, adapté aux lots et aux premiers essais.',
  medium: 'Bon équilibre entre coût et rendu pour la majorité des photos produit.',
  high: 'Rendu maximal pour les produits complexes, avec un traitement plus coûteux.',
};

const formatUsd = (value: number) => `${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} $`;
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const formatDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
};

/** Cadre identique à la page détail du site : carré, fond blanc, image contenue. */
const SiteFrame: React.FC<{ url: string; alt: string; onSize?: (size: { w: number; h: number }) => void; className?: string }> = ({ url, alt, onSize, className }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative aspect-square w-full overflow-hidden rounded-md border border-stone-200 bg-white ${className ?? ''}`}>
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-stone-400"><ImageOff className="h-6 w-6" /><span className="text-[11px]">Image introuvable</span></div>
      ) : (
        <img
          src={toBackendUrl(url)} alt={alt} loading="lazy" decoding="async"
          onLoad={(event) => onSize?.({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
    </div>
  );
};

const ImageTile = React.memo<{
  image: EnhancementImage;
  tab: ImageEnhancementTab;
  selected: boolean;
  busy: boolean;
  onToggle: (url: string, shiftKey: boolean) => void;
  onQuickToggleTreated: (image: EnhancementImage) => void;
  onPreview: (image: EnhancementImage) => void;
}>(({ image, tab, selected, busy, onToggle, onQuickToggleTreated, onPreview }) => {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const main = image.usages[0];
  const processing = image.status === 'processing';
  const lowRes = size !== null && Math.max(size.w, size.h) < LOW_RESOLUTION_PX;
  const extraUsages = image.usages.length - 1;

  return (
    <div className={`group relative flex flex-col rounded-xl border bg-white p-2 shadow-sm transition ${selected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-stone-200 hover:border-stone-300 hover:shadow-md'}`}>
      <div className="relative">
        <button type="button" onClick={(event) => (processing ? undefined : onToggle(image.url, event.shiftKey))} className="block w-full cursor-pointer text-left" aria-label={`Sélectionner l'image de ${main.designation}`}>
          <SiteFrame url={image.url} alt={main.designation} onSize={setSize} />
        </button>

        <input
          type="checkbox" checked={selected} disabled={processing}
          onChange={() => undefined}
          onClick={(event) => onToggle(image.url, event.shiftKey)}
          aria-label="Sélectionner"
          className="absolute left-2 top-2 h-5 w-5 cursor-pointer rounded border-stone-300 text-indigo-600 shadow focus:ring-indigo-500 disabled:opacity-40"
        />

        <div className="absolute right-2 top-2 flex gap-1">
          <button type="button" onClick={() => onPreview(image)} title="Aperçu taille site" className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-600 shadow-sm transition hover:text-stone-900">
            <ZoomIn className="h-4 w-4" />
          </button>
          {!processing ? (
            <button
              type="button" onClick={() => onQuickToggleTreated(image)} disabled={busy}
              title={tab === 'untreated' ? 'Marquer comme traitée' : image.method === 'ai' ? "Remettre en non traitée (restaure l'original)" : 'Remettre en non traitée'}
              className={`flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition disabled:opacity-50 ${tab === 'untreated' ? 'border-emerald-200 bg-white/95 text-emerald-600 hover:bg-emerald-600 hover:text-white' : 'border-stone-200 bg-white/95 text-stone-600 hover:bg-stone-800 hover:text-white'}`}
            >
              {tab === 'untreated' ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
            </button>
          ) : null}
        </div>

        {processing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-white/75 text-sm font-semibold text-indigo-700 backdrop-blur-[1px]">
            <Loader2 className="h-6 w-6 animate-spin" /> Amélioration IA…
          </div>
        ) : null}
      </div>

      <div className="mt-2 min-w-0 px-0.5">
        <p className="truncate text-sm font-bold text-stone-900" title={main.designation}>{main.designation}</p>
        <p className="truncate text-xs text-stone-500">
          {main.variant_name ? <span className="font-semibold text-indigo-700">{main.variant_name} · </span> : null}ID {main.product_id}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">{kindLabels[main.kind]}</span>
          {extraUsages > 0 ? (
            <span title={image.usages.slice(1).map((usage) => `${kindLabels[usage.kind]} · ${usage.designation}${usage.variant_name ? ` · ${usage.variant_name}` : ''}`).join('\n')} className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">+{extraUsages} utilisation{extraUsages > 1 ? 's' : ''}</span>
          ) : null}
          {size ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${lowRes ? 'border border-amber-200 bg-amber-50 text-amber-800' : 'border border-stone-200 bg-white text-stone-500'}`} title={lowRes ? 'Résolution faible pour la page détail du site' : 'Résolution réelle'}>{size.w}×{size.h}</span> : null}
          {image.status === 'error' ? <span title={image.error_message || ''} className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700"><AlertCircle className="h-3 w-3" /> Échec IA</span> : null}
          {image.status === 'treated' ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${image.method === 'ai' ? 'border border-indigo-200 bg-indigo-50 text-indigo-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {image.method === 'ai' ? `IA${image.ai_quality ? ` · ${image.ai_quality}` : ''}` : 'Manuel'}
            </span>
          ) : null}
        </div>
        {image.status === 'treated' && (image.treated_at || image.ai_cost_usd != null) ? (
          <p className="mt-1 text-[10px] text-stone-400">{formatDate(image.treated_at)}{image.ai_cost_usd != null ? ` · ${formatUsd(image.ai_cost_usd)}` : ''}</p>
        ) : null}
      </div>
    </div>
  );
});
ImageTile.displayName = 'ImageTile';

const PreviewModal: React.FC<{ image: EnhancementImage; onClose: () => void }> = ({ image, onClose }) => {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  const main = image.usages[0];
  const compare = Boolean(image.original_url);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="max-h-full overflow-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-bold text-stone-900">{main.designation}{main.variant_name ? <span className="text-indigo-700"> · {main.variant_name}</span> : null}</p>
            <p className="text-xs text-stone-500">Aperçu à la taille de la page détail du site ({SITE_DETAIL_SIZE} px)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        <div className={`flex flex-col gap-4 ${compare ? 'lg:flex-row' : ''}`}>
          {compare ? (
            <div style={{ width: `min(${SITE_DETAIL_SIZE}px, 85vw)` }}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-500">Avant</p>
              <SiteFrame url={image.original_url!} alt="Original" />
            </div>
          ) : null}
          {compare ? <ArrowRight className="hidden h-6 w-6 shrink-0 self-center text-stone-400 lg:block" /> : null}
          <div style={{ width: `min(${SITE_DETAIL_SIZE}px, 85vw)` }}>
            {compare ? <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-indigo-600">Après (IA)</p> : null}
            <SiteFrame url={image.url} alt={main.designation} />
          </div>
        </div>
      </div>
    </div>
  );
};

const ImageEnhancementPage: React.FC = () => {
  const [tab, setTab] = useState<ImageEnhancementTab>('untreated');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(48);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [tileSize, setTileSize] = useState<TileSize>('medium');
  const [model, setModel] = useState<AiImageModel>('gpt-image-2');
  const [quality, setQuality] = useState<AiImageQuality>('low');
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [preview, setPreview] = useState<EnhancementImage | null>(null);
  const lastIndex = useRef<number | null>(null);
  const defaultsApplied = useRef(false);

  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);

  const { data: categories = [] } = useGetCategoriesQuery();
  const [pollingInterval, setPollingInterval] = useState(0);
  const { data, isLoading, isFetching, isError, refetch } = useGetEnhancementImagesQuery(
    { tab, page, limit, q: query || undefined, category_id: categoryId === '' ? undefined : categoryId },
    { refetchOnMountOrArgChange: true, pollingInterval }
  );
  const [markTreated, { isLoading: isMarking }] = useMarkImagesTreatedMutation();
  const [unmarkTreated, { isLoading: isUnmarking }] = useUnmarkImagesTreatedMutation();
  const [enhanceImages, { isLoading: isEnhancing }] = useEnhanceImagesMutation();
  const busy = isMarking || isUnmarking || isEnhancing;
  const images = useMemo(() => data?.data ?? [], [data]);
  const counts = data?.counts;
  const meta = data?.meta;

  // Rafraîchit automatiquement tant que des images sont en cours de traitement IA.
  useEffect(() => { setPollingInterval((counts?.processing ?? 0) > 0 ? 4000 : 0); }, [counts?.processing]);

  useEffect(() => {
    if (!data?.defaults || defaultsApplied.current) return;
    defaultsApplied.current = true;
    setModel(data.defaults.model);
    setQuality(data.defaults.quality);
  }, [data?.defaults]);

  useEffect(() => { setSelected({}); lastIndex.current = null; }, [tab, page, limit, query, categoryId]);
  useEffect(() => { setPage(1); }, [limit, categoryId, tab]);

  const selectableImages = useMemo(() => images.filter((image) => image.status !== 'processing'), [images]);
  const selectedUrls = selectableImages.filter((image) => selected[image.url]).map((image) => image.url);
  const allSelected = selectableImages.length > 0 && selectedUrls.length === selectableImages.length;

  const toggle = useCallback((url: string, shiftKey: boolean) => {
    const index = images.findIndex((image) => image.url === url);
    setSelected((previous) => {
      const turningOn = !previous[url];
      const anchor = shiftKey && lastIndex.current !== null ? lastIndex.current : index;
      const [start, end] = anchor <= index ? [anchor, index] : [index, anchor];
      const next = { ...previous };
      for (let cursor = start; cursor <= end; cursor += 1) {
        const target = images[cursor];
        if (!target || target.status === 'processing') continue;
        if (turningOn) next[target.url] = true; else delete next[target.url];
      }
      return next;
    });
    lastIndex.current = index;
  }, [images]);

  const toggleAll = () => {
    lastIndex.current = null;
    setSelected(allSelected ? {} : Object.fromEntries(selectableImages.map((image) => [image.url, true])) as Record<string, true>);
  };

  const apiMessage = (error: unknown, fallback: string) => (error as { data?: { message?: string } })?.data?.message || fallback;

  const runMark = async (urls: string[]) => {
    if (!urls.length || busy) return;
    try {
      const result = await markTreated({ urls }).unwrap();
      setSelected({});
      showSuccess(`${result.marked} image(s) marquée(s) comme traitée(s)`);
    } catch (error) { showError(apiMessage(error, 'Impossible de marquer ces images.')); }
  };

  const runUnmark = async (urls: string[]) => {
    if (!urls.length || busy) return;
    const aiCount = images.filter((image) => urls.includes(image.url) && image.method === 'ai').length;
    const confirmation = await showConfirmation(
      `${urls.length} image(s) repasseront dans « Non traitées ».${aiCount ? ` ${aiCount} image(s) améliorée(s) par IA retrouveront leur image originale sur le site.` : ''}`,
      'Remettre en non traitées ?'
    );
    if (!confirmation.isConfirmed) return;
    try {
      const result = await unmarkTreated({ urls }).unwrap();
      setSelected({});
      showSuccess(`${result.unmarked} image(s) remise(s) en non traitée(s)${result.restored ? `, dont ${result.restored} original(aux) restauré(s)` : ''}`);
      if (result.failed.length) showError(result.failed.map((failure) => failure.message).join('\n'), `${result.failed.length} image(s) non restaurée(s)`);
    } catch (error) { showError(apiMessage(error, 'Impossible de remettre ces images en non traitées.')); }
  };

  const runEnhance = async () => {
    if (!selectedUrls.length || busy) return;
    const confirmation = await showConfirmation(
      `${selectedUrls.length} image(s) seront envoyées à l’IA (${model}, qualité ${quality}). Chaque image améliorée remplace l’originale sur le produit et le site ; l’original reste restaurable depuis l’onglet « Traitées ».`,
      'Améliorer la qualité avec l’IA ?'
    );
    if (!confirmation.isConfirmed) return;
    try {
      const result = await enhanceImages({ urls: selectedUrls, model, quality }).unwrap();
      setSelected({});
      showSuccess(`${result.queued} image(s) en cours d’amélioration${result.skipped ? ` · ${result.skipped} ignorée(s) (déjà traitée ou en cours)` : ''}`);
      setPollingInterval(4000);
    } catch (error) { showError(apiMessage(error, 'Impossible de lancer l’amélioration IA.')); }
  };

  const quickToggleTreated = useCallback((image: EnhancementImage) => {
    if (tab === 'untreated') void runMark([image.url]);
    else void runUnmark([image.url]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, busy, images]);

  const tilePx = TILE_SIZES.find((size) => size.id === tileSize)?.px ?? 260;

  return (
    <main className="min-h-full bg-stone-50 pb-28 lg:pb-10">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-700"><ImageUp className="h-4 w-4" /> Fiches produits · images</div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-950">Amélioration qualité images</h1>
              <p className="mt-1 max-w-3xl text-sm text-stone-500">Toutes les images principales et de galerie des produits et variantes, affichées comme sur la page détail du site. Marquez-les comme traitées d’un clic, ou sélectionnez-en plusieurs pour les améliorer avec l’IA.</p>
            </div>
            <section className="rounded-xl border border-orange-200 bg-orange-50/50 p-3 xl:w-[460px]" aria-labelledby="enhance-ai-config">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 id="enhance-ai-config" className="flex items-center gap-2 text-sm font-semibold text-stone-800"><Aperture className="h-4 w-4 text-orange-600" /> Configuration IA</h2>
                {model === 'gpt-image-2' && quality === 'medium' ? <span className="rounded-full border border-orange-200 bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">Recommandé · Équilibré</span> : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-stone-700">Modèle
                  <select value={model} onChange={(event) => setModel(event.target.value as AiImageModel)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="gpt-image-2">GPT Image 2 — recommandé</option>
                    <option value="gpt-image-1.5">GPT Image 1.5 — ancien</option>
                    <option value="gpt-image-1-mini">GPT Image 1 mini — économique</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-stone-700">Qualité
                  <select value={quality} onChange={(event) => setQuality(event.target.value as AiImageQuality)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="low">Faible — économique</option>
                    <option value="medium">Moyenne — équilibrée</option>
                    <option value="high">Élevée — qualité maximale</option>
                  </select>
                </label>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-600">{QUALITY_HELP[quality]}</p>
            </section>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-stone-100 pt-4 md:flex-row md:items-center md:justify-between">
            <nav className="flex gap-1" aria-label="État des images">
              {([{ id: 'untreated', label: 'Non traitées', count: counts?.untreated }, { id: 'treated', label: 'Traitées', count: counts?.treated }] as const).map((item) => (
                <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`relative inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold transition ${tab === item.id ? 'text-stone-950' : 'text-stone-500 hover:text-stone-800'}`}>
                  {item.label}
                  {item.count != null ? <span className="rounded-full bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-stone-700">{item.count}</span> : null}
                  {tab === item.id ? <span className="absolute inset-x-2 -bottom-[17px] h-0.5 bg-indigo-600" /> : null}
                </button>
              ))}
              {counts?.processing ? <span className="ml-2 inline-flex items-center gap-1.5 self-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {counts.processing} en cours</span> : null}
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative block w-full md:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID, produit, variante…" className="h-10 w-full rounded-lg border-stone-300 bg-stone-50 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-indigo-500 focus:ring-indigo-500" />
              </label>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : '')} aria-label="Filtrer par catégorie" className="h-10 max-w-[13rem] rounded-lg border-stone-300 bg-stone-50 px-3 text-sm font-medium text-stone-900 focus:border-indigo-500 focus:ring-indigo-500">
                <option value="">Toutes les catégories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.nom}</option>)}
              </select>
              <div className="flex items-center gap-0.5 rounded-lg bg-stone-100 p-0.5" role="group" aria-label="Taille des images">
                {TILE_SIZES.map((size) => (
                  <button key={size.id} type="button" onClick={() => setTileSize(size.id)} className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition ${tileSize === size.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>{size.label}</button>
                ))}
              </div>
              <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} aria-label="Images par page" className="h-10 rounded-lg border-stone-300 bg-stone-50 px-2 text-sm font-bold tabular-nums text-stone-900 focus:border-indigo-500 focus:ring-indigo-500">
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / page</option>)}
              </select>
              <button type="button" onClick={() => void refetch()} disabled={isFetching} aria-label="Actualiser" className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></button>
            </div>
          </div>
        </div>
      </header>

      {images.length > 0 ? (
        <div className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={busy || !selectableImages.length} className="h-4 w-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
                Tout sélectionner (page)
              </label>
              <span className="text-sm font-bold tabular-nums text-stone-900">{selectedUrls.length} sélectionnée(s)</span>
              {selectedUrls.length ? <button type="button" onClick={() => setSelected({})} className="text-xs font-semibold text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline">Désélectionner</button> : null}
              <span className="hidden text-[11px] text-stone-500 lg:inline">Maj + clic pour sélectionner une plage</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {tab === 'untreated' ? (
                <>
                  <button type="button" onClick={() => void runMark(selectedUrls)} disabled={!selectedUrls.length || busy} className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
                    {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Marquer traitées {selectedUrls.length ? `(${selectedUrls.length})` : ''}
                  </button>
                  <button type="button" onClick={() => void runEnhance()} disabled={!selectedUrls.length || busy || selectedUrls.length > 100} className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50" title={selectedUrls.length > 100 ? '100 images maximum par lot' : undefined}>
                    {isEnhancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Améliorer avec l’IA {selectedUrls.length ? `(${selectedUrls.length})` : ''}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => void runUnmark(selectedUrls)} disabled={!selectedUrls.length || busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-stone-800 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50">
                  {isUnmarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Remettre en non traitées {selectedUrls.length ? `(${selectedUrls.length})` : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <section className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6">
        {isLoading ? (
          <div className="flex min-h-72 items-center justify-center rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-500"><Loader2 className="mr-2 h-5 w-5 animate-spin text-indigo-600" /> Chargement des images…</div>
        ) : isError ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-red-200 bg-white p-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="mt-3 font-bold text-stone-900">Impossible de charger les images</p>
            <button type="button" onClick={() => void refetch()} className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm font-bold text-white">Réessayer</button>
          </div>
        ) : images.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-stone-200 bg-white p-8 text-center">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            <p className="mt-3 font-bold text-stone-900">{query || categoryId !== '' ? 'Aucune image pour ce filtre' : tab === 'untreated' ? 'Toutes les images sont traitées' : 'Aucune image traitée pour le moment'}</p>
          </div>
        ) : (
          <div className={`grid gap-3 transition-opacity ${isFetching && !pollingInterval ? 'opacity-70' : ''}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${tilePx}px, 100%), 1fr))` }}>
            {images.map((image) => (
              <ImageTile
                key={image.url} image={image} tab={tab} selected={Boolean(selected[image.url])} busy={busy}
                onToggle={toggle} onQuickToggleTreated={quickToggleTreated} onPreview={setPreview}
              />
            ))}
          </div>
        )}

        {meta && meta.total > 0 ? (
          <div className="mt-5 flex flex-col gap-3 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between">
            <span><span className="font-bold tabular-nums text-stone-900">{meta.total}</span> image(s) · page {meta.page} sur {meta.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 font-semibold text-stone-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Précédent</button>
              <button type="button" disabled={page >= meta.totalPages || isFetching} onClick={() => setPage((value) => value + 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 font-semibold text-stone-700 disabled:opacity-40">Suivant <ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        ) : null}
      </section>

      {preview ? <PreviewModal image={preview} onClose={() => setPreview(null)} /> : null}
    </main>
  );
};

export default ImageEnhancementPage;
