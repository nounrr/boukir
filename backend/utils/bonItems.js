export async function validateBonItems(connection, rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : [];

  for (const item of items) {
    if (!item?.product_id || item?.quantite == null || item?.prix_unitaire == null || item?.total == null) {
      return { message: 'Item invalide: champs requis manquants' };
    }
  }

  const productIds = [...new Set(
    items
      .map((item) => Number(item?.product_id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
  if (!productIds.length) return null;

  const [products] = await connection.query(
    'SELECT id, has_variants, is_obligatoire_variant FROM products WHERE id IN (?)',
    [productIds]
  );
  const productsById = new Map(products.map((product) => [Number(product.id), product]));

  for (const item of items) {
    const productId = Number(item.product_id);
    const product = productsById.get(productId);
    if (!product) return { message: `Produit introuvable (id=${item.product_id})` };
    const requiresVariant = Number(product.has_variants) === 1 && Number(product.is_obligatoire_variant) === 1;
    if (requiresVariant && !item.variant_id) {
      return { message: `Variante obligatoire pour le produit (id=${item.product_id})` };
    }
  }

  return null;
}

export async function insertBonLivraisons(connection, bonType, bonId, livraisons) {
  const values = (Array.isArray(livraisons) ? livraisons : [])
    .map((livraison) => {
      const vehiculeId = Number(livraison?.vehicule_id);
      const userId = livraison?.user_id != null && livraison.user_id !== ''
        ? Number(livraison.user_id)
        : null;
      return Number.isInteger(vehiculeId) && vehiculeId > 0
        ? [String(bonType), Number(bonId), vehiculeId, Number.isInteger(userId) && userId > 0 ? userId : null]
        : null;
    })
    .filter(Boolean);

  if (!values.length) return;
  await connection.query(
    'INSERT INTO livraisons (bon_type, bon_id, vehicule_id, user_id) VALUES ?',
    [values]
  );
}
