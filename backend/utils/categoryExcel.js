import * as XLSX from 'xlsx';

const MAX_ROWS = 20000;
const MAX_COLUMNS = 64;
const MAX_SHEETS = 20;
const columns = {
  product: ['produit', 'designation', 'nom du produit', 'nom produit'],
  productId: ['id', 'id produit', 'product id'],
  reference: ['reference', 'reference 2', 'ref', 'sku'],
  variant: ['variante', 'variant'],
  category: ['categorie', 'categorie actuelle', 'category'],
  correction: ['correction', 'categorie corrigee', 'nouvelle categorie', 'categorie cible'],
  validation: ['validation', 'validation ✓ / ✗'],
};

const clean = value => String(value ?? '').trim();
const normalize = value => clean(value).normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase();
const categoryKey = value => clean(value).split('>').map(normalize).join('>');

function importError(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export function readCategoryExcel(buffer) {
  const isZip = buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const isXls = buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!isZip && !isXls) throw importError('Sélectionnez un fichier Excel .xlsx ou .xls.');

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: MAX_ROWS + 2 });
  } catch {
    throw importError('Le fichier Excel est illisible ou protégé.');
  }
  if (workbook.SheetNames.length > MAX_SHEETS) {
    throw importError('Le classeur doit contenir au maximum 20 feuilles.');
  }

  const rows = [];
  let hasProductSheet = false;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    range.e.c = Math.min(range.e.c, range.s.c + MAX_COLUMNS - 1);
    const [header] = XLSX.utils.sheet_to_json(sheet, {
      header: 1, range: { s: range.s, e: { r: range.s.r, c: range.e.c } }, defval: '',
    });
    const headings = (header ?? []).map(value => normalize(value).replace(/[_-]+/g, ' '));
    const indexes = Object.fromEntries(Object.entries(columns).map(([field, names]) =>
      [field, headings.findIndex(heading => names.includes(heading))],
    ));
    if ([indexes.product, indexes.productId, indexes.reference].every(index => index < 0)) continue;
    if (indexes.category < 0 && indexes.correction < 0) continue;
    hasProductSheet = true;

    const fullRange = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);
    if (fullRange.e.r - range.s.r > MAX_ROWS) {
      throw importError('Le classeur doit contenir au maximum 20 000 lignes de produits.');
    }

    const values = XLSX.utils.sheet_to_json(sheet, { header: 1, range, defval: '' });
    for (let index = 1; index < values.length; index++) {
      const cells = values[index];
      const get = field => clean(cells[indexes[field]]);
      const correction = get('correction');
      const rejected = /\b(faux|incorrect|false|non)\b/.test(normalize(get('validation')));
      const row = {
        sheet: sheetName,
        row: range.s.r + index + 1,
        product: get('product'),
        productId: get('productId'),
        reference: get('reference'),
        variant: get('variant'),
        target: correction || (rejected ? '' : get('category')),
        explicit: Boolean(correction),
        rejected,
      };
      if (![row.product, row.productId, row.reference, row.variant, row.target, get('category')].some(Boolean)) continue;
      if ([row.product, row.productId, row.reference, row.variant, row.target].some(value => value.length > 500)) {
        throw importError('Une désignation, une référence ou une catégorie dépasse 500 caractères.');
      }
      rows.push(row);
      if (rows.length > MAX_ROWS) {
        throw importError('Le classeur doit contenir au maximum 20 000 lignes de produits.');
      }
    }
  }

  if (!hasProductSheet) {
    throw importError('Ajoutez les colonnes « Produit » et « Catégorie » ou « correction » dans la première ligne de la feuille.');
  }
  if (!rows.length) throw importError('Le classeur ne contient aucune ligne de produit.');
  return rows;
}

function addToIndex(index, key, id) {
  if (!key) return;
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(id);
}

function makeCategoryPaths(categories) {
  const byId = new Map(categories.map(category => [category.id, category]));
  return new Map(categories.map(category => {
    const names = [category.nom];
    const seen = new Set([category.id]);
    let parent = byId.get(category.parent_id);
    while (parent && !seen.has(parent.id)) {
      names.unshift(parent.nom);
      seen.add(parent.id);
      parent = byId.get(parent.parent_id);
    }
    return [category.id, names.join(' > ')];
  }));
}

export function planCategoryExcel(rows, { products, categories, variants }) {
  const productsById = new Map(products.map(product => [product.id, product]));
  const productNames = new Map();
  const references = new Map();
  const variantNames = new Map();
  const categoryNames = new Map();
  const categoryPaths = makeCategoryPaths(categories);

  for (const product of products) {
    addToIndex(productNames, normalize(product.designation), product.id);
    addToIndex(productNames, normalize(product.old_designation), product.id);
    addToIndex(references, normalize(product.reference_2), product.id);
  }
  for (const variant of variants) {
    addToIndex(variantNames, normalize(variant.variant_name), variant.product_id);
    addToIndex(references, normalize(variant.reference), variant.product_id);
  }
  for (const category of categories) {
    addToIndex(categoryNames, categoryKey(category.nom), category.id);
    addToIndex(categoryNames, categoryKey(categoryPaths.get(category.id)), category.id);
  }

  const recognized = [];
  const unknownProducts = [];
  const unknownCategories = [];
  const grouped = new Map();
  const changes = [];

  const entry = ({ sheet, row, product, productId, reference, variant, target }, match) => ({
    sheet, row, product: product || match?.designation || reference || productId || '—', variant,
    productId: match?.id,
    current: categoryPaths.get(match?.categorie_id) ?? null,
    target,
  });

  function findCategory(row, current) {
    if (!row.target) {
      return { reason: row.rejected ? 'Correction manquante' : 'Catégorie manquante' };
    }
    const matches = categoryNames.get(categoryKey(row.target));
    if (!matches) return { reason: 'Catégorie introuvable' };
    // A repeated label in the original category column can confirm an existing assignment.
    if (!row.explicit && matches.has(current)) return { id: current };
    if (matches.size > 1) return { reason: 'Plusieurs catégories portent ce nom. Indiquez le chemin complet.' };
    return { id: [...matches][0] };
  }

  for (const row of rows) {
    const names = productNames.get(normalize(row.product));
    let matches = names;
    if (row.productId) {
      const id = /^\d+$/.test(row.productId) ? Number(row.productId) : null;
      matches = productsById.has(id) && (!row.product || names?.has(id)) ? new Set([id]) : undefined;
    } else if (row.reference) {
      matches = new Set([...(references.get(normalize(row.reference)) ?? [])]
        .filter(id => !row.product || names?.has(id)));
    }
    if (matches?.size > 1 && row.variant) {
      const withVariant = [...matches].filter(id => variantNames.get(normalize(row.variant))?.has(id));
      if (withVariant.length) matches = new Set(withVariant);
    }
    if (matches?.size !== 1) {
      unknownProducts.push({ ...entry(row), reason: matches?.size > 1
        ? 'Plusieurs produits correspondent. Indiquez un ID produit.'
        : 'Produit introuvable ou identifiants incompatibles' });
      const { reason } = findCategory(row);
      if (reason) unknownCategories.push({ ...entry(row), reason });
      continue;
    }

    const [id] = matches;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(row);
  }

  for (const [id, productRows] of grouped) {
    const product = productsById.get(id);
    const corrections = productRows.filter(row => row.explicit);
    const candidates = corrections.length ? corrections : productRows;
    const targets = new Map(candidates.map(row => [categoryKey(row.target), row]));
    const resolved = new Map();
    const issues = [];
    for (const row of targets.values()) {
      const result = findCategory(row, product.categorie_id);
      if (result.reason) issues.push({ ...entry(row, product), reason: result.reason });
      else resolved.set(result.id, row);
    }

    if (resolved.size > 1) {
      const candidate = entry(candidates[0], product);
      candidate.target = [...resolved.keys()].map(categoryId => categoryPaths.get(categoryId)).join(' / ');
      issues.push({ ...candidate, reason: 'Plusieurs catégories cibles sont indiquées pour ce produit.' });
    }
    if (issues.length) {
      unknownCategories.push(...issues);
      continue;
    }

    const [[categoryId, row]] = resolved;
    const changed = categoryId !== product.categorie_id;
    const target = categoryPaths.get(categoryId);
    recognized.push({ ...entry(row, product), target, changed });
    if (changed) changes.push({ id, before: product.categorie_id, categoryId, target });
  }

  changes.sort((left, right) => left.id - right.id);
  return { totalRows: rows.length, recognized, unknownProducts, unknownCategories, changes };
}
