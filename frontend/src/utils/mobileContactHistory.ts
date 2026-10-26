export type ContactHistoryKind = 'client' | 'supplier' | 'charge';
export type HistoryFilters = { from: string; to: string; search: string; operation: string };

export const historyOperation = (row: any): string => row.docKind || String(row.id ?? '').split('-')[0] || row.type;
export const historyDocumentKey = (row: any): string => String(row.id ?? '').split('-item-')[0] || `${row.bon_numero}|${row.bon_date_iso}`;
export const historyOperationLabels: Record<string, string> = {
  sortie: 'Sorties', commande: 'Commandes', charge: 'Charges', comptant: 'Comptants',
  paiement: 'Paiements', avoir: 'Avoirs client', avoirClient: 'Avoirs',
  avoirFournisseur: 'Avoirs fournisseur', sortieVendreFournisseur: 'Vendre au fournisseur',
  avoirClientVendreFournisseur: 'Avoirs vendre fournisseur',
};
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filterContactHistory(rows: any[], filters: HistoryFilters): any[] {
  const words = normalize(filters.search).trim().split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    const date = String(row.bon_date_iso || row.bon_date || '').slice(0, 10);
    if (filters.from && (!date || date < filters.from)) return false;
    if (filters.to && (!date || date > filters.to)) return false;
    if (filters.operation && historyOperation(row) !== filters.operation) return false;
    if (words.length === 0) return true;
    const text = normalize([row.product_designation, row.product_reference, row.variant_name,
      row.bon_numero, row.code_reglement, row.adresse_livraison].join(' '));
    return words.every(word => text.includes(word));
  });
}

export function contactHistorySign(row: any, kind: ContactHistoryKind): number {
  if (kind === 'supplier' && (Number(row.balanceSign) === 1 || Number(row.balanceSign) === -1)) return Number(row.balanceSign);
  const sale = row.type === 'produit';
  return kind === 'client' ? (sale ? -1 : 1) : (sale ? 1 : -1);
}

export function selectedContactHistory(rows: any[], selected: Set<string> | null, kind: ContactHistoryKind): any[] {
  if (selected === null) return rows;
  let balance = 0;
  return rows.filter(row => selected.has(String(row.id))).map(row => {
    balance += contactHistorySign(row, kind) * (Number(row.total) || 0);
    return { ...row, soldeCumulatif: balance };
  });
}

export function contactHistoryTotals(rows: any[], kind: ContactHistoryKind) {
  let totalQty = 0, totalAmount = 0, totalDebit = 0, totalCredit = 0;
  for (const row of rows) {
    const amount = Number(row.total) || 0;
    const sign = contactHistorySign(row, kind);
    if (row.type === 'produit' && Number(row.quantite) > 0) totalQty += Number(row.quantite) * (kind === 'supplier' ? sign : 1);
    if (kind === 'supplier' ? row.type !== 'paiement' : row.type === 'produit') totalAmount += amount * (kind === 'supplier' ? sign : 1);
    const debit = kind === 'charge' ? sign > 0 : sign < 0;
    if (debit) totalDebit += amount;
    else totalCredit += amount;
  }
  return { totalQty, totalAmount, totalDebit, totalCredit, finalSolde: Number(rows[rows.length - 1]?.soldeCumulatif ?? 0) };
}

export function contactHistoryTransactions(rows: any[]): any[] {
  const grouped = new Map<string, any>();
  for (const row of rows) {
    const key = historyDocumentKey(row);
    const previous = grouped.get(key);
    if (previous) {
      previous.montant += Number(row.total) || 0;
      previous.soldeCumulatif = row.soldeCumulatif;
    } else {
      grouped.set(key, { id: key, numero: row.bon_numero, dateISO: row.bon_date_iso || row.bon_date,
        type: row.type === 'paiement' ? 'Paiement' : (historyOperationLabels[historyOperation(row)] || row.type),
        statut: row.bon_statut, montant: Number(row.total) || 0, soldeCumulatif: row.soldeCumulatif, balanceSign: row.balanceSign });
    }
  }
  return [...grouped.values()];
}
