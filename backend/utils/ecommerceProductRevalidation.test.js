import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ecommerceProductRevalidationConfig, revalidateEcommerceProduct } from './ecommerceProductRevalidation.js';

test('revalidation requires an explicit frontend URL and shared secret', () => {
  assert.equal(ecommerceProductRevalidationConfig({}), null);
  assert.equal(ecommerceProductRevalidationConfig({ ECOMMERCE_FRONTEND_URL: 'https://boukirdiamond.com' }), null);
  assert.deepEqual(ecommerceProductRevalidationConfig({
    ECOMMERCE_FRONTEND_URL: 'https://boukirdiamond.com/fr',
    ECOM_REVALIDATE_SECRET: 'secret',
  }), {
    url: 'https://boukirdiamond.com/internal-seo-cache/revalidate-product',
    secret: 'secret',
  });
});

test('successful product mutation sends a scoped authenticated invalidation', async () => {
  let request;
  const result = await revalidateEcommerceProduct(6696, {
    env: { ECOMMERCE_FRONTEND_URL: 'https://boukirdiamond.com', ECOM_REVALIDATE_SECRET: 'secret' },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    },
  });
  assert.equal(result.status, 'revalidated');
  assert.equal(request.url, 'https://boukirdiamond.com/internal-seo-cache/revalidate-product');
  assert.equal(request.options.headers['x-revalidation-secret'], 'secret');
  assert.deepEqual(JSON.parse(request.options.body), { productId: 6696 });
});

test('public price reads reject zero snapshot prices before falling back to product/variant prices', () => {
  const routeDir = path.join(import.meta.dirname, '..', 'routes', 'ecommerce');
  for (const file of ['products.js', 'search.js', 'wishlist.js', 'cart.js', 'orders.js']) {
    const source = fs.readFileSync(path.join(routeDir, file), 'utf8');
    assert.doesNotMatch(source, /SELECT\s+ps\.prix_vente(?:\s+FROM)/, file);
    assert.match(source, /NULLIF\(ps\.prix_vente, 0\)/, file);
  }
});
