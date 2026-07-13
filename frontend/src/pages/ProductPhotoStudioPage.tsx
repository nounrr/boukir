import React, { useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import {
  Camera, X, Trash2, Wand2, Search, ImagePlus, Check,
  Link2, RefreshCw, Star, ChevronRight, Loader2, History, Aperture
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { useSearchBonProductsQuery } from '../store/api/productsApi';
import {
  useGetPhotoShootsQuery,
  useCreatePhotoShootMutation,
  useDeletePhotoShootMutation,
  useDeletePhotoImageMutation,
  useProcessPhotoShootsMutation,
  useReorderPhotoImagesMutation,
  useAttachPhotoShootMutation,
} from '../store/api/productPhotosApi';
import type {
  AiImageModel,
  AiImageQuality,
  PhotoShoot,
  PhotoShootImage,
  PhotoShootStatus,
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

const ShootCard: React.FC<{
  shoot: PhotoShoot;
  selected: boolean;
  onToggleSelect: () => void;
  aiConfiguration: AiConfiguration;
}> = ({ shoot, selected, onToggleSelect, aiConfiguration }) => {
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
        {(shoot.status === 'pending' || shoot.status === 'error') && (
          <button
            onClick={() => processShoots({ shootIds: [shoot.id], ...aiConfiguration })}
            disabled={processing}
            className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Wand2 className="w-4 h-4" /> Traiter par IA
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
              {shoot.originals.map((orig) => {
                const proc = processedBySource.get(orig.id);
                return (
                  <div key={orig.id} className="flex items-center gap-1 flex-shrink-0">
                    <div className="relative">
                      <img src={orig.image_url} className="w-24 h-24 object-cover rounded-lg border" alt="avant" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center rounded-b-lg">Avant</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    {proc ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className="relative group">
                          <img src={proc.image_url} className="w-24 h-24 object-cover rounded-lg border-2 border-green-400" alt="après" />
                          <span className="absolute bottom-0 left-0 right-0 bg-green-600/70 text-white text-[10px] text-center rounded-b-lg">Après IA</span>
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
              {shoot.originals.map((img) => (
                <div key={img.id} className="relative group flex-shrink-0">
                  <img src={img.image_url} className="w-24 h-24 object-cover rounded-lg border" alt="" />
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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: allShoots = [], isFetching, refetch } = useGetPhotoShootsQuery(
    { status: statusFilter || undefined, q: debouncedQ || undefined, sortBy, sortOrder },
    { pollingInterval: 0 }
  );
  // L'historique ne montre que les sessions non attachées (les attachées ont leur propre onglet)
  const shoots = useMemo(() => allShoots.filter((s) => s.status !== 'attached'), [allShoots]);

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

  const selectableForProcess = shoots.filter(
    (s) => selectedIds.includes(s.id) && (s.status === 'pending' || s.status === 'error' || s.status === 'processed')
  );
  const selectableForAttach = shoots.filter(
    (s) => selectedIds.includes(s.id) && s.status !== 'processing'
  );

  const batchProcess = async () => {
    if (!selectableForProcess.length) return;
    try {
      await processShoots({ shootIds: selectableForProcess.map((s) => s.id), ...aiConfiguration }).unwrap();
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
          <option value="">Tous les statuts</option>
          <option value="pending">Non traité</option>
          <option value="processing">En traitement</option>
          <option value="processed">Traité par IA</option>
          <option value="error">Erreur</option>
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
        <button onClick={() => refetch()} className="p-2 border rounded-lg hover:bg-gray-50" title="Actualiser">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
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
            aiConfiguration={aiConfiguration}
          />
        ))}
      </div>
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

const ProductPhotoStudioPage: React.FC = () => {
  const [tab, setTab] = useState<'capture' | 'history' | 'attached'>('capture');
  const [aiConfiguration, setAiConfiguration] = useState<AiConfiguration>({
    model: 'gpt-image-2',
    quality: 'medium',
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-orange-100 rounded-lg">
          <Camera className="w-6 h-6 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Studio Photos Produits</h1>
          <p className="text-sm text-gray-500">Prise de photos en magasin, traitement IA et galeries produits</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4 w-fit">
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
      </div>

      {tab === 'capture' && (
        <CaptureTab aiConfiguration={aiConfiguration} onAiConfigurationChange={setAiConfiguration} />
      )}
      {tab === 'history' && (
        <HistoryTab aiConfiguration={aiConfiguration} onAiConfigurationChange={setAiConfiguration} />
      )}
      {tab === 'attached' && <AttachedTab />}
    </div>
  );
};

export default ProductPhotoStudioPage;
