import pool from '../db/pool.js';

function parseArgs(argv) {
  const args = {
    apply: false,
    perCategory: 1,
    maxNew: Infinity,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--per-category') args.perCategory = Number(argv[++i] ?? '1');
    else if (a === '--max-new') args.maxNew = Number(argv[++i] ?? '0');
  }

  if (!Number.isFinite(args.perCategory) || args.perCategory < 0) args.perCategory = 1;
  if (!Number.isFinite(args.maxNew) || args.maxNew <= 0) args.maxNew = Infinity;

  return args;
}

function pickRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getSampleImageUrl() {
  // Use a stable public placeholder CDN (no local uploads/files).
  // Note: Unsplash can return 404 in some environments.
  return 'https://placehold.co/1000x800/png?text=Boukir+Demo';
}

async function getCategories() {
  const [rows] = await pool.query(
    `SELECT id, nom, nom_ar, nom_en, nom_zh, parent_id
     FROM categories
     ORDER BY id ASC`
  );
  return rows;
}

async function getPublishedProductCountByCategory() {
  const [rows] = await pool.query(
    `SELECT categorie_id, COUNT(*) AS cnt
     FROM products
     WHERE ecom_published = 1 AND COALESCE(is_deleted, 0) = 0
     GROUP BY categorie_id`
  );
  const map = new Map();
  for (const r of rows) map.set(r.categorie_id, Number(r.cnt || 0));
  return map;
}

async function insertDemoProduct({
  category,
  index,
  sampleImageUrl,
  apply,
}) {
  const now = new Date();
  const designation = `Demo - ${category.nom} #${index}`;
  const prixVente = pickRandomInt(20, 300);

  if (!apply) {
    return { created: false, dryRun: true, designation, prixVente };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [productResult] = await conn.query(
      `INSERT INTO products (
        designation,
        designation_ar,
        designation_en,
        designation_zh,
        description,
        categorie_id,
        prix_vente,
        pourcentage_promo,
        image_url,
        ecom_published,
        stock_partage_ecom,
        stock_partage_ecom_qty,
        has_variants,
        is_obligatoire_variant,
        base_unit,
        categorie_base,
        remise_client,
        remise_artisan,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ,
      [
        designation,
        category.nom_ar || null,
        category.nom_en || null,
        category.nom_zh || null,
        `Produit de démonstration pour la catégorie: ${category.nom}`,
        category.id,
        prixVente,
        0,
        sampleImageUrl || null,
        1,
        1,
        50,
        1,
        0,
        'u',
        'Maison',
        0,
        0,
        now,
        now,
      ]
    );

    const productId = productResult.insertId;

    // Units (at least one default unit)
    await conn.query(
      `INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      ,
      [productId, 'u', 1, prixVente, 1, now, now]
    );

    // Images (at least one row, required by product_images schema)
    await conn.query(
      `INSERT INTO product_images (product_id, image_url, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
      ,
      [productId, sampleImageUrl, 1, now, now]
    );

    // Variants (simple color variants)
    const variantsToCreate = [
      { name: 'Rouge', type: 'Couleur' },
      { name: 'Bleu', type: 'Couleur' },
    ];

    for (let i = 0; i < variantsToCreate.length; i++) {
      const v = variantsToCreate[i];
      const [variantResult] = await conn.query(
        `INSERT INTO product_variants (
          product_id,
          variant_name,
          variant_type,
          reference,
          prix_vente,
          stock_quantity,
          image_url,
          remise_client,
          remise_artisan,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ,
        [
          productId,
          v.name,
          v.type,
          `DEMO-${productId}-${i + 1}`,
          prixVente,
          10,
          sampleImageUrl || null,
          0,
          0,
          now,
          now,
        ]
      );

      const variantId = variantResult.insertId;
      await conn.query(
        `INSERT INTO variant_images (variant_id, image_url, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
        ,
        [variantId, sampleImageUrl, 1, now, now]
      );
    }

    await conn.commit();
    return { created: true, productId, designation, prixVente };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      // ignore
    }
    throw e;
  } finally {
    conn.release();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const apply = args.apply;

  console.log('Seed ecommerce demo');
  console.log({ apply, perCategory: args.perCategory, maxNew: args.maxNew });

  const sampleImageUrl = await getSampleImageUrl();
  const categories = await getCategories();
  const countByCategory = await getPublishedProductCountByCategory();

  let planned = 0;
  const plan = [];

  for (const c of categories) {
    const existingCount = countByCategory.get(c.id) || 0;
    const needed = Math.max(0, args.perCategory - existingCount);
    for (let k = 1; k <= needed; k++) {
      if (planned >= args.maxNew) break;
      planned++;
      plan.push({ category: c, index: existingCount + k });
    }
    if (planned >= args.maxNew) break;
  }

  console.log(`Categories: ${categories.length}`);
  console.log(`Products to create (to reach per-category minimum): ${plan.length}`);

  if (plan.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (!apply) {
    console.log('Dry-run mode (no DB writes). Use --apply to insert.');
    console.log('Preview (first 10):');
    plan.slice(0, 10).forEach((p, idx) => {
      console.log(`${idx + 1}. category_id=${p.category.id} nom=${p.category.nom} -> Demo product #${p.index}`);
    });
    return;
  }

  let created = 0;
  for (const p of plan) {
    const result = await insertDemoProduct({
      category: p.category,
      index: p.index,
      sampleImageUrl,
      apply,
    });
    if (result.created) created++;
    console.log(`✓ Created product ${result.productId}: ${result.designation}`);
  }

  console.log(`Done. Created ${created} product(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Seed failed:', e?.message || e);
    process.exit(1);
  });
