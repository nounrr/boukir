import pool from '../db/pool.js';
import { getCurrentMoroccoTimeString, getCurrentMoroccoDayOfWeek, checkAccessWithMoroccoTime } from '../utils/timeUtils.js';

const ensureState = { done: false, inFlight: null };

export async function ensureAccessScheduleTables(db = pool) {
  if (ensureState.done) return;
  if (ensureState.inFlight) {
    await ensureState.inFlight;
    return;
  }

  ensureState.inFlight = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS access_schedules (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        user_role VARCHAR(50) NOT NULL DEFAULT 'employee',
        start_time TIME NOT NULL DEFAULT '08:00:00',
        end_time TIME NOT NULL DEFAULT '19:00:00',
        days_of_week JSON NOT NULL,
        detailed_schedules JSON NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        warning_minutes_before INT NOT NULL DEFAULT 15,
        auto_logout_enabled TINYINT(1) NOT NULL DEFAULT 1,
        popup_warning_enabled TINYINT(1) NOT NULL DEFAULT 1,
        grace_period_minutes INT NOT NULL DEFAULT 5,
        last_login_time TIMESTAMP NULL,
        last_activity_time TIMESTAMP NULL,
        session_warning_sent TINYINT(1) NOT NULL DEFAULT 0,
        session_id VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_access_schedules_user_id (user_id),
        KEY idx_access_schedules_active (is_active),
        KEY idx_access_schedules_session_id (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [cols] = await db.query("SHOW COLUMNS FROM access_schedules LIKE 'detailed_schedules'");
    if (!Array.isArray(cols) || cols.length === 0) {
      await db.query('ALTER TABLE access_schedules ADD COLUMN detailed_schedules JSON NULL AFTER days_of_week');
    }

    ensureState.done = true;
  })();

  try {
    await ensureState.inFlight;
  } finally {
    ensureState.inFlight = null;
  }
}

/**
 * Middleware pour vérifier les horaires d'accès d'un utilisateur
 * Vérifie si l'utilisateur peut accéder à l'application selon ses horaires configurés
 */
export const checkAccessSchedule = async (req, res, next) => {
  try {
    // Récupérer l'ID utilisateur depuis le token décodé
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'Token invalide ou utilisateur non trouvé',
        access_denied: true,
        reason: 'Authentification requise'
      });
    }

    // Récupérer l'horaire d'accès de l'utilisateur
    await ensureAccessScheduleTables();

    const [scheduleRows] = await pool.execute(`
      SELECT start_time, end_time, days_of_week, detailed_schedules, is_active
      FROM access_schedules
      WHERE user_id = ? AND is_active = 1
    `, [userId]);

    // Si aucun horaire configuré, autoriser l'accès (par défaut)
    if (scheduleRows.length === 0) {
      return next();
    }

    const schedule = scheduleRows[0];
    
    // Utiliser l'heure du Maroc pour la vérification
    const currentDay = getCurrentMoroccoDayOfWeek();
    const currentTime = getCurrentMoroccoTimeString();

    try {
      // MySQL retourne déjà un array JavaScript pour les colonnes JSON
      const allowedDays = Array.isArray(schedule.days_of_week) 
        ? schedule.days_of_week 
        : JSON.parse(schedule.days_of_week || '[1,2,3,4,5]');
      
      // Récupérer les horaires détaillés si disponibles
      const detailedSchedules = schedule.detailed_schedules 
        ? (Array.isArray(schedule.detailed_schedules) 
           ? schedule.detailed_schedules 
           : JSON.parse(schedule.detailed_schedules))
        : null;
      
      // Vérifier le jour
      if (!allowedDays.includes(currentDay)) {
        return res.status(403).json({
          error: 'Accès refusé - Jour non autorisé',
          access_denied: true,
          reason: 'Accès non autorisé ce jour',
          current_day: currentDay,
          allowed_days: allowedDays,
          current_time: currentTime
        });
      }

      // Déterminer les heures d'accès pour le jour actuel
      let startTime, endTime;
      
      if (detailedSchedules && detailedSchedules[currentDay]) {
        // Utiliser les horaires détaillés pour ce jour
        const daySchedule = detailedSchedules[currentDay];
        startTime = daySchedule.start_time.slice(0, 5);
        endTime = daySchedule.end_time.slice(0, 5);
      } else {
        // Utiliser les horaires généraux
        startTime = schedule.start_time.slice(0, 5);
        endTime = schedule.end_time.slice(0, 5);
      }
      
      // Vérifier l'heure
      if (currentTime < startTime || currentTime > endTime) {
        return res.status(403).json({
          error: 'Accès refusé - Heure non autorisée',
          access_denied: true,
          reason: `Accès autorisé de ${startTime} à ${endTime}`,
          current_time: currentTime,
          allowed_start: startTime,
          allowed_end: endTime
        });
      }

      // Accès autorisé
      next();
    } catch (parseError) {
      console.error('Erreur parsing jours autorisés:', parseError);
      return res.status(503).json({
        error: 'Configuration des horaires invalide',
        access_denied: true,
        reason: 'Vérification des horaires indisponible'
      });
    }
  } catch (error) {
    console.error('Erreur middleware horaires d\'accès:', error);
    
    return res.status(503).json({
      error: 'Vérification des horaires indisponible',
      access_denied: true
    });
  }
};

/**
 * Middleware optionnel pour les routes sensibles
 * Plus strict - refuse l'accès en cas d'erreur
 */
export const checkAccessScheduleStrict = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'Token invalide',
        access_denied: true 
      });
    }

    await ensureAccessScheduleTables();

    const [scheduleRows] = await pool.execute(`
      SELECT start_time, end_time, days_of_week, detailed_schedules, is_active
      FROM access_schedules
      WHERE user_id = ?
    `, [userId]);

    // Si aucun horaire configuré, autoriser l'accès
    if (scheduleRows.length === 0) {
      return next();
    }

    const schedule = scheduleRows[0];
    
    // Si l'horaire est désactivé, refuser l'accès
    if (!schedule.is_active) {
      return res.status(403).json({
        error: 'Accès refusé - Horaire désactivé',
        access_denied: true,
        reason: 'Votre accès a été temporairement désactivé'
      });
    }

    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay();
    const currentTime = now.toTimeString().slice(0, 5);

    // MySQL retourne déjà un array JavaScript pour les colonnes JSON
    const allowedDays = Array.isArray(schedule.days_of_week) 
      ? schedule.days_of_week 
      : JSON.parse(schedule.days_of_week || '[1,2,3,4,5]');
    
    // Récupérer les horaires détaillés si disponibles
    const detailedSchedules = schedule.detailed_schedules 
      ? (Array.isArray(schedule.detailed_schedules) 
         ? schedule.detailed_schedules 
         : JSON.parse(schedule.detailed_schedules))
      : null;
    
    // Vérifications strictes
    if (!allowedDays.includes(currentDay)) {
      return res.status(403).json({
        error: 'Accès refusé - Jour non autorisé',
        access_denied: true,
        reason: 'Accès non autorisé ce jour'
      });
    }

    // Déterminer les heures d'accès pour le jour actuel
    let startTime, endTime;
    
    if (detailedSchedules && detailedSchedules[currentDay]) {
      // Utiliser les horaires détaillés pour ce jour
      const daySchedule = detailedSchedules[currentDay];
      startTime = daySchedule.start_time.slice(0, 5);
      endTime = daySchedule.end_time.slice(0, 5);
    } else {
      // Utiliser les horaires généraux
      startTime = schedule.start_time.slice(0, 5);
      endTime = schedule.end_time.slice(0, 5);
    }
    
    if (currentTime < startTime || currentTime > endTime) {
      return res.status(403).json({
        error: 'Accès refusé - Heure non autorisée',
        access_denied: true,
        reason: `Accès autorisé de ${startTime} à ${endTime}`
      });
    }

    next();
  } catch (error) {
    console.error('Erreur middleware strict horaires:', error);
    return res.status(500).json({
      error: 'Erreur de vérification des horaires',
      access_denied: true
    });
  }
};

/**
 * Fonction utilitaire pour vérifier l'accès programmatiquement
 */
export const checkUserAccess = async (userId) => {
  try {
    await ensureAccessScheduleTables();

    const [scheduleRows] = await pool.execute(`
      SELECT start_time, end_time, days_of_week, detailed_schedules, is_active
      FROM access_schedules
      WHERE user_id = ? AND is_active = 1
    `, [userId]);

    if (scheduleRows.length === 0) {
      return { hasAccess: true, reason: 'Aucune restriction configurée' };
    }

    const schedule = scheduleRows[0];
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay();
    const currentTime = now.toTimeString().slice(0, 5);

    // MySQL retourne déjà un array JavaScript pour les colonnes JSON
    const allowedDays = Array.isArray(schedule.days_of_week) 
      ? schedule.days_of_week 
      : JSON.parse(schedule.days_of_week || '[1,2,3,4,5]');
    
    // Récupérer les horaires détaillés si disponibles
    const detailedSchedules = schedule.detailed_schedules 
      ? (Array.isArray(schedule.detailed_schedules) 
         ? schedule.detailed_schedules 
         : JSON.parse(schedule.detailed_schedules))
      : null;
    
    if (!allowedDays.includes(currentDay)) {
      return { hasAccess: false, reason: 'Accès non autorisé ce jour' };
    }

    // Déterminer les heures d'accès pour le jour actuel
    let startTime, endTime;
    
    if (detailedSchedules && detailedSchedules[currentDay]) {
      // Utiliser les horaires détaillés pour ce jour
      const daySchedule = detailedSchedules[currentDay];
      startTime = daySchedule.start_time.slice(0, 5);
      endTime = daySchedule.end_time.slice(0, 5);
    } else {
      // Utiliser les horaires généraux
      startTime = schedule.start_time.slice(0, 5);
      endTime = schedule.end_time.slice(0, 5);
    }
    
    if (currentTime < startTime || currentTime > endTime) {
      return { 
        hasAccess: false, 
        reason: `Accès autorisé de ${startTime} à ${endTime}` 
      };
    }

    return { hasAccess: true, reason: 'Accès autorisé' };
  } catch (error) {
    console.error('Erreur vérification accès:', error);
    throw error;
  }
};
