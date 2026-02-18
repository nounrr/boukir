# Solde cumulé (cards statistiques)

Ce document décrit **comment est calculé le “Solde cumulé”** affiché dans les cards de statistiques sur la page Contacts.

## Où ça s’affiche (frontend)

- Page: `bpukir/frontend/src/pages/ContactsPage.tsx`
- Card: "Solde cumulé"
- Source: `useGetContactsSummaryQuery(...)` → champ `contactsSummary.totalSoldeCumule`

## Source des données (API)

La card utilise l’endpoint:

- `GET /api/contacts/summary`

Paramètres principaux utilisés par le frontend:

- `type`: `Client` ou `Fournisseur` (selon l’onglet)
- `search`: recherche (nom / société / téléphone)
- `clientSubTab`: sous-onglet client (si actif)
- (optionnel) `groupId`

Le backend applique ces filtres via `applyContactsFilters(...)`, puis calcule un total.

## Définition: solde_cumule (par contact)

Dans le backend, le solde cumulé d’un contact est calculé avec l’expression SQL `BALANCE_EXPR` (dans `bpukir/backend/routes/contacts.js`).

### Cas Client

Pour un **client**:

- **Solde initial**: `contacts.solde`
- **Ventes backoffice**: somme des `montant_total` de:
  - `bons_sortie`
  - `bons_comptant`
  (statuts exclus: `annulé/annule`, `supprimé/supprime`, `brouillon`, `refusé/refuse`, `expiré/expire`)
- **Ventes e-commerce**: somme de `ecommerce_orders.total_amount` (statuts exclus: `cancelled`, `refunded`)
- **Paiements client**: somme de `payments.montant_total` où `type_paiement = 'Client'` (statuts exclus: `annulé/annule`, `supprimé/supprime`)
- **Avoirs client**: somme de `avoirs_client.montant_total` (statuts exclus: `annulé/annule`, `supprimé/supprime`)
- **Avoirs e-commerce**: somme de `avoirs_ecommerce.montant_total` (statuts exclus: `annulé/annule`)

Formule (vue “comptable”):

> `solde_cumule = solde_initial + ventes_backoffice + ventes_ecommerce - paiements_client - avoirs_client - avoirs_ecommerce`

Interprétation:

- Les **bons (ventes)** augmentent le solde (le client doit plus).
- Les **paiements** et **avoirs** diminuent le solde (le client doit moins).

### Cas Fournisseur

Pour un **fournisseur**:

- **Solde initial**: `contacts.solde`
- **Achats fournisseur**: somme de `bons_commande.montant_total` (statuts exclus: `annulé/annule`, `supprimé/supprime`)
- **Paiements fournisseur**: somme de `payments.montant_total` où `type_paiement = 'Fournisseur'` (statuts exclus: `annulé/annule`, `supprimé/supprime`)
- **Avoirs fournisseur**: somme de `avoirs_fournisseur.montant_total` (statuts exclus: `annulé/annule`, `supprimé/supprime`)

Formule:

> `solde_cumule = solde_initial + achats_fournisseur - paiements_fournisseur - avoirs_fournisseur`

## Définition: totalSoldeCumule (valeur affichée dans la card)

La card “Solde cumulé” affiche:

> `totalSoldeCumule = SUM(solde_cumule)`

où la somme est faite **sur l’ensemble des contacts** qui matchent les filtres (`type`, `search`, `clientSubTab`, `groupId`).

Techniquement, c’est fait dans la requête SQL de `GET /api/contacts/summary`:

- `COALESCE(SUM(BALANCE_EXPR), 0) AS totalSoldeCumule`

## Notes importantes / cohérence

- Le frontend contient aussi un calcul “ligne par ligne” (historique détaillé) dans `ContactsPage.tsx` et un helper dans `bpukir/frontend/src/utils/soldeCalculator.ts`.
- Dans `soldeCalculator.ts`, les **commandes e-commerce prises en compte dans l’historique** peuvent être filtrées par `is_solde` (uniquement les commandes en solde/crédit).
- L’endpoint `/api/contacts/summary` (et `BALANCE_EXPR`) additionne les ventes e-commerce selon le statut (`cancelled/refunded` exclus) **sans filtrer explicitement `is_solde`**.

Si tu veux que la card “Solde cumulé” reflète strictement *uniquement* les commandes e-commerce en solde, il faut aligner la sous-requête `ventes_ecommerce` du backend avec la règle `is_solde`.
