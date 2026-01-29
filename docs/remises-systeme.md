# Système "Remises" (app Boukir) — fonctionnement actuel + pistes de restructuration

Ce document explique comment la fonctionnalité **Remises** fonctionne aujourd’hui dans l’application (frontend + backend + base de données), et liste les problèmes probables qui font que “ça ne travaille pas bien”, afin de faciliter une restructuration.

---

## 1) Objectif fonctionnel

Le module **Remises** sert à gérer un “compte remise” par client (ou par contact) :

- **Client remise** (table `client_remises`) : une fiche (nom/téléphone/CIN/notes) qui représente un bénéficiaire de remises.
- **Lignes de remise** (table `item_remises`) : des lignes par produit, quantité et montant de remise, éventuellement rattachées à un **bon**.

L’application affiche :
- Une liste des clients remises + total de leurs remises.
- Une page détail d’un client remise avec ses lignes et actions (valider / annuler / mettre en attente).

---

## 2) Modèle de données (DB)

### 2.1 Table `client_remises`
Champs principaux (backend):
- `id`: identifiant
- `nom`: obligatoire
- `phone`, `cin`, `note`: optionnels
- `type`: `client-remise` ou `client_abonne` (défaut `client-remise`)
- `contact_id`: lien vers `contacts.id` (optionnel)
- `created_at`, `updated_at`

### 2.2 Table `item_remises`
Champs principaux (backend):
- `id`
- `client_remise_id`: FK vers `client_remises(id)`
- `product_id`: FK vers `products(id)` (si `products` existe)
- `qte`: quantité
- `prix_remise`: montant (voir règles ci-dessous)
- `statut`: `En attente` | `Validé` | `Annulé`
- `bon_id` + `bon_type`: lien optionnel vers un bon (Sortie/Comptant/Commande)
- `is_achat`: bool (0/1) **existe côté DB**, mais le frontend actuel ne l’utilise pas dans l’UI
- `created_at`, `updated_at`

### 2.3 Règle de calcul “total_remise”
Le backend calcule la somme comme :

- `total_remise = SUM(qte * prix_remise)`
- en excluant `statut = 'Annulé'`

Implication importante :
- si `prix_remise` est **négatif**, la remise totale **diminue**.

---

## 3) API backend (routes)

Base URL : `/api/remises`

### 3.1 Clients remises
- `GET /remises/clients`
  - Retourne les lignes `client_remises` + un champ `total_remise` agrégé.
  - Important : **ne retourne pas** les `items` (les lignes) dans ce endpoint.

- `GET /remises/clients/by-contact/:contactId`
  - Cherche un `client_remises` de type `client_abonne` rattaché à `contact_id`.

- `POST /remises/clients` (token requis)
  - Crée un client remise.
  - Valide `type` dans `client-remise` | `client_abonne`.

- `PATCH /remises/clients/:id` (token requis)
  - Modifie `nom`, `phone`, `cin`, `note`.

- `DELETE /remises/clients/:id` (token requis)
  - **PDG uniquement**.

### 3.2 Lignes (items)
- `GET /remises/clients/:id/items`
  - Retourne les lignes `item_remises` (avec `designation` produit si possible).

- `POST /remises/clients/:id/items` (token requis)
  - Crée une ligne remise.
  - Sécurité statut :
    - si rôle ≠ `PDG` et ≠ `ManagerPlus` => statut forcé à `En attente`.

- `PATCH /remises/items/:itemId` (token requis)
  - Modifie champs d’une ligne.
  - Sécurité statut :
    - rôle ≠ `PDG`/`ManagerPlus` ne peut pas passer à `Validé`.

- `DELETE /remises/items/:itemId` (token requis)
  - **PDG uniquement**.

### 3.3 Lien aux bons (agrégation)
- `GET /remises/clients/:id/bons`
  - Agrège les lignes de remises par `(bon_type, bon_id)`.
  - Joint sur `bons_sortie`, `bons_comptant`, `bons_commande` + `contacts`.

Règle “resolveBonLink” lors de la création/modif d’un item :
- si `bon_id` existe mais pas `bon_type`, le serveur tente de deviner (Sortie/Comptant).
- si `bon_type` n’est pas dans {Commande, Sortie, Comptant} ⇒ lien supprimé.

---

## 4) Frontend actuel (RemisesPage)

### 4.1 Écran liste
Fichier : `frontend/src/pages/RemisesPage.tsx`

- Charge : `useGetClientRemisesQuery()`.
- Affiche : liste des clients remises.
- Total colonne :
  - si `c.items` existe ⇒ calcule localement via `items`.
  - sinon ⇒ utilise `c.total_remise`.

### 4.2 Statistiques en haut
- `totalClients = clients.length`
- `totalRemises` :
  - si `c.items` existe ⇒ calcule localement.
  - sinon ⇒ utilise `c.total_remise`.

- `clientsActifs` :
  - **actuellement** basé sur `c.items.some(it.statut === 'Validé')`.
  - MAIS l’API `GET /remises/clients` ne renvoie pas `items`.

➡️ Résultat : `clientsActifs` est souvent faux (souvent 0), ce qui donne l’impression que la fonctionnalité est “cassée”.

### 4.3 Détail client remise
- Charge items via `useGetRemiseItemsQuery(clientRemise.id)`.
- Permet d’ajouter une ligne : produit + qté + prix_remise + (optionnel) bon.

### 4.4 “Remise négative” (UI)
Dans le détail, on peut cocher **Remise négative** :
- le frontend enregistre `prix_remise` en **négatif** (ex: -5.00).
- `bon_id` / `bon_type` sont désactivés dans l’UI quand c’est négatif.

Attention : la table a déjà `is_achat`, mais aujourd’hui le code fait plutôt :
- “négatif = flux inverse”
- sans utiliser `is_achat`

➡️ Ça peut devenir confus : est-ce qu’une remise négative veut dire “achat”, “retrait remise”, “correction”, “utilisation d’un crédit remise”, etc. ?

---

## 5) Permissions / statuts

### 5.1 Statuts
- `En attente`: brouillon / non confirmé
- `Validé`: appliqué
- `Annulé`: ignoré dans les totaux

### 5.2 Rôles
- Valider (`statut = Validé`) : seulement `PDG` ou `ManagerPlus` (côté backend).
- Supprimer (client remise / item) : seulement `PDG`.

Note : l’UI permet à tout le monde de cliquer “Annuler” (si token OK), et le backend accepte ce changement (pas bloqué). C’est peut-être voulu, mais si non, il faut verrouiller.

---

## 6) Problèmes probables (pourquoi “ça ne marche pas bien”)

1) **Statistique “Clients Actifs” fausse**
- L’UI calcule `clientsActifs` à partir de `c.items`, mais `GET /remises/clients` ne renvoie pas `items`.
- Donc `clientsActifs` tombe à 0 (ou incohérent).

2) **Modèle “prix_remise négatif” non formalisé**
- On a 2 façons possibles de représenter un flux :
  - `prix_remise` négatif
  - ou `is_achat` / `direction` (débit/crédit)
- Aujourd’hui on mélange / on n’exploite pas `is_achat`.

3) **Le lien bon est optionnel et partiellement validé**
- Si `bon_type=Commande`, le backend ne vérifie pas forcément que `bons_commande.id` existe (il accepte le type si valide).
- En cas d’erreur de saisie, l’item est créé mais l’agrégation par bon devient vide/incohérente.

4) **Pas de “balance remise” claire**
- On voit des totaux (somme des lignes), mais pas un “solde remise” (crédit restant) avec règles métier.
- Or le backend a aussi `contacts.remise_balance` (dans `ensureRemiseSchema.js`), ce qui suggère qu’un mécanisme de balance est attendu, mais il n’est pas connecté clairement ici.

---

## 7) Proposition de restructuration (recommandée)

### Option A (simple, efficace) : Remises = “prix spécial par client & produit”
Si l’objectif est de fixer un prix net/remise par produit pour un client (comme un barème) :
- Renommer le module conceptuellement en **Tarifs client**.
- Les lignes ne devraient pas dépendre d’un bon.
- Une ligne = `client_contact_id` + `product_id` + `prix_special` ou `remise_par_unite`.
- Statut utile : `Actif` / `Inactif`.

➡️ Plus simple, moins d’ambiguïté.

### Option B (comptable) : Remises = “wallet / solde remise” (crédit/débit)
Si l’objectif est un **crédit remise** (comme un portefeuille) :
- Transformer `item_remises` en **ledger** (journal) :
  - `direction`: `CREDIT` (gagne) / `DEBIT` (utilise)
  - `amount`: montant total (pas per unit)
  - `source_type`: `BON`, `PAYMENT`, `MANUAL`, `ECOMMERCE_ORDER`…
  - `source_id`
- Calculer `contacts.remise_balance` depuis ce ledger (ou maintenir via triggers/transactions).

➡️ Permet d’appliquer la remise lors du paiement/checkout et d’avoir un solde restant fiable.

### Option C (hybride) : 2 modules séparés
- **Tarifs/Remises par produit** (prix spécial)
- **Wallet remise** (solde)

➡️ Souvent le meilleur compromis : pas de mélange de concepts.

---

## 8) Checklist de décisions (avant de recoder)

1) Une remise est-elle :
   - un prix spécial par produit ?
   - un crédit à utiliser plus tard ?
   - une réduction appliquée à un bon ?

2) Le calcul correct doit-il inclure seulement `Validé` (et pas `En attente`) ?

3) Qui peut : créer / valider / annuler ?

4) Est-ce qu’on rattache forcément la remise à un `contact_id` (contacts existants) ?

---

## 9) Références code

- UI: `frontend/src/pages/RemisesPage.tsx`
- API client: `frontend/src/store/api/remisesApi.ts`
- Backend routes: `backend/routes/remises.js`
- Schema helpers: `backend/utils/ensureRemiseSchema.js`
- Migrations: `backend/migrations/2025-08-20-create-remises-tables.sql`, `backend/migrations/2025-09-11-add-type-to-client-remises.sql`
