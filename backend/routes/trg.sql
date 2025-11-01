CREATE TRIGGER `audit_del_bons_commande` AFTER DELETE ON `bons_commande`
 FOR EACH ROW INSERT INTO audit_logs(table_name, operation, user_id, request_id, db_user, pk, old_data)
    VALUES ('bons_commande', 'D', @app_user_id, @app_request_id, CURRENT_USER(), JSON_OBJECT('id', OLD.id), JSON_OBJECT('id', OLD.id, 'date_creation', OLD.date_creation, 'fournisseur_id', OLD.fournisseur_id, 'vehicule_id', OLD.vehicule_id, 'lieu_chargement', OLD.lieu_chargement, 'montant_total', OLD.montant_total, 'statut', OLD.statut, 'created_by', OLD.created_by, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'adresse_livraison', OLD.adresse_livraison))

CREATE TRIGGER `audit_del_commande_items` AFTER DELETE ON `commande_items`
 FOR EACH ROW INSERT INTO audit_logs(table_name, operation, user_id, request_id, db_user, pk, old_data)
    VALUES ('commande_items', 'D', @app_user_id, @app_request_id, CURRENT_USER(), JSON_OBJECT('id', OLD.id), JSON_OBJECT('id', OLD.id, 'bon_commande_id', OLD.bon_commande_id, 'product_id', OLD.product_id, 'quantite', OLD.quantite, 'prix_unitaire', OLD.prix_unitaire, 'remise_pourcentage', OLD.remise_pourcentage, 'remise_montant', OLD.remise_montant, 'total', OLD.total, 'created_at', OLD.created_at))

CREATE TRIGGER `audit_ins_bons_commande` AFTER INSERT ON `bons_commande`
 FOR EACH ROW INSERT INTO audit_logs(table_name, operation, user_id, request_id, db_user, pk, new_data)
    VALUES ('bons_commande', 'I', @app_user_id, @app_request_id, CURRENT_USER(), JSON_OBJECT('id', NEW.id), JSON_OBJECT('id', NEW.id, 'date_creation', NEW.date_creation, 'fournisseur_id', NEW.fournisseur_id, 'vehicule_id', NEW.vehicule_id, 'lieu_chargement', NEW.lieu_chargement, 'montant_total', NEW.montant_total, 'statut', NEW.statut, 'created_by', NEW.created_by, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'adresse_livraison', NEW.adresse_livraison))

CREATE TRIGGER `audit_ins_commande_items` AFTER INSERT ON `commande_items`
 FOR EACH ROW INSERT INTO audit_logs(table_name, operation, user_id, request_id, db_user, pk, new_data)
    VALUES ('commande_items', 'I', @app_user_id, @app_request_id, CURRENT_USER(), JSON_OBJECT('id', NEW.id), JSON_OBJECT('id', NEW.id, 'bon_commande_id', NEW.bon_commande_id, 'product_id', NEW.product_id, 'quantite', NEW.quantite, 'prix_unitaire', NEW.prix_unitaire, 'remise_pourcentage', NEW.remise_pourcentage, 'remise_montant', NEW.remise_montant, 'total', NEW.total, 'created_at', NEW.created_at))

CREATE TRIGGER `audit_upd_bons_commande` AFTER UPDATE ON `bons_commande`
 FOR EACH ROW INSERT INTO audit_logs(table_name, operation, user_id, request_id, db_user, pk, old_data, new_data)
    VALUES ('bons_commande', 'U', @app_user_id, @app_request_id, CURRENT_USER(), JSON_OBJECT('id', NEW.id), JSON_OBJECT('id', OLD.id, 'date_creation', OLD.date_creation, 'fournisseur_id', OLD.fournisseur_id, 'vehicule_id', OLD.vehicule_id, 'lieu_chargement', OLD.lieu_chargement, 'montant_total', OLD.montant_total, 'statut', OLD.statut, 'created_by', OLD.created_by, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'adresse_livraison', OLD.adresse_livraison), JSON_OBJECT('id', NEW.id, 'date_creation', NEW.date_creation, 'fournisseur_id', NEW.fournisseur_id, 'vehicule_id', NEW.vehicule_id, 'lieu_chargement', NEW.lieu_chargement, 'montant_total', NEW.montant_total, 'statut', NEW.statut, 'created_by', NEW.created_by, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'adresse_livraison', NEW.adresse_livraison))

CREATE TRIGGER `audit_upd_commande_items` AFTER UPDATE ON `commande_items`
 FOR EACH ROW INSERT INTO audit_logs(table_name, operation, user_id, request_id, db_user, pk, old_data, new_data)
    VALUES ('commande_items', 'U', @app_user_id, @app_request_id, CURRENT_USER(), JSON_OBJECT('id', NEW.id), JSON_OBJECT('id', OLD.id, 'bon_commande_id', OLD.bon_commande_id, 'product_id', OLD.product_id, 'quantite', OLD.quantite, 'prix_unitaire', OLD.prix_unitaire, 'remise_pourcentage', OLD.remise_pourcentage, 'remise_montant', OLD.remise_montant, 'total', OLD.total, 'created_at', OLD.created_at), JSON_OBJECT('id', NEW.id, 'bon_commande_id', NEW.bon_commande_id, 'product_id', NEW.product_id, 'quantite', NEW.quantite, 'prix_unitaire', NEW.prix_unitaire, 'remise_pourcentage', NEW.remise_pourcentage, 'remise_montant', NEW.remise_montant, 'total', NEW.total, 'created_at', NEW.created_at))

CREATE TRIGGER `trg_bons_commande_after_insert_stock` AFTER INSERT ON `bons_commande`
 FOR EACH ROW BEGIN
  IF NEW.statut = 'Validé' THEN
    UPDATE products p
    JOIN commande_items ci ON ci.product_id = p.id
    SET p.quantite = p.quantite + CAST(ci.quantite AS SIGNED)
    WHERE ci.bon_commande_id = NEW.id;
  END IF;
END

CREATE TRIGGER `trg_bons_commande_after_update_stock` AFTER UPDATE ON `bons_commande`
 FOR EACH ROW BEGIN
  
  IF NEW.statut = 'Validé' AND OLD.statut <> 'Validé' THEN
    UPDATE products p
    JOIN commande_items ci ON ci.product_id = p.id
    SET p.quantite = p.quantite + CAST(ci.quantite AS SIGNED)
    WHERE ci.bon_commande_id = NEW.id;
  END IF;

  
  IF OLD.statut = 'Validé' AND NEW.statut <> 'Validé' THEN
    UPDATE products p
    JOIN commande_items ci ON ci.product_id = p.id
    SET p.quantite = p.quantite - CAST(ci.quantite AS SIGNED)
    WHERE ci.bon_commande_id = NEW.id;
  END IF;
END

CREATE TRIGGER `trg_commande_items_after_delete_stock` AFTER DELETE ON `commande_items`
 FOR EACH ROW BEGIN
  IF (SELECT statut FROM bons_commande WHERE id = OLD.bon_commande_id) = 'Validé' THEN
    UPDATE products
    SET quantite = quantite - CAST(OLD.quantite AS SIGNED)
    WHERE id = OLD.product_id;
  END IF;
END

CREATE TRIGGER `trg_commande_items_after_insert_stock` AFTER INSERT ON `commande_items`
 FOR EACH ROW BEGIN
  IF (SELECT statut FROM bons_commande WHERE id = NEW.bon_commande_id) = 'Validé' THEN
    UPDATE products
    SET quantite = quantite + CAST(NEW.quantite AS SIGNED)
    WHERE id = NEW.product_id;
  END IF;
END

CREATE TRIGGER `trg_commande_items_after_update_stock` AFTER UPDATE ON `commande_items`
 FOR EACH ROW BEGIN
  IF (SELECT statut FROM bons_commande WHERE id = NEW.bon_commande_id) = 'Validé' THEN
    
    IF NEW.product_id = OLD.product_id THEN
      UPDATE products
      SET quantite = quantite + CAST(NEW.quantite - OLD.quantite AS SIGNED)
      WHERE id = NEW.product_id;
    ELSE
      
      UPDATE products SET quantite = quantite - CAST(OLD.quantite AS SIGNED) WHERE id = OLD.product_id;
      UPDATE products SET quantite = quantite + CAST(NEW.quantite AS SIGNED) WHERE id = NEW.product_id;
    END IF;
  END IF;
END
