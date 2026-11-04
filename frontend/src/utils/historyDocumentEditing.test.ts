import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHistoryDocumentType, isHistoryDocumentLocked, historyFieldAttributes } from './historyDocumentEditing.ts';

test('all contact document aliases resolve to the original document endpoint', () => {
  for (const [input, expected] of Object.entries({
    SOR: 'Sortie', sortie: 'Sortie', sortieVendreFournisseur: 'Sortie',
    CMD: 'Commande', commande: 'Commande', CHG: 'Charge', charge: 'Charge',
    ACH: 'AvoirCharge', avoirCharge: 'AvoirCharge', COM: 'Comptant', comptant: 'Comptant',
    AVC: 'Avoir', avoir: 'Avoir', avoirClient: 'Avoir', avoirClientVendreFournisseur: 'Avoir',
    AVF: 'AvoirFournisseur', avoirFournisseur: 'AvoirFournisseur',
  })) assert.equal(resolveHistoryDocumentType(input), expected);
  assert.equal(resolveHistoryDocumentType('paiement'), null);
});

test('editing preserves existing validated/cancelled document locks', () => {
  assert.equal(isHistoryDocumentLocked('Validé'), true);
  assert.equal(isHistoryDocumentLocked('Annulé'), true);
  assert.equal(isHistoryDocumentLocked('En attente'), false);
});

test('focus is identified by source item and product/variant, never page position', () => {
  assert.deepEqual(historyFieldAttributes({ id: 87, product_id: '42', variant_id: 3 }, 'quantite'), {
    'data-history-field': 'quantite', 'data-history-item-id': '87',
    'data-history-product-id': '42', 'data-history-variant-id': '3',
  });
  assert.equal(historyFieldAttributes({ id: 88 }, 'prix_unitaire')['data-history-item-id'], '88');
});
