import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import {
  Check, ChevronLeft, ChevronRight, Crop, Expand, Eye, FlipHorizontal2,
  FlipVertical2, Hand, Loader2, Maximize2, MoveUpRight, Redo2, RotateCcw,
  RotateCw, Save, Undo2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { PhotoShoot, PhotoShootImage } from '../../store/api/productPhotosApi';
import { useReplacePhotoShootImageMutation } from '../../store/api/productPhotosApi';
import {
  DEFAULT_PHOTO_TRANSFORM, canvasToJpeg, clonePhotoTransform, cropForAspect,
  renderProductPhoto,
} from '../../utils/productPhotoTransforms';
import type { ProductPhotoTransform } from '../../utils/productPhotoTransforms';

type Tool = 'crop' | 'rotate' | 'flip' | 'expand' | 'perspective';

interface EditorAsset {
  shoot: PhotoShoot;
  image: PhotoShootImage;
  originalUrl: string;
}

interface Props {
  shoots: PhotoShoot[];
  initialShootId: number;
  initialImageId: number;
  onClose: () => void;
}

const toolButton = 'min-h-11 min-w-11 px-3 py-2 rounded-lg border text-xs font-medium flex flex-col items-center justify-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400';
const iconButton = 'h-11 w-11 inline-flex items-center justify-center rounded-lg text-gray-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-30';
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const ProductPhotoEditor: React.FC<Props> = ({ shoots, initialShootId, initialImageId, onClose }) => {
  const assets = useMemo<EditorAsset[]>(() => {
    return shoots.flatMap((shoot) => {
      const originalById = new Map(shoot.originals.map((item) => [item.id, item]));
      const processedBySource = new Map<number, PhotoShootImage>();
      shoot.processed.forEach((image) => {
        if (image.source_image_id) processedBySource.set(image.source_image_id, image);
      });
      const used = new Set<number>();
      const paired = shoot.originals.map((original) => {
        const image = processedBySource.get(original.id) || original;
        used.add(image.id);
        return { shoot, image, originalUrl: original.image_url };
      });
      const unpaired = shoot.processed
        .filter((image) => !used.has(image.id))
        .map((image) => ({
          shoot,
          image,
          originalUrl: (image.source_image_id ? originalById.get(image.source_image_id)?.image_url : null) || image.image_url,
        }));
      return [...paired, ...unpaired];
    });
  }, [shoots]);
  const initialIndex = Math.max(0, assets.findIndex(
    (asset) => asset.shoot.id === initialShootId && asset.image.id === initialImageId
  ));
  const [index, setIndex] = useState(initialIndex);
  const [tool, setTool] = useState<Tool>('crop');
  const [transform, setTransform] = useState<ProductPhotoTransform>(() => clonePhotoTransform(DEFAULT_PHOTO_TRANSFORM));
  const [undoStack, setUndoStack] = useState<ProductPhotoTransform[]>([]);
  const [redoStack, setRedoStack] = useState<ProductPhotoTransform[]>([]);
  const [compareBefore, setCompareBefore] = useState(false);
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const renderSequence = useRef(0);
  const [replaceImage, { isLoading: saving }] = useReplacePhotoShootImageMutation();
  const current = assets[index] || assets[0];
  const dirty = undoStack.length > 0;

  const applyChange = useCallback((next: ProductPhotoTransform) => {
    setUndoStack((items) => [...items, clonePhotoTransform(transform)]);
    setRedoStack([]);
    setTransform(clonePhotoTransform(next));
  }, [transform]);

  const update = useCallback((patch: Partial<ProductPhotoTransform>) => {
    applyChange({ ...transform, ...patch });
  }, [applyChange, transform]);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => setStageSize({
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    }));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!current) return;
    const sequence = ++renderSequence.current;
    setRendering(true);
    setPreviewError(null);
    const imageUrl = compareBefore ? current.originalUrl : current.image.image_url;
    const previewTransform = compareBefore ? DEFAULT_PHOTO_TRANSFORM : transform;
    const previewExpansion = !compareBefore && tool === 'expand';
    renderProductPhoto(imageUrl, previewTransform, {
      maxDimension: 1200,
      applyCrop: previewExpansion,
      applyExpansion: previewExpansion,
    })
      .then((rendered) => {
        if (sequence !== renderSequence.current) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(rendered, 0, 0);
        setPreviewSize({ width: rendered.width, height: rendered.height });
      })
      .catch((error) => sequence === renderSequence.current && setPreviewError(error?.message || 'Aperçu impossible'))
      .finally(() => sequence === renderSequence.current && setRendering(false));
  }, [compareBefore, current, tool, transform]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((items) => [...items, clonePhotoTransform(transform)]);
    setTransform(previous);
    setUndoStack((items) => items.slice(0, -1));
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((items) => [...items, clonePhotoTransform(transform)]);
    setTransform(next);
    setRedoStack((items) => items.slice(0, -1));
  };

  const save = useCallback(async () => {
    if (!current || saving) return false;
    try {
      const canvas = await renderProductPhoto(current.image.image_url, transform, {
        maxDimension: 2400,
        applyCrop: true,
        applyExpansion: true,
      });
      const blob = await canvasToJpeg(canvas, 0.92);
      const body = new FormData();
      body.append('image', new File([blob], `photo-editee-${current.image.id}.jpg`, { type: 'image/jpeg' }));
      await replaceImage({ shootId: current.shoot.id, imageId: current.image.id, body }).unwrap();
      setTransform(clonePhotoTransform(DEFAULT_PHOTO_TRANSFORM));
      setUndoStack([]);
      setRedoStack([]);
      await Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Modifications enregistrées', showConfirmButton: false, timer: 2200 });
      return true;
    } catch (error: any) {
      await Swal.fire({ icon: 'error', title: 'Enregistrement impossible', text: error?.data?.message || error?.message || 'L’image n’a pas pu être exportée.' });
      return false;
    }
  }, [current, replaceImage, saving, transform]);

  const confirmDirty = useCallback(async () => {
    if (!dirty) return 'discard' as const;
    const result = await Swal.fire({
      title: 'Modifications non enregistrées',
      text: 'Enregistrez-les avant de quitter cette image ou abandonnez-les.',
      icon: 'warning',
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Enregistrer',
      denyButtonText: 'Abandonner',
      cancelButtonText: 'Continuer la retouche',
      confirmButtonColor: '#ea580c',
    });
    if (result.isConfirmed) return (await save()) ? 'save' as const : 'cancel' as const;
    if (result.isDenied) return 'discard' as const;
    return 'cancel' as const;
  }, [dirty, save]);

  const close = useCallback(async () => {
    const decision = await confirmDirty();
    if (decision !== 'cancel') onClose();
  }, [confirmDirty, onClose]);

  const move = useCallback(async (direction: -1 | 1) => {
    if (assets.length <= 1) return;
    const decision = await confirmDirty();
    if (decision === 'cancel') return;
    setIndex((value) => (value + direction + assets.length) % assets.length);
    setTransform(clonePhotoTransform(DEFAULT_PHOTO_TRANSFORM));
    setUndoStack([]);
    setRedoStack([]);
    setCompareBefore(false);
    resetView();
  }, [assets.length, confirmDirty]);

  const selectImage = useCallback(async (nextIndex: number) => {
    if (nextIndex === index || nextIndex < 0 || nextIndex >= assets.length) return;
    const decision = await confirmDirty();
    if (decision === 'cancel') return;
    setIndex(nextIndex);
    setTransform(clonePhotoTransform(DEFAULT_PHOTO_TRANSFORM));
    setUndoStack([]);
    setRedoStack([]);
    setCompareBefore(false);
    resetView();
  }, [assets.length, confirmDirty, index]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const controlFocused = !!target.closest('input, select, textarea, button, [contenteditable="true"]');
      if (event.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])
          .filter((element) => element.offsetParent !== null);
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
      if (event.key === 'Escape') { event.preventDefault(); void close(); }
      if (!controlFocused && event.key === 'ArrowLeft') { event.preventDefault(); void move(-1); }
      if (!controlFocused && event.key === 'ArrowRight') { event.preventDefault(); void move(1); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const displayScale = Math.min(
    Math.max(0.01, (stageSize.width - 40) / previewSize.width),
    Math.max(0.01, (stageSize.height - 40) / previewSize.height),
    1
  );
  const displayWidth = Math.max(1, previewSize.width * displayScale);
  const displayHeight = Math.max(1, previewSize.height * displayScale);

  const beginCropDrag = (corner: 0 | 1 | 2 | 3, event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation();
    const start = clonePhotoTransform(transform);
    setUndoStack((items) => [...items, start]); setRedoStack([]);
    const moveHandle = (pointer: PointerEvent) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clamp((pointer.clientX - rect.left) / rect.width);
      const y = clamp((pointer.clientY - rect.top) / rect.height);
      const right = start.crop.x + start.crop.width;
      const bottom = start.crop.y + start.crop.height;
      const min = 0.06;
      const crop = { ...start.crop };
      if (corner === 0 || corner === 3) { crop.x = Math.min(x, right - min); crop.width = right - crop.x; }
      else crop.width = Math.max(min, x - crop.x);
      if (corner === 0 || corner === 1) { crop.y = Math.min(y, bottom - min); crop.height = bottom - crop.y; }
      else crop.height = Math.max(min, y - crop.y);
      setTransform({ ...start, crop });
    };
    const stop = () => { window.removeEventListener('pointermove', moveHandle); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', moveHandle); window.addEventListener('pointerup', stop);
  };

  const beginPerspectiveDrag = (corner: 0 | 1 | 2 | 3, event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation();
    const start = clonePhotoTransform(transform);
    setUndoStack((items) => [...items, start]); setRedoStack([]);
    const moveHandle = (pointer: PointerEvent) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      const points = clonePhotoTransform(start).perspective;
      points[corner] = {
        x: clamp((pointer.clientX - rect.left) / rect.width, 0.02, 0.98),
        y: clamp((pointer.clientY - rect.top) / rect.height, 0.02, 0.98),
      };
      setTransform({ ...start, perspective: points });
    };
    const stop = () => { window.removeEventListener('pointermove', moveHandle); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', moveHandle); window.addEventListener('pointerup', stop);
  };

  const beginPan = (event: React.PointerEvent) => {
    if (zoom <= 1 || (event.target as HTMLElement).closest('[data-transform-handle]')) return;
    const start = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    const movePan = (pointer: PointerEvent) => setPan({ x: pointer.clientX - start.x, y: pointer.clientY - start.y });
    const stop = () => { window.removeEventListener('pointermove', movePan); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', movePan); window.addEventListener('pointerup', stop);
  };

  if (!current) return null;
  const crop = transform.crop;
  const cropHandles: Array<{ left: string; top: string }> = [
    { left: `${crop.x * 100}%`, top: `${crop.y * 100}%` },
    { left: `${(crop.x + crop.width) * 100}%`, top: `${crop.y * 100}%` },
    { left: `${(crop.x + crop.width) * 100}%`, top: `${(crop.y + crop.height) * 100}%` },
    { left: `${crop.x * 100}%`, top: `${(crop.y + crop.height) * 100}%` },
  ];

  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[80] flex flex-col bg-[#090a0c] text-white outline-none motion-reduce:[&_*]:!transition-none" role="dialog" aria-modal="true" aria-label="Éditeur de photos produit">
      <header className="flex min-h-16 items-center gap-2 border-b border-white/10 bg-[#101216] px-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold sm:text-base">{current.shoot.product_designation}</h2>
          <p className="truncate text-[11px] text-gray-400 sm:text-xs">
            Réf. {current.shoot.variant_reference || current.shoot.product_id}{current.shoot.variant_name ? ` · ${current.shoot.variant_name}` : ''} · Image {index + 1} / {assets.length}
          </p>
        </div>
        <button className={iconButton} onClick={undo} disabled={!undoStack.length} aria-label="Annuler la dernière modification"><Undo2 className="h-5 w-5" /></button>
        <button className={iconButton} onClick={redo} disabled={!redoStack.length} aria-label="Rétablir la modification"><Redo2 className="h-5 w-5" /></button>
        <button className={`${iconButton} hidden sm:inline-flex`} onClick={() => applyChange(clonePhotoTransform(DEFAULT_PHOTO_TRANSFORM))} aria-label="Réinitialiser les modifications"><RotateCcw className="h-5 w-5" /></button>
        <button
          className={`h-11 px-3 rounded-lg border text-sm font-medium inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${compareBefore ? 'border-orange-400 bg-orange-500/15 text-orange-300' : 'border-white/15 text-gray-200 hover:bg-white/10'}`}
          onClick={() => setCompareBefore((value) => !value)} aria-pressed={compareBefore}
        ><Eye className="h-4 w-4" /><span className="hidden sm:inline">{compareBefore ? 'Avant' : 'Après'}</span></button>
        <button className={iconButton} onClick={() => void close()} aria-label="Fermer l’éditeur"><X className="h-6 w-6" /></button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex shrink-0 gap-2 overflow-x-auto border-t border-white/10 bg-[#111318] p-2 lg:order-1 lg:w-24 lg:flex-col lg:border-r lg:border-t-0 lg:p-3" aria-label="Outils de retouche">
          {([
            ['crop', Crop, 'Recadrer'], ['rotate', RotateCw, 'Rotation'], ['flip', FlipHorizontal2, 'Retourner'],
            ['expand', Expand, 'Agrandir'], ['perspective', MoveUpRight, 'Perspective'],
          ] as const).map(([value, Icon, label]) => (
            <button key={value} onClick={() => setTool(value)} className={`${toolButton} ${tool === value ? 'border-orange-400 bg-orange-500/15 text-orange-300' : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'}`} aria-pressed={tool === value}>
              <Icon className="h-5 w-5" />{label}
            </button>
          ))}
        </aside>

        <section className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
          <div
            ref={stageRef}
            className="relative min-h-[280px] flex-1 overflow-hidden touch-none select-none"
            style={{ backgroundColor: '#15171b', backgroundImage: 'linear-gradient(45deg,#1c1f24 25%,transparent 25%),linear-gradient(-45deg,#1c1f24 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1c1f24 75%),linear-gradient(-45deg,transparent 75%,#1c1f24 75%)', backgroundSize: '24px 24px', backgroundPosition: '0 0,0 12px,12px -12px,-12px 0' }}
            onPointerDown={beginPan}
          >
            <button onClick={() => void move(-1)} disabled={assets.length <= 1} className="absolute left-2 top-1/2 z-30 h-11 w-11 -translate-y-1/2 rounded-lg border border-white/10 bg-black/60 text-white hover:bg-black/80 disabled:opacity-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" aria-label="Image précédente"><ChevronLeft className="mx-auto h-6 w-6" /></button>
            <button onClick={() => void move(1)} disabled={assets.length <= 1} className="absolute right-2 top-1/2 z-30 h-11 w-11 -translate-y-1/2 rounded-lg border border-white/10 bg-black/60 text-white hover:bg-black/80 disabled:opacity-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" aria-label="Image suivante"><ChevronRight className="mx-auto h-6 w-6" /></button>
            <div className="absolute right-3 top-3 z-30 flex rounded-lg border border-white/10 bg-black/70 p-1">
              <button className={iconButton} onClick={() => setZoom((value) => clamp(value - 0.25, 0.5, 3))} aria-label="Zoom arrière"><ZoomOut className="h-4 w-4" /></button>
              <span className="min-w-14 self-center text-center text-xs tabular-nums text-gray-300">{Math.round(zoom * 100)}%</span>
              <button className={iconButton} onClick={() => setZoom((value) => clamp(value + 0.25, 0.5, 3))} aria-label="Zoom avant"><ZoomIn className="h-4 w-4" /></button>
              <button className={iconButton} onClick={resetView} aria-label="Ajuster à l’écran"><Maximize2 className="h-4 w-4" /></button>
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-5" aria-live="polite">
              <div
                ref={surfaceRef}
                className="relative shadow-[0_24px_70px_rgba(0,0,0,.55)]"
                style={{ width: displayWidth, height: displayHeight, transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transition: 'transform 120ms ease-out' }}
              >
                <canvas ref={canvasRef} className="block h-full w-full bg-white" aria-label={compareBefore ? 'Photo originale avant modification' : 'Aperçu modifié'} />
                {!compareBefore && tool === 'crop' && (
                  <div className="absolute border-2 border-orange-400 shadow-[0_0_0_9999px_rgba(0,0,0,.55)]" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}>
                    <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'linear-gradient(to right,transparent 33%,#fff 33%,#fff calc(33% + 1px),transparent calc(33% + 1px),transparent 66%,#fff 66%,#fff calc(66% + 1px),transparent calc(66% + 1px)),linear-gradient(to bottom,transparent 33%,#fff 33%,#fff calc(33% + 1px),transparent calc(33% + 1px),transparent 66%,#fff 66%,#fff calc(66% + 1px),transparent calc(66% + 1px))' }} />
                  </div>
                )}
                {!compareBefore && tool === 'crop' && cropHandles.map((position, corner) => (
                  <button key={corner} data-transform-handle onPointerDown={(event) => beginCropDrag(corner as 0 | 1 | 2 | 3, event)} className="absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white bg-orange-500 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-white" style={position} aria-label={`Poignée de recadrage ${corner + 1}`} />
                ))}
                {!compareBefore && tool === 'perspective' && transform.perspective.map((point, corner) => (
                  <button key={corner} data-transform-handle onPointerDown={(event) => beginPerspectiveDrag(corner as 0 | 1 | 2 | 3, event)} className="absolute z-20 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-white bg-orange-500 shadow-[0_0_0_4px_rgba(234,88,12,.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-label={`Coin de perspective ${corner + 1}`} />
                ))}
              </div>
              {rendering && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Loader2 className="h-8 w-8 animate-spin text-orange-400 motion-reduce:animate-none" /><span className="sr-only">Calcul de l’aperçu</span></div>}
              {previewError && <div className="absolute max-w-md rounded-lg border border-red-500/30 bg-red-950/90 p-4 text-center text-sm text-red-200">{previewError}</div>}
            </div>
            <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] text-gray-300">
              <Hand className="mr-1 inline h-3.5 w-3.5" /> Zoomez puis glissez pour inspecter · la vue n’affecte pas l’export
            </div>
          </div>

          <div className="border-t border-white/10 bg-[#101216] px-3 py-2">
            <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1">
              {assets.map((asset, assetIndex) => (
                <button key={`${asset.shoot.id}-${asset.image.id}`} onClick={() => void selectImage(assetIndex)} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${assetIndex === index ? 'border-orange-400' : 'border-transparent opacity-60 hover:opacity-100'}`} aria-label={`Ouvrir l’image ${assetIndex + 1} de ${asset.shoot.product_designation}, référence ${asset.shoot.variant_reference || asset.shoot.product_id}`} aria-current={assetIndex === index ? 'true' : undefined} title={`${asset.shoot.product_designation} · Réf. ${asset.shoot.variant_reference || asset.shoot.product_id}`}>
                  <img src={asset.image.image_url} alt="" className="h-full w-full object-cover" />
                  <span className="absolute bottom-0 right-0 bg-black/75 px-1 text-[10px] tabular-nums">{assetIndex + 1}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="order-3 max-h-52 shrink-0 overflow-y-auto border-t border-white/10 bg-[#111318] p-4 lg:max-h-none lg:w-72 lg:border-l lg:border-t-0" aria-label="Réglages de l’outil">
          <h3 className="mb-1 text-sm font-semibold">{{ crop: 'Recadrage', rotate: 'Rotation', flip: 'Retournement', expand: 'Agrandir la toile', perspective: 'Perspective' }[tool]}</h3>
          <p className="mb-4 text-xs leading-relaxed text-gray-400">
            {{ crop: 'Choisissez un format puis ajustez les quatre poignées.', rotate: 'Rotation précise ou par quarts de tour.', flip: 'Inversez l’image horizontalement ou verticalement.', expand: 'Ajoute une toile blanche réelle autour du produit.', perspective: 'Déplacez les quatre coins. Transformation géométrique, aucun contenu inventé.' }[tool]}
          </p>
          {tool === 'crop' && <div className="grid grid-cols-2 gap-2">
            {[['Libre', null], ['1:1', 1], ['4:5', 4 / 5], ['16:9', 16 / 9]].map(([label, ratio]) => <button key={label as string} onClick={() => update({ crop: ratio ? cropForAspect((ratio as number) / (previewSize.width / previewSize.height)) : { x: 0, y: 0, width: 1, height: 1 } })} className="min-h-11 rounded-lg border border-white/10 bg-white/[0.04] text-sm hover:border-orange-400 hover:text-orange-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">{label}</button>)}
          </div>}
          {tool === 'rotate' && <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2"><button onClick={() => update({ quarterTurns: transform.quarterTurns - 1 })} className="min-h-11 rounded-lg border border-white/10 hover:border-orange-400">↶ 90°</button><button onClick={() => update({ quarterTurns: transform.quarterTurns + 1 })} className="min-h-11 rounded-lg border border-white/10 hover:border-orange-400">↷ 90°</button></div>
            <label className="block text-xs text-gray-300"><span className="mb-2 flex justify-between"><span>Rotation fine</span><span className="tabular-nums text-orange-300">{transform.fineRotation}°</span></span><input type="range" min={-15} max={15} step={0.5} value={transform.fineRotation} onChange={(event) => update({ fineRotation: Number(event.target.value) })} className="w-full accent-orange-500" /></label>
          </div>}
          {tool === 'flip' && <div className="space-y-2"><button onClick={() => update({ flipX: !transform.flipX })} className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border ${transform.flipX ? 'border-orange-400 bg-orange-500/15 text-orange-300' : 'border-white/10'}`}><FlipHorizontal2 className="h-4 w-4" /> Horizontal</button><button onClick={() => update({ flipY: !transform.flipY })} className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border ${transform.flipY ? 'border-orange-400 bg-orange-500/15 text-orange-300' : 'border-white/10'}`}><FlipVertical2 className="h-4 w-4" /> Vertical</button></div>}
          {tool === 'expand' && <div className="space-y-4"><div className="grid grid-cols-2 gap-2">{([['Aucune', 'none'], ['Carré', 'square'], ['Portrait 4:5', 'portrait'], ['Marge libre', 'custom']] as const).map(([label, mode]) => <button key={mode} onClick={() => update({ expandMode: mode })} className={`min-h-11 rounded-lg border text-sm ${transform.expandMode === mode ? 'border-orange-400 bg-orange-500/15 text-orange-300' : 'border-white/10'}`}>{label}</button>)}</div><label className="block text-xs text-gray-300"><span className="mb-2 flex justify-between"><span>Marge blanche</span><span className="tabular-nums text-orange-300">{transform.padding}%</span></span><input type="range" min={0} max={50} value={transform.padding} onChange={(event) => update({ padding: Number(event.target.value), expandMode: transform.expandMode === 'none' ? 'custom' : transform.expandMode })} className="w-full accent-orange-500" /></label></div>}
          {tool === 'perspective' && <button onClick={() => update({ perspective: clonePhotoTransform(DEFAULT_PHOTO_TRANSFORM).perspective })} className="min-h-11 w-full rounded-lg border border-white/10 text-sm hover:border-orange-400">Réinitialiser les coins</button>}
        </aside>
      </main>

      <footer className="flex min-h-16 items-center gap-3 border-t border-white/10 bg-[#0d0f12] px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        <span className={`hidden text-xs sm:block ${dirty ? 'text-orange-300' : 'text-gray-500'}`}>{dirty ? 'Modifications non enregistrées' : 'Version actuelle enregistrée'}</span>
        <button onClick={() => void close()} disabled={saving} className="ml-auto min-h-11 rounded-lg border border-white/15 px-4 text-sm font-medium text-gray-200 hover:bg-white/10 disabled:opacity-50">Annuler</button>
        <button onClick={() => void save()} disabled={saving || !dirty || rendering || !!previewError} className="min-h-11 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(234,88,12,.22)] hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 inline-flex items-center gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}<span className="sm:hidden">{saving ? 'Enregistrement…' : 'Enregistrer'}</span><span className="hidden sm:inline">{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</span>
        </button>
      </footer>
    </div>
  );
};

export default ProductPhotoEditor;
