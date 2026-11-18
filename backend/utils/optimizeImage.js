import fs from 'fs/promises';
import sharp from 'sharp';

// Largest side kept for catalogue photos: enough for a zoomed product page on a large screen.
export const MAX_IMAGE_SIDE = 1600;
// Files smaller than this are left alone (already light).
const MIN_BYTES = 120 * 1024;

/**
 * Compresses an image file in place, keeping its name and its format (so every URL already
 * stored in the database stays valid):
 * - longest side reduced to MAX_IMAGE_SIDE (never enlarged), EXIF orientation applied;
 * - JPEG: mozjpeg quality 80, progressive; PNG: palette quantisation (quality 80), keeps transparency;
 *   WebP: quality 80.
 * The file is replaced only when the result is smaller. Never throws: an image that cannot be
 * processed is kept as it is.
 *
 * @returns {Promise<{ before: number, after: number, changed: boolean }>}
 */
export async function optimizeImageFile(filePath, { dryRun = false } = {}) {
  let before = 0;
  try {
    const input = await fs.readFile(filePath);
    before = input.length;
    if (before < MIN_BYTES) return { before, after: before, changed: false };

    const image = sharp(input, { failOn: 'none' });
    const meta = await image.metadata();
    const format = meta.format;
    if (!['jpeg', 'png', 'webp'].includes(format)) return { before, after: before, changed: false };

    let pipeline = sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true });

    if (format === 'jpeg') pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true, progressive: true });
    else if (format === 'png') pipeline = pipeline.png({ palette: true, quality: 80, effort: 8, compressionLevel: 9 });
    else pipeline = pipeline.webp({ quality: 80, effort: 5 });

    const output = await pipeline.toBuffer();
    if (output.length >= before * 0.95) return { before, after: before, changed: false };
    if (!dryRun) {
      // Write next to it then rename: a reader never sees a half-written file.
      const temp = `${filePath}.optimizing`;
      await fs.writeFile(temp, output);
      await fs.rename(temp, filePath);
    }
    return { before, after: output.length, changed: true };
  } catch (error) {
    console.warn('[optimizeImage] skipped', filePath, error?.message || error);
    return { before, after: before, changed: false };
  }
}

/** Compresses every uploaded file of a multer request (single file, array or fields object). */
export async function optimizeUploadedFiles(files) {
  const list = Array.isArray(files) ? files : Object.values(files || {}).flat();
  await Promise.all(list.filter((file) => file?.path).map((file) => optimizeImageFile(file.path)));
}
