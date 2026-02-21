# Calcul du Solde Cumulé — Documentation Technique

## Vue d'ensemble

Le **solde cumulé** (`solde_cumule`) est calculé **à la volée** (on-the-fly) par une requête SQL. Il n'est **jamais stocké** dans la base de données. Le champ `contacts.solde` est un **solde initial/statique** qui n'est modifié que manuellement (création, édition, import CSV).

---

## Formule générale (BALANCE_EXPR)

### Pour un Client

```
solde_cumule = contacts.solde (solde initial)
             + ventes backoffice    (bons_sortie UNIQUEMENT)
             + ventes ecommerce     (ecommerce_orders WHERE is_solde = 1)
             - paiements client     (payments WHERE type_paiement = 'Client')
             - avoirs client        (avoirs_client)
```

> **bons_comptant** : NON inclus dans le calcul (n'affecte pas le solde contact).
> **avoirs_ecommerce** : NON inclus dans le calcul.
> **ecommerce_orders** : seules les commandes avec `is_solde = 1` sont comptées.

### Pour un Fournisseur

```
solde_cumule = contacts.solde (solde initial)
             + achats fournisseur   (bons_commande)
             - paiements fournisseur (payments WHERE type_paiement = 'Fournisseur')
             - avoirs fournisseur   (avoirs_fournisseur)
```

### Autres types

```
solde_cumule = contacts.solde
```

---

## Statuts exclus (Blacklist)

Toutes les sous-requêtes de `BALANCE_EXPR` utilisent un **blacklist** de statuts. Les enregistrements avec ces statuts sont **ignorés** du calcul :

```sql
LOWER(TRIM(statut)) NOT IN (
  'annulé',
  'annule',
  'supprimé',
  'supprime',
  'brouillon',
  'refusé',
  'refuse',
  'expiré',
  'expire'
)
```

> **Note :** La normalisation se fait avec `LOWER(TRIM(...))` pour gérer les accents et espaces.

### Cas spécial : ecommerce_orders

Les commandes ecommerce utilisent un blacklist différent (statuts en anglais) + un filtre `is_solde` :

```sql
o.is_solde = 1
AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded')
```

---

## Détail des sous-requêtes

### 1. Ventes Client (`ventes_client`)

| Propriété | Valeur |
|-----------|--------|
| **Table** | `bons_sortie` uniquement |
| **Colonne montant** | `montant_total` |
| **Jointure** | `client_id = contacts.id` |
| **Condition** | `client_id IS NOT NULL` |
| **Filtre statut** | Blacklist standard |
| **S'applique à** | `contacts.type = 'Client'` uniquement |

> ⚠️ `bons_comptant` n'est **PAS** inclus.

### 2. Ventes Ecommerce (`ventes_ecommerce`)

| Propriété | Valeur |
|-----------|--------|
| **Table** | `ecommerce_orders` |
| **Colonne montant** | `total_amount` |
| **Jointure** | `ecommerce_orders.user_id = contacts.id` |
| **Filtre** | `is_solde = 1` ET `status NOT IN ('cancelled', 'refunded')` |
| **S'applique à** | `contacts.type = 'Client'` uniquement |

> ⚠️ Seules les commandes marquées `is_solde = 1` sont comptées.

### 3. Achats Fournisseur (`achats_fournisseur`)

| Propriété | Valeur |
|-----------|--------|
| **Table** | `bons_commande` |
| **Colonne montant** | `montant_total` |
| **Jointure** | `fournisseur_id = contacts.id` |
| **Condition** | `fournisseur_id IS NOT NULL` |
| **Filtre statut** | Blacklist standard |
| **S'applique à** | `contacts.type = 'Fournisseur'` uniquement |

### 4. Paiements Client (`paiements_client`)

| Propriété | Valeur |
|-----------|--------|
| **Table** | `payments` |
| **Colonne montant** | `montant_total` |
| **Jointure** | `contact_id = contacts.id` |
| **Condition** | `type_paiement = 'Client'` |
| **Filtre statut** | Blacklist standard |
| **S'applique à** | `contacts.type = 'Client'` uniquement |

### 5. Paiements Fournisseur (`paiements_fournisseur`)

| Propriété | Valeur |
|-----------|--------|
| **Table** | `payments` |
| **Colonne montant** | `montant_total` |
| **Jointure** | `contact_id = contacts.id` |
| **Condition** | `type_paiement = 'Fournisseur'` |
| **Filtre statut** | Blacklist standard |
| **S'applique à** | `contacts.type = 'Fournisseur'` uniquement |

### 6. Avoirs Client (`avoirs_client`)

| Propriété | Valeur |
|-----------|--------|
| **Table** | `avoirs_client` |
| **Colonne montant** | `montant_total` |
| **Jointure** | `client_id = contacts.id` |
| **Filtre statut** | Blacklist standard |
| **S'applique à** | `contacts.type = 'Client'` uniquement |

### 7. Avoirs Fournisseur (`avoirs_fournisseur`)

| Propriété | Valeur |
|-----------|--------|
| **Table** | `avoirs_fournisseur` |
| **Colonne montant** | `montant_total` |
| **Jointure** | `fournisseur_id = contacts.id` |
| **Filtre statut** | Blacklist standard |
| **S'applique à** | `contacts.type = 'Fournisseur'` uniquement |

---

## Composants NON inclus dans le calcul

| Composant | Raison |
|-----------|--------|
| **`bons_comptant`** | N'affecte pas le solde des contacts |
| **`avoirs_ecommerce`** | Non pris en compte dans le solde cumulé |

---

## Les 3 endpoints qui calculent le solde cumulé

### 1. `GET /api/contacts` — Liste paginée (par contact)

- **Utilise** : `BALANCE_EXPR` avec LEFT JOINs
- **Résultat** : chaque contact a un champ `solde_cumule`
- **Filtres statut** : Blacklist standard (9 valeurs)
- **Scope** : paginé, filtrable par type/search/sous-onglet

### 2. `GET /api/contacts/summary` — Stats globales

- **Utilise** : `SUM(BALANCE_EXPR)` avec les mêmes LEFT JOINs
- **Résultat** : `totalSoldeCumule` = somme de tous les solde_cumule
- **Filtres statut** : Blacklist standard (9 valeurs)
- **Scope** : filtrable par type/search/sous-onglet (suit les filtres actifs)

### 3. `GET /api/contacts/solde-cumule-card` — Card globale

- **Utilise** : une requête **différente** avec des sous-requêtes indépendantes
- **Résultat** : `total_final`
- **Filtres statut** : **Whitelist** (permet seulement certains statuts)
- **Scope** : global, sans filtres, sans pagination

---

## Différences entre la Card et BALANCE_EXPR

| Aspect | Card (`/solde-cumule-card`) | Liste (`BALANCE_EXPR`) |
|--------|---------------------------|----------------------|
| **Méthode de filtrage** | Whitelist (`IN (...)`) | Blacklist (`NOT IN (...)`) |
| **Ecommerce** | `is_solde = 1` | `is_solde = 1` |
| **`bons_comptant`** | Non inclus | Non inclus |
| **`avoirs_ecommerce`** | Soustraits (dans la card uniquement) | Non inclus |
| **`contacts.solde`** | `SUM(solde)` de TOUS les contacts | Par contact selon son type |
| **Fournisseurs** | ❌ Pas de bons_commande, pas de paiements/avoirs fournisseur | ✅ Inclus |
| **Bons orphelins** | Inclus (pas de filtre `client_id`) | Exclus (`client_id IS NOT NULL`) |
| **Paiements statuts** | `IN ('En attente','Validé')` = 2 statuts | Blacklist = plus large |

### Statuts whitelist de la Card

| Table | Statuts acceptés |
|-------|-----------------|
| `bons_sortie` | `'En attente'`, `'Validé'`, `'Livré'`, `'Facturé'` |
| `avoirs_client` | `'En attente'`, `'Validé'`, `'Appliqué'` |
| `payments` | `'En attente'`, `'Validé'` |
| `ecommerce_orders` | `'pending'`, `'confirmed'`, `'processing'`, `'shipped'`, `'delivered'` |
| `avoirs_ecommerce` | `'En attente'`, `'Validé'`, `'Appliqué'` |

---

## `contacts.solde` — Quand est-il modifié ?

Le champ `contacts.solde` est **statique**. Il n'est modifié que dans 3 cas :

| Action | Endpoint | Description |
|--------|----------|-------------|
| Création contact | `POST /api/contacts` | Valeur initiale (défaut = 0) |
| Édition contact | `PUT /api/contacts/:id` | Modification manuelle par l'admin |
| Import CSV | `POST /api/import-contacts` | Valeur depuis le fichier CSV |

> **Aucun code transactionnel** (création de bon, paiement, avoir, commande ecommerce) **ne modifie jamais** `contacts.solde`. Il n'y a donc **pas de double-comptage**.

---

## Tri par solde cumulé

Quand l'utilisateur trie par "Solde", le frontend envoie `sortBy=solde_cumule` au backend. Le backend mappe :

```js
const sortMap = {
  solde: 'solde_cumule',
  solde_cumule: 'solde_cumule',
  nom: 'c.nom_complet',
  societe: 'c.societe',
  created_at: 'c.created_at',
};
```

Le tri est fait en SQL avec `ORDER BY solde_cumule ASC/DESC`, ce qui trie sur la valeur calculée à la volée.

---

## Fichiers source

- **Backend routes** : `bpukir/backend/routes/contacts.js`
  - `BALANCE_EXPR` : expression CASE principale
  - `SINGLE_CONTACT_QUERY` : requête pour un contact individuel
  - Liste paginée : JOINs et requête principale
  - Summary : JOINs et agrégation `SUM(BALANCE_EXPR)`
  - Card : requête indépendante avec whitelist
- **Utilitaire** : `bpukir/backend/utils/soldeCumule.js`
  - Fonction `getContactSoldeCumule()` — même formule que BALANCE_EXPR
