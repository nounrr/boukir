import type { ProjetBonItem, ProjetSituationRow } from '../store/api/projetsApi';
import type { Contact } from '../types';

type SituationPrintRow = ProjetSituationRow & { key: string; item?: ProjetBonItem };

const labels: Record<ProjetSituationRow['kind'], string> = {
  avance: 'Avance', products: 'Bon produits', charge: 'Charge produit',
  charge_materiel: 'Charge matériel', chef_oeuvre: 'Chef d’œuvre',
};
const modes: Record<string, string> = { Espece: 'Espèce', Virement: 'Virement', Cheque: 'Chèque' };

/** Adapt the visible project history to the existing client statement, without recalculating historical balances. */
export function prepareProjetSituationPrint(projectName: string, rows: SituationPrintRow[]) {
  const contact: Contact = {
    id: 0, nom_complet: projectName, type: 'Client', solde: 0, created_at: '', updated_at: '',
  };
  const productHistory = rows.map(row => {
    const payment = row.kind === 'avance';
    const item = row.item;
    const description = [
      item?.designation || row.libelle || labels[row.kind],
      item?.unite,
      item && row.libelle !== labels[row.kind] ? row.libelle : '',
      payment && row.mode_paiement ? modes[row.mode_paiement] : '',
    ].filter(Boolean).join(' · ');
    return {
      id: `${row.kind}-${row.id}-item-${row.key}`,
      docKind: labels[row.kind],
      type: payment ? 'paiement' : 'produit',
      bon_numero: row.reference,
      bon_date_iso: row.date,
      product_id: item?.product_id,
      product_snapshot_id: item?.product_snapshot_id,
      product_designation: description,
      quantite: item?.quantite ?? 0,
      prix_unitaire: item?.prix_unitaire ?? 0,
      total: payment ? row.entree : row.sortie,
      balanceSign: payment ? -1 : 1,
      // Client printing displays the opposite of its internal balance.
      soldeCumulatif: -row.solde,
    };
  });
  return {
    projectName,
    contact,
    productHistory,
    totalQty: rows.reduce((sum, row) => sum + (row.item?.quantite ?? 0), 0),
    totalAmount: rows.reduce((sum, row) => sum + row.sortie, 0),
    totalDebit: rows.reduce((sum, row) => sum + row.sortie, 0),
    totalCredit: rows.reduce((sum, row) => sum + row.entree, 0),
    finalSolde: -(rows.at(-1)?.solde ?? 0),
    totalDebitSubtitle: '(Dépenses du projet)',
  };
}
