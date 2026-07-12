-- Scenario complet de test fond caisse.
-- Relancable: supprime d'abord les lignes creees par ce scenario le jour courant.
--
-- Montant caisse attendu a la fin:
--   1000.00 fond initial
-- + 8999.00 entrees
-- - 1640.00 sorties
-- = 8359.00
--
-- Coffre attendu:
--   300.00 fond initial coffre
-- + 400.00 transfert caisse -> coffre
-- -  50.00 transfert coffre -> poche
-- = 650.00

SET @tag := 'FC_TEST_FOND_CAISSE';
SET @today := CURRENT_DATE();
SET @old_day := DATE_SUB(@today, INTERVAL 30 DAY);
SET @employee_id := (SELECT id FROM employees ORDER BY id LIMIT 1);
SET @client_id := (SELECT id FROM contacts WHERE type = 'Client' ORDER BY id LIMIT 1);
SET @fournisseur_id := (SELECT id FROM contacts WHERE type = 'Fournisseur' ORDER BY id LIMIT 1);
SET @vehicule_id := (SELECT id FROM vehicules ORDER BY id LIMIT 1);

DELETE p
  FROM payments p
 WHERE p.designation LIKE BINARY CONCAT(@tag, '%')
    OR p.numero LIKE BINARY CONCAT('FC-TST-', DATE_FORMAT(@today, '%Y%m%d'), '%');

DELETE p
  FROM paiement_boncomptant_nonpaye p
  JOIN bons_comptant bc ON bc.id = p.bon_comptant_id
 WHERE bc.client_nom LIKE BINARY CONCAT(@tag, '%')
    OR p.note LIKE BINARY CONCAT(@tag, '%');

DELETE ci
  FROM charge_items ci
  JOIN bons_charge bc ON bc.id = ci.bon_charge_id
 WHERE bc.observations LIKE BINARY CONCAT(@tag, '%');

DELETE iac
  FROM items_avoir_charge iac
  JOIN avoirs_charge ac ON ac.id = iac.avoir_charge_id
 WHERE ac.observations LIKE BINARY CONCAT(@tag, '%');

DELETE cof
  FROM coffre cof
  LEFT JOIN fond_caisse_entries fce ON fce.id = cof.fond_caisse_entry_id
 WHERE cof.note LIKE BINARY CONCAT(@tag, '%')
    OR fce.note LIKE BINARY CONCAT(@tag, '%');

DELETE FROM bons_comptant WHERE client_nom LIKE BINARY CONCAT(@tag, '%');
DELETE FROM bons_charge WHERE observations LIKE BINARY CONCAT(@tag, '%');
DELETE FROM avoirs_charge WHERE observations LIKE BINARY CONCAT(@tag, '%');
DELETE FROM bons_vehicule WHERE lieu_chargement LIKE BINARY CONCAT(@tag, '%');
DELETE FROM avoirs_comptant WHERE client_nom LIKE BINARY CONCAT(@tag, '%');
DELETE FROM bons_commande WHERE lieu_chargement LIKE BINARY CONCAT(@tag, '%');
DELETE FROM bons_sortie WHERE lieu_chargement LIKE BINARY CONCAT(@tag, '%');
DELETE FROM avoirs_client WHERE lieu_chargement LIKE BINARY CONCAT(@tag, '%');
DELETE FROM fond_caisse_entries WHERE note LIKE BINARY CONCAT(@tag, '%');
DELETE FROM coffre WHERE note LIKE BINARY CONCAT(@tag, '%');

DROP TEMPORARY TABLE IF EXISTS fc_seq;
CREATE TEMPORARY TABLE fc_seq (n INT NOT NULL PRIMARY KEY);
INSERT INTO fc_seq (n)
WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 30
)
SELECT n FROM seq;

-- Debut caisse et debut coffre.
INSERT INTO fond_caisse_entries
  (montant, entry_type, note, mode_paiement, opened_at, jour, created_by, created_by_name)
VALUES
  (1000.00, 'caisse_initial', CONCAT(@tag, ' - fond initial caisse'), 'Espece',
   TIMESTAMP(@today, '08:00:00'), @today, @employee_id, 'FC TEST');

INSERT INTO coffre
  (montant, entry_type, note, mode_paiement, opened_at, jour, created_by, created_by_name)
VALUES
  (300.00, 'coffre_initial', CONCAT(@tag, ' - fond initial coffre'), 'Espece',
   TIMESTAMP(@today, '08:00:00'), @today, @employee_id, 'FC TEST');

-- Montant libre: entree caisse +250.
INSERT INTO fond_caisse_entries
  (montant, entry_type, note, mode_paiement, opened_at, jour, created_by, created_by_name)
VALUES
  (250.00, 'caisse_libre', CONCAT(@tag, ' - montant libre caisse'), 'Espece',
   TIMESTAMP(@today, '09:00:00'), @today, @employee_id, 'FC TEST');

-- Bons comptant payes du jour: 30 x 100 = +3000.
INSERT INTO bons_comptant
  (date_creation, client_id, client_nom, montant_total, montant_ignorer, statut, created_by, created_at, reste, restant, non_paye)
SELECT
  TIMESTAMP(@today, ADDTIME('09:10:00', SEC_TO_TIME(n * 60))),
  @client_id,
  CONCAT(@tag, ' - comptant paye ', LPAD(n, 2, '0')),
  100.00,
  0.00,
  'Payé',
  @employee_id,
  TIMESTAMP(@today, ADDTIME('09:10:00', SEC_TO_TIME(n * 60))),
  0.00,
  0.00,
  0
FROM fc_seq
WHERE n <= 30;

-- Bons exclus: annule/avoir ne doivent pas compter.
-- Le bon avec ancienne date_creation mais created_at aujourd'hui doit compter aujourd'hui.
INSERT INTO bons_comptant
  (date_creation, client_id, client_nom, montant_total, montant_ignorer, statut, created_by, created_at, reste, restant, non_paye)
VALUES
  (TIMESTAMP(@today, '09:45:00'), @client_id, CONCAT(@tag, ' - comptant annule exclu'), 999.00, 0.00, 'Annulé', @employee_id, TIMESTAMP(@today, '09:45:00'), 0.00, 0.00, 0),
  (TIMESTAMP(@today, '09:46:00'), @client_id, CONCAT(@tag, ' - comptant avoir exclu'), 999.00, 0.00, 'Avoir', @employee_id, TIMESTAMP(@today, '09:46:00'), 0.00, 0.00, 0),
  (TIMESTAMP(@old_day, '09:47:00'), @client_id, CONCAT(@tag, ' - comptant old date exclu today'), 999.00, 0.00, 'Payé', @employee_id, TIMESTAMP(@today, '09:47:00'), 0.00, 0.00, 0);

-- Bons comptant non payes crees avec ancienne date metier, mais paiements saisis aujourd'hui.
-- 10 bons seront payes completement avec 2 paiements, puis passes Paye.
-- 10 bons restent partiels.
INSERT INTO bons_comptant
  (date_creation, client_id, client_nom, montant_total, montant_ignorer, statut, created_by, created_at, reste, restant, non_paye)
SELECT
  TIMESTAMP(@old_day, ADDTIME('10:00:00', SEC_TO_TIME(n * 60))),
  @client_id,
  CONCAT(@tag, ' - non paye old date ', LPAD(n, 2, '0')),
  200.00,
  0.00,
  'En attente',
  @employee_id,
  TIMESTAMP(@today, ADDTIME('10:00:00', SEC_TO_TIME(n * 60))),
  200.00,
  200.00,
  1
FROM fc_seq
WHERE n <= 20;

-- Paiements partiels 1/2 pour les 10 premiers: 10 x 50 = +500.
INSERT INTO paiement_boncomptant_nonpaye
  (bon_comptant_id, montant, date_paiement, note, created_by, created_at)
SELECT
  bc.id,
  50.00,
  TIMESTAMP(@old_day, '11:00:00'),
  CONCAT(@tag, ' - paiement partiel 1'),
  @employee_id,
  TIMESTAMP(@today, ADDTIME('10:30:00', SEC_TO_TIME(seq.n * 60)))
FROM bons_comptant bc
JOIN fc_seq seq ON BINARY bc.client_nom = CONCAT(@tag, ' - non paye old date ', LPAD(seq.n, 2, '0'))
WHERE seq.n <= 10;

-- Paiements complets 2/2 pour les 10 premiers: 10 x 150 = +1500.
INSERT INTO paiement_boncomptant_nonpaye
  (bon_comptant_id, montant, date_paiement, note, created_by, created_at)
SELECT
  bc.id,
  150.00,
  TIMESTAMP(@old_day, '12:00:00'),
  CONCAT(@tag, ' - paiement complet 2'),
  @employee_id,
  TIMESTAMP(@today, ADDTIME('11:00:00', SEC_TO_TIME(seq.n * 60)))
FROM bons_comptant bc
JOIN fc_seq seq ON BINARY bc.client_nom = CONCAT(@tag, ' - non paye old date ', LPAD(seq.n, 2, '0'))
WHERE seq.n <= 10;

UPDATE bons_comptant
   SET statut = 'Payé', non_paye = 0, reste = 0, restant = 0
 WHERE client_nom LIKE BINARY CONCAT(@tag, ' - non paye old date 0%');

-- Paiements partiels des 10 autres: 10 x 80 = +800.
INSERT INTO paiement_boncomptant_nonpaye
  (bon_comptant_id, montant, date_paiement, note, created_by, created_at)
SELECT
  bc.id,
  80.00,
  TIMESTAMP(@old_day, '13:00:00'),
  CONCAT(@tag, ' - paiement partiel restant'),
  @employee_id,
  TIMESTAMP(@today, ADDTIME('11:30:00', SEC_TO_TIME(seq.n * 60)))
FROM bons_comptant bc
JOIN fc_seq seq ON BINARY bc.client_nom = CONCAT(@tag, ' - non paye old date ', LPAD(seq.n, 2, '0'))
WHERE seq.n BETWEEN 11 AND 20;

UPDATE bons_comptant
   SET reste = 120.00, restant = 120.00, non_paye = 1
 WHERE client_nom LIKE BINARY CONCAT(@tag, ' - non paye old date 1%')
    OR client_nom LIKE BINARY CONCAT(@tag, ' - non paye old date 20');

-- Paiements caisse client: 20 x 70 = +1400.
INSERT INTO payments
  (numero, payment_group_id, type_paiement, contact_id, bon_type, montant_total, montant_ignorer, restant, mode_paiement, date_paiement, designation, payment, created_by, created_at, statut)
SELECT
  CONCAT('FC-TST-', DATE_FORMAT(@today, '%Y%m%d'), '-CL-', LPAD(n, 2, '0')),
  CASE WHEN n <= 3 THEN CONCAT(@tag, '-GROUP-CLIENT') ELSE NULL END,
  'Client',
  @client_id,
  NULL,
  70.00,
  0.00,
  0.00,
  'Espèces',
  TIMESTAMP(@today, ADDTIME('12:00:00', SEC_TO_TIME(n * 60))),
  CONCAT(@tag, ' - paiement client ', LPAD(n, 2, '0')),
  1,
  @employee_id,
  TIMESTAMP(@today, ADDTIME('12:00:00', SEC_TO_TIME(n * 60))),
  'Validé'
FROM fc_seq
WHERE n <= 20;

-- Paiements exclus: comptant dans payments, refuse, annule, fournisseur normal.
INSERT INTO payments
  (numero, type_paiement, contact_id, bon_type, montant_total, mode_paiement, date_paiement, designation, payment, created_by, created_at, statut)
VALUES
  (CONCAT('FC-TST-', DATE_FORMAT(@today, '%Y%m%d'), '-EX-COMPTANT'), 'Client', @client_id, 'Comptant', 999.00, 'Espèces', TIMESTAMP(@today, '12:40:00'), CONCAT(@tag, ' - payment comptant exclu'), 1, @employee_id, TIMESTAMP(@today, '12:40:00'), 'Validé'),
  (CONCAT('FC-TST-', DATE_FORMAT(@today, '%Y%m%d'), '-EX-REFUSE'), 'Client', @client_id, NULL, 999.00, 'Espèces', TIMESTAMP(@today, '12:41:00'), CONCAT(@tag, ' - payment refuse exclu'), 1, @employee_id, TIMESTAMP(@today, '12:41:00'), 'Refusé'),
  (CONCAT('FC-TST-', DATE_FORMAT(@today, '%Y%m%d'), '-EX-ANNULE'), 'Client', @client_id, NULL, 999.00, 'Espèces', TIMESTAMP(@today, '12:42:00'), CONCAT(@tag, ' - payment annule exclu'), 1, @employee_id, TIMESTAMP(@today, '12:42:00'), 'Annulé'),
  (CONCAT('FC-TST-', DATE_FORMAT(@today, '%Y%m%d'), '-EX-FOURN'), 'Fournisseur', @fournisseur_id, NULL, 999.00, 'Espèces', TIMESTAMP(@today, '12:43:00'), CONCAT(@tag, ' - fournisseur normal exclu'), 1, @employee_id, TIMESTAMP(@today, '12:43:00'), 'Validé');

-- Bon sortie avec paiement client: 5 x 60 = +300.
-- Le bon sortie lui-meme ne compte pas en caisse, seul le paiement client compte.
INSERT INTO bons_sortie
  (date_creation, client_id, fournisseur_id, lieu_chargement, montant_total, statut, created_by, created_at)
SELECT
  TIMESTAMP(@today, ADDTIME('13:00:00', SEC_TO_TIME(n * 60))),
  @client_id,
  @fournisseur_id,
  CONCAT(@tag, ' - sortie fournisseur ', LPAD(n, 2, '0')),
  60.00,
  'Validé',
  @employee_id,
  TIMESTAMP(@today, ADDTIME('13:00:00', SEC_TO_TIME(n * 60)))
FROM fc_seq
WHERE n <= 5;

UPDATE bons_sortie
   SET vendre_au_fournisseur = 1
 WHERE lieu_chargement LIKE BINARY CONCAT(@tag, ' - sortie fournisseur%');

INSERT INTO payments
  (numero, type_paiement, contact_id, bon_id, bon_type, montant_total, montant_ignorer, restant, mode_paiement, date_paiement, designation, payment, created_by, created_at, statut)
SELECT
  CONCAT('FC-TST-', DATE_FORMAT(@today, '%Y%m%d'), '-FS-', LPAD(seq.n, 2, '0')),
  'Client',
  @client_id,
  bs.id,
  'Sortie',
  60.00,
  0.00,
  0.00,
  'Espèces',
  TIMESTAMP(@today, ADDTIME('13:20:00', SEC_TO_TIME(seq.n * 60))),
  CONCAT(@tag, ' - paiement client sortie ', LPAD(seq.n, 2, '0')),
  1,
  @employee_id,
  TIMESTAMP(@today, ADDTIME('13:20:00', SEC_TO_TIME(seq.n * 60))),
  'Validé'
FROM bons_sortie bs
JOIN fc_seq seq ON BINARY bs.lieu_chargement = CONCAT(@tag, ' - sortie fournisseur ', LPAD(seq.n, 2, '0'))
WHERE seq.n <= 5;

-- Paiements fournisseur lies a des avoirs client: exclus de la caisse meme avec vendre_au_fournisseur.
INSERT INTO avoirs_client
  (date_creation, client_id, fournisseur_id, lieu_chargement, montant_total, statut, created_by, created_at)
SELECT
  TIMESTAMP(@today, ADDTIME('13:40:00', SEC_TO_TIME(n * 60))),
  @client_id,
  @fournisseur_id,
  CONCAT(@tag, ' - avoir fournisseur ', LPAD(n, 2, '0')),
  45.00,
  'Validé',
  @employee_id,
  TIMESTAMP(@today, ADDTIME('13:40:00', SEC_TO_TIME(n * 60)))
FROM fc_seq
WHERE n <= 5;

UPDATE avoirs_client
   SET vendre_au_fournisseur = 1
 WHERE lieu_chargement LIKE BINARY CONCAT(@tag, ' - avoir fournisseur%');

INSERT INTO payments
  (numero, type_paiement, contact_id, bon_id, bon_type, montant_total, montant_ignorer, restant, mode_paiement, date_paiement, designation, payment, created_by, created_at, statut)
SELECT
  CONCAT('FC-TST-', DATE_FORMAT(@today, '%Y%m%d'), '-FA-', LPAD(seq.n, 2, '0')),
  'Fournisseur',
  @fournisseur_id,
  ac.id,
  'Avoir',
  45.00,
  0.00,
  0.00,
  'Espèces',
  TIMESTAMP(@today, ADDTIME('14:00:00', SEC_TO_TIME(seq.n * 60))),
  CONCAT(@tag, ' - paiement fournisseur avoir ', LPAD(seq.n, 2, '0')),
  1,
  @employee_id,
  TIMESTAMP(@today, ADDTIME('14:00:00', SEC_TO_TIME(seq.n * 60))),
  'Validé'
FROM avoirs_client ac
JOIN fc_seq seq ON BINARY ac.lieu_chargement = CONCAT(@tag, ' - avoir fournisseur ', LPAD(seq.n, 2, '0'))
WHERE seq.n <= 5;

-- Charges incluses caisse: 20 x 30 = -600.
INSERT INTO bons_charge
  (date_creation, client_id, montant_total, statut, observations, operation_type, inclus_en_caisse, created_by, created_at)
SELECT
  TIMESTAMP(@today, ADDTIME('14:20:00', SEC_TO_TIME(n * 60))),
  @client_id,
  30.00,
  'Validé',
  CONCAT(@tag, ' - charge ', LPAD(n, 2, '0')),
  'charge',
  1,
  @employee_id,
  TIMESTAMP(@today, ADDTIME('14:20:00', SEC_TO_TIME(n * 60)))
FROM fc_seq
WHERE n <= 20;

INSERT INTO charge_items
  (bon_charge_id, designation_custom, quantite, prix_unitaire, total)
SELECT
  bc.id,
  CONCAT(@tag, ' item charge'),
  1.0000,
  30.0000,
  30.0000
FROM bons_charge bc
WHERE bc.observations LIKE BINARY CONCAT(@tag, ' - charge%');

-- Avoirs charge inclus caisse: 10 x 25 = +250.
INSERT INTO avoirs_charge
  (date_creation, client_id, montant_total, statut, observations, inclus_en_caisse, created_by, created_at)
SELECT
  TIMESTAMP(@today, ADDTIME('15:00:00', SEC_TO_TIME(n * 60))),
  @client_id,
  25.00,
  'Validé',
  CONCAT(@tag, ' - avoir charge ', LPAD(n, 2, '0')),
  1,
  @employee_id,
  TIMESTAMP(@today, ADDTIME('15:00:00', SEC_TO_TIME(n * 60)))
FROM fc_seq
WHERE n <= 10;

INSERT INTO items_avoir_charge
  (avoir_charge_id, designation_custom, quantite, prix_unitaire, total)
SELECT
  ac.id,
  CONCAT(@tag, ' item avoir charge'),
  1.0000,
  25.0000,
  25.0000
FROM avoirs_charge ac
WHERE ac.observations LIKE BINARY CONCAT(@tag, ' - avoir charge%');

-- Bons commande: crees pour verifier qu'ils ne sont ni comptes ni affiches en fond caisse.
INSERT INTO bons_commande
  (date_creation, fournisseur_id, lieu_chargement, montant_total, statut, inclus_en_caisse, created_by, created_at)
SELECT
  TIMESTAMP(@today, ADDTIME('15:20:00', SEC_TO_TIME(n * 60))),
  @fournisseur_id,
  CONCAT(@tag, ' - commande incluse ', LPAD(n, 2, '0')),
  40.00,
  'Validé',
  1,
  @employee_id,
  TIMESTAMP(@today, ADDTIME('15:20:00', SEC_TO_TIME(n * 60)))
FROM fc_seq
WHERE n <= 10;

-- Bons vehicule: 10 x 35 = -350.
INSERT INTO bons_vehicule
  (date_creation, vehicule_id, lieu_chargement, montant_total, statut, created_by, created_at)
SELECT
  TIMESTAMP(@today, ADDTIME('15:40:00', SEC_TO_TIME(n * 60))),
  @vehicule_id,
  CONCAT(@tag, ' - vehicule ', LPAD(n, 2, '0')),
  35.00,
  'Validé',
  @employee_id,
  TIMESTAMP(@today, ADDTIME('15:40:00', SEC_TO_TIME(n * 60)))
FROM fc_seq
WHERE n <= 10;

-- Avoirs comptant: 10 x 20 = -200.
INSERT INTO avoirs_comptant
  (date_creation, client_nom, lieu_chargement, montant_total, statut, created_by, created_at)
SELECT
  TIMESTAMP(@today, ADDTIME('16:00:00', SEC_TO_TIME(n * 60))),
  CONCAT(@tag, ' - avoir comptant ', LPAD(n, 2, '0')),
  CONCAT(@tag, ' - avoir comptant'),
  20.00,
  'Validé',
  @employee_id,
  TIMESTAMP(@today, ADDTIME('16:00:00', SEC_TO_TIME(n * 60)))
FROM fc_seq
WHERE n <= 10;

-- Transfert caisse vers coffre: -400 caisse, +400 coffre.
INSERT INTO fond_caisse_entries
  (montant, entry_type, note, mode_paiement, opened_at, jour, created_by, created_by_name)
VALUES
  (400.00, 'transfer_to_coffre', CONCAT(@tag, ' - transfert vers coffre'), 'Espece',
   TIMESTAMP(@today, '16:30:00'), @today, @employee_id, 'FC TEST');

SET @transfer_fce_id := LAST_INSERT_ID();

INSERT INTO coffre
  (montant, entry_type, note, mode_paiement, opened_at, jour, fond_caisse_entry_id, created_by, created_by_name)
VALUES
  (400.00, 'transfer_from_caisse', CONCAT(@tag, ' - entree coffre depuis caisse'), 'Espece',
   TIMESTAMP(@today, '16:30:00'), @today, @transfer_fce_id, @employee_id, 'FC TEST');

-- Transfert caisse vers poche: -90 caisse.
INSERT INTO fond_caisse_entries
  (montant, entry_type, note, mode_paiement, opened_at, jour, created_by, created_by_name)
VALUES
  (90.00, 'transfer_to_poche', CONCAT(@tag, ' - transfert caisse vers poche'), 'Espece',
   TIMESTAMP(@today, '16:40:00'), @today, @employee_id, 'FC TEST');

-- Transfert coffre vers poche: -50 coffre, ne change pas la caisse.
INSERT INTO coffre
  (montant, entry_type, note, mode_paiement, opened_at, jour, created_by, created_by_name)
VALUES
  (50.00, 'coffre_transfer_to_poche', CONCAT(@tag, ' - transfert coffre vers poche'), 'Espece',
   TIMESTAMP(@today, '16:50:00'), @today, @employee_id, 'FC TEST');

SELECT
  @today AS jour,
  1000.00 AS fond_initial_caisse,
  3000.00 AS bon_comptant_paye,
  999.00 AS bon_comptant_old_date_created_today,
  2800.00 AS paiement_bon_comptant_non_paye,
  1700.00 AS paiement_caisse,
  250.00 AS montant_libre_caisse,
  250.00 AS avoir_charge_inclus_caisse,
  8999.00 AS total_entrees_hors_initial,
  600.00 AS charge_incluse_caisse,
  400.00 AS bon_commande_hors_caisse,
  350.00 AS bon_vehicule,
  200.00 AS avoir_comptant,
  400.00 AS transfert_vers_coffre,
  90.00 AS transfert_vers_poche,
  1640.00 AS total_sorties,
  8359.00 AS caisse_finale_attendue,
  650.00 AS coffre_final_attendu;
