-- Autorisation accordée par le PDG depuis « Autorisations par page ».
ALTER TABLE employees
  ADD COLUMN acces_correction_prix_vente TINYINT(1) NOT NULL DEFAULT 0;
