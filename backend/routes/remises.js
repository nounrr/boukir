import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// ---- helpers -------------------------------------------------
async function tableExists(table) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function ensureRemisesTables() {
  // client_remises : toujours
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS client_remises (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nom VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NULL,
      cin VARCHAR(50) NULL,
      note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const hasProducts = await tableExists('products');

  // Créer item_remises. Si products absent, pas de FK pour l’instant.
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS item_remises (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_remise_id INT NOT NULL,
      product_id INT NOT NULL,
      bon_id INT NULL,
      bon_type ENUM('Commande','Sortie','Comptant') NULL,
      is_achat TINYINT(1) NOT NULL DEFAULT 0,
      qte INT NOT NULL DEFAULT 0,
      prix_remise DECIMAL(10,2) NOT NULL DEFAULT 0,
      statut ENUM('En attente','Validé','Annulé') NOT NULL DEFAULT 'En attente',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_item_remises_client
        FOREIGN KEY (client_remise_id) REFERENCES client_remises(id) ON DELETE CASCADE
    )
  `);

  // Add is_achat column if it doesn't exist (for existing tables)
  const [cols] = await pool.execute(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'item_remises' AND COLUMN_NAME = 'is_achat'
  `);
  if (!cols.length) {
    await pool.execute(`ALTER TABLE item_remises ADD COLUMN is_achat TINYINT(1) NOT NULL DEFAULT 0 AFTER bon_type`);
  }

  // Ajouter la FK vers products si possible (et si non présente)
  if (hasProducts) {
    const [fk] = await pool.execute(`
      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'item_remises' AND CONSTRAINT_NAME = 'fk_item_remises_product'
      LIMIT 1
    `);
    if (!fk.length) {
      await pool.execute(`
        ALTER TABLE item_remises
        ADD CONSTRAINT fk_item_remises_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
      `);
    }
  }
}
ensureRemisesTables().catch(e => console.error('ensureRemisesTables:', e));

// Résoudre (bon_id, bon_type) mais uniquement Sortie/Comptant
async function resolveBonLink(bonId, bonType) {
  let finalBonId = bonId ?? null;
  let finalBonType = bonType ?? null;

  if (finalBonId && !finalBonType) {
    const hasSorties = await tableExists('bons_sortie');
    const hasComptants = await tableExists('bons_comptant');

    if (hasSorties) {
      const [s] = await pool.execute('SELECT id FROM bons_sortie WHERE id = ? LIMIT 1', [finalBonId]);
      if (s.length) return { finalBonId, finalBonType: 'Sortie' };
    }
    if (hasComptants) {
      const [c] = await pool.execute('SELECT id FROM bons_comptant WHERE id = ? LIMIT 1', [finalBonId]);
      if (c.length) return { finalBonId, finalBonType: 'Comptant' };
    }
    // rien trouvé → on annule le lien
    finalBonId = null;
    finalBonType = null;
  }

  // Si type invalide, on neutralise
  if (finalBonType && !['Commande', 'Sortie', 'Comptant'].includes(finalBonType)) {
    finalBonId = null;
    finalBonType = null;
  }
  return { finalBonId, finalBonType };
}

// ---- Client Remises CRUD ------------------------------------
// Liste des clients remises avec total_remise agrégé
router.get('/clients', async (_req, res) => {
  try {
    await ensureRemisesTables();
  const [rows] = await pool.execute(`
      SELECT 
        cr.*,
        (
          SELECT COALESCE(SUM(ir.qte * ir.prix_remise), 0)
          FROM item_remises ir
          WHERE ir.client_remise_id = cr.id AND ir.statut <> 'Annulé'
        ) AS total_remise
      FROM client_remises cr
      ORDER BY cr.id DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error('remises clients list error', e);
    res.status(500).json({ message: 'Erreur du serveur', detail: e?.message, code: e?.code });
  }
});

// Créer un client remise
router.post('/clients', verifyToken, async (req, res) => {
  try {
    const { nom, phone, cin, note } = req.body;
    if (!nom || !String(nom).trim()) {
      return res.status(400).json({ message: 'nom requis' });
    }
    const [r] = await pool.execute(
      'INSERT INTO client_remises (nom, phone, cin, note) VALUES (?, ?, ?, ?)',
      [String(nom).trim(), phone ?? null, cin ?? null, note ?? null]
    );
    const [rows] = await pool.execute('SELECT * FROM client_remises WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('remises clients create error', e);
    res.status(500).json({ message: 'Erreur du serveur', detail: e?.message, code: e?.code });
  }
});

// Récupérer un client remise par id
router.get('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM client_remises WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Introuvable' });
    res.json(rows[0]);
  } catch (e) {
    console.error('remises clients get error', e);
    res.status(500).json({ message: 'Erreur du serveur', detail: e?.message, code: e?.code });
  }
});

router.get('/clients/:id/bons', async (req, res) => {
  try {
    const { id } = req.params;
  const [rows] = await pool.execute(
      `
      SELECT
        ir.bon_id AS id,
        ir.bon_type AS type,
    MAX(COALESCE(bs.date_creation, bc.date_creation, bcmd.date_creation)) AS date_creation,
    MAX(COALESCE(bs.montant_total, bc.montant_total, bcmd.montant_total)) AS montant_total,
    MAX(CASE WHEN ir.bon_type = 'Commande' THEN fs.nom_complet ELSE cs.nom_complet END) AS contact_name,
        SUM(ir.qte * ir.prix_remise) AS total_remise,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'item_remise_id', ir.id,
            'product_id', ir.product_id,
            'reference', CAST(p.id AS CHAR),
            'designation', p.designation,
            'qte', ir.qte,
            'prix_remise', ir.prix_remise,
            'total', ir.qte * ir.prix_remise
          )
        ) AS remises
      FROM item_remises ir
      LEFT JOIN products p ON p.id = ir.product_id
      LEFT JOIN bons_sortie bs ON ir.bon_type = 'Sortie' AND bs.id = ir.bon_id
      LEFT JOIN bons_comptant bc ON ir.bon_type = 'Comptant' AND bc.id = ir.bon_id
      LEFT JOIN bons_commande bcmd ON ir.bon_type = 'Commande' AND bcmd.id = ir.bon_id
      LEFT JOIN contacts cs ON cs.id = COALESCE(bs.client_id, bc.client_id)
      LEFT JOIN contacts fs ON fs.id = bcmd.fournisseur_id
  WHERE ir.client_remise_id = ? AND ir.bon_id IS NOT NULL AND ir.statut <> 'Annulé'
      GROUP BY ir.bon_type, ir.bon_id
      ORDER BY date_creation DESC
      `,
      [id]
    );
    // Parse JSON arrays and guard nulls/driver differences
    const data = rows.map((r) => {
      let remisesArr = [];
      if (r.remises) {
        if (typeof r.remises === 'string') {
          try { remisesArr = JSON.parse(r.remises) || []; } catch { remisesArr = []; }
        } else if (Array.isArray(r.remises)) {
          remisesArr = r.remises;
        } else {
          // Fallback: try to stringify and parse
          try { remisesArr = JSON.parse(String(r.remises)); } catch { remisesArr = []; }
        }
      }
      remisesArr = remisesArr.filter((x) => x && x.item_remise_id != null);
      return { ...r, remises: remisesArr };
    });
    res.json(data);
  } catch (e) {
    console.error('remises bons error', e);
    res.status(500).json({ message: 'Erreur du serveur', detail: e?.message, code: e?.code });
  }
});

router.patch('/clients/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, phone, cin, note } = req.body;
    const fields = [], vals = [];
    for (const [k, v] of Object.entries({ nom, phone, cin, note })) {
      if (v !== undefined) { fields.push(`${k} = ?`); vals.push(v); }
    }
    if (!fields.length) return res.status(400).json({ message: 'Aucune modification' });
    vals.push(id);
    await pool.execute(`UPDATE client_remises SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [row] = await pool.execute('SELECT * FROM client_remises WHERE id = ?', [id]);
    if (!row.length) return res.status(404).json({ message: 'Introuvable' });
    res.json(row[0]);
  } catch (e) {
    console.error('remises clients update error', e);
    res.status(500).json({ message: 'Erreur du serveur', detail: e?.message, code: e?.code });
  }
});

router.delete('/clients/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    // Only PDG can delete a remise client
    if ((req.user?.role || '') !== 'PDG') {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    await pool.execute('DELETE FROM client_remises WHERE id = ?', [id]);
    res.json({ success: true, id: Number(id) });
  } catch (e) {
    console.error('remises clients delete error', e);
    res.status(500).json({ message: 'Erreur du serveur', detail: e?.message, code: e?.code });
  }
});

// ---- Items Remises CRUD -------------------------------------
router.get('/clients/:id/items', async (req, res) => {
  try {
    const { id } = req.params;

    // sécurité : vérifier l’existence d’item_remises
    if (!(await tableExists('item_remises'))) {
      return res.json([]); // ou res.status(200).json([]) pour éviter 500
    }

    const hasProducts = await tableExists('products');
  const sql = hasProducts
      ? `
    SELECT ir.*, CAST(p.id AS CHAR) AS reference, p.designation
        FROM item_remises ir
        LEFT JOIN products p ON ir.product_id = p.id
        WHERE ir.client_remise_id = ?
        ORDER BY ir.created_at DESC
      `
      : `
        SELECT ir.*, NULL AS reference, NULL AS designation
        FROM item_remises ir
        WHERE ir.client_remise_id = ?
        ORDER BY ir.created_at DESC
      `;

    const [rows] = await pool.execute(sql, [id]);
    res.json(rows);
  } catch (e) {
    console.error('remises items list error', e);
    res.status(500).json({ message: 'Erreur du serveur', detail: e?.message, code: e?.code });
  }
});

router.post('/clients/:id/items', verifyToken, async (req, res) => {
  try {
    const { id } = req.params; // client_remise_id
    let { product_id, qte, prix_remise, statut, bon_id, bon_type, is_achat } = req.body;
    if (!product_id) return res.status(400).json({ message: 'product_id requis' });

    const { finalBonId, finalBonType } = await resolveBonLink(bon_id, bon_type);

    // Employé cannot create validated items; force 'En attente'
    if ((req.user?.role || '') !== 'PDG') {
      statut = 'En attente';
    } else {
      statut = statut || 'En attente';
    }

    const [r] = await pool.execute(
      `INSERT INTO item_remises (client_remise_id, product_id, bon_id, bon_type, is_achat, qte, prix_remise, statut)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  [id, product_id, finalBonId, finalBonType, is_achat ? 1 : 0, qte ?? 0, prix_remise ?? 0, statut]
    );
    const [row] = await pool.execute('SELECT * FROM item_remises WHERE id = ?', [r.insertId]);
    res.status(201).json(row[0]);
  } catch (e) {
    console.error('remises items create error', e);
    res.status(500).json({ message: 'Erreur du serveur', detail: e?.message, code: e?.code });
  }
});

router.patch('/items/:itemId', verifyToken, async (req, res) => {
  try {
    const { itemId } = req.params;
  let { product_id, qte, prix_remise, statut, bon_id, bon_type, is_achat } = req.body;

    if (bon_id !== undefined && (bon_type === undefined || bon_type === null)) {
      const resolved = await resolveBonLink(bon_id, bon_type);
      bon_id = resolved.finalBonId;
      bon_type = resolved.finalBonType;
    }

    const fields = [], vals = [];
    // Employé cannot validate; ignore statut=Validé from Employé
    if ((req.user?.role || '') !== 'PDG' && statut === 'Validé') {
      statut = undefined;
    }

    for (const [k, v] of Object.entries({ product_id, qte, prix_remise, statut, bon_id, bon_type, is_achat })) {
      if (v !== undefined) { fields.push(`${k} = ?`); vals.push(v); }
    }
    if (!fields.length) return res.status(400).json({ message: 'Aucune modification' });
    vals.push(itemId);

    await pool.execute(`UPDATE item_remises SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [row] = await pool.execute('SELECT * FROM item_remises WHERE id = ?', [itemId]);
    if (!row.length) return res.status(404).json({ message: 'Introuvable' });
    res.json(row[0]);
  } catch (e) {
    console.error('remises items update error', e);
    res.status(500).json({ message: 'Erreur du serveur', detail: e?.message, code: e?.code });
  }
});

router.delete('/items/:itemId', verifyToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    // Only PDG can delete items
    if ((req.user?.role || '') !== 'PDG') {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    await pool.execute('DELETE FROM item_remises WHERE id = ?', [itemId]);
    res.json({ success: true, id: Number(itemId) });
  } catch (e) {
    console.error('remises items delete error', e);
    res.status(500).json({ message: 'Erreur du serveur', detail: e?.message, code: e?.code });
  }
});

export default router;
