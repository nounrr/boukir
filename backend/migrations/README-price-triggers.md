# Triggers de gestion automatique des prix d'achat (bons de commande)

Ce dossier contient la migration `2025-09-10-add-commande-price-triggers.sql` qui introduit un mécanisme automatique pour mettre à jour et rétablir les `prix_achat` des produits selon le statut des bons de commande.

## Règles
1. Lorsqu'un bon de commande passe en **Validé**:
   - Pour chaque ligne de `commande_items`, si `prix_unitaire` diffère de `products.prix_achat`, l'ancien prix est stocké dans `commande_items.old_prix_achat` et le champ `price_applied` passe à 1.
   - Le `products.prix_achat` est mis à jour avec `prix_unitaire`.
   - Les champs dérivés (`cout_revient`, `prix_gros`, `prix_vente`) sont recalculés si des pourcentages existent (`*_pourcentage`).
2. Si un bon **Validé** repasse à un autre statut (Annulé, En attente, etc.):
   - On restaure `products.prix_achat` à `old_prix_achat` SEULEMENT si le prix actuel correspond à `prix_unitaire` (sécurité contre conflits si un autre bon a changé le prix entre temps) et si `price_applied = 1`.
   - Les champs dérivés sont recalculés à partir de l'ancien prix.
   - Le flag `price_applied` est remis à 0.

## Colonnes ajoutées
- `commande_items.old_prix_achat` (DECIMAL(10,2) NULL)
- `commande_items.price_applied` (TINYINT(1) DEFAULT 0)

La migration est idempotente grâce à `ADD COLUMN IF NOT EXISTS` et `DROP TRIGGER IF EXISTS`.

## Limitations
- Si plusieurs bons validés modifient successivement le même produit, seul le dernier revert sera possible dans l'ordre inverse des validations (stack implicite gérée tant que chaque revert ne rencontre pas un prix différent de `prix_unitaire`).
- Aucun historique multi-niveaux n'est stocké au-delà d'un seul `old_prix_achat` par ligne.

## Extension possible
- Créer une table `product_price_history` pour tracer toutes les transitions: (product_id, old_price, new_price, source_bon_id, applied_at, reverted_at, user_id).

## Sécurité
- Le trigger ne modifie rien si `prix_unitaire` est 0 ou égal à `prix_achat`.
- Revert protégé par condition `p.prix_achat = ci.prix_unitaire` et `price_applied = 1`.

## Test manuel rapide (SQL pseudo)
```
UPDATE bons_commande SET statut='Validé' WHERE id=123; -- Applique nouveaux prix
SELECT p.prix_achat FROM products p JOIN commande_items ci ON ci.product_id=p.id WHERE ci.bon_commande_id=123;
UPDATE bons_commande SET statut='En attente' WHERE id=123; -- Revert
```

## Frontend
Aucune adaptation nécessaire: la logique est purement en base.
