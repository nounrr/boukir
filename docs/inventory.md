# Inventaire — Enregistrement et Consultation

Ce document explique comment l'inventaire est enregistré sans modifier le stock actuel, comment le consulter, et comment l'enregistrer en base de données si vous souhaitez persister les snapshots côté DB.

## Vue d'ensemble
- Objectif: capturer un "snapshot" du stock à un instant T (valeurs quantités/prix), sans changer les quantités en temps réel.
- Par défaut (implémenté): enregistrement fichier (JSON + CSV) dans `backend/uploads/inventory/YYYY-MM-DD/`.
- Sécurité: seul `PDG` et `ManagerPlus` peuvent créer un snapshot; tous les utilisateurs authentifiés peuvent lister/consulter.

## Accès & Rôles
- Création de snapshot: rôle `PDG` ou `ManagerPlus` (contrôlé dans le backend).
- Lecture/liste: requiert authentification (les endpoints sont montés via le routeur protégé).

## Endpoints API
- POST `/api/inventory/snapshots`
  - Crée un snapshot du jour, génère deux fichiers (`.json` et `.csv`) et retourne leurs URL publiques.
  - Réponse (ex.):
  ```json
  {
    "ok": true,
    "id": 1737080000000,
    "date": "2026-01-17",
    "jsonUrl": "/uploads/inventory/2026-01-17/snapshot-1737080000000.json",
    "csvUrl": "/uploads/inventory/2026-01-17/snapshot-1737080000000.csv",
    "totals": { "totalProducts": 120, "totalQty": 3200, "totalCost": 123456.78, "totalSale": 145678.90 }
  }
  ```
- GET `/api/inventory/snapshots?date=YYYY-MM-DD`
  - Liste les snapshots pour la date; chaque entrée inclut les fichiers disponibles.
- GET `/api/inventory/snapshots/:id?date=YYYY-MM-DD`
  - Retourne le contenu JSON du snapshot demandé.

## Stockage Fichiers
- Chemin: `backend/uploads/inventory/<YYYY-MM-DD>/snapshot-<id>.json|csv`.
- `json` contient: meta (date, auteur, rôle, totaux) et `items` avec `{ id, designation, quantite, prix_achat, prix_vente, kg, valeur_cost, valeur_sale }`.

## Frontend
- Page: `/inventaire` — affiche la liste des snapshots du jour et un bouton "Enregistrer inventaire" (visible pour `PDG`/`ManagerPlus`).
  - Fichier: `frontend/src/pages/InventoryPage.tsx`.
- Bouton d'accès rapide dans `BonsPage` header.
  - Fichier: `frontend/src/pages/BonsPage.tsx`.
- Navigation (Sidebar): entrée "Inventaire" sous Produits.
  - Fichier: `frontend/src/components/layout/Sidebar.tsx`.

### Essais rapides
- Créer un snapshot via curl:
```bash
curl -X POST http://localhost:3001/api/inventory/snapshots \
  -H "Authorization: Bearer <TOKEN_PDg_ou_ManagerPlus>" \
  -H "Content-Type: application/json"
```
- Lister les snapshots du jour:
```bash
curl http://localhost:3001/api/inventory/snapshots?date=$(date +%F) \
  -H "Authorization: Bearer <TOKEN>"
```

## Enregistrer en Base de Données (optionnel)
Si vous souhaitez persister les snapshots en DB (en plus ou à la place des fichiers), créez ces tables puis insérez les données transactionnellement.

### Schéma SQL (MySQL)
```sql
-- Table snapshots (en-tête)
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id BIGINT PRIMARY KEY, -- utiliser timestamp/epoch pour cohérence avec fichiers
  created_at DATETIME NOT NULL,
  created_by INT NULL,
  role VARCHAR(32) NULL,
  total_products INT NOT NULL DEFAULT 0,
  total_qty DECIMAL(18,3) NOT NULL DEFAULT 0,
  total_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_sale DECIMAL(18,2) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

-- Table items (détails par produit)
CREATE TABLE IF NOT EXISTS inventory_snapshot_items (
  snapshot_id BIGINT NOT NULL,
  product_id INT NULL,
  designation VARCHAR(255) NOT NULL,
  quantite DECIMAL(18,3) NOT NULL DEFAULT 0,
  prix_achat DECIMAL(18,2) NOT NULL DEFAULT 0,
  prix_vente DECIMAL(18,2) NOT NULL DEFAULT 0,
  kg DECIMAL(18,3) NULL,
  valeur_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  valeur_sale DECIMAL(18,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_id, product_id),
  CONSTRAINT fk_inv_items_snapshot FOREIGN KEY (snapshot_id)
    REFERENCES inventory_snapshots(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Index pour recherches
CREATE INDEX IF NOT EXISTS idx_inv_items_product ON inventory_snapshot_items(product_id);
```

### Insertion côté backend (exemple)
Dans `backend/routes/inventory.js`, à l'intérieur du handler POST, après calcul `items` et `totals`, insérer transactionnellement:
```js
import pool from '../db/pool.js';

// ... après le calcul de const items = [...]; const totals = {...};
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  const now = new Date();
  const ts = now.toISOString().slice(0,19).replace('T',' ');
  const snapshotId = Date.now();

  await conn.query(
    `INSERT INTO inventory_snapshots (id, created_at, created_by, role, total_products, total_qty, total_cost, total_sale)
     VALUES (?,?,?,?,?,?,?,?)`,
    [snapshotId, ts, req.user?.id || null, req.user?.role || null,
     totals.totalProducts, totals.totalQty, totals.totalCost, totals.totalSale]
  );

  // Bulk insert items
  if (items.length) {
    const values = items.map(it => [
      snapshotId,
      it.id ?? null,
      String(it.designation || ''),
      Number(it.quantite || 0),
      Number(it.prix_achat || 0),
      Number(it.prix_vente || 0),
      it.kg != null ? Number(it.kg) : null,
      Number(it.valeur_cost || 0),
      Number(it.valeur_sale || 0)
    ]);
    await conn.query(
      `INSERT INTO inventory_snapshot_items
       (snapshot_id, product_id, designation, quantite, prix_achat, prix_vente, kg, valeur_cost, valeur_sale)
       VALUES ` + values.map(() => '(?,?,?,?,?,?,?,?,?)').join(','),
      values.flat()
    );
  }

  await conn.commit();
  res.json({ ok: true, id: snapshotId, savedToDb: true, totals });
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
}
```

### Bonnes pratiques & sécurité
- **Lecture seule du stock**: ne mettez jamais à jour `products.quantite` lors d'un snapshot.
- **Transactions**: utilisez `BEGIN/COMMIT/ROLLBACK` pour garantir la cohérence.
- **Indexation**: index sur `(snapshot_id)` et `(product_id)` pour accélérer les recherches.
- **Contrôles d'accès**: gardez la restriction de rôle pour la création.
- **Traçabilité**: stockez `created_by` et `role` pour audit.

## Intégration UI (option DB)
- Vous pouvez afficher un badge "Enregistré en DB" dans `/inventaire` si la réponse contient `savedToDb: true`.
- Ou ajouter un switch dans l'UI pour choisir "Fichier" vs "Base de données" (à implémenter côté backend via un paramètre ou variable d'environnement).

---
Besoin d'aide pour activer l'enregistrement en DB directement dans le code ? Je peux ajouter la logique et une migration automatique côté backend.
