# Statistiques — Chiffre d’Affaires & Achats (Backoffice)

Ce document décrit **les règles de calcul** utilisées par l’API de statistiques (backend) pour alimenter les pages:
- Chiffre d’affaires (liste par jour)
- Détail chiffre d’affaires (par date)

Objectif: que le calcul soit **100% côté backend / base de données**, et que le frontend n’ait plus de logique de calcul (il affiche juste les valeurs).

## 1) API

### 1.1 Résumé + détail par jour

`GET /api/stats/chiffre-affaires`

Query params:
- `filterType`: `all | day | period | month`
- si `day`: `date=YYYY-MM-DD`
- si `period`: `startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- si `month`: `month=YYYY-MM`

Réponse (structure utilisée par la page):
- `totalChiffreAffaires`
- `totalChiffreAffairesAchat`
- `totalChiffreAchats`
- `totalBons`
- `dailyData[]`: `{ date, chiffreAffaires, chiffreAffairesAchat, chiffreAffairesAchatBrut, chiffreAchats, totalRemises }`
- `totalRemisesNet`, `totalRemisesVente`, `totalRemisesAvoirClient`, `totalRemisesAvoirComptant`

### 1.2 Détail par date

`GET /api/stats/chiffre-affaires/detail/:date`

- `:date` au format `YYYY-MM-DD`

Réponse: tableau de 3 sections:
- `CA_NET`
- `BENEFICIAIRE`
- `ACHATS`

Chaque section contient:
- `total`
- `calculs[]` par bon: `{ bonId, bonNumero, bonType, totalBon, profitBon?, totalRemiseBon?, netTotalBon?, items[] }`

## 2) Règles de filtrage (documents inclus)

### 2.1 Statuts inclus

Les documents pris en compte sont ceux dont le `statut` (après normalisation `LOWER(TRIM(...))`) est dans:
- `en attente`
- `validé`
- `livré`
- `payé` (ou `paye`)
- `facturé`
- `appliqué` (pour certains avoirs)

Par tolérance (données historiques / variantes), l’API accepte aussi:
- `valide`
- `pending`

### 2.2 Exclusion des documents “non calculés”

Tout document avec `isNotCalculated = 1` est exclu.

## 3) Définitions des montants

### 3.1 Coût utilisé

Pour chaque ligne d’article, le coût est:

$$
cout = COALESCE(products.cout_revient,\ products.prix_achat,\ 0)
$$

### 3.2 Remise

La remise (montant) est traitée comme **un montant unitaire**:

$$
remise_{total} = remise_{montant\_unitaire} \times quantite
$$

### 3.3 Profit d’une ligne

- Profit brut (avant remises):

$$
profit_{brut\_ligne} = (PV - cout) \times quantite
$$

- Profit net (après remises):

$$
profit_{net\_ligne} = ((PV - cout) \times quantite) - remise_{total}
$$

Où:
- $PV = prix\_unitaire$

### 3.4 Profit d’un bon

Somme des lignes:

$$
profit_{bon} = \sum profit_{net\_ligne}
$$

### 3.5 Total remises d’un bon

$$
remises_{bon} = \sum remise_{total}
$$

### 3.6 Total net d’un bon (info / contrôle)

Le “net total” affichable est:

$$
netTotalBon = montant\_total - remises_{bon}
$$

## 4) Règles par type de document

### 4.1 Ventes (Sortie + Comptant)

Tables:
- `bons_sortie` + `sortie_items`
- `bons_comptant` + `comptant_items`

Contributions:
- `CA Net` (chiffre d’affaires): **+ montant_total**
- `Bénéfice (profit)`: **+ profit_net**
- `Remises`: **+ remises_bon**

### 4.1bis Ventes e-commerce

Tables:
- `ecommerce_orders` + `ecommerce_order_items`

Contributions:
- `CA Net`: **+ ecommerce_orders.total_amount**
- `Bénéfice (profit)`: calculé à partir des lignes (même formule que ventes), en utilisant `ecommerce_order_items.unit_price`, `quantity` et le coût `products.cout_revient/prix_achat`.
- `Remises`: **+ SUM(ecommerce_order_items.remise_amount)**

Filtre:
- Exclut les statuts e-commerce: `cancelled`, `refunded`.

### 4.2 Avoirs (Avoir client + Avoir comptant)

Tables:
- `avoirs_client` + `avoir_client_items`
- `avoirs_comptant` + `avoir_comptant_items`

Contributions:
- `CA Net`: **- montant_total**
- `Bénéfice (profit)`: **- profit_net**
- `Remises`: **- remises_bon**

Note: dans le détail, les deux types d’avoir sont regroupés sous `bonType = "Avoir"`.

### 4.2bis Avoirs e-commerce

Tables:
- `avoirs_ecommerce` + `avoir_ecommerce_items`

Contributions:
- `CA Net`: **- montant_total**
- `Bénéfice (profit)`: **- profit_net**
- `Remises`: **- remises_bon**

### 4.3 Bons véhicule

Table:
- `bons_vehicule`

Règle demandée (comme dans le frontend avant):
- Impact uniquement sur le bénéfice: **- montant_total**
- Aucun impact sur `CA Net` (CA) dans ces stats.

### 4.4 Commandes (Achats)

Table:
- `bons_commande` + `commande_items`

Contributions:
- `CA des achats`: **+ montant_total**
- Pas de profit calculé pour les achats (la section `ACHATS` affiche des totaux, et peut lister les lignes de commande).

## 5) Remarques d’implémentation

- Tous les calculs sont exécutés par le backend via SQL (agrégations `SUM`, groupements par bon puis par jour).
- Le frontend ne recalcule pas les montants: il consomme l’API.
