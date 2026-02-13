-- Migration: ajoute la colonne prix_achat_snapshot aux tables d'items
-- But: stocker le prix d'achat du produit AU MOMENT de la création de la ligne
-- uniquement quand bon_commande_id est NULL (pas de référence bon commande).
-- Si bon_commande_id existe → prix_achat_snapshot reste NULL (le coût est lu depuis commande_items).

-- sortie_items
ALTER TABLE sortie_items
  ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;

-- comptant_items
ALTER TABLE comptant_items
  ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;

-- devis_items
ALTER TABLE devis_items
  ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;

-- vehicule_items
ALTER TABLE vehicule_items
  ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;

-- avoir_client_items
ALTER TABLE avoir_client_items
  ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;

-- avoir_comptant_items
ALTER TABLE avoir_comptant_items
  ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;

-- avoir_fournisseur_items
ALTER TABLE avoir_fournisseur_items
  ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;

-- ecommerce_order_items
ALTER TABLE ecommerce_order_items
  ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;

-- avoir_ecommerce_items
ALTER TABLE avoir_ecommerce_items
  ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;
