export function buildHistoryInlineUpdate(bon: any, sourceItems: any[], field: 'quantite' | 'prix_unitaire', value: number, userId: number) {
  if (!Number.isFinite(value) || value < 0 || (field === 'quantite' && value === 0)) throw new Error('Saisissez une valeur valide. La quantité doit être supérieure à zéro.');
  const items: any[] = typeof bon.items === 'string' ? JSON.parse(bon.items) : bon.items;
  const ids = new Set(sourceItems.map(item => Number(item.id)));
  if (!ids.size || sourceItems.some(item => !Number.isSafeInteger(Number(item.id)) || Number(item.id) <= 0)) throw new Error('Ligne invalide. Actualisez la fiche.');
  const selected = items.filter(item => ids.has(Number(item.id)));
  if (selected.length !== ids.size || selected.some(item => {
    const displayed = sourceItems.find(source => Number(source.id) === Number(item.id));
    return Number(item.quantite) !== Number(displayed.quantite) || Number(item.prix_unitaire) !== Number(displayed.prix_unitaire);
  })) throw new Error('Cette ligne a changé depuis son affichage. Actualisez la fiche avant de réessayer.');
  const quantity = selected.reduce((sum, item) => sum + Number(item.quantite), 0);
  if (field === 'quantite' && (!Number.isFinite(quantity) || quantity <= 0)) throw new Error('La quantité des lots d’origine est invalide.');
  let remaining = value;
  let selectedIndex = 0;
  let difference = 0;
  const updated = items.map(item => {
    if (!ids.has(Number(item.id))) return item;
    const next = { ...item };
    if (field === 'quantite') {
      // Keep FIFO lots separate. Allocate the visible group's quantity in its
      // original proportions; the final lot absorbs rounding to six decimals.
      next.quantite = selectedIndex === selected.length - 1 ? Number(remaining.toFixed(6))
        : Number((value * Number(item.quantite) / quantity).toFixed(6));
      remaining -= next.quantite;
      if (next.quantite <= 0) throw new Error('Quantité trop petite pour les lots de cette ligne.');
      selectedIndex++;
    } else {
      next.prix_unitaire = value;
      if (bon.type === 'Commande') next.prix_achat = value;
    }
    next.total = Number((Number(next.quantite) * Number(next.prix_unitaire)).toFixed(6));
    difference += next.total - Number(item.total ?? Number(item.quantite) * Number(item.prix_unitaire));
    return next;
  });
  const date = new Date(bon.date_creation);
  if (Number.isNaN(date.getTime())) throw new Error('Date du bon invalide.');
  const pad = (n: number) => String(n).padStart(2, '0');
  return { ...bon, items: updated,
    date_creation: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    montant_total: Number((Number(bon.montant_total) + difference).toFixed(3)),
    isNotCalculated: bon.isNotCalculated === true || Number(bon.isNotCalculated) === 1 ? true : null,
    updated_by: userId,
  };
}
