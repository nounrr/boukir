import { stat } from 'node:fs/promises';
import { imageSizeFromFile } from 'image-size/fromFile';

const cache = new Map();
const MAX_CACHE_ENTRIES = 10000;

export function resolutionOptions(query = {}) {
  const mode = ['below', 'above', 'unknown'].includes(query.resolution) ? query.resolution : 'all';
  const value = Number(query.resolution_px);
  const threshold = Number.isInteger(value) && value >= 1 && value <= 20000 ? value : 800;
  return { mode, threshold };
}

export function matchesResolution(dimensions, { mode, threshold }) {
  if (mode === 'all') return true;
  if (mode === 'unknown') return dimensions == null;
  if (!dimensions) return false;
  const longestSide = Math.max(dimensions.width, dimensions.height);
  return mode === 'below' ? longestSide < threshold : longestSide >= threshold;
}

export async function readImageResolution(filePath) {
  if (!filePath) return null;
  try {
    const file = await stat(filePath);
    const signature = `${file.mtimeMs}:${file.ctimeMs}:${file.size}`;
    const cached = cache.get(filePath);
    if (cached?.signature === signature) return cached.result;
    const result = imageSizeFromFile(filePath).then(({ width, height }) => (
      width > 0 && height > 0 ? { width, height } : null
    )).catch(() => null);
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(filePath, { signature, result });
    return await result;
  } catch { return null; }
}

// Read headers in bounded batches; never download every photo to filter the catalog.
export async function filterImagesByResolution(images, options, readDimensions) {
  if (options.mode === 'all') return images;
  const result = [];
  for (let start = 0; start < images.length; start += 16) {
    const batch = await Promise.all(images.slice(start, start + 16).map(async image => ({
      ...image, dimensions: await readDimensions(image.url),
    })));
    result.push(...batch.filter(image => matchesResolution(image.dimensions, options)));
  }
  return result;
}
