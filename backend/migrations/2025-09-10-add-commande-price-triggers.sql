-- Migration: Gestion automatique des prix d'achat via triggers lors de la validation / annulation d'un bon de commande
-- Objectif:
-- 1. Lorsqu'un bon de commande passe en statut 'Validé':
--    - Pour chaque ligne (commande_items), si prix_unitaire != products.prix_achat, on sauvegarde l'ancien prix dans commande_items.old_prix_achat
--      puis on met à jour products.prix_achat et les prix dérivés (cout_revient, prix_gros, prix_vente) selon les pourcentages stockés.
-- 2. Lorsqu'un bon validé repasse à un autre statut (Annulé, En attente, etc.):
--    - On rétablit l'ancien prix uniquement si le prix actuel du produit correspond exactement au prix appliqué par ce bon (évite d'écraser un changement plus récent).
--    - Puis on remet le flag price_applied à 0.
--
-- Hypothèses:
--  - Table commande_items existe et contient les colonnes: bon_commande_id, product_id, prix_unitaire.
--  - Table products contient: prix_achat, cout_revient_pourcentage, prix_gros_pourcentage, prix_vente_pourcentage,
--    cout_revient, prix_gros, prix_vente.
--  - On ajoute ici deux colonnes si elles n'existent pas: old_prix_achat (DECIMAL) et price_applied (TINYINT flag).
--  - Moteur: MySQL/MariaDB compatible.

-- Sécurité: on encapsule dans des IF pour ne pas planter si relancé.

-- 1. Ajouter colonnes manquantes (idempotent)
ALTER TABLE commande_items
  ADD COLUMN old_prix_achat DECIMAL(10,2) NULL AFTER prix_unitaire,
  ADD COLUMN price_applied TINYINT(1) NOT NULL DEFAULT 0 AFTER old_prix_achat;

UPDATE `commande_items`
SET `old_prix_achat` = `prix_unitaire`;

-- 2. Supprimer triggers existants si on rejoue la migration
DROP TRIGGER IF EXISTS trg_bons_commande_update_prices;

DELIMITER $$
CREATE TRIGGER trg_bons_commande_update_prices
AFTER UPDATE ON bons_commande
FOR EACH ROW
BEGIN
  -- Application des nouveaux prix à l'entrée en 'Validé'
  IF NEW.statut = 'Validé' AND OLD.statut <> 'Validé' THEN
    -- Sauvegarder l'ancien prix et appliquer le nouveau uniquement si différent
    UPDATE commande_items ci
    JOIN products p ON p.id = ci.product_id
    SET
      ci.old_prix_achat = CASE
        WHEN ci.prix_unitaire <> p.prix_achat THEN p.prix_achat ELSE ci.old_prix_achat
      END,
      p.prix_achat = CASE
        WHEN ci.prix_unitaire <> p.prix_achat AND ci.prix_unitaire > 0 THEN ci.prix_unitaire ELSE p.prix_achat
      END,
      p.cout_revient = CASE
        WHEN ci.prix_unitaire <> p.prix_achat AND ci.prix_unitaire > 0 AND p.cout_revient_pourcentage IS NOT NULL
          THEN ci.prix_unitaire * (1 + p.cout_revient_pourcentage/100)
        ELSE p.cout_revient
      END,
      p.prix_gros = CASE
        WHEN ci.prix_unitaire <> p.prix_achat AND ci.prix_unitaire > 0 AND p.prix_gros_pourcentage IS NOT NULL
          THEN ci.prix_unitaire * (1 + p.prix_gros_pourcentage/100)
        ELSE p.prix_gros
      END,
      p.prix_vente = CASE
        WHEN ci.prix_unitaire <> p.prix_achat AND ci.prix_unitaire > 0 AND p.prix_vente_pourcentage IS NOT NULL
          THEN ci.prix_unitaire * (1 + p.prix_vente_pourcentage/100)
        ELSE p.prix_vente
      END,
      ci.price_applied = CASE
        WHEN ci.prix_unitaire <> p.prix_achat AND ci.prix_unitaire > 0 THEN 1 ELSE ci.price_applied END
    WHERE ci.bon_commande_id = NEW.id
      AND ci.prix_unitaire > 0;
  END IF;

  -- Réversion lors de la sortie de 'Validé'
  IF OLD.statut = 'Validé' AND NEW.statut <> 'Validé' THEN
    -- Revenir à l'ancien prix seulement si le prix actuel est celui appliqué par ce bon (sécurité)
    UPDATE commande_items ci
    JOIN products p ON p.id = ci.product_id
    SET
      p.prix_achat = CASE
        WHEN ci.price_applied = 1 AND ci.old_prix_achat IS NOT NULL AND p.prix_achat = ci.prix_unitaire
          THEN ci.old_prix_achat
        ELSE p.prix_achat
      END,
      p.cout_revient = CASE
        WHEN ci.price_applied = 1 AND ci.old_prix_achat IS NOT NULL AND p.prix_achat = ci.prix_unitaire AND p.cout_revient_pourcentage IS NOT NULL
          THEN ci.old_prix_achat * (1 + p.cout_revient_pourcentage/100)
        ELSE p.cout_revient
      END,
      p.prix_gros = CASE
        WHEN ci.price_applied = 1 AND ci.old_prix_achat IS NOT NULL AND p.prix_achat = ci.prix_unitaire AND p.prix_gros_pourcentage IS NOT NULL
          THEN ci.old_prix_achat * (1 + p.prix_gros_pourcentage/100)
        ELSE p.prix_gros
      END,
      p.prix_vente = CASE
        WHEN ci.price_applied = 1 AND ci.old_prix_achat IS NOT NULL AND p.prix_achat = ci.prix_unitaire AND p.prix_vente_pourcentage IS NOT NULL
          THEN ci.old_prix_achat * (1 + p.prix_vente_pourcentage/100)
        ELSE p.prix_vente
      END,
      ci.price_applied = CASE
        WHEN ci.price_applied = 1 THEN 0 ELSE ci.price_applied END
    WHERE ci.bon_commande_id = NEW.id;
  END IF;
END$$
DELIMITER ;

-- FIN MIGRATION
