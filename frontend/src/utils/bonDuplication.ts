// Preserve the stock identity when converting a sale line to a purchase line.
export function toCommandeDuplicateItem(item: Record<string, any>, purchaseUnit: number) {
  const quantite = Number(item.quantite ?? item.qty ?? 0) || 0;
  const prix_unitaire = Number(purchaseUnit) || 0;
  return {
    product_id: item.product_id || item.produit_id || item.id,
    variant_id: item.variant_id ?? null,
    unit_id: item.unit_id ?? null,
    quantite,
    prix_unitaire,
    remise_pourcentage: 0,
    remise_montant: 0,
    total: prix_unitaire * quantite,
  };
}
