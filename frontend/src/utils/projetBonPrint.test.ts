import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareProjetBonPrint } from './projetBonPrint.ts';
import type { ProjetBon } from '../store/api/projetsApi';

test('project PDFs preserve references, saved prices, units and free-text lines for every type', () => {
  for (const [type, prefix, title] of [['products', 'BP', 'BON PRODUITS'], ['charge', 'BC', 'BON CHARGE PRODUIT'], ['charge_materiel', 'BCM', 'BON CHARGE MATÉRIEL'], ['chef_oeuvre', 'BCO', 'BON CHEF D’ŒUVRE']] as const) {
    const source: ProjetBon = { id: 42, type, date_bon: '2026-10-17', observations: 'Chantier étage 2', montant_total: 125.5, items: [{ product_id: null, variant_id: null, unit_id: null, designation: 'Location matériel', unite: 'jour', quantite: 2, prix_unitaire: 62.75, total: 125.5 }] };
    const result = prepareProjetBonPrint(source, 'Villa Tanger');
    assert.equal(result.projectContext.reference, `${prefix}-0042`);
    assert.equal(result.projectContext.title, title);
    assert.equal(result.projectContext.projectName, 'Villa Tanger');
    assert.equal(result.bon.type, type === 'products' ? 'Sortie' : 'Charge');
    assert.equal(result.bon.date_creation, '2026-10-17T00:00:00');
    assert.equal(result.bon.notes, source.observations);
    assert.deepEqual(result.bon.items, source.items);
    assert.notEqual(result.bon.items[0], source.items[0]);
    assert.equal(source.type, type);
  }
});
