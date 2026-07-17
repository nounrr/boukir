import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import {
  Camera, X, Trash2, Wand2, Search, ImagePlus, Check,
  Link2, RefreshCw, Star, ChevronLeft, ChevronRight, Loader2, History, Aperture, ZoomIn,
  ImageOff, Upload, FolderUp, AlertTriangle
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { useSearchBonProductsQuery } from '../store/api/productsApi';
import {
  useGetPhotoShootsQuery,
  useGetPhotoShootStatusCountsQuery,
  useGetManualPhotoProductsQuery,
  useCreatePhotoShootMutation,
  useDeletePhotoShootMutation,
  useDeletePhotoImageMutation,
  useProcessPhotoShootsMutation,
  useReprocessPhotoImageMutation,
  useReorderPhotoImagesMutation,
  useAttachPhotoShootMutation,
  useAttachManualProductPhotosMutation,
  useUploadManualProductPhotosMutation,
  useUploadManualProductPhotosBatchMutation,
  useDeleteManualProductPhotoMutation,
  useRejectManualProductPhotoMutation,
} from '../store/api/productPhotosApi';
import type {
  AiImageModel,
  AiImageQuality,
  PhotoShoot,
  PhotoShootImage,
  PhotoShootStatus,
  ManualProductImageStatus,
  ManualProductPhoto,
  ManualPhotoProduct,
  ManualPhotoBatchResponse,
} from '../store/api/productPhotosApi';
import { useAuth } from '../hooks/redux';
import type { Product, ProductVariant } from '../types';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const MAX_DIMENSION = 1600;

/** Redimensionne/compresse une image côté client avant upload (JPEG). */
const compressImage = (blob: Blob): Promise<Blob> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(blob);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((out) => resolve(out || blob), 'image/jpeg', 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });

interface PendingPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
}

const makePendingPhoto = (blob: Blob): PendingPhoto => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  blob,
  previewUrl: URL.createObjectURL(blob),
});

const toast = (icon: 'success' | 'error' | 'info', title: string) =>
  Swal.fire({ toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer: 2500, timerProgressBar: true });

const STATUS_LABELS: Record<PhotoShootStatus, { label: string; cls: string }> = {
  pending: { label: 'Non traité', cls: 'bg-yellow-100 text-yellow-800' },
  processing: { label: 'Traitement IA…', cls: 'bg-blue-100 text-blue-800' },
  processed: { label: 'Traité par IA', cls: 'bg-green-100 text-green-800' },
  attached: { label: 'Attaché au produit', cls: 'bg-purple-100 text-purple-800' },
  error: { label: 'Erreur IA', cls: 'bg-red-100 text-red-800' },
};

interface AiConfiguration {
  model: AiImageModel;
  quality: AiImageQuality;
}

const QUALITY_HELP: Record<AiImageQuality, string> = {
  low: 'Traitement le plus économique, adapté aux lots simples et aux premiers essais.',
  medium: 'Bon équilibre entre coût et rendu pour la majorité des photos produit.',
  high: 'Rendu maximal pour les produits complexes, avec un traitement plus coûteux.',
};

const AiConfigurationPanel: React.FC<{
  value: AiConfiguration;
  onChange: (next: AiConfiguration) => void;
  compact?: boolean;
}> = ({ value, onChange, compact = false }) => (
  <section className={`border border-orange-200 bg-orange-50/50 rounded-xl ${compact ? 'p-3' : 'p-4'}`} aria-labelledby="ai-config-title">
    <div className="flex items-center justify-between gap-3 mb-3">
      <div>
        <h2 id="ai-config-title" className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Aperture className="w-4 h-4 text-orange-600" /> Configuration IA
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">Appliquée au prochain traitement</p>
      </div>
      {value.model === 'gpt-image-2' && value.quality === 'medium' && (
        <span className="text-[11px] font-semibold text-orange-700 bg-orange-100 border border-orange-200 px-2 py-1 rounded-full whitespace-nowrap">
          Recommandé · Équilibré
        </span>
      )}
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Modèle</span>
        <select
          value={value.model}
          onChange={(e) => onChange({ ...value, model: e.target.value as AiImageModel })}
          className="mt-1 w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
        >
          <option value="gpt-image-2">GPT Image 2 — recommandé</option>
          <option value="gpt-image-1.5">GPT Image 1.5 — ancien</option>
          <option value="gpt-image-1-mini">GPT Image 1 mini — économique / ancien</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Qualité</span>
        <select
          value={value.quality}
          onChange={(e) => onChange({ ...value, quality: e.target.value as AiImageQuality })}
          className="mt-1 w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
        >
          <option value="low">Basse — économique</option>
          <option value="medium">Moyenne — équilibrée / recommandée</option>
          <option value="high">Haute — qualité maximale</option>
        </select>
      </label>
    </div>
    <p className="mt-2 text-xs text-gray-600" aria-live="polite">
      {QUALITY_HELP[value.quality]}
      {value.model !== 'gpt-image-2' && ' Modèle d’ancienne génération sélectionné.'}
    </p>
  </section>
);

const formatDate = (s: string) => {
  try {
    return new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return s;
  }
};

const formatAiCostUsd = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return null;
  const cost = Number(value);
  if (!Number.isFinite(cost)) return null;
  return cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3);
};

// ----------------------------------------------------------------------------
// Camera modal (multi-capture via getUserMedia)
// ----------------------------------------------------------------------------

const CameraModal: React.FC<{
  onClose: () => void;
  onCaptured: (photos: PendingPhoto[]) => void;
}> = ({ onClose, onCaptured }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shots, setShots] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e: any) {
        setError(e?.message || "Impossible d'accéder à la caméra");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (blob) {
      const compressed = await compressImage(blob);
      setShots((prev) => [...prev, makePendingPhoto(compressed)]);
    }
  };

  const finish = () => {
    onCaptured(shots);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <span className="font-medium flex items-center gap-2">
          <Camera className="w-5 h-5" /> Prise de photos ({shots.length})
        </span>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {error ? (
          <div className="text-white text-center p-6">
            <p className="mb-2 font-medium">Caméra indisponible</p>
            <p className="text-sm text-gray-300">{error}</p>
            <p className="text-sm text-gray-300 mt-2">Utilisez le bouton "Importer des images" à la place.</p>
          </div>
        ) : (
          <video ref={videoRef} playsInline muted className="max-h-full max-w-full object-contain" />
        )}
        {flash && <div className="absolute inset-0 bg-white/80" />}
      </div>

      {shots.length > 0 && (
        <div className="flex gap-2 p-2 overflow-x-auto bg-black/60">
          {shots.map((s) => (
            <div key={s.id} className="relative flex-shrink-0">
              <img src={s.previewUrl} className="h-16 w-16 object-cover rounded" alt="" />
              <button
                onClick={() => setShots((prev) => prev.filter((p) => p.id !== s.id))}
                className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-8 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-black">
        <button
          onClick={capture}
          disabled={!!error}
          className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 active:scale-95 disabled:opacity-40 flex items-center justify-center"
          title="Capturer"
        >
          <Aperture className="w-7 h-7 text-gray-700" />
        </button>
        <button
          onClick={finish}
          disabled={shots.length === 0}
          className="px-5 py-3 rounded-lg bg-green-600 text-white font-medium disabled:opacity-40 flex items-center gap-2"
        >
          <Check className="w-5 h-5" /> Terminer ({shots.length})
        </button>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Product picker (recherche + choix variante)
// ----------------------------------------------------------------------------

const ProductPicker: React.FC<{
  onSelect: (product: Product, variant: ProductVariant | null) => void;
  onClose: () => void;
}> = ({ onSelect, onClose }) => {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useSearchBonProductsQuery(
    { q: debouncedQ, limit: 30 },
    { skip: debouncedQ.length < 1 }
  );
  const products = data?.data || [];

  const pick = (p: Product) => {
    const variants = p.variants || [];
    if (variants.length > 0) {
      setPendingProduct(p);
    } else {
      onSelect(p, null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-start sm:items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {!pendingProduct ? (
          <>
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">Choisir un produit</h3>
                <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Référence ou désignation…"
                  className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 divide-y">
              {isFetching && <div className="p-4 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Recherche…</div>}
              {!isFetching && debouncedQ && products.length === 0 && (
                <div className="p-4 text-sm text-gray-500">Aucun produit trouvé</div>
              )}
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pick(p)}
                  className="w-full text-left p-3 hover:bg-orange-50 flex items-center gap-3"
                >
                  {p.image_url ? (
                    <img src={p.image_url} className="w-10 h-10 rounded object-cover border" alt="" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 border">
                      <Camera className="w-4 h-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">{p.designation}</div>
                    <div className="text-xs text-gray-500">
                      Réf: {p.id}
                      {(p.variants?.length || 0) > 0 && ` • ${p.variants!.length} variante(s)`}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 truncate">
                {pendingProduct.designation} — choisir la variante
              </h3>
              <button onClick={() => setPendingProduct(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => onSelect(pendingProduct, null)}
                className="p-3 border rounded-lg hover:border-orange-400 hover:bg-orange-50 text-left"
              >
                <div className="font-medium text-gray-800">Produit principal</div>
                <div className="text-xs text-gray-500">Sans variante</div>
              </button>
              {(pendingProduct.variants || []).map((v) => (
                <button
                  key={v.id}
                  onClick={() => onSelect(pendingProduct, v)}
                  className="p-3 border rounded-lg hover:border-orange-400 hover:bg-orange-50 text-left flex items-center gap-2"
                >
                  {v.image_url && <img src={v.image_url} className="w-8 h-8 rounded object-cover border" alt="" />}
                  <div>
                    <div className="font-medium text-gray-800">{v.variant_name}</div>
                    {v.reference && <div className="text-xs text-gray-500">Réf: {v.reference}</div>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Onglet Capture
// ----------------------------------------------------------------------------

const CaptureTab: React.FC<{
  aiConfiguration: AiConfiguration;
  onAiConfigurationChange: (next: AiConfiguration) => void;
}> = ({ aiConfiguration, onAiConfigurationChange }) => {
  const { user } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [createShoot, { isLoading: saving }] = useCreatePhotoShootMutation();
  const [processShoots] = useProcessPhotoShootsMutation();

  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setProduct(null);
    setVariant(null);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const compressed = await Promise.all(Array.from(files).map((f) => compressImage(f)));
    setPhotos((prev) => [...prev, ...compressed.map(makePendingPhoto)]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const save = async (processNow: boolean) => {
    if (!product || photos.length === 0) return;
    const fd = new FormData();
    fd.append('product_id', String(product.id));
    if (variant?.id) fd.append('variant_id', String(variant.id));
    if (user?.id) fd.append('created_by', String(user.id));
    photos.forEach((p, i) => fd.append('images', new File([p.blob], `photo-${i + 1}.jpg`, { type: 'image/jpeg' })));

    try {
      const shoot = await createShoot(fd).unwrap();
      if (processNow) {
        await processShoots({ shootIds: [shoot.id], ...aiConfiguration }).unwrap();
        toast('success', 'Images enregistrées, traitement IA lancé');
      } else {
        toast('success', 'Images enregistrées');
      }
      reset();
    } catch (e: any) {
      toast('error', e?.data?.message || 'Erreur lors de l’enregistrement');
    }
  };

  return (
    <div className="space-y-4">
      {/* Étape 1 : produit */}
      <div className="bg-white rounded-xl border p-4">
        <div className="text-sm font-semibold text-gray-500 mb-2">1. Produit / variante</div>
        {product ? (
          <div className="flex items-center gap-3">
            {product.image_url ? (
              <img src={product.image_url} className="w-12 h-12 rounded object-cover border" alt="" />
            ) : (
              <div className="w-12 h-12 rounded bg-gray-100 border flex items-center justify-center text-gray-400">
                <Camera className="w-5 h-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800 truncate">{product.designation}</div>
              <div className="text-xs text-gray-500">
                Réf: {product.id}
                {variant ? ` • Variante: ${variant.variant_name}` : ' • Produit principal'}
              </div>
            </div>
            <button
              onClick={() => setPickerOpen(true)}
              className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
            >
              Changer
            </button>
          </div>
        ) : (
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full py-4 border-2 border-dashed rounded-xl text-gray-600 hover:border-orange-400 hover:text-orange-600 flex items-center justify-center gap-2 font-medium"
          >
            <Search className="w-5 h-5" /> Choisir la référence du produit ou d&apos;une variante
          </button>
        )}
      </div>

      {/* Étape 2 : photos */}
      {product && (
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm font-semibold text-gray-500 mb-3">2. Photos ({photos.length})</div>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setCameraOpen(true)}
              className="px-4 py-2.5 bg-orange-600 text-white rounded-lg font-medium flex items-center gap-2 hover:bg-orange-700"
            >
              <Camera className="w-5 h-5" /> Prendre des photos
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 border rounded-lg font-medium flex items-center gap-2 hover:bg-gray-50"
            >
              <ImagePlus className="w-5 h-5" /> Importer des images
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
          </div>

          {photos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {photos.map((p) => (
                <div key={p.id} className="relative group aspect-square">
                  <img src={p.previewUrl} className="w-full h-full object-cover rounded-lg border" alt="" />
                  <button
                    onClick={() => {
                      URL.revokeObjectURL(p.previewUrl);
                      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
                    }}
                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow"
                    title="Supprimer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Étape 3 : enregistrer */}
      <AiConfigurationPanel value={aiConfiguration} onChange={onAiConfigurationChange} />

      {product && photos.length > 0 && (
        <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="flex-1 min-w-[180px] px-4 py-3 border-2 border-orange-600 text-orange-700 rounded-lg font-medium hover:bg-orange-50 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            Enregistrer
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="flex-1 min-w-[180px] px-4 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
            Enregistrer + Traiter par IA
          </button>
        </div>
      )}

      {pickerOpen && (
        <ProductPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(p, v) => {
            setProduct(p);
            setVariant(v);
            setPickerOpen(false);
          }}
        />
      )}
      {cameraOpen && (
        <CameraModal
          onClose={() => setCameraOpen(false)}
          onCaptured={(shots) => setPhotos((prev) => [...prev, ...shots])}
        />
      )}
    </div>
  );
};

// ----------------------------------------------------------------------------
// Carte d'une session (historique)
// ----------------------------------------------------------------------------

interface HistoryGallerySelection {
  shootId: number;
  imageId: number;
}

const ShootGalleryModal: React.FC<{
  shoots: PhotoShoot[];
  initialSelection: HistoryGallerySelection;
  aiConfiguration: AiConfiguration;
  onAiConfigurationChange: (next: AiConfiguration) => void;
  onClose: () => void;
}> = ({ shoots, initialSelection, aiConfiguration, onAiConfigurationChange, onClose }) => {
  const entries = useMemo(
    () =>
      shoots.flatMap((shoot) =>
        shoot.originals.map((original) => ({ shoot, original }))
      ),
    [shoots]
  );
  const [selection, setSelection] = useState<HistoryGallerySelection>(initialSelection);
  const [reprocessImage, { isLoading: launchingReprocess }] = useReprocessPhotoImageMutation();

  useEffect(() => setSelection(initialSelection), [initialSelection]);

  const selectedIndex = Math.max(
    0,
    entries.findIndex(
      (entry) => entry.shoot.id === selection.shootId && entry.original.id === selection.imageId
    )
  );
  const currentEntry = entries[selectedIndex] || entries[0];

  const move = (direction: -1 | 1) => {
    if (entries.length <= 1) return;
    const nextIndex = (selectedIndex + direction + entries.length) % entries.length;
    const next = entries[nextIndex];
    setSelection({ shootId: next.shoot.id, imageId: next.original.id });
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  if (!currentEntry) return null;

  const { shoot: currentShoot, original: currentOriginal } = currentEntry;
  const currentProcessed = currentShoot.processed.find(
    (image) => image.source_image_id === currentOriginal.id
  );

  const reprocessCurrent = async () => {
    try {
      await reprocessImage({
        shootId: currentShoot.id,
        imageId: currentOriginal.id,
        ...aiConfiguration,
      }).unwrap();
      toast('success', currentProcessed ? 'Retraitement IA lancé pour cette image' : 'Traitement IA lancé pour cette image');
    } catch (error: any) {
      toast('error', error?.data?.message || 'Impossible de traiter cette image');
    }
  };

  const aiBusy = launchingReprocess || currentShoot.status === 'processing';

  return (
    <div className="fixed inset-0 z-[70] bg-gray-950/95 text-white flex flex-col" role="dialog" aria-modal="true" aria-label="Galerie globale avant et après IA">
      <div className="flex items-center gap-3 px-3 sm:px-5 py-3 border-b border-white/15 bg-black/30">
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{currentShoot.product_designation}</div>
          <div className="text-xs text-gray-300">
            Réf: {currentShoot.product_id} · Image {selectedIndex + 1} / {entries.length}
            {currentShoot.variant_name ? ` · ${currentShoot.variant_name}` : ''}
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10" title="Fermer">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center px-12 sm:px-16 py-4">
        <button onClick={() => move(-1)} disabled={entries.length <= 1} className="absolute left-2 sm:left-5 z-10 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20" title="Photo ou référence précédente">
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="w-full h-full max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
          <div className="min-h-0 rounded-xl border border-white/15 bg-black/30 flex flex-col overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide bg-black/40">Avant · Original</div>
            <div className="flex-1 min-h-0 p-2 flex items-center justify-center">
              <img src={currentOriginal.image_url} className="max-w-full max-h-full object-contain rounded-lg" alt="Photo originale" />
            </div>
          </div>

          <div className="min-h-0 rounded-xl border border-green-400/40 bg-black/30 flex flex-col overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide bg-green-700/30 flex items-center justify-between gap-2">
              <span>Après · IA</span>
              {currentProcessed && formatAiCostUsd(currentProcessed.ai_cost_usd) && (
                <span className="normal-case text-green-200">Coût ≈ ${formatAiCostUsd(currentProcessed.ai_cost_usd)}</span>
              )}
            </div>
            <div className="flex-1 min-h-0 p-2 flex items-center justify-center">
              {currentProcessed ? (
                <img src={currentProcessed.image_url} className="max-w-full max-h-full object-contain rounded-lg" alt="Photo traitée par IA" />
              ) : (
                <div className="text-center text-gray-400">
                  <ImagePlus className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  Cette image n’a pas encore de résultat IA
                </div>
              )}
            </div>
          </div>
        </div>

        <button onClick={() => move(1)} disabled={entries.length <= 1} className="absolute right-2 sm:right-5 z-10 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20" title="Photo ou référence suivante">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      <div className="border-t border-white/15 bg-black/40 p-3 space-y-3">
        <div className="flex flex-wrap items-end justify-center gap-2 sm:gap-3">
          <label className="text-xs text-gray-300">
            <span className="block mb-1">Modèle IA</span>
            <select
              value={aiConfiguration.model}
              onChange={(event) => onAiConfigurationChange({
                ...aiConfiguration,
                model: event.target.value as AiImageModel,
              })}
              disabled={aiBusy}
              className="min-w-[190px] rounded-lg border border-white/20 bg-gray-900 text-white px-3 py-2.5 text-sm disabled:opacity-50"
            >
              <option value="gpt-image-2">GPT Image 2 — recommandé</option>
              <option value="gpt-image-1.5">GPT Image 1.5 — ancien</option>
              <option value="gpt-image-1-mini">GPT Image 1 mini — économique</option>
            </select>
          </label>
          <label className="text-xs text-gray-300">
            <span className="block mb-1">Qualité</span>
            <select
              value={aiConfiguration.quality}
              onChange={(event) => onAiConfigurationChange({
                ...aiConfiguration,
                quality: event.target.value as AiImageQuality,
              })}
              disabled={aiBusy}
              className="min-w-[160px] rounded-lg border border-white/20 bg-gray-900 text-white px-3 py-2.5 text-sm disabled:opacity-50"
            >
              <option value="low">Basse — économique</option>
              <option value="medium">Moyenne — équilibrée</option>
              <option value="high">Haute — maximale</option>
            </select>
          </label>
          <button onClick={reprocessCurrent} disabled={aiBusy} className="px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 font-medium flex items-center gap-2">
            {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {aiBusy ? 'Traitement IA en cours…' : currentProcessed ? 'Retraiter cette image par IA' : 'Traiter cette image par IA'}
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto justify-start pb-1">
          {entries.map((entry, entryIndex) => {
            const processed = entry.shoot.processed.find(
              (image) => image.source_image_id === entry.original.id
            );
            return (
              <button
                key={`${entry.shoot.id}-${entry.original.id}`}
                onClick={() => setSelection({ shootId: entry.shoot.id, imageId: entry.original.id })}
                className={`relative flex-shrink-0 rounded-lg border-2 overflow-hidden ${entryIndex === selectedIndex ? 'border-orange-400' : 'border-transparent opacity-70 hover:opacity-100'}`}
                title={`Réf ${entry.shoot.product_id} · ${entry.shoot.product_designation}`}
              >
                <img loading="lazy" src={processed?.image_url || entry.original.image_url} className="w-16 h-16 object-cover" alt="" />
                <span className="absolute bottom-0 left-0 right-0 bg-black/75 text-[9px] leading-4 px-1 truncate">Réf {entry.shoot.product_id}</span>
                {processed && <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-green-400" title="Traitée par IA" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const ShootCard: React.FC<{
  shoot: PhotoShoot;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenGallery: (imageIndex: number) => void;
  aiConfiguration: AiConfiguration;
}> = ({ shoot, selected, onToggleSelect, onOpenGallery, aiConfiguration }) => {
  const [deleteShoot] = useDeletePhotoShootMutation();
  const [deleteImage] = useDeletePhotoImageMutation();
  const [processShoots, { isLoading: processing }] = useProcessPhotoShootsMutation();
  const [reorderImages] = useReorderPhotoImagesMutation();
  const [attachShoot, { isLoading: attaching }] = useAttachPhotoShootMutation();

  const statusInfo = STATUS_LABELS[shoot.status] || STATUS_LABELS.pending;
  const hasProcessed = shoot.processed.length > 0;
  const sessionCost = useMemo(
    () =>
      shoot.processed.reduce((total, image) => {
        const cost = Number(image.ai_cost_usd);
        return Number.isFinite(cost) ? total + cost : total;
      }, 0),
    [shoot.processed]
  );
  const hasSessionCost = shoot.processed.some(
    (image) => image.ai_cost_usd !== null && Number.isFinite(Number(image.ai_cost_usd))
  );

  // Galerie finale = images IA si disponibles, sinon originales (ordre = position)
  const galleryImages = useMemo<PhotoShootImage[]>(
    () => (hasProcessed ? shoot.processed : shoot.originals),
    [hasProcessed, shoot.processed, shoot.originals]
  );

  const [localOrder, setLocalOrder] = useState<PhotoShootImage[]>(galleryImages);
  useEffect(() => setLocalOrder(galleryImages), [galleryImages]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const next = [...localOrder];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setLocalOrder(next);
    reorderImages({ shootId: shoot.id, imageIds: next.map((i) => i.id) });
  };

  const confirmDeleteImage = async (img: PhotoShootImage) => {
    const r = await Swal.fire({
      title: 'Supprimer cette image ?',
      text: img.kind === 'original' ? 'Le résultat IA associé sera aussi supprimé.' : undefined,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#dc2626',
    });
    if (r.isConfirmed) deleteImage(img.id);
  };

  const confirmDeleteShoot = async () => {
    const r = await Swal.fire({
      title: 'Supprimer cette session ?',
      text: 'Toutes les images (originales et IA) seront supprimées.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#dc2626',
    });
    if (r.isConfirmed) deleteShoot(shoot.id);
  };

  const attach = async () => {
    try {
      const res = await attachShoot({ shootId: shoot.id, imageIds: localOrder.map((i) => i.id) }).unwrap();
      toast('success', `${res.attached} image(s) attachée(s) — voir l'onglet "Attachés"`);
    } catch (e: any) {
      toast('error', e?.data?.message || 'Erreur attachement');
    }
  };

  const processedBySource = useMemo(() => {
    const m = new Map<number, PhotoShootImage>();
    shoot.processed.forEach((p) => {
      if (p.source_image_id) m.set(p.source_image_id, p);
    });
    return m;
  }, [shoot.processed]);

  return (
    <div className={`bg-white rounded-xl border ${selected ? 'ring-2 ring-orange-400 border-orange-300' : ''}`}>
      {/* Header */}
      <div className="p-3 border-b flex items-center gap-3 flex-wrap">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-4 h-4 rounded text-orange-600 focus:ring-orange-400"
        />
        <div className="flex-1 min-w-[200px]">
          <div className="font-medium text-gray-800 truncate">{shoot.product_designation}</div>
          <div className="text-xs text-gray-500">
            Réf: {shoot.product_id}
            {shoot.variant_name ? ` • Variante: ${shoot.variant_name}` : ''}
            {' • Prise/import : '}{formatDate(shoot.created_at)}
            {shoot.ai_processed_at ? ` • IA : ${formatDate(shoot.ai_processed_at)}` : ''}
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusInfo.cls}`}>
          {shoot.status === 'processing' && <Loader2 className="w-3 h-3 inline animate-spin mr-1" />}
          {statusInfo.label}
        </span>
        {hasSessionCost && (
          <span
            className="text-xs px-2 py-1 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
            title="Somme des coûts API estimés enregistrés pour cette session"
          >
            Coût IA ≈ ${sessionCost.toFixed(4)}
          </span>
        )}
        {(shoot.status === 'pending' || shoot.status === 'error' || shoot.status === 'processed') && (
          <button
            onClick={() => processShoots({
              shootIds: [shoot.id],
              replaceShootIds: shoot.status === 'processed' ? [shoot.id] : undefined,
              ...aiConfiguration,
            })}
            disabled={processing}
            className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Wand2 className="w-4 h-4" /> {shoot.status === 'processed' ? 'Retraiter par IA' : 'Traiter par IA'}
          </button>
        )}
        <button onClick={confirmDeleteShoot} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Supprimer la session">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {shoot.status === 'error' && shoot.error_message && (
        <div className="px-4 py-2 bg-red-50 text-red-700 text-sm border-b">{shoot.error_message}</div>
      )}

      {/* Avant / Après (si traité) ou originales */}
      <div className="p-3">
        {hasProcessed ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase">Avant / Après</div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {shoot.originals.map((orig, imageIndex) => {
                const proc = processedBySource.get(orig.id);
                return (
                  <div key={orig.id} className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenGallery(imageIndex)}
                      className="relative cursor-zoom-in group"
                      title="Ouvrir la galerie Avant / Après"
                    >
                      <img src={orig.image_url} className="w-24 h-24 object-cover rounded-lg border" alt="avant" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center rounded-b-lg">Avant</span>
                      <ZoomIn className="absolute top-1 left-1 w-4 h-4 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    {proc ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className="relative group">
                          <button
                            type="button"
                            onClick={() => onOpenGallery(imageIndex)}
                            className="block cursor-zoom-in"
                            title="Ouvrir la galerie Avant / Après"
                          >
                            <img src={proc.image_url} className="w-24 h-24 object-cover rounded-lg border-2 border-green-400" alt="après" />
                            <span className="absolute bottom-0 left-0 right-0 bg-green-600/70 text-white text-[10px] text-center rounded-b-lg">Après IA</span>
                            <ZoomIn className="absolute top-1 left-1 w-4 h-4 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100" />
                          </button>
                          <button
                            onClick={() => confirmDeleteImage(proc)}
                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow"
                            title="Supprimer le résultat IA"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {formatAiCostUsd(proc.ai_cost_usd) ? (
                          <span
                            className="text-[10px] font-semibold text-emerald-700"
                            title={`${proc.ai_model || 'Modèle IA'} · ${proc.ai_quality || 'qualité inconnue'} · entrée ${proc.ai_input_tokens ?? '?'} tokens · sortie ${proc.ai_output_tokens ?? '?'} tokens · tarif ${proc.ai_pricing_version || 'inconnu'}`}
                          >
                            Coût ≈ ${formatAiCostUsd(proc.ai_cost_usd)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400" title="La consommation n’a pas été enregistrée pour cette ancienne image">
                            Coût indisponible
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-lg border border-dashed flex items-center justify-center text-gray-300 text-xs">
                        —
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase">Images originales</div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {shoot.originals.map((img, imageIndex) => (
                <div key={img.id} className="relative group flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenGallery(imageIndex)}
                    className="block cursor-zoom-in"
                    title="Ouvrir la galerie Avant / Après"
                  >
                    <img src={img.image_url} className="w-24 h-24 object-cover rounded-lg border" alt="" />
                    <ZoomIn className="absolute top-1 left-1 w-4 h-4 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100" />
                  </button>
                  {shoot.status !== 'processing' && (
                    <button
                      onClick={() => confirmDeleteImage(img)}
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow"
                      title="Supprimer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Organisation galerie + attachement */}
        {shoot.status !== 'processing' && localOrder.length > 0 && (
          <div className="mt-4 pt-3 border-t">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-yellow-500" />
                Galerie finale — glissez pour réordonner (1ère = image principale)
              </div>
              <button
                onClick={attach}
                disabled={attaching}
                className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {attaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {shoot.status === 'attached' ? 'Ré-attacher au produit' : 'Attacher au produit'}
              </button>
            </div>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId={`shoot-${shoot.id}`} direction="horizontal">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex gap-2 overflow-x-auto pb-2"
                  >
                    {localOrder.map((img, idx) => (
                      <Draggable key={img.id} draggableId={String(img.id)} index={idx}>
                        {(prov, snapshot) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            className={`relative flex-shrink-0 cursor-grab ${snapshot.isDragging ? 'opacity-80' : ''}`}
                          >
                            <img
                              src={img.image_url}
                              className={`w-20 h-20 object-cover rounded-lg border-2 ${idx === 0 ? 'border-yellow-400' : 'border-gray-200'}`}
                              alt=""
                            />
                            {idx === 0 && (
                              <span className="absolute -top-2 -left-2 bg-yellow-400 text-white rounded-full p-1 shadow" title="Image principale">
                                <Star className="w-3 h-3 fill-current" />
                              </span>
                            )}
                            <span className="absolute bottom-0.5 right-1 text-[10px] bg-black/50 text-white px-1 rounded">
                              {idx + 1}
                            </span>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        )}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Onglet Historique
// ----------------------------------------------------------------------------

const HistoryTab: React.FC<{
  aiConfiguration: AiConfiguration;
  onAiConfigurationChange: (next: AiConfiguration) => void;
}> = ({ aiConfiguration, onAiConfigurationChange }) => {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'capture' | 'ai'>('capture');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [quickSelectionCount, setQuickSelectionCount] = useState('40');
  const [gallerySelection, setGallerySelection] = useState<HistoryGallerySelection | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setSelectedIds([]);
  }, [statusFilter, debouncedQ]);

  const { data: allShoots = [], isFetching, refetch } = useGetPhotoShootsQuery(
    { status: statusFilter || undefined, q: debouncedQ || undefined, sortBy, sortOrder },
    { pollingInterval: 0 }
  );
  // L'historique ne montre que les sessions non attachées (les attachées ont leur propre onglet)
  const shoots = useMemo(() => allShoots.filter((s) => s.status !== 'attached'), [allShoots]);
  const statusCountArgs = { q: debouncedQ || undefined };
  const {
    data: statusCounts,
    isFetching: isFetchingStatusCounts,
    refetch: refetchStatusCounts,
  } = useGetPhotoShootStatusCountsQuery(statusCountArgs);

  // Keep counters current while an AI job is moving between statuses.
  useGetPhotoShootStatusCountsQuery(statusCountArgs, {
    pollingInterval: Number(statusCounts?.processing || 0) > 0 ? 4000 : 0,
    skip: Number(statusCounts?.processing || 0) === 0,
  });

  // Poll tant qu'un traitement IA est en cours
  const anyProcessing = shoots.some((s) => s.status === 'processing');
  useGetPhotoShootsQuery(
    { status: statusFilter || undefined, q: debouncedQ || undefined, sortBy, sortOrder },
    { pollingInterval: anyProcessing ? 4000 : 0, skip: !anyProcessing }
  );

  const [processShoots, { isLoading: batchProcessing }] = useProcessPhotoShootsMutation();
  const [attachShoot] = useAttachPhotoShootMutation();
  const [batchAttaching, setBatchAttaching] = useState(false);

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectAllVisible = () => {
    setSelectedIds(shoots.map((shoot) => shoot.id));
  };

  const selectVisibleCount = () => {
    const requestedCount = Math.floor(Number(quickSelectionCount));
    if (!Number.isFinite(requestedCount) || requestedCount <= 0) {
      toast('error', 'Saisissez un nombre de produits supérieur à 0');
      return;
    }

    const selected = shoots.slice(0, requestedCount).map((shoot) => shoot.id);
    setSelectedIds(selected);
    if (requestedCount > shoots.length) {
      toast('info', `${shoots.length} produit(s) disponible(s) ont été sélectionné(s)`);
    }
  };

  const selectableForProcess = shoots.filter(
    (s) => selectedIds.includes(s.id) && (s.status === 'pending' || s.status === 'error' || s.status === 'processed')
  );
  const selectableForAttach = shoots.filter(
    (s) => selectedIds.includes(s.id) && s.status !== 'processing'
  );

  const batchProcess = async () => {
    if (!selectableForProcess.length) return;
    try {
      await processShoots({
        shootIds: selectableForProcess.map((s) => s.id),
        replaceShootIds: selectableForProcess.filter((s) => s.status === 'processed').map((s) => s.id),
        ...aiConfiguration,
      }).unwrap();
      toast('success', `Traitement IA lancé pour ${selectableForProcess.length} session(s)`);
      setSelectedIds([]);
    } catch (e: any) {
      toast('error', e?.data?.message || 'Erreur lancement traitement IA');
    }
  };

  const batchAttach = async () => {
    if (!selectableForAttach.length) return;
    const r = await Swal.fire({
      title: `Attacher ${selectableForAttach.length} session(s) ?`,
      text: 'Pour chaque produit, la 1ère image (ordre actuel) devient l’image principale, les autres vont dans la galerie.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Attacher',
      cancelButtonText: 'Annuler',
    });
    if (!r.isConfirmed) return;
    setBatchAttaching(true);
    let ok = 0;
    for (const s of selectableForAttach) {
      try {
        await attachShoot({ shootId: s.id }).unwrap();
        ok++;
      } catch {
        // continue les autres
      }
    }
    setBatchAttaching(false);
    setSelectedIds([]);
    toast(ok === selectableForAttach.length ? 'success' : 'info', `${ok}/${selectableForAttach.length} session(s) attachée(s)`);
  };

  return (
    <div className="space-y-4">
      <AiConfigurationPanel value={aiConfiguration} onChange={onAiConfigurationChange} compact />

      {/* Filtres */}
      <div className="bg-white rounded-xl border p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher produit / variante…"
            className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Tous les statuts ({Number(statusCounts?.history_total || 0)})</option>
          <option value="pending">Non traité ({Number(statusCounts?.pending || 0)})</option>
          <option value="processing">En traitement ({Number(statusCounts?.processing || 0)})</option>
          <option value="processed">Traité par IA ({Number(statusCounts?.processed || 0)})</option>
          <option value="error">Erreur ({Number(statusCounts?.error || 0)})</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'capture' | 'ai')}
          className="border rounded-lg px-3 py-2 text-sm"
          aria-label="Critère de tri"
        >
          <option value="capture">Date de prise / importation</option>
          <option value="ai">Date de traitement IA</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
          className="border rounded-lg px-3 py-2 text-sm"
          aria-label="Ordre de tri"
        >
          <option value="desc">Plus récent d’abord</option>
          <option value="asc">Plus ancien d’abord</option>
        </select>
        <button
          onClick={() => {
            void refetch();
            void refetchStatusCounts();
          }}
          className="p-2 border rounded-lg hover:bg-gray-50"
          title="Actualiser"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching || isFetchingStatusCounts ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Sélection rapide des sessions affichées */}
      <div className="bg-white rounded-xl border p-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-700 mr-1">Sélection rapide</span>
        <button
          type="button"
          onClick={selectAllVisible}
          disabled={shoots.length === 0}
          className="px-3 py-2 text-sm border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Tout sélectionner ({shoots.length})
        </button>
        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
          <span>Nombre de produits</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, shoots.length)}
            step={1}
            value={quickSelectionCount}
            onChange={(event) => setQuickSelectionCount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') selectVisibleCount();
            }}
            className="w-24 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            aria-label="Nombre de produits à sélectionner"
          />
        </label>
        <button
          type="button"
          onClick={selectVisibleCount}
          disabled={shoots.length === 0}
          className="px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Sélectionner {quickSelectionCount || ''}
        </button>
      </div>

      {/* Barre actions multi-sélection */}
      {selectedIds.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex flex-wrap items-center gap-3 sticky top-0 z-10">
          <span className="text-sm font-medium text-orange-800">{selectedIds.length} sélectionnée(s)</span>
          <button
            onClick={batchProcess}
            disabled={batchProcessing || !selectableForProcess.length}
            className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {batchProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Traiter par IA ({selectableForProcess.length})
          </button>
          <button
            onClick={batchAttach}
            disabled={batchAttaching || !selectableForAttach.length}
            className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {batchAttaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Attacher aux produits ({selectableForAttach.length})
          </button>
          <button onClick={() => setSelectedIds([])} className="text-sm text-gray-500 hover:underline ml-auto">
            Tout désélectionner
          </button>
        </div>
      )}

      {/* Liste */}
      {isFetching && shoots.length === 0 && (
        <div className="text-center text-gray-500 py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Chargement…</div>
      )}
      {!isFetching && shoots.length === 0 && (
        <div className="text-center text-gray-500 py-10">
          <History className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          Aucune session photo pour le moment
        </div>
      )}
      <div className="space-y-3">
        {shoots.map((s) => (
          <ShootCard
            key={s.id}
            shoot={s}
            selected={selectedIds.includes(s.id)}
            onToggleSelect={() => toggleSelect(s.id)}
            onOpenGallery={(imageIndex) => {
              const image = s.originals[imageIndex];
              if (image) setGallerySelection({ shootId: s.id, imageId: image.id });
            }}
            aiConfiguration={aiConfiguration}
          />
        ))}
      </div>
      {gallerySelection && (
        <ShootGalleryModal
          shoots={shoots}
          initialSelection={gallerySelection}
          aiConfiguration={aiConfiguration}
          onAiConfigurationChange={onAiConfigurationChange}
          onClose={() => setGallerySelection(null)}
        />
      )}
    </div>
  );
};

// ----------------------------------------------------------------------------
// Onglet Attachés (sessions traitées + attachées à leur produit)
// ----------------------------------------------------------------------------

const AttachedTab: React.FC = () => {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: shoots = [], isFetching, refetch } = useGetPhotoShootsQuery({
    status: 'attached',
    q: debouncedQ || undefined,
  });
  const [deleteShoot] = useDeletePhotoShootMutation();

  const confirmDeleteShoot = async (shoot: PhotoShoot) => {
    const r = await Swal.fire({
      title: 'Supprimer cette session ?',
      text: 'Les images déjà attachées au produit resteront dans sa galerie, mais l’historique et les fichiers de la session seront supprimés.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#dc2626',
    });
    if (r.isConfirmed) deleteShoot(shoot.id);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher produit / variante…"
            className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <button onClick={() => refetch()} className="p-2 border rounded-lg hover:bg-gray-50" title="Actualiser">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isFetching && shoots.length === 0 && (
        <div className="text-center text-gray-500 py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Chargement…</div>
      )}
      {!isFetching && shoots.length === 0 && (
        <div className="text-center text-gray-500 py-10">
          <Link2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          Aucune session attachée pour le moment
        </div>
      )}

      <div className="space-y-3">
        {shoots.map((shoot) => {
          const gallery = shoot.processed.length ? shoot.processed : shoot.originals;
          return (
            <div key={shoot.id} className="bg-white rounded-xl border">
              <div className="p-3 border-b flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium text-gray-800 truncate">{shoot.product_designation}</div>
                  <div className="text-xs text-gray-500">
                    Réf: {shoot.product_id}
                    {shoot.variant_name ? ` • Variante: ${shoot.variant_name}` : ''}
                    {' • '}{formatDate(shoot.updated_at || shoot.created_at)}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_LABELS.attached.cls}`}>
                  <Check className="w-3 h-3 inline mr-1" />
                  {STATUS_LABELS.attached.label}
                </span>
                <button
                  onClick={() => confirmDeleteShoot(shoot)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                  title="Supprimer la session"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {gallery.map((img, idx) => (
                    <div key={img.id} className="relative flex-shrink-0">
                      <img
                        src={img.image_url}
                        className={`w-20 h-20 object-cover rounded-lg border-2 ${idx === 0 ? 'border-yellow-400' : 'border-gray-200'}`}
                        alt=""
                      />
                      {idx === 0 && (
                        <span className="absolute -top-2 -left-2 bg-yellow-400 text-white rounded-full p-1 shadow" title="Image principale">
                          <Star className="w-3 h-3 fill-current" />
                        </span>
                      )}
                      <span className="absolute bottom-0.5 right-1 text-[10px] bg-black/50 text-white px-1 rounded">
                        {idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

type ManualPhotoQueues = Record<number, ManualProductPhoto[]>;

interface ManualPhotoReviewItem {
  product: ManualPhotoProduct;
  photo: ManualProductPhoto;
}

const ManualPhotosTab: React.FC = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [imageStatus, setImageStatus] = useState<ManualProductImageStatus>('missing');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [queues, setQueues] = useState<ManualPhotoQueues>({});
  const [uploadingIds, setUploadingIds] = useState<Set<number>>(new Set());
  const [attachingIds, setAttachingIds] = useState<Set<number>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [rejectingIds, setRejectingIds] = useState<Set<number>>(new Set());
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [batchDragOver, setBatchDragOver] = useState(false);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchResult, setBatchResult] = useState<ManualPhotoBatchResponse | null>(null);
  const [reviewPhotoId, setReviewPhotoId] = useState<number | null>(null);
  const queuesRef = useRef<ManualPhotoQueues>({});
  const attachingLocksRef = useRef<Set<number>>(new Set());
  const rejectingLocksRef = useRef<Set<number>>(new Set());
  const reviewDialogRef = useRef<HTMLDivElement | null>(null);
  const reviewCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const reviewTriggerRef = useRef<HTMLElement | null>(null);
  const reviewTriggerProductIdRef = useRef<number | null>(null);

  const { data, isLoading, isFetching, isError, error, refetch } = useGetManualPhotoProductsQuery({
    q: debouncedSearch || undefined,
    imageStatus,
    page,
    limit,
  });
  const [attachManualProductPhotos] = useAttachManualProductPhotosMutation();
  const [uploadManualProductPhotos] = useUploadManualProductPhotosMutation();
  const [uploadManualProductPhotosBatch] = useUploadManualProductPhotosBatchMutation();
  const [deleteManualProductPhoto] = useDeleteManualProductPhotoMutation();
  const [rejectManualProductPhoto] = useRejectManualProductPhotoMutation();

  const openReview = (photoId: number, trigger: HTMLElement, productId: number) => {
    reviewTriggerRef.current = trigger;
    reviewTriggerProductIdRef.current = productId;
    setReviewPhotoId(photoId);
  };

  const closeReview = useCallback(() => {
    setReviewPhotoId(null);
    window.setTimeout(() => {
      const trigger = reviewTriggerRef.current;
      if (trigger?.isConnected) {
        trigger.focus();
        return;
      }
      const productId = reviewTriggerProductIdRef.current;
      if (productId !== null) {
        document.querySelector<HTMLElement>(`[data-manual-product-id="${productId}"]`)?.focus();
      }
    }, 0);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const updateQueues = (updater: (current: ManualPhotoQueues) => ManualPhotoQueues) => {
    setQueues((current) => {
      const next = updater(current);
      queuesRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    if (!data?.data) return;
    updateQueues((current) => {
      const next = { ...current };
      for (const product of data.data) next[product.id] = product.manual_photos || [];
      return next;
    });
  }, [data]);

  const addFiles = async (productId: number, fileList: FileList | File[]) => {
    if (uploadingIds.has(productId) || attachingIds.has(productId)) return;
    const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      toast('error', 'Sélectionnez uniquement des fichiers image');
      return;
    }
    setUploadingIds((current) => new Set(current).add(productId));
    try {
      const compressed = await Promise.all(imageFiles.map((file) => compressImage(file)));
      const body = new FormData();
      compressed.forEach((blob, index) => {
        body.append('images', new File([blob], `produit-${productId}-${index + 1}.jpg`, { type: 'image/jpeg' }));
      });
      const response = await uploadManualProductPhotos({ productId, body }).unwrap();
      updateQueues((current) => ({
        ...current,
        [productId]: [
          ...(current[productId] || []),
          ...response.photos.filter((photo) => !(current[productId] || []).some((existing) => existing.id === photo.id)),
        ],
      }));
      toast('success', `${response.uploaded} image(s) uploadée(s) et enregistrée(s)`);
    } catch (requestError: any) {
      toast('error', requestError?.data?.message || 'Impossible d’uploader les images');
    } finally {
      setUploadingIds((current) => {
        const next = new Set(current);
        next.delete(productId);
        return next;
      });
    }
  };

  const importBatch = async (fileList: FileList | File[]) => {
    if (batchUploading) return;
    const selectedFiles = Array.from(fileList);
    const invalidFiles = selectedFiles.filter((file) => !file.type.startsWith('image/'));
    if (invalidFiles.length) {
      toast('error', `Lot refusé : ${invalidFiles.length} fichier(s) ne sont pas des images`);
      return;
    }
    if (!selectedFiles.length) {
      toast('error', 'Sélectionnez au moins une image');
      return;
    }
    if (selectedFiles.length > 30) {
      toast('error', 'Vous pouvez importer au maximum 30 images à la fois');
      return;
    }

    setBatchUploading(true);
    setBatchResult(null);
    try {
      const compressed = await Promise.all(selectedFiles.map((file) => compressImage(file)));
      const body = new FormData();
      compressed.forEach((blob, index) => {
        const originalName = selectedFiles[index].name;
        const lastDot = originalName.lastIndexOf('.');
        const referenceBasename = lastDot >= 0 ? originalName.slice(0, lastDot) : originalName;
        body.append('images', new File([blob], `${referenceBasename}.jpg`, { type: 'image/jpeg' }));
      });
      const response = await uploadManualProductPhotosBatch(body).unwrap();
      const visibleProductIds = new Set((data?.data || []).map((product) => product.id));
      updateQueues((current) => {
        const next = { ...current };
        for (const importedProduct of response.products) {
          if (!visibleProductIds.has(importedProduct.product_id)) continue;
          const existing = next[importedProduct.product_id] || [];
          next[importedProduct.product_id] = [
            ...existing,
            ...importedProduct.photos.filter((photo) => !existing.some((item) => item.id === photo.id)),
          ];
        }
        return next;
      });
      setBatchResult(response);
      if (response.uploaded) toast('success', `${response.uploaded} image(s) ajoutée(s) aux files manuelles`);
    } catch (requestError: any) {
      toast('error', requestError?.data?.message || 'Impossible d’importer ce lot d’images');
    } finally {
      setBatchUploading(false);
      setBatchDragOver(false);
    }
  };

  const removePhoto = async (productId: number, photoId: number) => {
    if (deletingIds.has(photoId) || attachingIds.has(productId)) return;
    setDeletingIds((current) => new Set(current).add(photoId));
    try {
      await deleteManualProductPhoto(photoId).unwrap();
      updateQueues((current) => ({
        ...current,
        [productId]: (current[productId] || []).filter((photo) => photo.id !== photoId),
      }));
    } catch (requestError: any) {
      toast('error', requestError?.data?.message || 'Impossible de supprimer cette image');
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(photoId);
        return next;
      });
    }
  };

  const clearQueue = async (productId: number) => {
    const removable = (queuesRef.current[productId] || []).filter((photo) => photo.status === 'uploaded');
    if (!removable.length || attachingIds.has(productId)) return;
    for (const photo of removable) await removePhoto(productId, photo.id);
  };

  const rejectPhoto = async (productId: number, photoId: number) => {
    if (
      rejectingLocksRef.current.has(photoId) ||
      attachingLocksRef.current.has(productId) ||
      rejectingIds.has(photoId) ||
      attachingIds.has(productId)
    ) return;
    rejectingLocksRef.current.add(photoId);
    const photo = (queuesRef.current[productId] || []).find((item) => item.id === photoId);
    let mutationStarted = false;
    try {
      const confirmation = await Swal.fire({
        title: 'Marquer cette image comme fausse ?',
        text: photo?.status === 'uploaded'
          ? 'Elle sera retirée de la file d’attente et conservée dans l’historique interne, sans modifier les images du produit.'
          : 'Elle sera retirée du produit et conservée dans l’historique interne.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Oui, image fausse',
        cancelButtonText: 'Annuler',
        confirmButtonColor: '#dc2626',
      });
      if (!confirmation.isConfirmed) return;

      mutationStarted = true;
      setRejectingIds((current) => new Set(current).add(photoId));
      await rejectManualProductPhoto(photoId).unwrap();
      updateQueues((current) => ({
        ...current,
        [productId]: (current[productId] || []).filter((photo) => photo.id !== photoId),
      }));
      advanceAfterReview(photoId);
      toast('success', photo?.status === 'uploaded'
        ? 'Photo fausse rejetée de la file d’attente'
        : 'Image marquée comme fausse et retirée du produit');
    } catch (requestError: any) {
      toast('error', requestError?.data?.message || 'Impossible de marquer cette image comme fausse');
    } finally {
      rejectingLocksRef.current.delete(photoId);
      if (mutationStarted) {
        setRejectingIds((current) => {
          const next = new Set(current);
          next.delete(photoId);
          return next;
        });
      }
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.droppableId !== result.destination.droppableId) return;
    const productId = Number(result.source.droppableId.replace('manual-queue-', ''));
    if (!Number.isFinite(productId) || uploadingIds.has(productId) || attachingIds.has(productId)) return;
    updateQueues((current) => {
      const reordered = [...(current[productId] || [])];
      const [moved] = reordered.splice(result.source.index, 1);
      if (!moved) return current;
      reordered.splice(result.destination!.index, 0, moved);
      return { ...current, [productId]: reordered };
    });
  };

  const attach = async (productId: number) => {
    const photos = (queuesRef.current[productId] || []).filter((photo) => photo.status === 'uploaded');
    if (
      !photos.length ||
      attachingLocksRef.current.has(productId) ||
      photos.some((photo) => rejectingLocksRef.current.has(photo.id)) ||
      attachingIds.has(productId) ||
      uploadingIds.has(productId)
    ) return;
    attachingLocksRef.current.add(productId);
    setAttachingIds((current) => new Set(current).add(productId));
    try {
      const response = await attachManualProductPhotos({ productId, imageIds: photos.map((photo) => photo.id) }).unwrap();
      updateQueues((current) => ({
        ...current,
        [productId]: (current[productId] || []).map((photo) =>
          photos.some((attached) => attached.id === photo.id) ? { ...photo, status: 'attached' as const } : photo
        ),
      }));
      toast('success', `${response.attached} image(s) attachée(s) au produit`);
    } catch (requestError: any) {
      toast('error', requestError?.data?.message || 'Erreur lors de l’attachement');
    } finally {
      attachingLocksRef.current.delete(productId);
      setAttachingIds((current) => {
        const next = new Set(current);
        next.delete(productId);
        return next;
      });
    }
  };

  const attachPhoto = async (productId: number, photoId: number) => {
    const photo = (queuesRef.current[productId] || []).find(
      (item) => item.id === photoId && item.status === 'uploaded'
    );
    if (
      !photo ||
      attachingLocksRef.current.has(productId) ||
      rejectingLocksRef.current.has(photoId) ||
      attachingIds.has(productId) ||
      uploadingIds.has(productId) ||
      rejectingIds.has(photoId)
    ) return;
    attachingLocksRef.current.add(productId);
    setAttachingIds((current) => new Set(current).add(productId));
    try {
      await attachManualProductPhotos({ productId, imageIds: [photoId] }).unwrap();
      updateQueues((current) => ({
        ...current,
        [productId]: (current[productId] || []).map((item) =>
          item.id === photoId ? { ...item, status: 'attached' as const } : item
        ),
      }));
      advanceAfterReview(photoId);
      toast('success', 'Photo attachée au produit');
    } catch (requestError: any) {
      toast('error', requestError?.data?.message || 'Erreur lors de l’attachement');
    } finally {
      attachingLocksRef.current.delete(productId);
      setAttachingIds((current) => {
        const next = new Set(current);
        next.delete(productId);
        return next;
      });
    }
  };

  const errorMessage = (error as { data?: { message?: string } } | undefined)?.data?.message;
  const products = useMemo(() => data?.data || [], [data?.data]);
  const meta = data?.meta;
  const reviewItems = useMemo<ManualPhotoReviewItem[]>(
    () => products.flatMap((product) =>
      (queues[product.id] || [])
        .filter((photo) => photo.status === 'uploaded')
        .map((photo) => ({ product, photo }))
    ),
    [products, queues]
  );
  const reviewIndex = reviewPhotoId === null
    ? -1
    : reviewItems.findIndex((item) => item.photo.id === reviewPhotoId);
  const reviewItem = reviewIndex >= 0 ? reviewItems[reviewIndex] : null;
  const reviewBusy = reviewItem
    ? attachingIds.has(reviewItem.product.id) || rejectingIds.has(reviewItem.photo.id)
    : false;

  const advanceAfterReview = (photoId: number) => {
    const removedIndex = Math.max(0, reviewItems.findIndex((item) => item.photo.id === photoId));
    const remaining = reviewItems.filter((item) => item.photo.id !== photoId);
    if (remaining.length) {
      setReviewPhotoId(remaining[Math.min(removedIndex, remaining.length - 1)].photo.id);
    } else {
      closeReview();
    }
  };

  const navigateReview = useCallback((direction: -1 | 1) => {
    if (reviewIndex < 0 || reviewItems.length < 2 || reviewBusy) return;
    const nextIndex = (reviewIndex + direction + reviewItems.length) % reviewItems.length;
    setReviewPhotoId(reviewItems[nextIndex].photo.id);
  }, [reviewBusy, reviewIndex, reviewItems]);

  useEffect(() => {
    if (reviewPhotoId === null) return;
    if (!reviewItems.length) {
      closeReview();
      return;
    }
    if (!reviewItems.some((item) => item.photo.id === reviewPhotoId)) {
      setReviewPhotoId(reviewItems[0].photo.id);
    }
  }, [closeReview, reviewItems, reviewPhotoId]);

  useEffect(() => {
    if (!reviewItem) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => reviewCloseButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (Swal.isVisible()) return;
      if (event.key === 'Tab') {
        const focusable = Array.from(
          reviewDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') || []
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      } else if (event.key === 'Escape' && !reviewBusy) {
        event.preventDefault();
        closeReview();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateReview(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateReview(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeReview, navigateReview, reviewItem, reviewBusy]);

  return (
    <section className="space-y-4" aria-label="Photos recherche manuelle">
      <div className="bg-white rounded-xl border border-orange-200 overflow-hidden shadow-sm">
        <div className="px-3 py-3 md:px-4 border-b border-orange-100 bg-orange-50/70 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="flex gap-3 min-w-0">
            <span className="w-9 h-9 flex-none rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
              <FolderUp className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Import groupé par référence</h2>
              <p className="mt-0.5 text-xs text-gray-600">
                Le nom du fichier doit être exactement la référence produit : <strong className="text-gray-800">1234.jpg → réf. 1234</strong>
              </p>
            </div>
          </div>
          <span className="self-start rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
            Variantes : affectation manuelle uniquement
          </span>
        </div>

        <div className="p-3 md:p-4 grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)] gap-3">
          <div
            onDragEnter={(event) => {
              if (!batchUploading && event.dataTransfer.types.includes('Files')) setBatchDragOver(true);
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes('Files')) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = batchUploading ? 'none' : 'copy';
              if (!batchUploading) setBatchDragOver(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setBatchDragOver(false);
            }}
            onDrop={(event) => {
              if (!event.dataTransfer.files.length) return;
              event.preventDefault();
              setBatchDragOver(false);
              if (!batchUploading) void importBatch(event.dataTransfer.files);
            }}
            aria-busy={batchUploading}
            className={`min-h-[116px] rounded-xl border-2 border-dashed p-4 flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left transition-colors ${
              batchUploading
                ? 'border-gray-200 bg-gray-100/70'
                : batchDragOver
                  ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-100'
                  : 'border-gray-300 bg-gray-50/70 hover:border-orange-300'
            }`}
          >
            {batchUploading ? (
              <Loader2 className="w-8 h-8 flex-none animate-spin text-orange-600" aria-hidden="true" />
            ) : (
              <Upload className={`w-8 h-8 flex-none ${batchDragOver ? 'text-orange-600' : 'text-gray-400'}`} aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">
                {batchUploading ? 'Préparation et import des images…' : 'Glissez jusqu’à 30 images ici'}
              </p>
              <p className="mt-1 text-xs text-gray-500">JPEG ou PNG réel · 25 Mo maximum par fichier</p>
            </div>
            <label className={`min-h-10 px-3 flex-none rounded-lg text-xs font-semibold inline-flex items-center gap-2 focus-within:ring-2 focus-within:ring-orange-400 focus-within:ring-offset-2 ${
              batchUploading
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-700 cursor-pointer'
            }`}>
              <ImagePlus className="w-4 h-4" aria-hidden="true" />
              Sélectionner un lot
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={batchUploading}
                className="sr-only"
                aria-label="Sélectionner plusieurs images à importer par référence"
                onChange={(event) => {
                  if (event.target.files) void importBatch(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>

          <aside className={`rounded-xl border p-3 ${batchResult ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50/50'}`} aria-live="polite">
            {!batchResult ? (
              <div className="h-full min-h-[90px] flex flex-col items-center justify-center text-center text-gray-500">
                <Check className="w-5 h-5 text-gray-300" aria-hidden="true" />
                <p className="mt-2 text-xs font-medium">Le bilan de correspondance apparaîtra ici</p>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Bilan du lot</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">{batchResult.total} fichier(s) traité(s)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBatchResult(null)}
                    className="min-h-8 px-2 rounded-md text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
                    aria-label="Effacer le bilan d’import"
                  >
                    Effacer
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                    <p className="text-lg leading-none font-bold text-green-700">{batchResult.uploaded}</p>
                    <p className="mt-1 text-[11px] font-medium text-green-800">images importées</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                    <p className="text-lg leading-none font-bold text-green-700">{batchResult.products.length}</p>
                    <p className="mt-1 text-[11px] font-medium text-green-800">produits trouvés</p>
                  </div>
                </div>
                {batchResult.unmatched.length > 0 ? (
                  <details className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-amber-900 focus:outline-none focus:ring-2 focus:ring-orange-400 rounded">
                      {batchResult.unmatched.length} fichier(s) non reconnu(s)
                    </summary>
                    <ul className="mt-2 max-h-28 overflow-y-auto space-y-1" aria-label="Fichiers non reconnus">
                      {batchResult.unmatched.map((file, index) => (
                        <li key={`${file.filename}-${index}`} className="flex items-start gap-1.5 text-[11px] text-amber-900">
                          <AlertTriangle className="mt-0.5 w-3 h-3 flex-none" aria-hidden="true" />
                          <span className="break-all"><strong>{file.filename}</strong> — {file.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <p className="mt-2 text-xs font-medium text-green-700 flex items-center gap-1.5">
                    <Check className="w-4 h-4" aria-hidden="true" /> Toutes les images ont été reconnues.
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Rechercher par référence, produit ou variante</span>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Référence, nom du produit ou variante…"
              className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
            />
          </label>

          <div className="grid grid-cols-2 bg-gray-100 p-1 rounded-lg" aria-label="Filtrer selon les photos manuelles importées">
            {([
              ['missing', 'Sans photo manuelle'],
              ['present', 'Photos en attente'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setImageStatus(value);
                  setPage(1);
                }}
                className={`min-h-10 px-3 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  imageStatus === value ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
                aria-pressed={imageStatus === value}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-10 px-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Actualiser
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>{meta ? `${meta.total} produit(s)` : 'Recherche dans tout le catalogue'}</span>
          <span>Les images sont enregistrées dès l’upload et restent après actualisation.</span>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border p-10 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin text-orange-500" /> Chargement des produits…
        </div>
      ) : isError ? (
        <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
          <p className="text-sm font-medium text-red-700">{errorMessage || 'Impossible de charger les produits'}</p>
          <button onClick={() => refetch()} className="mt-3 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
            Réessayer
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <ImageOff className="w-9 h-9 mx-auto text-gray-300" />
          <p className="mt-3 text-sm font-semibold text-gray-700">Aucun produit trouvé</p>
          <p className="mt-1 text-xs text-gray-500">
            {imageStatus === 'missing'
              ? 'Tous les produits correspondants ont déjà des photos manuelles ou des photos en attente.'
              : 'Aucun produit correspondant ne possède de photo uploadée en attente d’attachement.'}
          </p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className={`space-y-3 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            {products.map((product) => {
              const photos = queues[product.id] || [];
              const pendingPhotos = photos.filter((photo) => photo.status === 'uploaded');
              const uploading = uploadingIds.has(product.id);
              const attaching = attachingIds.has(product.id);
              const busy = uploading || attaching;
              const draggingFiles = !busy && dragOverId === product.id;
              return (
                <article
                  key={product.id}
                  data-manual-product-id={product.id}
                  role={pendingPhotos.length && imageStatus === 'present' ? 'button' : undefined}
                  tabIndex={pendingPhotos.length && imageStatus === 'present' ? 0 : -1}
                  aria-label={pendingPhotos.length && imageStatus === 'present'
                    ? `Examiner les photos en attente de ${product.designation}`
                    : undefined}
                  className={`bg-white rounded-xl border p-3 md:p-4 transition-colors ${pendingPhotos.length && imageStatus === 'present' ? 'cursor-pointer hover:border-orange-300' : ''} ${
                    draggingFiles ? 'border-orange-500 bg-orange-50/40 ring-2 ring-orange-200' : 'border-gray-200'
                  }`}
                  onClick={(event) => {
                    if (imageStatus !== 'present' || !pendingPhotos.length) return;
                    const target = event.target as HTMLElement;
                    if (target.closest('button, input, label, select, a')) return;
                    openReview(pendingPhotos[0].id, event.currentTarget, product.id);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.target !== event.currentTarget ||
                      imageStatus !== 'present' ||
                      !pendingPhotos.length ||
                      (event.key !== 'Enter' && event.key !== ' ')
                    ) return;
                    event.preventDefault();
                    openReview(pendingPhotos[0].id, event.currentTarget, product.id);
                  }}
                  onDragEnter={(event) => {
                    if (!busy && event.dataTransfer.types.includes('Files')) setDragOverId(product.id);
                  }}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes('Files')) return;
                    event.preventDefault();
                    if (busy) {
                      event.dataTransfer.dropEffect = 'none';
                      return;
                    }
                    event.dataTransfer.dropEffect = 'copy';
                    setDragOverId(product.id);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverId(null);
                  }}
                  onDrop={(event) => {
                    if (!event.dataTransfer.files.length) return;
                    event.preventDefault();
                    setDragOverId(null);
                    if (busy) return;
                    void addFiles(product.id, event.dataTransfer.files);
                  }}
                >
                  <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_170px] gap-4 items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt=""
                          className="w-16 h-16 flex-none rounded-lg object-cover border border-gray-200 bg-gray-50"
                        />
                      ) : (
                        <div className="w-16 h-16 flex-none rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-gray-400">
                          <ImageOff className="w-5 h-5" />
                          <span className="text-[9px] mt-1">Sans image</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900 line-clamp-2">{product.designation}</p>
                        <p className="mt-1 text-xs text-gray-500">Réf. {product.reference || product.id}</p>
                        <p className="text-xs text-gray-500">Galerie : {product.gallery_count} image(s)</p>
                      </div>
                    </div>

                    <div
                      aria-disabled={busy}
                      className={`min-w-0 rounded-xl border-2 border-dashed px-3 py-3 ${
                        draggingFiles
                          ? 'border-orange-500 bg-white'
                          : busy
                            ? 'border-gray-200 bg-gray-100/70 opacity-70'
                            : 'border-gray-300 bg-gray-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-700">Glissez les images ici</p>
                          <p className="text-[11px] text-gray-500">Upload immédiat en base · ordre modifiable avant attachement</p>
                        </div>
                        <label className={`h-10 px-3 flex-none rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 ${
                          busy
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'border-orange-300 bg-white text-orange-700 hover:bg-orange-50 cursor-pointer'
                        }`}>
                          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          {uploading ? 'Upload…' : 'Uploader'}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={busy}
                            className="sr-only"
                            onChange={(event) => {
                              if (event.target.files) void addFiles(product.id, event.target.files);
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>
                      </div>

                      <Droppable droppableId={`manual-queue-${product.id}`} direction="horizontal">
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex min-h-[76px] gap-2 overflow-x-auto py-1 ${snapshot.isDraggingOver ? 'bg-orange-50' : ''}`}
                          >
                            {photos.length === 0 && (
                              <div className="w-full min-h-[68px] flex items-center justify-center text-xs text-gray-400">
                                La file d’images est vide
                              </div>
                            )}
                            {photos.map((photo, index) => (
                              <Draggable key={photo.id} draggableId={String(photo.id)} index={index} isDragDisabled={busy}>
                                {(dragProvided, dragSnapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    role={photo.status === 'uploaded' && imageStatus === 'present' ? 'button' : undefined}
                                    tabIndex={photo.status === 'uploaded' && imageStatus === 'present' ? 0 : -1}
                                    aria-label={photo.status === 'uploaded' && imageStatus === 'present'
                                      ? `Examiner l'image ${index + 1} de ${product.designation}`
                                      : undefined}
                                    onClick={(event) => {
                                      if ((event.target as HTMLElement).closest('button')) return;
                                      if (photo.status === 'uploaded' && imageStatus === 'present') {
                                        event.stopPropagation();
                                        openReview(photo.id, event.currentTarget, product.id);
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if (photo.status !== 'uploaded' || imageStatus !== 'present') return;
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        openReview(photo.id, event.currentTarget, product.id);
                                      }
                                    }}
                                    className={`relative w-20 h-20 flex-none rounded-lg bg-white ${photo.status === 'uploaded' && imageStatus === 'present' ? 'cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2' : ''} ${
                                      dragSnapshot.isDragging ? 'shadow-xl ring-2 ring-orange-400' : ''
                                    }`}
                                  >
                                    <img src={photo.image_url} alt={`Image ${index + 1}`} className="w-full h-full object-cover rounded-lg border" />
                                    {photo.id === pendingPhotos[0]?.id && (
                                      <span
                                        className="absolute -top-1.5 -left-1.5 bg-yellow-400 text-yellow-900 rounded-full p-1 shadow"
                                        title="Image principale"
                                      >
                                        <Star className="w-3 h-3 fill-current" />
                                      </span>
                                    )}
                                    <span className="absolute bottom-1 left-1 text-[10px] font-bold bg-gray-900/75 text-white px-1.5 py-0.5 rounded">
                                      {photo.status === 'attached' ? 'Attachée' : index + 1}
                                    </span>
                                    {photo.status === 'uploaded' && (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void removePhoto(product.id, photo.id);
                                        }}
                                        disabled={busy || deletingIds.has(photo.id)}
                                        className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-red-600 text-white shadow flex items-center justify-center hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                        title="Supprimer cette image uploadée"
                                        aria-label={`Supprimer l'image ${index + 1}`}
                                      >
                                        {deletingIds.has(photo.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                      </button>
                                    )}
                                    {photo.status === 'attached' && (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void rejectPhoto(product.id, photo.id);
                                        }}
                                        disabled={busy || rejectingIds.has(photo.id)}
                                        className="absolute -top-2 -right-2 min-h-8 px-2 rounded-full bg-red-600 text-white shadow flex items-center justify-center gap-1 text-[10px] font-bold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                        title="Marquer cette image comme fausse"
                                        aria-label={`Marquer l'image ${index + 1} comme fausse`}
                                      >
                                        {rejectingIds.has(photo.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                        Fausse
                                      </button>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>

                    <div className="flex flex-col gap-2 w-full">
                      <button
                        type="button"
                        onClick={() => void attach(product.id)}
                        disabled={!pendingPhotos.length || busy}
                        className="min-h-10 w-full px-3 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {attaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                        {attaching ? 'Attachement…' : `Attacher au produit (${pendingPhotos.length})`}
                      </button>
                      {pendingPhotos.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void clearQueue(product.id)}
                          disabled={busy}
                          className="min-h-10 w-full px-3 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Vider les uploads ({pendingPhotos.length})
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {meta && meta.total > 0 && (
        <footer className="bg-white rounded-xl border px-3 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Page {meta.page} sur {meta.totalPages}</span>
            <label className="flex items-center gap-1.5">
              <span>Afficher</span>
              <select
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
                className="h-9 border border-gray-300 rounded-lg py-0 pl-2 pr-7 text-xs focus:ring-orange-400 focus:border-orange-400"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={40}>40</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={meta.page <= 1 || isFetching}
              className="h-10 px-3 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Précédent
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}
              disabled={meta.page >= meta.totalPages || isFetching}
              className="h-10 px-3 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 flex items-center gap-1"
            >
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </footer>
      )}

      {reviewItem && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/85 p-2 sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !reviewBusy) closeReview();
          }}
        >
          <div
            ref={reviewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-review-title"
            aria-describedby="manual-review-reference"
            className="flex h-[calc(100vh-1rem)] max-h-[900px] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/15 bg-white shadow-2xl sm:h-[calc(100vh-2rem)]"
          >
            <header className="flex flex-none items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-700">Revue photo</span>
                  <span className="text-xs font-semibold text-gray-500" aria-live="polite">
                    {reviewIndex + 1} / {reviewItems.length}
                  </span>
                </div>
                <h2 id="manual-review-title" className="mt-1 truncate text-base font-bold text-gray-950 sm:text-lg">
                  {reviewItem.product.designation}
                </h2>
                <p id="manual-review-reference" className="mt-0.5 text-xs text-gray-500">
                  Réf. {reviewItem.product.reference || reviewItem.product.id}
                </p>
              </div>
              <button
                ref={reviewCloseButtonRef}
                type="button"
                onClick={closeReview}
                disabled={reviewBusy}
                className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Fermer la revue des photos"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div className="grid min-h-0 flex-1 grid-rows-[minmax(170px,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-1">
              <div className="relative flex min-h-0 items-center justify-center overflow-hidden bg-gray-950 p-3 sm:p-6">
                <img
                  src={reviewItem.photo.image_url}
                  alt={`Photo en attente de ${reviewItem.product.designation}`}
                  className="max-h-full max-w-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => navigateReview(-1)}
                  disabled={reviewItems.length < 2 || reviewBusy}
                  className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg border border-white/20 bg-gray-950/75 text-white shadow-lg hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:opacity-30 sm:left-4"
                  aria-label="Photo précédente"
                >
                  <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => navigateReview(1)}
                  disabled={reviewItems.length < 2 || reviewBusy}
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg border border-white/20 bg-gray-950/75 text-white shadow-lg hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:opacity-30 sm:right-4"
                  aria-label="Photo suivante"
                >
                  <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>

              <aside className="flex min-h-0 flex-col overflow-y-auto border-t border-gray-200 bg-gray-50 p-3 sm:p-4 lg:border-l lg:border-t-0">
                <div className="min-h-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Photos en attente</p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    Vérifiez la photo avant de l’attacher. Une photo rejetée reste conservée dans l’historique interne.
                  </p>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:max-h-[calc(100vh-390px)] lg:flex-wrap lg:overflow-y-auto">
                    {reviewItems.map((item, index) => (
                      <button
                        key={item.photo.id}
                        type="button"
                        onClick={() => setReviewPhotoId(item.photo.id)}
                        disabled={reviewBusy}
                        aria-label={`Afficher la photo ${index + 1} de ${item.product.designation}`}
                        aria-current={item.photo.id === reviewItem.photo.id ? 'true' : undefined}
                        className={`relative h-16 w-16 flex-none overflow-hidden rounded-lg border-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                          item.photo.id === reviewItem.photo.id
                            ? 'border-orange-500 shadow-sm'
                            : 'border-transparent opacity-70 hover:border-gray-300 hover:opacity-100'
                        }`}
                        title={`${item.product.designation} · Réf. ${item.product.reference || item.product.id}`}
                      >
                        <img src={item.photo.image_url} alt="" className="h-full w-full object-cover" />
                        <span className="absolute bottom-0 right-0 bg-gray-950/80 px-1 text-[9px] font-bold text-white">
                          {index + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 grid flex-none gap-2 border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => void attachPhoto(reviewItem.product.id, reviewItem.photo.id)}
                    disabled={reviewBusy}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {attachingIds.has(reviewItem.product.id)
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Link2 className="h-4 w-4" aria-hidden="true" />}
                    {attachingIds.has(reviewItem.product.id) ? 'Attachement…' : 'Attacher cette photo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void rejectPhoto(reviewItem.product.id, reviewItem.photo.id)}
                    disabled={reviewBusy}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 text-sm font-bold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                  >
                    {rejectingIds.has(reviewItem.photo.id)
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                    {rejectingIds.has(reviewItem.photo.id) ? 'Rejet…' : 'Photo fausse — Rejeter'}
                  </button>
                  <p className="hidden text-center text-[11px] text-gray-400 lg:block">
                    Touches ← → pour naviguer · Échap pour fermer
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const ProductPhotoStudioPage: React.FC = () => {
  const [tab, setTab] = useState<'capture' | 'history' | 'attached' | 'manual'>('capture');
  const [aiConfiguration, setAiConfiguration] = useState<AiConfiguration>({
    model: 'gpt-image-2',
    quality: 'medium',
  });

  return (
    <div className={`p-4 md:p-6 mx-auto ${tab === 'manual' ? 'max-w-7xl' : 'max-w-5xl'}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-orange-100 rounded-lg">
          <Camera className="w-6 h-6 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Studio Photos Produits</h1>
          <p className="text-sm text-gray-500">Prise de photos en magasin, traitement IA et galeries produits</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4 w-full sm:w-fit overflow-x-auto">
        <button
          onClick={() => setTab('capture')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${tab === 'capture' ? 'bg-white shadow text-orange-600' : 'text-gray-600 hover:text-gray-800'}`}
        >
          <Camera className="w-4 h-4" /> Capture
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${tab === 'history' ? 'bg-white shadow text-orange-600' : 'text-gray-600 hover:text-gray-800'}`}
        >
          <History className="w-4 h-4" /> Historique
        </button>
        <button
          onClick={() => setTab('attached')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${tab === 'attached' ? 'bg-white shadow text-orange-600' : 'text-gray-600 hover:text-gray-800'}`}
        >
          <Link2 className="w-4 h-4" /> Attachés
        </button>
        <button
          onClick={() => setTab('manual')}
          aria-label="Photos recherche manuelle"
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 whitespace-nowrap ${tab === 'manual' ? 'bg-white shadow text-orange-600' : 'text-gray-600 hover:text-gray-800'}`}
        >
          <ImagePlus className="w-4 h-4" /> <span className="hidden md:inline">Photos recherche manuelle</span><span className="md:hidden">Recherche manuelle</span>
        </button>
      </div>

      {tab === 'capture' && (
        <CaptureTab aiConfiguration={aiConfiguration} onAiConfigurationChange={setAiConfiguration} />
      )}
      {tab === 'history' && (
        <HistoryTab aiConfiguration={aiConfiguration} onAiConfigurationChange={setAiConfiguration} />
      )}
      {tab === 'attached' && <AttachedTab />}
      {tab === 'manual' && <ManualPhotosTab />}
    </div>
  );
};

export default ProductPhotoStudioPage;
