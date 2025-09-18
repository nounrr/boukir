import { Router } from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// GET /api/access-schedules/detailed
// Récupérer tous les horaires détaillés par employé
router.get('/detailed', verifyToken, async (req, res, next) => {
  try {
    const [scheduleRows] = await pool.execute(`
      SELECT 
        asd.user_id,
        e.nom_complet as user_name,
        e.role as user_role,
        asd.day_of_week,
        asd.start_time,
        asd.end_time,
        asd.is_active
      FROM access_schedule_details asd
      JOIN employees e ON asd.user_id = e.id
      ORDER BY asd.user_id, asd.day_of_week
    `);

    // Grouper par utilisateur
    const groupedSchedules = scheduleRows.reduce((acc, row) => {
      const userId = row.user_id;
      
      if (!acc[userId]) {
        acc[userId] = {
          user_id: userId,
          user_name: row.user_name,
          user_role: row.user_role,
          schedules: []
        };
      }
      
      acc[userId].schedules.push({
        user_id: userId,
        day_of_week: row.day_of_week,
        start_time: row.start_time,
        end_time: row.end_time,
        is_active: Boolean(row.is_active)
      });
      
      return acc;
    }, {});

    // Convertir en array
    const result = Object.values(groupedSchedules);
    
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/access-schedules/detailed
// Ajouter ou mettre à jour un horaire pour un jour spécifique
router.post('/detailed', verifyToken, async (req, res, next) => {
  try {
    const { user_id, day_of_week, start_time, end_time, is_active = true } = req.body;

    if (!user_id || !day_of_week || !start_time || !end_time) {
      return res.status(400).json({
        message: 'user_id, day_of_week, start_time et end_time sont requis'
      });
    }

    // Vérifier que l'utilisateur existe
    const [userCheck] = await pool.execute(
      'SELECT id FROM employees WHERE id = ?',
      [user_id]
    );

    if (userCheck.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Insérer ou mettre à jour l'horaire
    await pool.execute(`
      INSERT INTO access_schedule_details 
      (user_id, day_of_week, start_time, end_time, is_active)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      start_time = VALUES(start_time),
      end_time = VALUES(end_time),
      is_active = VALUES(is_active),
      updated_at = CURRENT_TIMESTAMP
    `, [user_id, day_of_week, start_time, end_time, is_active]);

    res.json({ 
      message: 'Horaire sauvegardé avec succès',
      schedule: {
        user_id,
        day_of_week,
        start_time,
        end_time,
        is_active
      }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/access-schedules/detailed/:userId/:dayOfWeek
// Supprimer un horaire pour un jour spécifique
router.delete('/detailed/:userId/:dayOfWeek', verifyToken, async (req, res, next) => {
  try {
    const { userId, dayOfWeek } = req.params;

    const [result] = await pool.execute(
      'DELETE FROM access_schedule_details WHERE user_id = ? AND day_of_week = ?',
      [userId, dayOfWeek]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Horaire non trouvé' });
    }

    res.json({ message: 'Horaire supprimé avec succès' });
  } catch (err) {
    next(err);
  }
});

// GET /api/access-schedules/detailed/:userId
// Récupérer les horaires détaillés d'un utilisateur spécifique
router.get('/detailed/:userId', verifyToken, async (req, res, next) => {
  try {
    const { userId } = req.params;

    const [scheduleRows] = await pool.execute(`
      SELECT 
        asd.user_id,
        e.nom_complet as user_name,
        e.role as user_role,
        asd.day_of_week,
        asd.start_time,
        asd.end_time,
        asd.is_active
      FROM access_schedule_details asd
      JOIN employees e ON asd.user_id = e.id
      WHERE asd.user_id = ?
      ORDER BY asd.day_of_week
    `, [userId]);

    if (scheduleRows.length === 0) {
      return res.json({
        user_id: parseInt(userId),
        user_name: null,
        user_role: null,
        schedules: []
      });
    }

    const result = {
      user_id: scheduleRows[0].user_id,
      user_name: scheduleRows[0].user_name,
      user_role: scheduleRows[0].user_role,
      schedules: scheduleRows.map(row => ({
        user_id: row.user_id,
        day_of_week: row.day_of_week,
        start_time: row.start_time,
        end_time: row.end_time,
        is_active: Boolean(row.is_active)
      }))
    };

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/access-schedules/detailed/batch
// Mise à jour en lot des horaires pour un utilisateur
router.post('/detailed/batch', verifyToken, async (req, res, next) => {
  try {
    const { user_id, schedules } = req.body;

    if (!user_id || !Array.isArray(schedules)) {
      return res.status(400).json({
        message: 'user_id et schedules (array) sont requis'
      });
    }

    // Commencer une transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Supprimer tous les horaires existants pour cet utilisateur
      await connection.execute(
        'DELETE FROM access_schedule_details WHERE user_id = ?',
        [user_id]
      );

      // Insérer les nouveaux horaires
      for (const schedule of schedules) {
        if (schedule.day_of_week && schedule.start_time && schedule.end_time) {
          await connection.execute(`
            INSERT INTO access_schedule_details 
            (user_id, day_of_week, start_time, end_time, is_active)
            VALUES (?, ?, ?, ?, ?)
          `, [
            user_id,
            schedule.day_of_week,
            schedule.start_time,
            schedule.end_time,
            schedule.is_active ?? true
          ]);
        }
      }

      await connection.commit();
      connection.release();

      res.json({ 
        message: 'Horaires mis à jour avec succès',
        user_id,
        schedules_count: schedules.length
      });
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

export default router;