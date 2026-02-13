# Workflow: prix d’achat historique (bons/avoirs)

Date: 2026-02-10

## Objectif

Éviter qu’un changement de `products.prix_achat` (suite à la validation d’un bon de commande) modifie rétroactivement le coût/prix d’achat affiché ou utilisé dans les anciens documents:

- Bons Sortie
- Bons Comptant
- Avoir Client
- Avoir Comptant
- Commandes e-commerce
- Avoirs e-commerce
- (Devis: ajout de la colonne/lien, mais c’est un document “commercial”, pas un mouvement stock/CA)

La solution mise en place est d’**attacher chaque ligne d’item** à un bon de commande précis via `bon_commande_id`, puis de **calculer/afficher `prix_achat` depuis la commande liée** (`commande_items.prix_unitaire`) au lieu d’utiliser la valeur actuelle dans `products`.

---

## Résumé des changements

### 1) Base de données (migration SQL)

Fichier: [bpukir/backend/migrations/2026-02-10-products-last-boncommande-and-snapshot.sql](../backend/migrations/2026-02-10-products-last-boncommande-and-snapshot.sql)

Cette migration (idempotente via `information_schema`) ajoute:

- `products.last_boncommande_id` (INT NULL)
  - Index: `idx_products_last_boncommande_id`
  - FK: `fk_products_last_boncommande` → `bons_commande(id)` avec `ON DELETE SET NULL`

- `bon_commande_id` (INT NULL) sur plusieurs tables d’items (bons/avoirs) + index + FK → `bons_commande(id)` avec `ON DELETE SET NULL`
  - `sortie_items`
  - `comptant_items`
  - `vehicule_items`
  - `devis_items`
  - `avoir_client_items`
  - `avoir_fournisseur_items`
  - `avoir_comptant_items`

Migration complémentaire e-commerce:

Fichier: [bpukir/backend/migrations/2026-02-10-ecommerce-items-bon-commande-id.sql](../backend/migrations/2026-02-10-ecommerce-items-bon-commande-id.sql)

- Ajoute `bon_commande_id` à:
  - `ecommerce_order_items`
  - `avoir_ecommerce_items`

Avec index + FK vers `bons_commande(id)` (`ON DELETE SET NULL`).

- Création de `products_snapshot`
  - Contient toutes les colonnes de `products` + `qte`
  - Ajoute une PK `snapshot_id` auto-incrément

Note: `products_snapshot` est créé côté DB mais **n’est pas encore utilisé** dans les routes (la stabilité historique est gérée via `bon_commande_id` + lecture du coût depuis `commande_items`).

---

### 2) Écriture: remplir `bon_commande_id` automatiquement

Principe appliqué aux routes:

- Lors de la création/mise à jour d’un document (sortie/comptant/avoirs/devis…), chaque item peut contenir `bon_commande_id` dans le payload.
- Si le frontend ne l’envoie pas, le backend le résout automatiquement:

```text
resolved_bon_commande_id = item.bon_commande_id
                      ?? products.last_boncommande_id
                      ?? NULL
```

Routes concernées (écriture + lecture du champ):

- [bpukir/backend/routes/sorties.js](../backend/routes/sorties.js)
- [bpukir/backend/routes/comptant.js](../backend/routes/comptant.js)
- [bpukir/backend/routes/bons_vehicule.js](../backend/routes/bons_vehicule.js)
- [bpukir/backend/routes/avoirs_client.js](../backend/routes/avoirs_client.js)
- [bpukir/backend/routes/avoirs_fournisseur.js](../backend/routes/avoirs_fournisseur.js)
- [bpukir/backend/routes/avoirs_comptant.js](../backend/routes/avoirs_comptant.js)
- [bpukir/backend/routes/devis.js](../backend/routes/devis.js)
- [bpukir/backend/routes/ecommerce/orders.js](../backend/routes/ecommerce/orders.js)
- [bpukir/backend/routes/avoirs_ecommerce.js](../backend/routes/avoirs_ecommerce.js)

Implémentation: ajout d’un helper `getLastBonCommandeMap(connection, items)` qui fait une requête unique sur `products` pour récupérer `last_boncommande_id` par `product_id`.

---

### 3) Lecture: `prix_achat` devient stable (historique)

Avant:
- Les items retournaient souvent `prix_achat = products.prix_achat`
- Donc si un bon de commande validé modifie `products.prix_achat`, les anciens bons/avoirs “changent” visuellement et dans certains calculs.

Après:
- Les routes retournent `prix_achat` comme:

```text
prix_achat = COALESCE(
  (SELECT commande_items.prix_unitaire
   WHERE commande_items.bon_commande_id = item.bon_commande_id
     AND commande_items.product_id = item.product_id
   LIMIT 1),
  products.prix_achat
)
```

Routes mises à jour:

- [bpukir/backend/routes/sorties.js](../backend/routes/sorties.js)
- [bpukir/backend/routes/comptant.js](../backend/routes/comptant.js)
- [bpukir/backend/routes/avoirs_client.js](../backend/routes/avoirs_client.js)
- [bpukir/backend/routes/avoirs_comptant.js](../backend/routes/avoirs_comptant.js)

E-commerce:

- Les routes e-commerce stockent `bon_commande_id` sur les lignes (`ecommerce_order_items`, `avoir_ecommerce_items`).
- Les calculs de profit/CA (stats) utilisent ce lien pour un coût historique stable.

Important:
- Si `bon_commande_id` est NULL (anciens documents ou produits jamais achetés), on retombe sur `products.prix_achat` → dans ce cas, l’historique peut encore bouger.

---

### 4) Maintenir `products.last_boncommande_id` au bon moment

Route mise à jour:

- [bpukir/backend/routes/commandes.js](../backend/routes/commandes.js)

Comportement:

- Quand un bon de commande passe en statut **`Validé`**:
  - Pour chaque `product_id` dans `commande_items` de ce bon, on fait:
    - `products.last_boncommande_id = <id du bon_commande>`

- Quand un bon de commande quitte le statut **`Validé`** (retour en Brouillon/Annulé/etc.):
  - On recalcule `products.last_boncommande_id` pour les produits impactés:
    - `MAX(bon_commande_id)` parmi les `commande_items` dont `bons_commande.statut = 'Validé'`
  - Si aucun bon validé n’existe, on met `NULL`.

---

### 5) Stats: profit stable aussi

Fichier mis à jour:

- [bpukir/backend/routes/stats.js](../backend/routes/stats.js)

Changement:
- Les calculs profit (Sortie/Comptant/Avoir client/Avoir comptant) n’utilisent plus uniquement `products.prix_achat`.
- Ils utilisent le coût historique depuis `commande_items.prix_unitaire` via `bon_commande_id` (fallback `products.prix_achat`).

E-commerce:
- Les calculs profit pour `ecommerce_orders` et `avoirs_ecommerce` utilisent aussi `bon_commande_id` (fallback `products.prix_achat`).

Note:
- Les stats e-commerce utilisent encore `products.prix_achat` car les tables e-commerce n’ont pas été incluses dans ce workflow ici.

---

## Workflow “comment ça marche maintenant”

### A) Validation d’un Bon de Commande

1) Tu crées un bon de commande et ses lignes dans `commande_items`.
2) Quand tu passes le statut du bon de commande à **`Validé`**:
   - Le backend met à jour `products.prix_achat` (logique déjà existante)
   - Le backend met aussi `products.last_boncommande_id = <id du bon>` pour chaque produit acheté

Résultat:
- `products.last_boncommande_id` pointe vers le dernier achat validé.

### B) Création d’un document (Sortie/Comptant/Avoir…)

Quand tu ajoutes une ligne item:

- Si tu envoies `bon_commande_id` explicitement → il est stocké.
- Sinon le backend utilise `products.last_boncommande_id` au moment de l’insertion.

Résultat:
- Chaque ligne a une “référence achat” stable.

### C) Affichage / calcul du `prix_achat` dans les documents

Quand on lit un document:

- `prix_achat` est lu depuis `commande_items.prix_unitaire` du bon de commande lié.
- Donc même si `products.prix_achat` change plus tard, l’ancien document garde son coût historique.

---

## Commandes utiles

Depuis le dossier [bpukir/package.json](../package.json):

- Lister migrations:
  - `npm run db:migrate:list`
- Exécuter migrations:
  - `npm run db:migrate`

---

## SQL: snapshot manuel de tous les produits (avec liaison dernier bon)

But:
- Créer un snapshot **maintenant** de tous les produits (en copiant les colonnes actuelles de `products`).
- Remplir `qte` avec la quantité actuelle (`products.quantite`).
- Forcer `last_boncommande_id` du snapshot vers **le dernier bon de commande validé** qui contient le produit.
- Les prix utilisés dans le snapshot restent ceux de `products` au moment d’exécution (donc “manuel”).

SQL (exécuter dans MySQL):

```sql
-- Optionnel: si tu veux garder un seul snapshot “dernier état”, décommente:
-- TRUNCATE TABLE products_snapshot;

SET @before := (SELECT IFNULL(MAX(snapshot_id), 0) FROM products_snapshot);

-- Insert: copie toutes les colonnes de products + qte
INSERT INTO products_snapshot
SELECT
  NULL AS snapshot_id,
  p.*,
  p.quantite AS qte
FROM products p;

-- Update: liaison vers le dernier bon commande VALIDÉ qui contient le produit
UPDATE products_snapshot ps
LEFT JOIN (
  SELECT
    ci.product_id,
    MAX(ci.bon_commande_id) AS last_id
  FROM commande_items ci
  JOIN bons_commande bc ON bc.id = ci.bon_commande_id
  WHERE bc.statut = 'Validé'
  GROUP BY ci.product_id
) x ON x.product_id = ps.id
SET ps.last_boncommande_id = x.last_id
WHERE ps.snapshot_id > @before;
```

Remarques:
- Si tu veux “dernier bon même si pas Validé”, enlève le `JOIN bons_commande` + `WHERE bc.statut = 'Validé'`.
- Ce snapshot n’est pas encore consommé par les routes; il sert surtout à garder un état manuel exportable/auditable.

---

## Points d’attention / limites

- Les documents existants (déjà en base avant cette mise à jour) ont `bon_commande_id` NULL.
  - Pour eux, l’affichage/calc peut encore dépendre de `products.prix_achat`.
  - Si tu veux un historique parfait, il faut:
    - soit backfill `bon_commande_id` sur les anciennes lignes (règle métier à définir)
    - soit stocker un `prix_achat_snapshot` directement dans les items (non demandé ici)

- `products_snapshot` existe côté DB mais n’est pas branché dans les routes pour l’instant.

---

## Fichiers modifiés (code)

- [bpukir/backend/routes/avoirs_comptant.js](../backend/routes/avoirs_comptant.js)
- [bpukir/backend/routes/devis.js](../backend/routes/devis.js)
- [bpukir/backend/routes/sorties.js](../backend/routes/sorties.js)
- [bpukir/backend/routes/comptant.js](../backend/routes/comptant.js)
- [bpukir/backend/routes/avoirs_client.js](../backend/routes/avoirs_client.js)
- [bpukir/backend/routes/stats.js](../backend/routes/stats.js)
- [bpukir/backend/routes/commandes.js](../backend/routes/commandes.js)
- [bpukir/backend/routes/ecommerce/orders.js](../backend/routes/ecommerce/orders.js)
- [bpukir/backend/routes/avoirs_ecommerce.js](../backend/routes/avoirs_ecommerce.js)

Migration:
- [bpukir/backend/migrations/2026-02-10-products-last-boncommande-and-snapshot.sql](../backend/migrations/2026-02-10-products-last-boncommande-and-snapshot.sql)
- [bpukir/backend/migrations/2026-02-10-ecommerce-items-bon-commande-id.sql](../backend/migrations/2026-02-10-ecommerce-items-bon-commande-id.sql)
