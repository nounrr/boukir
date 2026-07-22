export interface NormalizedPoint { x: number; y: number }
export interface NormalizedCrop { x: number; y: number; width: number; height: number }
export type ExpandMode = 'none' | 'square' | 'portrait' | 'custom';

export interface ProductPhotoTransform {
  quarterTurns: number;
  fineRotation: number;
  flipX: boolean;
  flipY: boolean;
  crop: NormalizedCrop;
  expandMode: ExpandMode;
  padding: number;
  perspective: [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];
}

export const DEFAULT_PHOTO_TRANSFORM: ProductPhotoTransform = {
  quarterTurns: 0,
  fineRotation: 0,
  flipX: false,
  flipY: false,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  expandMode: 'none',
  padding: 0,
  perspective: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
};

export const clonePhotoTransform = (value: ProductPhotoTransform): ProductPhotoTransform =>
  JSON.parse(JSON.stringify(value));

export const cropForAspect = (aspect: number): NormalizedCrop => {
  if (!Number.isFinite(aspect) || aspect <= 0) return { x: 0, y: 0, width: 1, height: 1 };
  if (aspect >= 1) {
    const height = 1 / aspect;
    return { x: 0, y: (1 - height) / 2, width: 1, height };
  }
  const width = aspect;
  return { x: (1 - width) / 2, y: 0, width, height: 1 };
};

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
};

const loadImage = async (url: string): Promise<CanvasImageSource & { width: number; height: number }> => {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Impossible de charger cette image');
  const blob = await response.blob();
  if ('createImageBitmap' in window) {
    return createImageBitmap(blob, { imageOrientation: 'from-image' });
  }
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image illisible')); };
    image.src = objectUrl;
  });
};

const drawMappedTriangle = (
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourcePoints: [NormalizedPoint, NormalizedPoint, NormalizedPoint],
  targetPoints: [NormalizedPoint, NormalizedPoint, NormalizedPoint]
) => {
  const [s0, s1, s2] = sourcePoints;
  const [d0, d1, d2] = targetPoints;
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denominator) < 0.00001) return;
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denominator;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denominator;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denominator;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denominator;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denominator;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denominator;
  context.save();
  context.beginPath();
  context.moveTo(d0.x, d0.y);
  context.lineTo(d1.x, d1.y);
  context.lineTo(d2.x, d2.y);
  context.closePath();
  context.clip();
  context.setTransform(a, b, c, d, e, f);
  context.drawImage(source, 0, 0);
  context.restore();
};

const bilinearPoint = (
  corners: ProductPhotoTransform['perspective'], u: number, v: number, width: number, height: number
): NormalizedPoint => {
  const topX = corners[0].x * (1 - u) + corners[1].x * u;
  const topY = corners[0].y * (1 - u) + corners[1].y * u;
  const bottomX = corners[3].x * (1 - u) + corners[2].x * u;
  const bottomY = corners[3].y * (1 - u) + corners[2].y * u;
  return { x: (topX * (1 - v) + bottomX * v) * width, y: (topY * (1 - v) + bottomY * v) * height };
};

const warpPerspective = (source: HTMLCanvasElement, corners: ProductPhotoTransform['perspective']) => {
  const target = createCanvas(source.width, source.height);
  const context = target.getContext('2d');
  if (!context) throw new Error('Canvas indisponible');
  const cells = 18;
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const u0 = column / cells; const u1 = (column + 1) / cells;
      const v0 = row / cells; const v1 = (row + 1) / cells;
      const s00 = { x: u0 * source.width, y: v0 * source.height };
      const s10 = { x: u1 * source.width, y: v0 * source.height };
      const s11 = { x: u1 * source.width, y: v1 * source.height };
      const s01 = { x: u0 * source.width, y: v1 * source.height };
      const d00 = bilinearPoint(corners, u0, v0, source.width, source.height);
      const d10 = bilinearPoint(corners, u1, v0, source.width, source.height);
      const d11 = bilinearPoint(corners, u1, v1, source.width, source.height);
      const d01 = bilinearPoint(corners, u0, v1, source.width, source.height);
      drawMappedTriangle(context, source, [s00, s10, s11], [d00, d10, d11]);
      drawMappedTriangle(context, source, [s00, s11, s01], [d00, d11, d01]);
    }
  }
  return target;
};

export async function renderProductPhoto(
  imageUrl: string,
  transform: ProductPhotoTransform,
  options: { maxDimension?: number; applyCrop?: boolean; applyExpansion?: boolean } = {}
) {
  const source = await loadImage(imageUrl);
  const maxDimension = options.maxDimension || 2400;
  const sourceScale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * sourceScale));
  const height = Math.max(1, Math.round(source.height * sourceScale));
  const angle = (transform.quarterTurns * 90 + transform.fineRotation) * Math.PI / 180;
  const rotatedWidth = Math.ceil(Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle)));
  const rotatedHeight = Math.ceil(Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle)));
  const rotated = createCanvas(rotatedWidth, rotatedHeight);
  const rotatedContext = rotated.getContext('2d');
  if (!rotatedContext) throw new Error('Canvas indisponible');
  rotatedContext.translate(rotated.width / 2, rotated.height / 2);
  rotatedContext.rotate(angle);
  rotatedContext.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
  rotatedContext.drawImage(source, -width / 2, -height / 2, width, height);
  if ('close' in source && typeof source.close === 'function') source.close();

  const warped = warpPerspective(rotated, transform.perspective);
  if (options.applyCrop === false) return warped;
  const crop = transform.crop;
  const sx = Math.round(crop.x * warped.width);
  const sy = Math.round(crop.y * warped.height);
  const sw = Math.max(1, Math.round(crop.width * warped.width));
  const sh = Math.max(1, Math.round(crop.height * warped.height));
  const cropped = createCanvas(sw, sh);
  cropped.getContext('2d')?.drawImage(warped, sx, sy, sw, sh, 0, 0, sw, sh);
  if (options.applyExpansion === false || transform.expandMode === 'none') return cropped;

  const padding = Math.round(Math.max(sw, sh) * Math.max(0, transform.padding) / 100);
  let targetWidth = sw + padding * 2;
  let targetHeight = sh + padding * 2;
  if (transform.expandMode === 'square') {
    targetWidth = targetHeight = Math.max(targetWidth, targetHeight);
  } else if (transform.expandMode === 'portrait') {
    targetWidth = Math.max(targetWidth, Math.ceil(targetHeight * 4 / 5));
    targetHeight = Math.max(targetHeight, Math.ceil(targetWidth * 5 / 4));
  }
  const expanded = createCanvas(targetWidth, targetHeight);
  const expandedContext = expanded.getContext('2d');
  if (!expandedContext) throw new Error('Canvas indisponible');
  expandedContext.fillStyle = '#ffffff';
  expandedContext.fillRect(0, 0, targetWidth, targetHeight);
  expandedContext.drawImage(cropped, Math.round((targetWidth - sw) / 2), Math.round((targetHeight - sh) / 2));
  return expanded;
}

export const canvasToJpeg = (canvas: HTMLCanvasElement, quality = 0.92) =>
  new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Export JPEG impossible')), 'image/jpeg', quality);
    } catch {
      reject(new Error('Export bloqué par la sécurité du navigateur (canvas non autorisé)'));
    }
  });

