import pool from '../db/pool.js';

function parseArgs(argv) {
  const args = {
    apply: false,
    force: false,
    width: 800,
    height: 500,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--force') args.force = true;
    else if (a === '--width') args.width = Number(argv[++i] ?? args.width);
    else if (a === '--height') args.height = Number(argv[++i] ?? args.height);
  }

  if (!Number.isFinite(args.width) || args.width <= 0) args.width = 800;
  if (!Number.isFinite(args.height) || args.height <= 0) args.height = 500;

  return args;
}

function buildCdnUrl({ width, height, label }) {
  // Stable CDN placeholder that works in this environment.
  // Example: https://placehold.co/800x500/png?text=Boukir+Category+12
  const text = encodeURIComponent(label).replace(/%20/g, '+');
  return `https://placehold.co/${width}x${height}/png?text=${text}`;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log('Seed category images');
  console.log({ apply: args.apply, force: args.force, width: args.width, height: args.height });

  const [categories] = await pool.query(
    `SELECT id, nom, image_url
     FROM categories
     ORDER BY id ASC`
  );

  const targets = categories.filter((c) => {
    const current = String(c.image_url ?? '').trim();
    if (args.force) return true;
    return current.length === 0;
  });

  console.log(`Categories total: ${categories.length}`);
  console.log(`Categories to update: ${targets.length}`);

  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const preview = targets.slice(0, 10).map((c) => {
    const url = buildCdnUrl({
      width: args.width,
      height: args.height,
      label: `Boukir Category ${c.id}`,
    });
    return { id: c.id, nom: c.nom, url };
  });

  console.log('Preview (first 10):');
  console.log(preview);

  if (!args.apply) {
    console.log('Dry-run mode (no DB writes). Use --apply to update.');
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const c of targets) {
      const url = buildCdnUrl({
        width: args.width,
        height: args.height,
        label: `Boukir Category ${c.id}`,
      });
      await conn.query('UPDATE categories SET image_url = ? WHERE id = ?', [url, c.id]);
    }

    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }

  const [[{ missing }]] = await pool.query(
    `SELECT COUNT(*) AS missing
     FROM categories
     WHERE image_url IS NULL OR TRIM(image_url) = ''`
  );

  console.log(`Done. Missing images after update: ${missing}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Seed failed:', e?.message || e);
    process.exit(1);
  });
