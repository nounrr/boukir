-- Test script pour vérifier les modifications de remises
-- Ce script teste la nouvelle logique client_abonné

-- 1. Vérifier que les colonnes ont été ajoutées
DESCRIBE client_remises;

-- 2. Tester l'insertion d'un client_abonné
INSERT INTO client_remises (nom, phone, cin, type, contact_id) 
VALUES ('Test Client Abonné', '0600000000', 'RIB123', 'client_abonne', 1);

-- 3. Vérifier la récupération par contact_id et type
SELECT * FROM client_remises 
WHERE contact_id = 1 AND type = 'client_abonne';

-- 4. Nettoyer les données de test
DELETE FROM client_remises WHERE nom = 'Test Client Abonné';