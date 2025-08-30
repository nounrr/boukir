import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

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
