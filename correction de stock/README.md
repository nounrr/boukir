# Correction de stock — items sans snapshot

## Le problème

Pendant une période (à partir du **1er avril 2026**), lors de la création d'un bon,
**tous les types de bons SAUF le bon de commande** (sortie, comptant, avoir client,
avoir comptant, avoir fournisseur) ont enregistré leurs items **sans lier
`product_snapshot_id`**, même quand un snapshot existait pour le produit/variante.

Conséquences :
- On ne sait pas à quel snapshot chaque item est rattaché.
- Le stock du `product_snapshot` n'a jamais été déduit ni ajouté → il est resté figé.
- Quand un stock est épuisé, on ne voit pas `is_indisponible` sur l'item.

## La solution

Deux scripts à exécuter dans l'ordre :

### 1. `01_detection.sql` — lecture seule
Liste tous les items concernés (détail + résumé par produit/variante), avec :
- le sens (DÉDUIT ou AJOUTÉ),
- la quantité en **unité de base** (`quantite × conversion_factor`),
- le nombre de snapshots et le stock total disponible.

➡️ **Exécutez-le d'abord et vérifiez les résultats.**

### 2. `02_correction.sql` — modifie les données
Crée la procédure `corriger_stock_snapshots(date_debut, dry_run)` qui applique un
**vrai FIFO** :

- **Sens DÉDUIT** (sortie, comptant, avoir fournisseur) : consomme les snapshots
  du plus ancien au plus récent (`created_at ASC`), lie l'item au premier snapshot
  ayant du stock, baisse les quantités. Si le stock total est insuffisant → les
  snapshots tombent à 0 et l'item passe `is_indisponible = 1`.
- **Sens AJOUTÉ** (avoir client, avoir comptant) : retour en stock → ajoute la
  quantité au snapshot le plus récent et lie l'item à ce snapshot.

Les items sont traités dans l'**ordre chronologique** (date du bon) pour un FIFO cohérent.

#### Exécution
```sql
-- 1) Test (ne modifie rien) :
CALL corriger_stock_snapshots('2026-04-01 00:00:00', 1);
-- 2) Après vérification + sauvegarde, en réel :
CALL corriger_stock_snapshots('2026-04-01 00:00:00', 0);
```

## Règles respectées
- ✅ Gère **produits** (variant_id NULL) **et variantes**.
- ✅ Gère l'**unité spéciale** : quantité appliquée = `quantite × conversion_factor`
  (facteur récupéré via `unit_id` → `product_units`). Si pas d'unité, facteur = 1.
- ✅ FIFO réel sur plusieurs snapshots, ajout/déduction selon le type de bon.
- ✅ `is_indisponible` géré quand le stock est épuisé.
- ✅ **Aucun prix modifié** : ni `prix_unitaire`, ni `prix_achat`, ni `prix_vente`.
  Seuls `product_snapshot_id`, `is_indisponible` et `product_snapshot.quantite`
  changent.
- ✅ **N'inclut jamais** `commande_items` (bon de commande).

## ⚠️ Avant d'exécuter en réel
1. **Sauvegardez la base** (`mysqldump`).
2. Lancez `01_detection.sql` et vérifiez.
3. Lancez la procédure en dry-run (`1`), relisez le journal.
4. Seulement ensuite, lancez en réel (`0`).
