// Les lignes détaillées éditent directement Formik. Leur ancienne saisie brute
// peut encore valoir « 0 » : le prix visible est la source à enregistrer.
export function projetBonUnitPrice(
  item: { line_mode?: string; prix_unitaire?: number | string | null },
  rawPrice?: string,
): number {
  const source = item.line_mode === 'detail'
    ? item.prix_unitaire
    : rawPrice !== undefined && rawPrice !== '' ? rawPrice : item.prix_unitaire;
  const value = Number(String(source ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}
