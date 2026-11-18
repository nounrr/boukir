import sharp from 'sharp';

// Category cover composed from real product photos and brand logos (no AI, nothing invented):
// each product in an identical white rounded card on a warm light background, brand logos underneath.
// Square, 1200 px: shown cropped (object-cover) as cards, thumbnails and the categories carousel.
export const COVER_SIZE = 1200;

const WHITE = { r: 255, g: 255, b: 255 };

/**
 * Border of the photo: `cutout` when it is a plain light background (product shot on white or light grey),
 * with its average `color`, used as the card background so no rectangle shows.
 */
async function photoBorder(image) {
  const { data, info } = await image.clone().resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let light = 0;
  let total = 0;
  const sum = [0, 0, 0];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (x > 2 && x < info.width - 3 && y > 2 && y < info.height - 3) continue;
      const i = (y * info.width + x) * info.channels;
      total += 1;
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      if (min > 214 && max - min < 14) light += 1; // light and neutral (white or light grey)
    }
  }
  const color = { r: Math.round(sum[0] / total), g: Math.round(sum[1] / total), b: Math.round(sum[2] / total) };
  return { cutout: light / total > 0.85, color };
}

const roundedRect = (w, h, r, fill = '#fff') =>
  Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/></svg>`);

/**
 * One product card, w × h:
 * - cut-out photo (white border): trimmed and shown whole, centered with padding, on white;
 * - photo with its own scene: fills the card (cropped on the interesting part).
 */
async function productCard(buffer, w, h, radius) {
  const flat = sharp(buffer, { failOn: 'none' }).rotate().flatten({ background: WHITE });
  let content;
  const border = await photoBorder(flat);
  if (border.cutout) {
    const { r, g, b } = border.color;
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const trimmed = await flat.clone().trim({ background: hex, threshold: 18 }).toBuffer().catch(() => flat.clone().toBuffer());
    const product = await sharp(trimmed)
      .resize(Math.round(w * 0.78), Math.round(h * 0.78), { fit: 'inside', withoutEnlargement: false })
      .toBuffer({ resolveWithObject: true });
    // Card painted in the photo's own background colour: no visible rectangle around the product.
    content = await sharp({ create: { width: w, height: h, channels: 3, background: border.color } })
      .composite([{ input: product.data, left: Math.round((w - product.info.width) / 2), top: Math.round((h - product.info.height) / 2) }])
      .png()
      .toBuffer();
  } else {
    content = await flat.clone().resize(w, h, { fit: 'cover', position: 'attention' }).png().toBuffer();
  }
  return sharp(content).ensureAlpha().composite([{ input: roundedRect(w, h, radius), blend: 'dest-in' }]).png().toBuffer();
}

/** Soft shadow under a card, as a full-cover layer. */
function cardShadow(S, x, y, w, h, radius) {
  return Buffer.from(
    `<svg width="${S}" height="${S}"><defs><filter id="s" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="14"/></filter></defs>` +
    `<rect x="${x + 6}" y="${y + 16}" width="${w - 12}" height="${h - 10}" rx="${radius}" fill="#3b2a07" fill-opacity="0.14" filter="url(#s)"/>` +
    `<rect x="${x - 1}" y="${y - 1}" width="${w + 2}" height="${h + 2}" rx="${radius + 1}" fill="none" stroke="#e8e0cf" stroke-width="2"/></svg>`
  );
}

/** Brand logo fitted in a w × h box (white background trimmed). */
async function logoImage(buffer, w, h) {
  const flat = sharp(buffer, { failOn: 'none' }).flatten({ background: WHITE });
  const trimmed = await flat.clone().trim({ background: '#ffffff', threshold: 20 }).toBuffer().catch(() => flat.clone().toBuffer());
  return sharp(trimmed).resize(w, h, { fit: 'inside', withoutEnlargement: false }).png().toBuffer({ resolveWithObject: true });
}

/**
 * Builds the cover.
 * @param {{ products: Buffer[], logos?: Buffer[] }} input  up to 4 product photos (best first) and up to 5 brand logos
 * @returns {Promise<Buffer>} JPEG, COVER_SIZE × COVER_SIZE
 */
export async function composeCategoryCover({ products, logos = [] }) {
  const S = COVER_SIZE;
  const items = products.slice(0, 4);
  if (items.length === 0) throw new Error('Aucune photo produit');

  const margin = 56;
  const gap = 28;
  const radius = 40;
  const brandList = logos.slice(0, 5);
  const barH = brandList.length ? 150 : 0;
  const top = margin;
  const left = margin;
  const width = S - margin * 2;
  const height = S - margin * 2 - barH;

  // Card frames [x, y, w, h] for 1 to 4 products.
  const half = (size) => Math.round((size - gap) / 2);
  const frames = {
    1: [[left, top, width, height]],
    2: [[left, top, half(width), height], [left + half(width) + gap, top, width - half(width) - gap, height]],
    3: [
      [left, top, half(width), height],
      [left + half(width) + gap, top, width - half(width) - gap, half(height)],
      [left + half(width) + gap, top + half(height) + gap, width - half(width) - gap, height - half(height) - gap],
    ],
    4: [
      [left, top, half(width), half(height)],
      [left + half(width) + gap, top, width - half(width) - gap, half(height)],
      [left, top + half(height) + gap, half(width), height - half(height) - gap],
      [left + half(width) + gap, top + half(height) + gap, width - half(width) - gap, height - half(height) - gap],
    ],
  }[items.length];

  const layers = [];
  for (const [index, [x, y, w, h]] of frames.entries()) {
    let card;
    try {
      card = await productCard(items[index], w, h, radius);
    } catch {
      continue;
    }
    layers.push({ input: cardShadow(S, x, y, w, h, radius), left: 0, top: 0 });
    layers.push({ input: card, left: x, top: y });
  }

  if (brandList.length) {
    const barTop = S - margin - barH + 26;
    const barInnerH = barH - 26;
    // White pill holding the brand logos.
    layers.push({ input: cardShadow(S, left, barTop, width, barInnerH, barInnerH / 2), left: 0, top: 0 });
    layers.push({ input: roundedRect(width, barInnerH, barInnerH / 2), left, top: barTop });
    const slotW = Math.round((width - 80) / brandList.length);
    const logoW = Math.min(Math.round(slotW * 0.74), 200);
    const logoH = Math.round(barInnerH * 0.58);
    for (const [i, logo] of brandList.entries()) {
      try {
        const { data, info } = await logoImage(logo, logoW, logoH);
        const slotX = left + 40 + slotW * i;
        layers.push({ input: data, left: slotX + Math.round((slotW - info.width) / 2), top: barTop + Math.round((barInnerH - info.height) / 2) });
      } catch {
        /* unreadable logo: skipped */
      }
    }
  }

  // Warm light background: sand with a soft light in the upper centre.
  const background = Buffer.from(
    `<svg width="${S}" height="${S}"><defs><radialGradient id="g" cx="50%" cy="30%" r="85%"><stop offset="0%" stop-color="#fbf8f1"/><stop offset="100%" stop-color="#efe7d6"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
  );
  return sharp(background).composite(layers).jpeg({ quality: 86, mozjpeg: true, progressive: true }).toBuffer();
}
