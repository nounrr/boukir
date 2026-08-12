import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// Normalisation utilisée pour rapprocher une désignation collée d'un produit :
// casse ignorée, accents retirés, espaces multiples réduits.
const normalizeDesignation = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Liste des catégories avec le nom de leur parent, indispensable pour
// distinguer les catégories homonymes rattachées à des parents différents.
router.get('/categories', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id,
              c.nom,
              c.parent_id,
              p.nom AS parent_nom,
              (SELECT COUNT(*) FROM products pr WHERE pr.categorie_id = c.id) AS product_count
         FROM categories c
         LEFT JOIN categories p ON p.id = c.parent_id
        ORDER BY COALESCE(p.nom, c.nom), c.parent_id IS NOT NULL, c.nom`
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        nom: r.nom,
        parent_id: r.parent_id,
        parent_nom: r.parent_nom,
        product_count: Number(r.product_count) || 0,
        chemin: r.parent_nom ? `${r.parent_nom} > ${r.nom}` : r.nom,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Résout une liste de désignations (une par ligne) en produits.
// Ne modifie rien : sert d'aperçu avant l'affectation.
router.post('/resolve', async (req, res, next) => {
  try {
    const lines = Array.isArray(req.body?.designations) ? req.body.designations : [];
    const cleaned = lines
      .map((l) => String(l ?? '').trim())
      .filter(Boolean)
      .slice(0, 2000);

    if (!cleaned.length) return res.json({ results: [] });

    // On récupère tous les produits candidats en une requête, puis on
    // rapproche côté JS avec la même normalisation que l'entrée.
    const [rows] = await pool.query(
      `SELECT p.id,
              p.designation,
              p.reference,
              p.categorie_id,
              c.nom AS categorie_nom,
              pc.nom AS categorie_parent_nom
         FROM products p
         LEFT JOIN categories c ON c.id = p.categorie_id
         LEFT JOIN categories pc ON pc.id = c.parent_id`
    );

    const byKey = new Map();
    for (const row of rows) {
      const key = normalizeDesignation(row.designation);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(row);
    }

    const seen = new Set();
    const results = [];
    for (const raw of cleaned) {
      const key = normalizeDesignation(raw);
      if (!key) continue;
      // Une même désignation collée deux fois ne produit qu'une ligne.
      if (seen.has(key)) continue;
      seen.add(key);

      const matches = byKey.get(key) || [];
      results.push({
        designation: raw,
        status: matches.length === 0 ? 'not_found' : matches.length > 1 ? 'ambiguous' : 'ok',
        matches: matches.map((m) => ({
          id: m.id,
          designation: m.designation,
          reference: m.reference,
          categorie_id: m.categorie_id,
          categorie_nom: m.categorie_nom,
          categorie_chemin: m.categorie_nom
            ? m.categorie_parent_nom
              ? `${m.categorie_parent_nom} > ${m.categorie_nom}`
              : m.categorie_nom
            : null,
        })),
      });
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

// Affecte la catégorie choisie aux produits sélectionnés.
router.post('/assign', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const categorieId = Number(req.body?.categorie_id);
    const productIds = Array.isArray(req.body?.product_ids)
      ? [...new Set(req.body.product_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
      : [];

    if (!Number.isInteger(categorieId) || categorieId <= 0) {
      return res.status(400).json({ message: 'Catégorie invalide' });
    }
    if (!productIds.length) {
      return res.status(400).json({ message: 'Aucun produit à affecter' });
    }

    const [[category]] = await connection.query('SELECT id, nom FROM categories WHERE id = ? LIMIT 1', [categorieId]);
    if (!category) return res.status(404).json({ message: 'Catégorie introuvable' });

    const updatedBy = Number(req.user?.id) || null;

    await connection.beginTransaction();
    const [result] = await connection.query(
      `UPDATE products SET categorie_id = ?, updated_by = COALESCE(?, updated_by) WHERE id IN (?)`,
      [categorieId, updatedBy, productIds]
    );
    await connection.commit();

    res.json({
      message: `${result.affectedRows} produit(s) affecté(s) à « ${category.nom} »`,
      categorie_id: categorieId,
      updated: result.affectedRows,
      product_ids: productIds,
    });
  } catch (err) {
    try { await connection.rollback(); } catch { /* rollback best-effort */ }
    next(err);
  } finally {
    connection.release();
  }
});

export default router;
