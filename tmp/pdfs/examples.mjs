import { writeFileSync } from 'node:fs';
import { buildProjetTablePrintHtml } from '../../frontend/src/utils/projetTablePrint.ts';
const columns = (labels, numeric = []) => labels.map((label, i) => ({ label, numeric: numeric.includes(i) }));
const money = n => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DH';
const reports = [
  { title: 'Devis du projet', tables: [{
    columns: columns(['#', 'Désignation', 'Unité', 'Quantité', 'Prix unitaire', 'Total'], [3, 4, 5]),
    rows: [[1, 'Ciment blanc AALBORG', 'kg', 150, money(4), money(600)], [2, 'Colle carrelage Kerakoll', 'sac', 20, money(120), money(2400)], [3, 'Pose du carrelage', 'm²', 100, money(70), money(7000)]],
    totals: [['Total du devis', '', '', '', '', money(10000)]],
  }] },
  { title: 'Avances reçues', notes: ['2 avance(s)'], tables: [{
    columns: columns(['Date', 'Mode', 'Description', 'Montant'], [3]),
    rows: [['20/10/2026', 'Virement', 'Avance au démarrage des travaux', money(5000)], ['24/10/2026', 'Espèces', 'Deuxième avance', money(2000)]],
    totals: [['Total des avances', '', '', money(7000)]],
  }] },
  { title: 'Bons produits', landscape: true, notes: ['1 bon(s) · Total : ' + money(3000)], tables: [{
    title: 'BP-0001 · 22/10/2026 - Livraison chantier',
    columns: columns(['Désignation', 'Unité', 'Qté', 'PA', 'CR', 'PV', 'PV2', 'P.U. bon', 'Total'], [2,3,4,5,6,7,8]),
    rows: [['Ciment blanc AALBORG', 'kg', 150, money(2.57), money(2.8), money(4), money(3.8), money(4), money(600)], ['Colle carrelage Kerakoll', 'sac', 20, money(85), money(90), money(120), money(115), money(120), money(2400)]],
    totals: [['Total du bon', '', '', '', '', '', '', '', money(3000)]],
  }] },
  { title: 'Situation complète', landscape: true, notes: ['5 ligne(s) · Vue par bon', 'Les soldes cumulés conservent l’historique avant les filtres.'], tables: [{
    columns: columns(['Date', 'Type', 'Référence', 'Libellé', 'Mode', 'Entrée', 'Sortie', 'Solde cumulé'], [5,6,7]),
    rows: [['20/10/2026', 'Avance', 'AV-0001', 'Avance au démarrage', 'Virement', money(5000), '', money(5000)], ['22/10/2026', 'Produits', 'BP-0001', 'Livraison chantier', '-', '', money(3000), money(2000)], ['23/10/2026', 'Charge matériel', 'BCM-0001', 'Location bétonnière', '-', '', money(500), money(1500)], ['24/10/2026', 'Avance', 'AV-0002', 'Deuxième avance', 'Espèces', money(2000), '', money(3500)], ['25/10/2026', 'Chef d’œuvre', 'BCO-0001', 'Main-d’œuvre', '-', '', money(1500), money(2000)]],
    totals: [['Totaux du projet / Solde final', '', '', '', '', money(7000), money(5000), money(2000)]],
  }] },
  { title: 'Statistiques du projet', landscape: true, tables: [{ title: 'Synthèse', columns: columns(['Indicateur', 'Valeur'], [1]), rows: [
    ['Montant du devis', money(10000)], ['Avances reçues', money(7000)], ['Bons produits', money(3000)], ['Charges produit', money(0)], ['Charges matériel', money(500)], ['Chef d’œuvre', money(1500)], ['Total dépensé', money(5000)], ['Solde (avances − dépenses)', money(2000)], ['Reste à encaisser (devis − avances)', money(3000)], ['Résultat prévisionnel (devis − dépenses)', money(5000)], ['Encaissement', '70%'], ['Consommation du devis', '50%'],
  ] }, { title: 'Avances par mode de paiement · 2 avance(s)', columns: columns(['Mode', 'Montant'], [1]), rows: [['Virement', money(5000)], ['Espèces', money(2000)]], totals: [['Total des avances', money(7000)]] }, { title: 'Évolution mensuelle', columns: columns(['Mois', 'Avances', 'Bons produits', 'Charges produit', 'Charges matériel', 'Chef d’œuvre'], [1,2,3,4,5]), rows: [['Octobre 2026', money(7000), money(3000), money(0), money(500), money(1500)]] }] },
];
for (const [i, report] of reports.entries()) {
  writeFileSync(new URL(`example-${i + 1}.html`, import.meta.url), buildProjetTablePrintHtml({ ...report, projectName: 'Villa Al Amal - Client : Ahmed Benali (exemple fictif)' }, new Date('2026-10-26T10:00:00+01:00')));
}
