# Products Snapshot History (batches + liaison bons/avoirs)

Ce document explique le script SQL [bpukir/sql.sql/products_snapshot_history.sql](../sql.sql/products_snapshot_history.sql) qui ajoute une historisation de snapshots de produits sous forme de **batches** (lots), et permet de **lier chaque snapshot à un document source** (bon / avoir / commande ecommerce, etc.).

## Objectif

- Garder plusieurs snapshots dans le temps (pas un seul snapshot qui écrase tout).
- Associer un snapshot à un document: bon commande, bon sortie, bon comptant, avoir client, avoir fournisseur, etc.
- Pouvoir détecter facilement:
  - quels documents ont déjà un snapshot
  - quels documents n’ont pas encore de snapshot

## Ce que le script SQL ajoute

### 1) Table `products_snapshot_batches`

Une ligne = **un batch** (un événement snapshot).

Colonnes principales:
- `id`: identifiant batch
- `source_type`: type de document (ex: `BON_COMMANDE`, `AVOIR_CLIENT`)
- `source_id`: id du document (ex: id du bon commande)
- `note`: texte libre (optionnel)
- `created_at`: date du batch

Indexes:
- `(source_type, source_id)` pour retrouver rapidement le batch d’un document

### 2) Extension de `products_snapshot`

Le script ajoute des colonnes “meta” dans `products_snapshot`:
- `batch_id`: lien vers `products_snapshot_batches.id`
- `source_type`: même valeur que le batch (copie pratique)
- `source_id`: même valeur que le batch (copie pratique)
- `snapshot_at`: date/heure de la prise de snapshot

Et ajoute des indexes + FK:
- index sur `batch_id`
- index sur `(source_type, source_id)`
- FK `products_snapshot.batch_id -> products_snapshot_batches.id`

> Remarque: `products_snapshot` existe déjà (créée par migration) comme une copie des colonnes de `products` + `qte`.

## Procédure principale

Le script crée la procédure:

- `sp_create_products_snapshot_for_source(source_type, source_id, only_source_products, note)`

Paramètres:
- `source_type` (VARCHAR): type du document
- `source_id` (BIGINT): id du document (peut être `NULL` pour `MANUAL`)
- `only_source_products` (TINYINT):
  - `1`: snapshot seulement les produits présents dans le document
  - `0`: snapshot tous les produits
- `note` (VARCHAR): note libre

### Source types supportés

- `BON_COMMANDE` (table items: `commande_items`, clé: `bon_commande_id`)
- `BON_SORTIE` (table items: `sortie_items`, clé: `bon_sortie_id`)
- `BON_COMPTANT` (table items: `comptant_items`, clé: `bon_comptant_id`)
- `BON_VEHICULE` (table items: `vehicule_items`, clé: `bon_vehicule_id`)
- `DEVIS` (table items: `devis_items`, clé: `devis_id`)
- `AVOIR_CLIENT` (table items: `avoir_client_items`, clé: `avoir_client_id`)
- `AVOIR_FOURNISSEUR` (table items: `avoir_fournisseur_items`, clé: `avoir_fournisseur_id`)
- `AVOIR_COMPTANT` (table items: `avoir_comptant_items`, clé: `avoir_comptant_id`)
- `ECOMMERCE_ORDER` (table items: `ecommerce_order_items`, clé: `order_id`)
- `AVOIR_ECOMMERCE` (table items: `avoir_ecommerce_items`, clé: `avoir_ecommerce_id`)
- `MANUAL`

## Exemples d’utilisation

### Snapshot d’un bon commande

```sql
CALL sp_create_products_snapshot_for_source('BON_COMMANDE', 8, 1, 'Validation bon 8');
```

- Crée un batch `products_snapshot_batches`
- Snapshot uniquement les produits présents dans `commande_items` du bon 8

### Snapshot d’un avoir client

```sql
CALL sp_create_products_snapshot_for_source('AVOIR_CLIENT', 12, 1, 'Avoir client 12');
```

### Snapshot complet manuel (tous produits)

```sql
CALL sp_create_products_snapshot_for_source('MANUAL', NULL, 0, 'Snapshot complet');
```

## Requêtes de détection

### Lister tous les batches

```sql
SELECT *
FROM products_snapshot_batches
ORDER BY id DESC;
```

### Compter les lignes snapshot par batch

```sql
SELECT
  b.id,
  b.source_type,
  b.source_id,
  b.note,
  b.created_at,
  COUNT(ps.snapshot_id) AS rows_count
FROM products_snapshot_batches b
LEFT JOIN products_snapshot ps ON ps.batch_id = b.id
GROUP BY b.id
ORDER BY b.id DESC;
```

### Détecter les bons commande qui n’ont pas de snapshot

```sql
SELECT
  bc.id,
  bc.date_creation,
  bc.statut,
  b.id AS snapshot_batch_id
FROM bons_commande bc
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'BON_COMMANDE'
 AND b.source_id = bc.id
WHERE b.id IS NULL
ORDER BY bc.id DESC;
```

## Suivi des bons commande (tracking)

### 1) Voir tous les snapshots faits pour les bons commande

Chaque ligne = un batch (un snapshot) lié à un bon commande.

```sql
SELECT
  b.id            AS batch_id,
  b.source_id     AS bon_commande_id,
  bc.date_creation,
  bc.statut,
  b.note,
  b.created_at,
  COUNT(ps.snapshot_id) AS snapshot_rows
FROM products_snapshot_batches b
LEFT JOIN bons_commande bc
  ON bc.id = b.source_id
LEFT JOIN products_snapshot ps
  ON ps.batch_id = b.id
WHERE b.source_type = 'BON_COMMANDE'
GROUP BY b.id
ORDER BY b.id DESC;
```

### 2) Suivi complet: tous les bons + statut snapshot (fait / pas fait)

Pratique pour “audit”: tu vois tous les bons, et si un snapshot existe.

```sql
SELECT
  bc.id,
  bc.date_creation,
  bc.statut,
  CASE WHEN b.id IS NULL THEN 0 ELSE 1 END AS has_snapshot,
  MAX(b.created_at) AS last_snapshot_at,
  COUNT(DISTINCT b.id) AS snapshot_count
FROM bons_commande bc
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'BON_COMMANDE'
 AND b.source_id = bc.id
GROUP BY bc.id
ORDER BY bc.id DESC;
```

### 3) Détail d’un snapshot pour un bon commande précis

1) Récupérer le batch le plus récent (ou choisis un batch_id manuellement):

```sql
SELECT b.*
FROM products_snapshot_batches b
WHERE b.source_type = 'BON_COMMANDE' AND b.source_id = 8
ORDER BY b.id DESC
LIMIT 1;
```

2) Voir les lignes produits du snapshot (par batch_id):

```sql
SELECT ps.*
FROM products_snapshot ps
WHERE ps.batch_id = 123
ORDER BY ps.id ASC;
```

> Remarque: `ps.id` ici = l’id produit original (copié depuis `products`).

### 4) Détecter les bons qui ont plusieurs snapshots (doublons)

Utile si tu veux 1 seul snapshot par bon (ou si tu veux comprendre pourquoi il y en a plusieurs).

```sql
SELECT
  b.source_id AS bon_commande_id,
  COUNT(*) AS snapshot_count,
  MIN(b.created_at) AS first_snapshot_at,
  MAX(b.created_at) AS last_snapshot_at
FROM products_snapshot_batches b
WHERE b.source_type = 'BON_COMMANDE'
GROUP BY b.source_id
HAVING COUNT(*) > 1
ORDER BY snapshot_count DESC;
```

### 5) Détecter les snapshots “vides” (batch sans lignes produits)

Si le bon n’a pas d’items, ou si `only_source_products=1` et aucun produit trouvé.

```sql
SELECT
  b.id AS batch_id,
  b.source_type,
  b.source_id,
  b.created_at
FROM products_snapshot_batches b
LEFT JOIN products_snapshot ps ON ps.batch_id = b.id
WHERE ps.snapshot_id IS NULL
ORDER BY b.id DESC;
```

## Notes importantes

- La procédure copie les colonnes de `products` vers `products_snapshot` via SQL dynamique (liste des colonnes lue depuis `information_schema`).
- Les colonnes “meta” (`snapshot_id`, `qte`, `batch_id`, `source_type`, `source_id`, `snapshot_at`) sont exclues automatiquement de la copie.
- Le champ `qte` dans le snapshot est rempli par `products.quantite` au moment du snapshot.

## Quand créer un snapshot (workflow)

Exemples simples (au choix selon ton besoin):
- Quand un document passe au statut `Validé` (ex: bon commande validé / avoir validé)
- Ou bien en mode manuel par l’admin (audit / clôture de période)

Le script SQL ne modifie pas le backend automatiquement: il fournit seulement la structure et les requêtes/procédures.
