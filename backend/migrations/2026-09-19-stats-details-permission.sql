-- Autorisation "statistiques détaillées" (page /reports/details).
-- Par défaut, seul le PDG consulte les statistiques détaillées (produits,
-- clients, marges, profits). Le PDG peut désigner des employés autorisés à
-- ouvrir cette page depuis la page Statistiques détaillées elle-même.
-- Le serveur applique le même schéma au démarrage (ensureStatsDetailsPermissionSchema).

ALTER TABLE employees
  ADD COLUMN acces_statistiques_details TINYINT(1) NOT NULL DEFAULT 0;
