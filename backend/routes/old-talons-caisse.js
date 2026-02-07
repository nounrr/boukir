import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/old-talons-caisse/paged - Récupérer des anciens talons caisse avec pagination + stats calculées
router.get('/paged', verifyToken, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(limitRaw || 50, 1), 5000);
    const offset = (page - 1) * limit;

    const q = String(req.query.q || '').trim();
    const date = String(req.query.date || '').trim();
    const mode = String(req.query.mode || 'all').trim();
    const onlyDueSoon = String(req.query.onlyDueSoon || 'false') === 'true';
    const talonId = String(req.query.talonId || '').trim();

    const statusParam = req.query.status;
    const statuses = Array.isArray(statusParam)
      ? statusParam.flatMap((s) => String(s).split(',').map((x) => x.trim()).filter(Boolean))
      : String(statusParam || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

    const sortField = String(req.query.sortField || '').trim();
    const sortDir = String(req.query.sortDir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const where = [];
    const params = [];

    // Mode filter: old talons caisse sont tous des chèques
    if (mode && mode !== 'all' && mode !== 'Chèque') {
      where.push('0 = 1');
    }

    if (q) {
      const term = `%${q.toLowerCase()}%`;
      where.push(`(
        LOWER(CONCAT('old', LPAD(otc.id, 2, '0'))) LIKE ? OR
        CAST(otc.id AS CHAR) LIKE ? OR
        LOWER(COALESCE(otc.fournisseur, '')) LIKE ? OR
        LOWER(COALESCE(otc.numero_cheque, '')) LIKE ? OR
        LOWER(COALESCE(otc.validation, '')) LIKE ? OR
        LOWER(COALESCE(t.nom, '')) LIKE ? OR
        CAST(COALESCE(otc.montant_cheque, 0) AS CHAR) LIKE ? OR
        LOWER(COALESCE(otc.personne, '')) LIKE ? OR
        LOWER(COALESCE(otc.factures, '')) LIKE ? OR
        LOWER(COALESCE(otc.disponible, '')) LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term, term, term, term);
    }

    if (date) {
      where.push('DATE(otc.date_paiement) = ?');
      params.push(date);
    }

    if (statuses.length > 0) {
      where.push(`otc.validation IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }

    if (talonId) {
      where.push('otc.id_talon = ?');
      params.push(parseInt(talonId, 10) || talonId);
    }

    if (onlyDueSoon) {
      where.push(
        "otc.validation <> 'Validé' AND otc.date_cheque IS NOT NULL AND DATEDIFF(DATE(otc.date_cheque), CURDATE()) <= 5"
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sortMap = {
      numero: 'otc.id',
      talon: 't.nom',
      montant: 'otc.montant_cheque',
      date: 'otc.date_paiement',
      echeance: 'otc.date_cheque',
    };

    let orderBySql = '';
    if (sortField && sortMap[sortField]) {
      orderBySql = `ORDER BY ${sortMap[sortField]} ${sortDir}`;
    } else {
      // Default sorting: prioriser les échéances proches, puis trier par date d'échéance croissante
      orderBySql = `ORDER BY
        (CASE
          WHEN otc.validation <> 'Validé'
           AND otc.date_cheque IS NOT NULL
           AND DATEDIFF(DATE(otc.date_cheque), CURDATE()) <= 5
          THEN 0 ELSE 1
        END) ASC,
        DATE(otc.date_cheque) ASC,
        DATE(otc.date_paiement) DESC,
        otc.created_at DESC`;
    }

    const baseFromSql = `
      FROM old_talons_caisse otc
      LEFT JOIN talons t ON t.id = otc.id_talon
      ${whereSql}
    `;

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS count ${baseFromSql}`,
      params
    );
    const totalItems = Number(countRows?.[0]?.count || 0);
    const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / limit);

    const [statsRows] = await pool.execute(
      `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN otc.validation = 'Validé' THEN 1 ELSE 0 END) AS valides,
          SUM(CASE WHEN otc.validation = 'En attente' THEN 1 ELSE 0 END) AS enAttente,
          COALESCE(SUM(COALESCE(otc.montant_cheque, 0)), 0) AS montantTotal,
          SUM(
            CASE
              WHEN otc.validation <> 'Validé'
               AND otc.date_cheque IS NOT NULL
               AND DATEDIFF(DATE(otc.date_cheque), CURDATE()) <= 5
              THEN 1 ELSE 0
            END
          ) AS echeanceProche
        ${baseFromSql}
      `,
      params
    );

    const stats = statsRows?.[0] || {};

    // NOTE: certains serveurs MySQL (et/ou mysql2) ont des soucis avec les placeholders
    // dans LIMIT/OFFSET en prepared statements. On injecte ici des entiers bornés.
    const [rows] = await pool.execute(
      `
        SELECT otc.*, t.nom AS talon_nom
        ${baseFromSql}
        ${orderBySql}
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}
      `,
      params
    );

    res.json({
      data: rows,
      pagination: { page, limit, totalItems, totalPages },
      stats: {
        total: Number(stats.total || 0),
        validés: Number(stats.valides || 0),
        enAttente: Number(stats.enAttente || 0),
        montantTotal: Number(stats.montantTotal || 0),
        echeanceProche: Number(stats.echeanceProche || 0),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération paginée des anciens talons caisse:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération paginée des anciens talons caisse',
      error: error.message,
    });
  }
});

// GET /api/old-talons-caisse - Récupérer tous les anciens talons caisse
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT * FROM old_talons_caisse 
      ORDER BY date_paiement DESC, created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des anciens talons caisse:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des anciens talons caisse',
      error: error.message 
    });
  }
});

// GET /api/old-talons-caisse/:id - Récupérer un ancien talon caisse par ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT * FROM old_talons_caisse WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Ancien talon caisse introuvable' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'ancien talon caisse:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération de l\'ancien talon caisse',
      error: error.message 
    });
  }
});

// POST /api/old-talons-caisse - Créer un nouvel ancien talon caisse
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      date_paiement,
      fournisseur,
      montant_cheque,
      date_cheque,
      numero_cheque,
      validation = 'En attente',
      banque,
      personne,
      factures,
      disponible,
      id_talon
    } = req.body;

    // Validation des champs obligatoires
    if (  !id_talon) {
      return res.status(400).json({ 
        message: 'Les champs date_paiement, fournisseur, montant_cheque, date_cheque et id_talon sont obligatoires' 
      });
    }

    // Vérifier que le talon existe
    const [talonExists] = await pool.execute(
      'SELECT id FROM talons WHERE id = ?',
      [id_talon]
    );

    if (talonExists.length === 0) {
      return res.status(400).json({ message: 'Le talon spécifié n\'existe pas' });
    }

    const [result] = await pool.execute(`
      INSERT INTO old_talons_caisse (
        date_paiement, fournisseur, montant_cheque, date_cheque, 
        numero_cheque, validation, banque, personne, factures, disponible, id_talon
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      date_paiement, 
      fournisseur, 
      montant_cheque, 
      date_cheque, 
      numero_cheque || null, 
      validation || 'En attente', 
      banque || null, 
      personne || null, 
      factures || null, 
      disponible || null, 
      id_talon
    ]);

    // Récupérer l'enregistrement créé
    const [newRecord] = await pool.execute(
      'SELECT * FROM old_talons_caisse WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'Ancien talon caisse créé avec succès',
      data: newRecord[0]
    });
  } catch (error) {
    console.error('Erreur lors de la création de l\'ancien talon caisse:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la création de l\'ancien talon caisse',
      error: error.message 
    });
  }
});

// PUT /api/old-talons-caisse/:id - Modifier un ancien talon caisse
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      date_paiement,
      fournisseur,
      montant_cheque,
      date_cheque,
      numero_cheque,
      validation,
      banque,
      personne,
      factures,
      disponible,
      id_talon
    } = req.body;

    // Vérifier que l'enregistrement existe
    const [existing] = await pool.execute(
      'SELECT * FROM old_talons_caisse WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Ancien talon caisse introuvable' });
    }

    // Si id_talon est modifié, vérifier qu'il existe
    if (id_talon) {
      const [talonExists] = await pool.execute(
        'SELECT id FROM talons WHERE id = ?',
        [id_talon]
      );

      if (talonExists.length === 0) {
        return res.status(400).json({ message: 'Le talon spécifié n\'existe pas' });
      }
    }

    await pool.execute(`
      UPDATE old_talons_caisse SET 
        date_paiement = COALESCE(?, date_paiement),
        fournisseur = COALESCE(?, fournisseur),
        montant_cheque = COALESCE(?, montant_cheque),
        date_cheque = COALESCE(?, date_cheque),
        numero_cheque = COALESCE(?, numero_cheque),
        validation = COALESCE(?, validation),
        banque = COALESCE(?, banque),
        personne = COALESCE(?, personne),
        factures = COALESCE(?, factures),
        disponible = COALESCE(?, disponible),
        id_talon = COALESCE(?, id_talon),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      date_paiement || null, 
      fournisseur || null, 
      montant_cheque || null, 
      date_cheque || null, 
      numero_cheque || null, 
      validation || null, 
      banque || null, 
      personne || null, 
      factures || null, 
      disponible || null, 
      id_talon || null, 
      id
    ]);

    // Récupérer l'enregistrement mis à jour
    const [updatedRecord] = await pool.execute(
      'SELECT * FROM old_talons_caisse WHERE id = ?',
      [id]
    );

    res.json({
      message: 'Ancien talon caisse mis à jour avec succès',
      data: updatedRecord[0]
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'ancien talon caisse:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la mise à jour de l\'ancien talon caisse',
      error: error.message 
    });
  }
});

// DELETE /api/old-talons-caisse/:id - Supprimer un ancien talon caisse
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier que l'enregistrement existe
    const [existing] = await pool.execute(
      'SELECT * FROM old_talons_caisse WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Ancien talon caisse introuvable' });
    }

    await pool.execute('DELETE FROM old_talons_caisse WHERE id = ?', [id]);
    
    res.json({ message: 'Ancien talon caisse supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'ancien talon caisse:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la suppression de l\'ancien talon caisse',
      error: error.message 
    });
  }
});

// PUT /api/old-talons-caisse/:id/status - Changer le statut d'un ancien talon caisse
router.put('/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { validation } = req.body;

    if (!validation || !['Validé', 'En attente', 'Refusé', 'Annulé'].includes(validation)) {
      return res.status(400).json({ 
        message: 'Statut invalide. Valeurs acceptées: Validé, En attente, Refusé, Annulé' 
      });
    }

    // Vérifier que l'enregistrement existe
    const [existing] = await pool.execute(
      'SELECT * FROM old_talons_caisse WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Ancien talon caisse introuvable' });
    }

    await pool.execute(
      'UPDATE old_talons_caisse SET validation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [validation, id]
    );

    // Récupérer l'enregistrement mis à jour
    const [updatedRecord] = await pool.execute(
      'SELECT * FROM old_talons_caisse WHERE id = ?',
      [id]
    );

    res.json({
      message: `Statut mis à jour: ${validation}`,
      data: updatedRecord[0]
    });
  } catch (error) {
    console.error('Erreur lors du changement de statut:', error);
    res.status(500).json({ 
      message: 'Erreur lors du changement de statut',
      error: error.message 
    });
  }
});

export default router;
