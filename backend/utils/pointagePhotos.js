import { imageSize } from 'image-size';

export const MAX_POINTAGE_PHOTO_BYTES = 2 * 1024 * 1024;

// Accept only bounded JPEG/PNG snapshots, never image URLs or biometric templates.
export function decodePointagePhoto(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.length > Math.ceil(MAX_POINTAGE_PHOTO_BYTES / 3) * 4 + 100) return null;
  const raw = value.replace(/^data:image\/(?:jpeg|jpg|png);base64,/i, '').replace(/\s/g, '');
  if (!raw || raw.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) return null;
  const image = Buffer.from(raw, 'base64');
  if (!image.length || image.length > MAX_POINTAGE_PHOTO_BYTES) return null;
  try {
    const dimensions = imageSize(image);
    if (!['jpg', 'png'].includes(dimensions.type) || !dimensions.width || !dimensions.height
        || dimensions.width > 4096 || dimensions.height > 4096) return null;
    return { image, mime: dimensions.type === 'jpg' ? 'image/jpeg' : 'image/png' };
  } catch { return null; }
}

export async function ensurePointagePhotoSchema(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS pointage_event_photos (
    event_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    mime VARCHAR(32) NOT NULL, image MEDIUMBLOB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

export async function savePointagePhoto(db, eventKey, photo) {
  if (!photo) return;
  await db.query(`INSERT INTO pointage_event_photos (event_id, mime, image)
    SELECT id, ?, ? FROM pointage_events WHERE event_key = ?
    ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)`, [photo.mime, photo.image, eventKey]);
}
