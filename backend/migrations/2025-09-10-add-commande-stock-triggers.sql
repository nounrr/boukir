-- Stock management triggers for bons_commande / commande_items
-- Adds quantity to products only when a purchase order (bon commande) becomes Validé
-- Removes (reverses) that quantity if status leaves Validé
-- Also keeps product stock in sync when items are added/updated/removed while the bon is already Validé

DELIMITER $$

-- Drop old trigger if it exists (from previous implementation)
DROP TRIGGER IF EXISTS trg_bc_after_update_stock $$

-- When a bon_commande is inserted already with statut = 'Validé'
CREATE TRIGGER trg_bons_commande_after_insert_stock
AFTER INSERT ON bons_commande
FOR EACH ROW
BEGIN
  IF NEW.statut = 'Validé' THEN
    UPDATE products p
    JOIN commande_items ci ON ci.product_id = p.id
    SET p.quantite = p.quantite + CAST(ci.quantite AS SIGNED)
    WHERE ci.bon_commande_id = NEW.id;
  END IF;
END $$

-- When statut changes (add on entering Validé, subtract on leaving Validé)
CREATE TRIGGER trg_bons_commande_after_update_stock
AFTER UPDATE ON bons_commande
FOR EACH ROW
BEGIN
  -- Entering Validé
  IF NEW.statut = 'Validé' AND OLD.statut <> 'Validé' THEN
    UPDATE products p
    JOIN commande_items ci ON ci.product_id = p.id
    SET p.quantite = p.quantite + CAST(ci.quantite AS SIGNED)
    WHERE ci.bon_commande_id = NEW.id;
  END IF;

  -- Leaving Validé (any other statut)
  IF OLD.statut = 'Validé' AND NEW.statut <> 'Validé' THEN
    UPDATE products p
    JOIN commande_items ci ON ci.product_id = p.id
    SET p.quantite = p.quantite - CAST(ci.quantite AS SIGNED)
    WHERE ci.bon_commande_id = NEW.id;
  END IF;
END $$

-- Item inserted while parent bon already Validé => immediately add its quantity
CREATE TRIGGER trg_commande_items_after_insert_stock
AFTER INSERT ON commande_items
FOR EACH ROW
BEGIN
  IF (SELECT statut FROM bons_commande WHERE id = NEW.bon_commande_id) = 'Validé' THEN
    UPDATE products
    SET quantite = quantite + CAST(NEW.quantite AS SIGNED)
    WHERE id = NEW.product_id;
  END IF;
END $$

-- Item updated (quantity / product change) while bon is Validé => apply delta
CREATE TRIGGER trg_commande_items_after_update_stock
AFTER UPDATE ON commande_items
FOR EACH ROW
BEGIN
  IF (SELECT statut FROM bons_commande WHERE id = NEW.bon_commande_id) = 'Validé' THEN
    -- If product_id unchanged, just apply quantity delta
    IF NEW.product_id = OLD.product_id THEN
      UPDATE products
      SET quantite = quantite + CAST(NEW.quantite - OLD.quantite AS SIGNED)
      WHERE id = NEW.product_id;
    ELSE
      -- Product changed: remove old qty from old product, add new qty to new product
      UPDATE products SET quantite = quantite - CAST(OLD.quantite AS SIGNED) WHERE id = OLD.product_id;
      UPDATE products SET quantite = quantite + CAST(NEW.quantite AS SIGNED) WHERE id = NEW.product_id;
    END IF;
  END IF;
END $$

-- Item deleted while bon is Validé => subtract its quantity
CREATE TRIGGER trg_commande_items_after_delete_stock
AFTER DELETE ON commande_items
FOR EACH ROW
BEGIN
  IF (SELECT statut FROM bons_commande WHERE id = OLD.bon_commande_id) = 'Validé' THEN
    UPDATE products
    SET quantite = quantite - CAST(OLD.quantite AS SIGNED)
    WHERE id = OLD.product_id;
  END IF;
END $$

DELIMITER ;

-- NOTE:
-- products.quantite is INT while commande_items.quantite is DECIMAL(10,2): fractional parts are truncated by CAST.
-- If you need fractional stock, change products.quantite to DECIMAL(10,2).
