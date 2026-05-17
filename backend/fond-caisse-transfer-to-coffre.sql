-- Transferer un montant de la caisse vers le coffre.
-- Remplacer 0.00 par le montant reel.
START TRANSACTION;

INSERT INTO fond_caisse_entries (
  montant,
  entry_type,
  note,
  opened_at,
  jour,
  created_by,
  created_by_name
) VALUES (
  0.00,
  'transfer_to_coffre',
  'Transfert vers coffre',
  NOW(),
  CURDATE(),
  NULL,
  'Caissier'
);

INSERT INTO coffre (
  montant,
  entry_type,
  note,
  opened_at,
  jour,
  fond_caisse_entry_id,
  created_by,
  created_by_name
) VALUES (
  0.00,
  'transfer_from_caisse',
  'Transfert depuis caisse',
  NOW(),
  CURDATE(),
  LAST_INSERT_ID(),
  NULL,
  'Caissier'
);

COMMIT;
