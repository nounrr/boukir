import pool from '../db/pool.js';

async function hasProductSnapshotTable(db) {
  try {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name = 'product_snapshot'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

async function main() {
  const snapshotEnabled = await hasProductSnapshotTable(pool);

  const stockExpr = snapshotEnabled
    ? `(
        SELECT COALESCE(SUM(ps.quantite), 0)
        FROM product_snapshot ps
        WHERE ps.product_id = p.id
      )`
    : `COALESCE(p.stock_partage_ecom_qty, 0)`;

  const [rows] = await pool.query(
    `SELECT
        p.id,
        p.designation,
        p.has_variants,
        p.stock_partage_ecom_qty,
        p.prix_vente,
        p.pourcentage_promo,
        ${stockExpr} AS stock_qty
     FROM products p
     WHERE p.ecom_published = 1
       AND COALESCE(p.is_deleted, 0) = 0
       AND ${stockExpr} <= 0
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT 10`
  );

  if (!rows.length) {
    console.log('No out-of-stock published ecommerce products found.');
    console.log('snapshotEnabled:', snapshotEnabled);
    process.exit(0);
  }

  const first = rows[0];

  console.log('snapshotEnabled:', snapshotEnabled);
  console.log('Found out-of-stock published product:');
  console.log({
    id: toNum(first.id),
    designation: first.designation,
    has_variants: !!first.has_variants,
    stock_qty: toNum(first.stock_qty),
    legacy_stock_partage_ecom_qty: toNum(first.stock_partage_ecom_qty),
    prix_vente: toNum(first.prix_vente),
    pourcentage_promo: toNum(first.pourcentage_promo),
  });

  console.log('\nOther candidates (up to 10):');
  for (const r of rows) {
    console.log(`- ${r.id}: ${r.designation} (stock_qty=${toNum(r.stock_qty)})`);
  }

  console.log('\nTest endpoints:');
  console.log(`- GET /api/ecommerce/products/${first.id}`);
  console.log(`- GET /api/ecommerce/products?in_stock_only=false&search=${encodeURIComponent(String(first.designation || '').slice(0, 30))}`);
}

main()
  .catch((err) => {
    console.error('ERROR:', err?.message || err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
