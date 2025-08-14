import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/* ========== GET / (liste) ========== */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        af.*,
        f.nom_complet AS fournisseur_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', i.id,
              'product_id', i.product_id,
              'designation', p.designation,
              'quantite', i.quantite,
              'prix_unitaire', i.prix_unitaire,
              'remise_pourcentage', i.remise_pourcentage,
              'remise_montant', i.remise_montant,
              'total', i.total
            )
          )
          FROM avoir_fournisseur_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_fournisseur_id = af.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_fournisseur af
      LEFT JOIN contacts f ON f.id = af.fournisseur_id
      ORDER BY af.created_at DESC
    `);

    const data = rows.map(r => ({
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    }));

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_fournisseur:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* ======= GET /:id (détail) ======= */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT
        af.*,
        f.nom_complet AS fournisseur_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', i.id,
              'product_id', i.product_id,
              'designation', p.designation,
              'quantite', i.quantite,
              'prix_unitaire', i.prix_unitaire,
              'remise_pourcentage', i.remise_pourcentage,
              'remise_montant', i.remise_montant,
              'total', i.total
            )
          )
          FROM avoir_fournisseur_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_fournisseur_id = af.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_fournisseur af
      LEFT JOIN contacts f ON f.id = af.fournisseur_id
      WHERE af.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Avoir fournisseur non trouvé' });

    const r = rows[0];
    const data = {
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    };

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_fournisseur/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* ===== POST / (création) ===== */
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      // numero auto-généré avf{ID} => on ignore "numero" s'il est envoyé
      date_creation,
      fournisseur_id,
      montant_total,
      statut = 'En attente',
      created_by,
      items = [],
      // tolère snake_case et camelCase
      lieu_chargement: lieuSnake,
      lieuChargement: lieuCamel,
      adresse_livraison: adresseLivSnake,
      adresseLivraison: adresseLivCamel
    } = req.body || {};

    if (!date_creation || !montant_total || !created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    const fId  = fournisseur_id ?? null;
    const st   = statut ?? 'En attente';
    const lieu = (typeof lieuSnake === 'string' && lieuSnake.trim() !== '')
      ? lieuSnake.trim()
      : (typeof lieuCamel === 'string' && lieuCamel.trim() !== '' ? lieuCamel.trim() : null);

    // numero temporaire pour satisfaire NOT NULL + UNIQUE
    const tmpNumero = `tmp-${Date.now()}-${Math.floor(Math.random()*1e6)}`;

    const adresseLiv = (typeof adresseLivSnake === 'string' && adresseLivSnake.trim() !== '')
      ? adresseLivSnake.trim()
      : (typeof adresseLivCamel === 'string' && adresseLivCamel.trim() !== '' ? adresseLivCamel.trim() : null);

    const [ins] = await connection.execute(`
      INSERT INTO avoirs_fournisseur (
        numero, date_creation, fournisseur_id, lieu_chargement, adresse_livraison, montant_total, statut, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [tmpNumero, date_creation, fId, lieu, adresseLiv, montant_total, st, created_by]);

    const avoirId = ins.insertId;

    // numero final = avf{ID}
    const finalNumero = `avf${avoirId}`;
    await connection.execute(
      'UPDATE avoirs_fournisseur SET numero = ? WHERE id = ?',
      [finalNumero, avoirId]
    );

    for (const it of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        remise_pourcentage = 0,
        remise_montant = 0,
        total
      } = it;

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      await connection.execute(`
        INSERT INTO avoir_fournisseur_items (
          avoir_fournisseur_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [avoirId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.status(201).json({ message: 'Avoir fournisseur créé avec succès', id: avoirId, numero: finalNumero });
  } catch (error) {
    await connection.rollback();
    console.error('POST /avoirs_fournisseur:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* ==== PUT /:id (mise à jour) ==== */
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      date_creation,
      fournisseur_id,
      montant_total,
      statut,
      items = [],
      lieu_chargement: lieuSnake,
      lieuChargement: lieuCamel,
      adresse_livraison: adresseLivSnake,
      adresseLivraison: adresseLivCamel
    } = req.body || {};

    const [exists] = await connection.execute('SELECT id FROM avoirs_fournisseur WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir fournisseur non trouvé' });
    }

    const fId  = fournisseur_id ?? null;
    const st   = statut ?? null;
    const lieu = (typeof lieuSnake === 'string' && lieuSnake.trim() !== '')
      ? lieuSnake.trim()
      : (typeof lieuCamel === 'string' && lieuCamel.trim() !== '' ? lieuCamel.trim() : null);

    const adresseLiv = (typeof adresseLivSnake === 'string' && adresseLivSnake.trim() !== '')
      ? adresseLivSnake.trim()
      : (typeof adresseLivCamel === 'string' && adresseLivCamel.trim() !== '' ? adresseLivCamel.trim() : null);

    await connection.execute(`
      UPDATE avoirs_fournisseur SET
        date_creation = ?, fournisseur_id = ?, lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, statut = ?
      WHERE id = ?
    `, [date_creation, fId, lieu, adresseLiv, montant_total, st, id]);

    await connection.execute('DELETE FROM avoir_fournisseur_items WHERE avoir_fournisseur_id = ?', [id]);

    for (const it of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        remise_pourcentage = 0,
        remise_montant = 0,
        total
      } = it;

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      await connection.execute(`
        INSERT INTO avoir_fournisseur_items (
          avoir_fournisseur_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.json({ message: 'Avoir fournisseur mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('PUT /avoirs_fournisseur/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* == PATCH /:id/statut (changer) == */
router.patch('/:id/statut', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!statut) return res.status(400).json({ message: 'Statut requis' });

    const valides = ['En attente', 'Validé', 'Appliqué', 'Annulé'];
    if (!valides.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    // PDG-only for validation
    const userRole = req.user?.role;
    const lower = String(statut).toLowerCase();
    if ((lower === 'validé' || lower === 'valid') && userRole !== 'PDG') {
      return res.status(403).json({ message: 'Rôle PDG requis pour valider' });
    }

    const [result] = await pool.execute(
      'UPDATE avoirs_fournisseur SET statut = ?, updated_at = NOW() WHERE id = ?',
      [statut, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Avoir fournisseur non trouvé' });

    const [rows] = await pool.execute(`
      SELECT af.*, f.nom_complet AS fournisseur_nom
      FROM avoirs_fournisseur af
      LEFT JOIN contacts f ON f.id = af.fournisseur_id
      WHERE af.id = ?
    `, [id]);

    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    console.error('PATCH /avoirs_fournisseur/:id/statut:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* ====== DELETE /:id ====== */
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [exists] = await connection.execute('SELECT id FROM avoirs_fournisseur WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir fournisseur non trouvé' });
    }

    await connection.execute('DELETE FROM avoir_fournisseur_items WHERE avoir_fournisseur_id = ?', [id]);
    await connection.execute('DELETE FROM avoirs_fournisseur WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    await connection.rollback();
    console.error('DELETE /avoirs_fournisseur/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

export default router;
