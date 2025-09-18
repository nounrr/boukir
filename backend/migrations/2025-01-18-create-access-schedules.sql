-- Migration pour créer la table des horaires d'accès
-- Date: 2025-01-18
-- Description: Table pour gérer les plages horaires d'accès à l'application par utilisateur

CREATE TABLE IF NOT EXISTS access_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    user_role ENUM('employee', 'manager', 'admin') NOT NULL DEFAULT 'employee',
    start_time TIME NOT NULL DEFAULT '08:00:00',
    end_time TIME NOT NULL DEFAULT '19:00:00',
    days_of_week JSON NOT NULL, -- 1=Lundi, 2=Mardi, ..., 7=Dimanche
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Colonnes pour le système de popup d'avertissement
    warning_minutes_before INT NOT NULL DEFAULT 15, -- Minutes d'avertissement avant expiration
    auto_logout_enabled BOOLEAN NOT NULL DEFAULT TRUE, -- Active/désactive l'auto-logout
    popup_warning_enabled BOOLEAN NOT NULL DEFAULT TRUE, -- Active/désactive le popup d'avertissement
    grace_period_minutes INT NOT NULL DEFAULT 5, -- Période de grâce après expiration
    
    -- Colonnes de session et tracking
    last_login_time TIMESTAMP NULL, -- Dernière connexion
    last_activity_time TIMESTAMP NULL, -- Dernière activité
    session_warning_sent BOOLEAN NOT NULL DEFAULT FALSE, -- Popup déjà envoyé pour cette session
    session_id VARCHAR(255) NULL, -- ID de session actuelle
    
    -- Métadonnées
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Index pour améliorer les performances
    INDEX idx_user_id (user_id),
    INDEX idx_active (is_active),
    INDEX idx_user_role (user_role),
    INDEX idx_session_id (session_id),
    INDEX idx_last_activity (last_activity_time),
    INDEX idx_warning_settings (warning_minutes_before, auto_logout_enabled),
    
    -- Contrainte pour éviter les doublons par utilisateur
    UNIQUE KEY unique_user_schedule (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ajouter quelques horaires d'exemple avec configuration popup
INSERT INTO access_schedules (
    user_id, user_name, user_role, start_time, end_time, days_of_week, is_active,
    warning_minutes_before, auto_logout_enabled, popup_warning_enabled, grace_period_minutes
) VALUES
(1, 'Admin User', 'admin', '00:00:00', '23:59:59', '[1,2,3,4,5,6,7]', TRUE, 30, TRUE, TRUE, 10),
(2, 'Manager Test', 'manager', '07:00:00', '20:00:00', '[1,2,3,4,5,6]', TRUE, 15, TRUE, TRUE, 5),
(3, 'Employee Test', 'employee', '08:00:00', '18:00:00', '[1,2,3,4,5]', TRUE, 10, TRUE, TRUE, 2)
ON DUPLICATE KEY UPDATE
user_name = VALUES(user_name),
user_role = VALUES(user_role),
warning_minutes_before = VALUES(warning_minutes_before),
auto_logout_enabled = VALUES(auto_logout_enabled),
popup_warning_enabled = VALUES(popup_warning_enabled),
grace_period_minutes = VALUES(grace_period_minutes);

-- Ajouter des commentaires pour documenter la table
ALTER TABLE access_schedules 
COMMENT = 'Table pour gérer les horaires d\'accès avec système de popup d\'avertissement et auto-logout';

-- Créer une table pour les logs d'activité et avertissements
CREATE TABLE IF NOT EXISTS access_activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    activity_type ENUM('login', 'logout', 'warning_sent', 'auto_logout', 'grace_period_used') NOT NULL,
    activity_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_id VARCHAR(255) NULL,
    details JSON NULL, -- Informations supplémentaires (temps restant, etc.)
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    
    -- Index pour recherche rapide
    INDEX idx_user_activity (user_id, activity_time),
    INDEX idx_session_logs (session_id),
    INDEX idx_activity_type (activity_type),
    
    -- Clé étrangère vers access_schedules
    FOREIGN KEY (user_id) REFERENCES access_schedules(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT = 'Logs d\'activité pour le système de contrôle d\'accès horaire';

-- Vérification que les tables ont été créées correctement
SELECT 'Tables access_schedules et access_activity_logs créées avec succès' as message;