import test from 'node:test';
import assert from 'node:assert/strict';
import { canReuseWebPriceResearch, parseWebResearchUsage, summarizeWebPrices, summarizeWebResearchUsage } from './webSalePriceResearch.js';

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

test('reuses only recent successful research from the same model', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  const saved = { model: 'gpt-5-mini', error_text: null, searched_at: '2026-09-29T11:00:00Z' };
  assert.equal(canReuseWebPriceResearch(saved, 'gpt-5-mini', now), true);
  assert.equal(canReuseWebPriceResearch(saved, 'gpt-5', now), false);
  assert.equal(canReuseWebPriceResearch({ ...saved, error_text: 'quota' }, 'gpt-5-mini', now), false);
  assert.equal(canReuseWebPriceResearch({ ...saved, searched_at: '2026-09-28T11:00:00Z' }, 'gpt-5-mini', now), false);
});

test('estimates billed tokens and actual web search calls separately', () => {
  const usage = summarizeWebResearchUsage({
    usage: { input_tokens: 10000, output_tokens: 1000, input_tokens_details: { cached_tokens: 2000 } },
    output: [{ type: 'web_search_call' }, { type: 'web_search_call' }, { type: 'message' }],
  }, 'gpt-5-mini');
  assert.deepEqual(usage, {
    input_tokens: 10000,
    output_tokens: 1000,
    web_search_calls: 2,
    estimated_cost_usd: 0.0241,
  });
});

test('reads saved research costs and ignores missing or invalid historical costs', () => {
  const usage = { input_tokens: 100, output_tokens: 20, web_search_calls: 1, estimated_cost_usd: 0.0101 };
  assert.deepEqual(parseWebResearchUsage(JSON.stringify(usage)), usage);
  assert.deepEqual(parseWebResearchUsage(usage), usage);
  assert.equal(parseWebResearchUsage(null), undefined);
  assert.equal(parseWebResearchUsage('{invalid'), undefined);
});
