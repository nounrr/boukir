import express from 'express';
import pool from '../db/pool.js';
import { verifyToken as auth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(auth, requireRole('PDG'));

// Récupérer tous les horaires d'accès
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        id,
        user_id,
        user_name,
        user_role,
        start_time,
        end_time,
        days_of_week,
        detailed_schedules,
        is_active,
        created_at,
        updated_at
      FROM access_schedules
      ORDER BY user_name ASC
    `);

    // Parser le JSON des jours de la semaine et horaires détaillés
    const schedules = rows.map(schedule => ({
      ...schedule,
      days_of_week: Array.isArray(schedule.days_of_week) ? schedule.days_of_week : JSON.parse(schedule.days_of_week || '[1,2,3,4,5]'),
      detailed_schedules: schedule.detailed_schedules ? 
        (typeof schedule.detailed_schedules === 'object' ? schedule.detailed_schedules : JSON.parse(schedule.detailed_schedules)) 
        : null
    }));

    res.json(schedules);
  } catch (error) {
    console.error('Erreur récupération horaires:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération des horaires' });
  }
});

// Récupérer l'horaire d'un utilisateur spécifique
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [rows] = await pool.execute(`
      SELECT 
        id,
        user_id,
        user_name,
        user_role,
        start_time,
        end_time,
        days_of_week,
        detailed_schedules,
        is_active,
        created_at,
        updated_at
      FROM access_schedules
      WHERE user_id = ?
    `, [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Aucun horaire trouvé pour cet utilisateur' });
    }

    const schedule = {
      ...rows[0],
      days_of_week: Array.isArray(rows[0].days_of_week) ? rows[0].days_of_week : JSON.parse(rows[0].days_of_week || '[1,2,3,4,5]'),
      detailed_schedules: rows[0].detailed_schedules ? 
        (typeof rows[0].detailed_schedules === 'object' ? rows[0].detailed_schedules : JSON.parse(rows[0].detailed_schedules)) 
        : null
    };

    res.json(schedule);
  } catch (error) {
    console.error('Erreur récupération horaire utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération de l\'horaire' });
  }
});

// Créer ou mettre à jour un horaire d'accès
router.post('/', auth, async (req, res) => {
  try {
    const {
      user_id,
      user_name,
      user_role,
      start_time,
      end_time,
      days_of_week,
      detailed_schedules,
      is_active
    } = req.body;

    // Validation des données
    if (!user_id || !user_name || !start_time || !end_time || !Array.isArray(days_of_week)) {
      return res.status(400).json({ 
        error: 'Données manquantes: user_id, user_name, start_time, end_time et days_of_week sont requis' 
      });
    }

    // Vérifier que les heures sont valides
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
      return res.status(400).json({ error: 'Format d\'heure invalide (HH:MM attendu)' });
    }

    // Vérifier que les jours sont valides (1-7)
    const validDays = days_of_week.every(day => day >= 1 && day <= 7);
    if (!validDays) {
      return res.status(400).json({ error: 'Jours de la semaine invalides (1-7 attendus)' });
    }

    // Convertir les jours en JSON
    const daysJson = JSON.stringify(days_of_week);
    const detailedJson = detailed_schedules ? JSON.stringify(detailed_schedules) : null;

    // Toujours créer une nouvelle règle (pas de vérification d'unicité)
    const [result] = await pool.execute(`
      INSERT INTO access_schedules (user_id, user_name, user_role, start_time, end_time, days_of_week, detailed_schedules, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [user_id, user_name, user_role, start_time, end_time, daysJson, detailedJson, is_active]);

    res.status(201).json({
      message: 'Nouvelle règle créée avec succès',
      id: result.insertId,
      user_id,
      user_name,
      user_role,
      start_time,
      end_time,
      days_of_week,
      detailed_schedules,
      is_active
    });
  } catch (error) {
    console.error('Erreur création/mise à jour horaire:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Un horaire existe déjà pour cet utilisateur' });
    } else {
      res.status(500).json({ error: 'Erreur serveur lors de la sauvegarde de l\'horaire' });
    }
  }
});

// Mettre à jour un horaire spécifique
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      user_name,
      user_role,
      start_time,
      end_time,
      days_of_week,
      detailed_schedules,
      is_active
    } = req.body;

    console.log('🔧 PUT /api/access-schedules/:id - Début mise à jour');
    console.log('ID:', id);
    console.log('Données reçues:', {
      user_name,
      user_role,
      start_time,
      end_time,
      days_of_week,
      detailed_schedules,
      is_active
    });

    // Validation des données
    if (!start_time || !end_time || !Array.isArray(days_of_week)) {
      console.log('❌ Validation échouée - données manquantes');
      return res.status(400).json({ 
        error: 'Données manquantes: start_time, end_time et days_of_week sont requis' 
      });
    }

    // Vérifier que l'horaire existe et récupérer ses données
    const [existing] = await pool.execute(
      'SELECT user_id, user_name, user_role FROM access_schedules WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      console.log('❌ Horaire non trouvé pour ID:', id);
      return res.status(404).json({ error: 'Horaire non trouvé' });
    }

    console.log('✅ Horaire trouvé:', existing[0]);

    // Utiliser les valeurs existantes si non fournies
    const finalUserName = user_name || existing[0].user_name;
    const finalUserRole = user_role || existing[0].user_role;

    // Convertir les jours en JSON
    const daysJson = JSON.stringify(days_of_week);
    const detailedJson = detailed_schedules ? JSON.stringify(detailed_schedules) : null;

    console.log('📝 Valeurs finales:', { 
      finalUserName, 
      finalUserRole, 
      daysJson, 
      detailedJson 
    });

    // Mettre à jour l'horaire
    const [result] = await pool.execute(`
      UPDATE access_schedules 
      SET user_name = ?, user_role = ?, start_time = ?, end_time = ?, 
          days_of_week = ?, detailed_schedules = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [finalUserName, finalUserRole, start_time, end_time, daysJson, detailedJson, is_active, id]);

    console.log('🔄 Résultat UPDATE:', {
      affectedRows: result.affectedRows,
      changedRows: result.changedRows
    });

    if (result.affectedRows === 0) {
      console.log('❌ Aucune ligne mise à jour');
      return res.status(404).json({ error: 'Horaire non trouvé' });
    }

    console.log('✅ Mise à jour réussie');
    res.json({
      message: 'Horaire mis à jour avec succès',
      id: parseInt(id),
      user_id: existing[0].user_id,
      user_name: finalUserName,
      user_role: finalUserRole,
      start_time,
      end_time,
      days_of_week,
      detailed_schedules,
      is_active
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour horaire:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la mise à jour de l\'horaire' });
  }
});

// Supprimer un horaire
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que l'horaire existe
    const [existing] = await pool.execute(
      'SELECT user_name FROM access_schedules WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Horaire non trouvé' });
    }

    // Supprimer l'horaire
    const [result] = await pool.execute(
      'DELETE FROM access_schedules WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Horaire non trouvé' });
    }

    res.json({
      message: 'Horaire supprimé avec succès',
      deleted_user: existing[0].user_name
    });
  } catch (error) {
    console.error('Erreur suppression horaire:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la suppression de l\'horaire' });
  }
});

// Créer/Mettre à jour en lot (pour la sélection multiple)
router.post('/batch', auth, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { users, schedule_config } = req.body;
    
    if (!Array.isArray(users) || !schedule_config) {
      return res.status(400).json({ 
        error: 'Format invalide: users (array) et schedule_config (object) requis' 
      });
    }

    const {
      start_time,
      end_time,
      days_of_week,
      detailed_schedules,
      is_active
    } = schedule_config;

    // Validation
    if (!start_time || !end_time || !Array.isArray(days_of_week)) {
      return res.status(400).json({ 
        error: 'Configuration invalide: start_time, end_time et days_of_week requis' 
      });
    }

    await connection.beginTransaction();

    const results = [];
    const daysJson = JSON.stringify(days_of_week);
    const detailedJson = detailed_schedules ? JSON.stringify(detailed_schedules) : null;

    for (const user of users) {
      const { user_id, user_name, user_role } = user;
      
      if (!user_id || !user_name) {
        continue; // Ignorer les utilisateurs invalides
      }

      try {
        // Vérifier si un horaire existe
        const [existing] = await connection.execute(
          'SELECT id FROM access_schedules WHERE user_id = ?',
          [user_id]
        );

        if (existing.length > 0) {
          // Mettre à jour
          await connection.execute(`
            UPDATE access_schedules 
            SET user_name = ?, user_role = ?, start_time = ?, end_time = ?, 
                days_of_week = ?, detailed_schedules = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
          `, [user_name, user_role, start_time, end_time, daysJson, detailedJson, is_active, user_id]);

          results.push({
            user_id,
            user_name,
            action: 'updated'
          });
        } else {
          // Créer
          await connection.execute(`
            INSERT INTO access_schedules (user_id, user_name, user_role, start_time, end_time, days_of_week, detailed_schedules, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [user_id, user_name, user_role, start_time, end_time, daysJson, detailedJson, is_active]);

          results.push({
            user_id,
            user_name,
            action: 'created'
          });
        }
      } catch (userError) {
        console.error(`Erreur pour utilisateur ${user_id}:`, userError);
        results.push({
          user_id,
          user_name,
          action: 'error',
          error: userError.message
        });
      }
    }

    await connection.commit();

    res.json({
      message: 'Traitement en lot terminé',
      results,
      summary: {
        total: users.length,
        created: results.filter(r => r.action === 'created').length,
        updated: results.filter(r => r.action === 'updated').length,
        errors: results.filter(r => r.action === 'error').length
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur traitement en lot:', error);
    res.status(500).json({ error: 'Erreur serveur lors du traitement en lot' });
  } finally {
    connection.release();
  }
});

// Vérifier l'accès d'un utilisateur à l'heure actuelle
router.get('/check/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [rows] = await pool.execute(`
      SELECT start_time, end_time, days_of_week, is_active
      FROM access_schedules
      WHERE user_id = ? AND is_active = 1
    `, [userId]);

    if (rows.length === 0) {
      return res.json({
        hasAccess: true, // Par défaut, accès autorisé si pas de configuration
        reason: 'Aucune restriction configurée'
      });
    }

    const schedule = rows[0];
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // Convertir dimanche de 0 à 7
    const currentTime = now.toTimeString().slice(0, 5); // Format HH:MM

    const allowedDays = JSON.parse(schedule.days_of_week || '[1,2,3,4,5]');
    
    // Vérifier le jour
    if (!allowedDays.includes(currentDay)) {
      return res.json({
        hasAccess: false,
        reason: 'Accès non autorisé ce jour'
      });
    }

    // Vérifier l'heure
    const startTime = schedule.start_time.slice(0, 5);
    const endTime = schedule.end_time.slice(0, 5);
    
    if (currentTime < startTime || currentTime > endTime) {
      return res.json({
        hasAccess: false,
        reason: `Accès autorisé de ${startTime} à ${endTime}`
      });
    }

    res.json({
      hasAccess: true,
      reason: 'Accès autorisé'
    });
  } catch (error) {
    console.error('Erreur vérification accès:', error);
    res.status(500).json({ 
      hasAccess: true, // En cas d'erreur, autoriser l'accès par sécurité
      reason: 'Erreur de vérification, accès autorisé par défaut'
    });
  }
});

// Route de débogage pour vérifier les fuseaux horaires
router.get('/debug/timezone', auth, async (req, res) => {
  try {
    const { getTimezoneDebugInfo } = await import('../utils/timeUtils.js');
    const debugInfo = getTimezoneDebugInfo();
    
    res.json({
      message: 'Informations de fuseau horaire',
      ...debugInfo,
      note: 'Le système utilise le fuseau horaire Africa/Casablanca (Maroc)'
    });
  } catch (error) {
    console.error('Erreur debug timezone:', error);
    res.status(500).json({ error: 'Erreur lors du debug des fuseaux horaires' });
  }
});

export default router;
