import axios from 'axios';
import pool from '../db/pool.js';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const SAMPLE_LIMIT = Number(process.env.SAMPLE_LIMIT || 30);
const DETAIL_SAMPLE = Number(process.env.DETAIL_SAMPLE || 5);

function nearlyEqual(a, b, eps = 1e-6) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) <= eps;
}

function normalizeBool(v) {
  return v === true || v === 1 || v === '1';
}

async function requireSnapshotTable() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'product_snapshot'`
  );
  if (Number(rows?.[0]?.cnt || 0) <= 0) {
    throw new Error('product_snapshot table not found in current database');
  }
}

async function assertApiUp() {
  try {
    const r = await axios.get(`${BASE_URL}/api/health`, { timeout: 5000 });
    if (!r?.data?.ok) throw new Error('healthcheck did not return ok');
  } catch (e) {
    const msg = e?.message || String(e);
    throw new Error(
      `Backend not reachable on ${BASE_URL}. ` +
        `Start it with: npm run server. Details: ${msg}`
    );
  }
}

async function fetchProductsList() {
  const r = await axios.get(`${BASE_URL}/api/ecommerce/products`, {
    params: {
      page: 1,
      limit: SAMPLE_LIMIT,
      in_stock_only: 'false',
      sort: 'newest',
    },
    timeout: 20000,
  });

  const data = r.data;
  const products = Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : null;
  if (!products) {
    throw new Error(
      'Unexpected /api/ecommerce/products response shape. ' +
        'Expected { products: [...] }.'
    );
  }
  return products;
}

async function fetchProductDetail(productId) {
  const r = await axios.get(`${BASE_URL}/api/ecommerce/products/${productId}`, {
    timeout: 20000,
  });
  return r.data;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getExpectedProducts(productIds) {
  if (productIds.length === 0) return new Map();

  const map = new Map();
  // Chunk to avoid max placeholders issues
  for (const ids of chunk(productIds, 200)) {
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT
        p.id,
        COALESCE((
          SELECT ps.prix_vente
          FROM product_snapshot ps
          WHERE ps.product_id = p.id AND ps.variant_id IS NULL
          ORDER BY ps.created_at DESC, ps.id DESC
          LIMIT 1
        ), p.prix_vente) AS expected_prix_vente,
        (
          SELECT COALESCE(SUM(ps.quantite), 0)
          FROM product_snapshot ps
          WHERE ps.product_id = p.id
        ) AS expected_stock_qty
      FROM products p
      WHERE p.id IN (${placeholders})`,
      ids
    );

    for (const r of rows) {
      map.set(Number(r.id), {
        expectedPrixVente: Number(r.expected_prix_vente),
        expectedStockQty: Number(r.expected_stock_qty),
      });
    }
  }

  return map;
}

async function getExpectedVariants(variantIds) {
  if (variantIds.length === 0) return new Map();

  const map = new Map();
  for (const ids of chunk(variantIds, 200)) {
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT
        pv.id,
        COALESCE((
          SELECT ps.prix_vente
          FROM product_snapshot ps
          WHERE ps.variant_id = pv.id
          ORDER BY ps.created_at DESC, ps.id DESC
          LIMIT 1
        ), pv.prix_vente) AS expected_prix_vente,
        COALESCE((
          SELECT COALESCE(SUM(ps.quantite), 0)
          FROM product_snapshot ps
          WHERE ps.variant_id = pv.id
        ), pv.stock_quantity) AS expected_stock_qty
      FROM product_variants pv
      WHERE pv.id IN (${placeholders})`,
      ids
    );

    for (const r of rows) {
      map.set(Number(r.id), {
        expectedPrixVente: Number(r.expected_prix_vente),
        expectedStockQty: Number(r.expected_stock_qty),
      });
    }
  }

  return map;
}

function collectVariantIdsFromListProducts(products) {
  const ids = [];
  for (const p of products) {
    const variants = p?.variants?.all;
    if (Array.isArray(variants)) {
      for (const v of variants) {
        if (v?.id != null) ids.push(Number(v.id));
      }
    }
  }
  return [...new Set(ids)];
}

function collectVariantIdsFromDetail(detail) {
  const variants = Array.isArray(detail?.variants) ? detail.variants : [];
  const ids = variants.map(v => Number(v.id)).filter(n => Number.isFinite(n));
  return [...new Set(ids)];
}

function validateListProducts(products, expectedProducts, expectedVariants) {
  const mismatches = [];

  for (const p of products) {
    const pid = Number(p.id);
    const exp = expectedProducts.get(pid);
    if (!exp) {
      mismatches.push({
        kind: 'product',
        id: pid,
        field: 'expected_row',
        expected: 'present',
        got: 'missing',
      });
      continue;
    }

    if (!nearlyEqual(p.prix_vente, exp.expectedPrixVente, 1e-4)) {
      mismatches.push({
        kind: 'product',
        id: pid,
        field: 'prix_vente',
        expected: exp.expectedPrixVente,
        got: p.prix_vente,
      });
    }

    const expectedInStock = exp.expectedStockQty > 0;
    if (normalizeBool(p.in_stock) !== expectedInStock) {
      mismatches.push({
        kind: 'product',
        id: pid,
        field: 'in_stock',
        expected: expectedInStock,
        got: p.in_stock,
      });
    }

    const variants = p?.variants?.all;
    if (Array.isArray(variants)) {
      for (const v of variants) {
        const vid = Number(v.id);
        const expV = expectedVariants.get(vid);
        if (!expV) continue;

        if (!nearlyEqual(v.prix_vente, expV.expectedPrixVente, 1e-4)) {
          mismatches.push({
            kind: 'variant',
            id: vid,
            parentProductId: pid,
            field: 'prix_vente',
            expected: expV.expectedPrixVente,
            got: v.prix_vente,
          });
        }

        const expectedAvailable = expV.expectedStockQty > 0;
        if (normalizeBool(v.available) !== expectedAvailable) {
          mismatches.push({
            kind: 'variant',
            id: vid,
            parentProductId: pid,
            field: 'available',
            expected: expectedAvailable,
            got: v.available,
          });
        }
      }
    }
  }

  return mismatches;
}

function validateDetailProduct(detail, expectedProducts, expectedVariants) {
  const mismatches = [];
  const pid = Number(detail?.id);
  const exp = expectedProducts.get(pid);

  if (!exp) {
    mismatches.push({ kind: 'product_detail', id: pid, field: 'expected_row', expected: 'present', got: 'missing' });
    return mismatches;
  }

  if (!nearlyEqual(detail.prix_vente, exp.expectedPrixVente, 1e-4)) {
    mismatches.push({
      kind: 'product_detail',
      id: pid,
      field: 'prix_vente',
      expected: exp.expectedPrixVente,
      got: detail.prix_vente,
    });
  }

  const expectedInStock = exp.expectedStockQty > 0;
  if (normalizeBool(detail.in_stock) !== expectedInStock) {
    mismatches.push({
      kind: 'product_detail',
      id: pid,
      field: 'in_stock',
      expected: expectedInStock,
      got: detail.in_stock,
    });
  }

  const variants = Array.isArray(detail?.variants) ? detail.variants : [];
  for (const v of variants) {
    const vid = Number(v.id);
    const expV = expectedVariants.get(vid);
    if (!expV) continue;

    if (!nearlyEqual(v.prix_vente, expV.expectedPrixVente, 1e-4)) {
      mismatches.push({
        kind: 'variant_detail',
        id: vid,
        parentProductId: pid,
        field: 'prix_vente',
        expected: expV.expectedPrixVente,
        got: v.prix_vente,
      });
    }

    const expectedAvailable = expV.expectedStockQty > 0;
    if (normalizeBool(v.available) !== expectedAvailable) {
      mismatches.push({
        kind: 'variant_detail',
        id: vid,
        parentProductId: pid,
        field: 'available',
        expected: expectedAvailable,
        got: v.available,
      });
    }
  }

  return mismatches;
}

async function main() {
  await requireSnapshotTable();
  await assertApiUp();

  const products = await fetchProductsList();
  const productIds = [...new Set(products.map(p => Number(p.id)).filter(n => Number.isFinite(n)))];

  const variantIds = collectVariantIdsFromListProducts(products);

  const expectedProducts = await getExpectedProducts(productIds);
  const expectedVariants = await getExpectedVariants(variantIds);

  const listMismatches = validateListProducts(products, expectedProducts, expectedVariants);

  // Detail check on a small sample
  const detailIds = productIds.slice(0, Math.max(0, DETAIL_SAMPLE));
  const detailMismatches = [];
  for (const pid of detailIds) {
    const detail = await fetchProductDetail(pid);
    const detailVariantIds = collectVariantIdsFromDetail(detail);
    const expectedVariantsForDetail = detailVariantIds.length
      ? await getExpectedVariants(detailVariantIds)
      : new Map();

    detailMismatches.push(
      ...validateDetailProduct(detail, expectedProducts, expectedVariantsForDetail)
    );
  }

  const mismatches = [...listMismatches, ...detailMismatches];

  console.log('\n=== Snapshot Product Test ===');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Checked list products: ${products.length}`);
  console.log(`Checked detail products: ${detailIds.length}`);
  console.log(`Mismatches: ${mismatches.length}`);

  if (mismatches.length) {
    console.log('\nFirst mismatches:');
    mismatches.slice(0, 25).forEach((m, i) => {
      console.log(
        `${String(i + 1).padStart(2, '0')}. ` +
          `${m.kind} ` +
          `id=${m.id}` +
          (m.parentProductId ? ` product=${m.parentProductId}` : '') +
          ` field=${m.field} expected=${m.expected} got=${m.got}`
      );
    });
    process.exitCode = 1;
  } else {
    console.log('✅ OK: API prices/stock match product_snapshot expectations');
  }
}

main()
  .catch(err => {
    console.error('❌ Test failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Best-effort: close pool so Node exits cleanly
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
