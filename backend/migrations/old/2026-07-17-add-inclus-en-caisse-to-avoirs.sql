-- Colonne inclus_en_caisse sur les avoirs (avoirs_charge l'a déjà).
-- avoirs_comptant est déjà compté dans le fond de caisse : défaut 1 pour préserver le comportement existant.
-- inclus_en_caisse_at retient la date/heure où la case a été cochée : c'est ce jour-là (et non
-- le jour de création de l'avoir) qui sert à classer le montant dans le fond de caisse.
ALTER TABLE avoirs_client
  ADD COLUMN inclus_en_caisse TINYINT(1) NOT NULL DEFAULT 0 AFTER statut,
  ADD COLUMN inclus_en_caisse_at DATETIME NULL AFTER inclus_en_caisse;

ALTER TABLE avoirs_fournisseur
  ADD COLUMN inclus_en_caisse TINYINT(1) NOT NULL DEFAULT 0 AFTER statut,
  ADD COLUMN inclus_en_caisse_at DATETIME NULL AFTER inclus_en_caisse;

ALTER TABLE avoirs_comptant
  ADD COLUMN inclus_en_caisse TINYINT(1) NOT NULL DEFAULT 1 AFTER statut,
  ADD COLUMN inclus_en_caisse_at DATETIME NULL AFTER inclus_en_caisse;

ALTER TABLE avoirs_ecommerce
  ADD COLUMN inclus_en_caisse TINYINT(1) NOT NULL DEFAULT 0 AFTER statut,
  ADD COLUMN inclus_en_caisse_at DATETIME NULL AFTER inclus_en_caisse;

ALTER TABLE avoirs_charge
  ADD COLUMN inclus_en_caisse_at DATETIME NULL AFTER inclus_en_caisse;

-- Pour les lignes déjà cochées (avoirs_comptant par défaut à 1, ou avoirs_charge existants),
-- on initialise la date de cochage sur la date de création afin de ne rien perdre en historique.
UPDATE avoirs_comptant SET inclus_en_caisse_at = created_at WHERE inclus_en_caisse = 1 AND inclus_en_caisse_at IS NULL;
UPDATE avoirs_charge SET inclus_en_caisse_at = created_at WHERE inclus_en_caisse = 1 AND inclus_en_caisse_at IS NULL;
