import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, c.id as c_id, c.nom as c_nom, c.description as c_description
      FROM products p
      LEFT JOIN categories c ON p.categorie_id = c.id
      ORDER BY p.id DESC
    `);
    const data = rows.map((r) => ({
      id: r.id,
  // reference is now derived from id for compatibility with frontend displays
  reference: String(r.id),
      designation: r.designation,
      categorie_id: r.categorie_id,
      categorie: r.c_id ? { id: r.c_id, nom: r.c_nom, description: r.c_description } : undefined,
      quantite: Number(r.quantite),
      prix_achat: Number(r.prix_achat),
      cout_revient_pourcentage: Number(r.cout_revient_pourcentage),
      cout_revient: Number(r.cout_revient),
      prix_gros_pourcentage: Number(r.prix_gros_pourcentage),
      prix_gros: Number(r.prix_gros),
      prix_vente_pourcentage: Number(r.prix_vente_pourcentage),
      prix_vente: Number(r.prix_vente),
      est_service: !!r.est_service,
      created_by: r.created_by,
      updated_by: r.updated_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ message: 'Produit introuvable' });
    res.json({
      id: r.id,
  reference: String(r.id),
      designation: r.designation,
      categorie_id: r.categorie_id,
      quantite: Number(r.quantite),
      prix_achat: Number(r.prix_achat),
      cout_revient_pourcentage: Number(r.cout_revient_pourcentage),
      cout_revient: Number(r.cout_revient),
      prix_gros_pourcentage: Number(r.prix_gros_pourcentage),
      prix_gros: Number(r.prix_gros),
      prix_vente_pourcentage: Number(r.prix_vente_pourcentage),
      prix_vente: Number(r.prix_vente),
      est_service: !!r.est_service,
      created_by: r.created_by,
      updated_by: r.updated_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      designation,
      categorie_id,
      quantite,
      prix_achat,
      cout_revient_pourcentage,
      prix_gros_pourcentage,
      prix_vente_pourcentage,
      est_service,
      created_by,
    } = req.body;

    // Ensure we have a category: use provided one, else first category or create a default
    let catId = Number(categorie_id);
    if (!catId) {
      const [catRows] = await pool.query('SELECT id FROM categories ORDER BY id ASC LIMIT 1');
      if (catRows.length > 0) {
        catId = catRows[0].id;
      } else {
        const nowCat = new Date();
        const [insCat] = await pool.query(
          'INSERT INTO categories (nom, description, created_at, updated_at) VALUES (?, ?, ?, ?)',
          ['Divers', 'Catégorie par défaut', nowCat, nowCat]
        );
        catId = insCat.insertId;
      }
    }

    const pa = Number(prix_achat ?? 0);
    const crp = Number(cout_revient_pourcentage ?? 0);
    const pgp = Number(prix_gros_pourcentage ?? 0);
    const pvp = Number(prix_vente_pourcentage ?? 0);

  // Align with frontend display: prix = prix_achat * (1 + pourcentage/100)
  const cr = pa * (1 + crp / 100);
  const pg = pa * (1 + pgp / 100);
  const pv = pa * (1 + pvp / 100);

    const now = new Date();
    const [result] = await pool.query(
  `INSERT INTO products
   (designation, categorie_id, quantite, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, est_service, created_by, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        (designation && String(designation).trim()) || 'Sans désignation',
        catId,
        Number(est_service ? 0 : (quantite ?? 0)),
        pa,
        crp,
        cr,
        pgp,
        pg,
        pvp,
        pv,
        est_service ? 1 : 0,
        created_by ?? null,
        now,
        now,
      ]
    );
    const id = result.insertId;
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    const r = rows[0];
    res.status(201).json({ ...r, reference: String(r.id) });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [exists] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ message: 'Produit introuvable' });

    const fields = [];
    const values = [];
    const now = new Date();

    const {
      designation,
      categorie_id,
      quantite,
      prix_achat,
      cout_revient_pourcentage,
      prix_gros_pourcentage,
      prix_vente_pourcentage,
      est_service,
      updated_by,
    } = req.body;

    if (designation !== undefined) { fields.push('designation = ?'); values.push(designation ? designation.trim() : null); }
    if (categorie_id !== undefined) { fields.push('categorie_id = ?'); values.push(categorie_id); }
    if (quantite !== undefined) { fields.push('quantite = ?'); values.push(Number(quantite)); }
    if (prix_achat !== undefined) { fields.push('prix_achat = ?'); values.push(Number(prix_achat)); }
    if (cout_revient_pourcentage !== undefined) { fields.push('cout_revient_pourcentage = ?'); values.push(Number(cout_revient_pourcentage)); }
    if (prix_gros_pourcentage !== undefined) { fields.push('prix_gros_pourcentage = ?'); values.push(Number(prix_gros_pourcentage)); }
    if (prix_vente_pourcentage !== undefined) { fields.push('prix_vente_pourcentage = ?'); values.push(Number(prix_vente_pourcentage)); }

    // Recalculate derived prices if inputs provided
    if (prix_achat !== undefined || cout_revient_pourcentage !== undefined) {
      const pa = Number(prix_achat ?? exists[0].prix_achat);
      const crp = Number(cout_revient_pourcentage ?? exists[0].cout_revient_pourcentage);
      fields.push('cout_revient = ?'); values.push(pa * (1 + crp / 100));
    }
    if (prix_achat !== undefined || prix_gros_pourcentage !== undefined) {
      const pa = Number(prix_achat ?? exists[0].prix_achat);
      const pgp = Number(prix_gros_pourcentage ?? exists[0].prix_gros_pourcentage);
      fields.push('prix_gros = ?'); values.push(pa * (1 + pgp / 100));
    }
    if (prix_achat !== undefined || prix_vente_pourcentage !== undefined) {
      const pa = Number(prix_achat ?? exists[0].prix_achat);
      const pvp = Number(prix_vente_pourcentage ?? exists[0].prix_vente_pourcentage);
      fields.push('prix_vente = ?'); values.push(pa * (1 + pvp / 100));
    }

    if (est_service !== undefined) { fields.push('est_service = ?'); values.push(est_service ? 1 : 0); }
    if (updated_by !== undefined) { fields.push('updated_by = ?'); values.push(updated_by); }

    fields.push('updated_at = ?'); values.push(now);
    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    await pool.query(sql, values);

  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  const r = rows[0];
  res.json({ ...r, reference: String(r.id) });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// Specific stock update endpoint
router.patch('/:id/stock', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { quantite, updated_by } = req.body;
    const [exists] = await pool.query('SELECT id FROM products WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ message: 'Produit introuvable' });
    const now = new Date();
    await pool.query('UPDATE products SET quantite = ?, updated_by = ?, updated_at = ? WHERE id = ?', [Number(quantite), updated_by ?? null, now, id]);
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  const r = rows[0];
  res.json({ ...r, reference: String(r.id) });
  } catch (err) { next(err); }
});

export default router;
