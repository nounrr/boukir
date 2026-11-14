import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { detectBufferKind } from './uploadValidation.js';

const avatarsRoot = fileURLToPath(new URL('../uploads/avatars/', import.meta.url));
const extensions = { jpeg: '.jpg', png: '.png', webp: '.webp' };
const invalid = message => Object.assign(new Error(message), { status: 400 });

export function normalizeProfileAvatar(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw invalid('Photo de profil invalide');
  const url = value.trim();
  if (!url) return null;
  if (url.length > 255) throw invalid('L’adresse de la photo de profil est trop longue');
  if (/^\/uploads\/[a-zA-Z0-9_./-]+$/.test(url) && !url.split('/').includes('..')) return url;
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return url;
  } catch { /* A local device URI cannot be reloaded on another session/device. */ }
  throw invalid('Envoyez le fichier photo au serveur ; une adresse locale du téléphone ne peut pas être enregistrée.');
}

export function avatarForProviderLogin(current, provider) {
  try {
    const saved = normalizeProfileAvatar(current);
    if (saved) return saved;
  } catch { /* Replace an unusable legacy device URL with the provider picture. */ }
  return provider || null;
}

export async function saveProfileAvatar(file, contactId, root = avatarsRoot) {
  const kind = detectBufferKind(file?.buffer);
  if (!extensions[kind]) throw invalid('La photo doit être une image JPEG, PNG ou WebP valide.');
  if (file.buffer.length > 5 * 1024 * 1024) throw Object.assign(new Error('La photo dépasse 5 Mo.'), { status: 413 });
  await fs.mkdir(root, { recursive: true });
  const filename = `${contactId}-${randomUUID()}${extensions[kind]}`;
  const absolutePath = path.join(root, filename);
  await fs.writeFile(absolutePath, file.buffer, { flag: 'wx' });
  return { absolutePath, publicUrl: `/uploads/avatars/${filename}` };
}
