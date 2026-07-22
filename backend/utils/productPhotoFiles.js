import fs from 'fs';

const URL_REFERENCE_QUERIES = [
  'SELECT COUNT(*) AS count FROM product_photo_images WHERE image_url = ?',
  'SELECT COUNT(*) AS count FROM manual_product_photos WHERE image_url = ?',
  'SELECT COUNT(*) AS count FROM product_images WHERE image_url = ?',
  'SELECT COUNT(*) AS count FROM variant_images WHERE image_url = ?',
  'SELECT COUNT(*) AS count FROM products WHERE image_url = ?',
  'SELECT COUNT(*) AS count FROM product_variants WHERE image_url = ?',
];

export async function countProductPhotoUrlReferences(conn, imageUrl) {
  let references = 0;
  for (const sql of URL_REFERENCE_QUERIES) {
    const [rows] = await conn.query(sql, [imageUrl]);
    references += Number(rows?.[0]?.count || 0);
  }
  return references;
}

export async function deleteProductPhotoFileIfUnreferenced({ conn, imageUrl, resolvePath }) {
  if (!imageUrl || (await countProductPhotoUrlReferences(conn, imageUrl)) > 0) return false;
  const filePath = resolvePath(imageUrl);
  if (!filePath || !fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export async function syncAttachedPhotoUrl(conn, shoot, oldUrl, newUrl) {
  if (shoot.variant_id) {
    await conn.query(
      'UPDATE variant_images SET image_url = ? WHERE variant_id = ? AND image_url = ?',
      [newUrl, shoot.variant_id, oldUrl]
    );
    await conn.query(
      'UPDATE product_variants SET image_url = ? WHERE id = ? AND image_url = ?',
      [newUrl, shoot.variant_id, oldUrl]
    );
    return;
  }

  await conn.query(
    'UPDATE product_images SET image_url = ? WHERE product_id = ? AND image_url = ?',
    [newUrl, shoot.product_id, oldUrl]
  );
  await conn.query(
    'UPDATE products SET image_url = ? WHERE id = ? AND image_url = ?',
    [newUrl, shoot.product_id, oldUrl]
  );
}

