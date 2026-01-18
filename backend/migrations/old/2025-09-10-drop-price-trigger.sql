-- Supprime le trigger de mise à jour prix (désormais géré dans l'application)
DROP TRIGGER IF EXISTS trg_bons_commande_update_prices;
