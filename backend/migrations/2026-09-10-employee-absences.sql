-- Gestion des absences employés.
-- Une absence totale retient 100 DH sur le salaire du mois ; une absence
-- partielle retient la fraction de journée non travaillée (heure d'entrée).
-- Le serveur applique le même schéma au démarrage (ensureAbsenceSchema).

CREATE TABLE IF NOT EXISTS employe_absences (
  id INT NOT NULL AUTO_INCREMENT,
  employe_id INT NOT NULL,
  date_absence DATE NOT NULL,
  type_absence ENUM('totale','partielle') NOT NULL DEFAULT 'totale',
  heure_entree TIME NULL,
  montant_retenue DECIMAL(10,2) NOT NULL DEFAULT 0,
  motif VARCHAR(255) NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_absence_employe_date (employe_id, date_absence),
  KEY idx_absence_date (date_absence),
  KEY idx_absence_employe (employe_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Droits accordés par le PDG depuis la page des absences.
ALTER TABLE employees
  ADD COLUMN acces_gestion_absences TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE employees
  ADD COLUMN acces_statistiques_absences TINYINT(1) NOT NULL DEFAULT 0;
