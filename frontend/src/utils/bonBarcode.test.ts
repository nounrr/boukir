import test from 'node:test';
import assert from 'node:assert/strict';
import { bonBarcodeValue, parseBonBarcode } from './bonBarcode.ts';

test('encode le type et l’identifiant du bon', () => {
  assert.equal(bonBarcodeValue('Sortie', 1042), 'SOR-1042');
  assert.equal(bonBarcodeValue('AvoirComptant', '7'), 'AVCC-7');
  assert.equal(bonBarcodeValue('AvoirClient', 3), 'AVC-3');
  assert.equal(bonBarcodeValue('Inconnu', 3), null);
  assert.equal(bonBarcodeValue('Sortie', 0), null);
});

test('lit le code imprimé et les numéros affichés', () => {
  assert.deepEqual(parseBonBarcode('SOR-1042'), { type: 'Sortie', id: 1042, code: 'SOR-1042' });
  assert.deepEqual(parseBonBarcode(' sor1042 '), { type: 'Sortie', id: 1042, code: 'SOR-1042' });
  assert.equal(parseBonBarcode('AVCC-12')?.type, 'AvoirComptant');
  assert.equal(parseBonBarcode('AVC12')?.type, 'Avoir');
  assert.equal(parseBonBarcode('SORF0042')?.id, 42);
  assert.equal(parseBonBarcode('#CMD-5')?.type, 'Commande');
});

test('refuse ce qui n’est pas un bon', () => {
  assert.equal(parseBonBarcode('6111234567890'), null);
  assert.equal(parseBonBarcode('XYZ-12'), null);
  assert.equal(parseBonBarcode('SOR-0'), null);
  assert.equal(parseBonBarcode(''), null);
});
