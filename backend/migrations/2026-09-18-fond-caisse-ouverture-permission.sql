-- Autorisation "ouverture du fond de caisse".
-- Le PDG peut désigner des employés autorisés uniquement à saisir le fond
-- initial de la caisse (montant, mode, date/heure) sans consulter les
-- données, calculs ni détails du fond de caisse, qui restent réservés au PDG.
-- Le serveur applique le même schéma au démarrage (ensureFondCaissePermissionSchema).

ALTER TABLE employees
  ADD COLUMN acces_ouverture_fond_caisse TINYINT(1) NOT NULL DEFAULT 0;
