import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWebPrices } from './webSalePriceResearch.js';

test('groups only cited MAD prices and keeps INGCO separate', () => {
  const urls = ['https://shop-a.ma/p/1', 'https://shop-b.ma/p/1', 'https://ingco.ma/p/1'];
  const result = summarizeWebPrices({ offers: [
    { price: 149.99, currency: 'MAD', url: urls[0] },
    { price: 149.99, currency: 'MAD', url: urls[1] },
    { price: 120, currency: 'MAD', url: urls[2] },
    { price: 2, currency: 'USD', url: urls[0] },
    { price: 100, currency: 'MAD', url: 'https://invented.ma/p/1' },
  ] }, urls);
  assert.equal(result.market[0].price, 149.99);
  assert.equal(result.market[0].count, 2);
  assert.equal(result.ingco[0].price, 120);
  assert.equal(result.offersCount, 3);
});
