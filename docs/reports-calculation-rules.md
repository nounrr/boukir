# Règles de calcul — Page Rapports (ReportsPage)

But : documenter les relations (Clients / Fournisseurs) et les règles utilisées pour calculer chaque statistique affichée dans `frontend/src/pages/ReportsPage.tsx`.

Checklist
- [x] Lister les sources de données (RTK Query) utilisées par la page
- [x] Décrire les filtres applicables (dates, type de contact)
- [x] Fournir la formule et les entrées pour chaque métrique / carte
- [x] Exposer les fonctions/variables du code qui réalisent ces calculs
- [x] Mentionner les cas limites et hypothèses
- [x] Indiquer où modifier le comportement et proposer tests simples

---

## 1) Sources de données (input)
- Bons
  - `bonsComptant` (useGetComptantQuery)
  - `bonsSortie` (useGetSortiesQuery)
  - `bonsCommande` (useGetCommandesQuery)
  - Avoirs clients / fournisseurs via `useGetBonsByTypeQuery("Avoir")` et `("AvoirFournisseur")`

- Paiements
  - `payments` (useGetPaymentsQuery)

- Contacts
  - `clients` (useGetClientsQuery)
  - `fournisseurs` (useGetFournisseursQuery)

- Utilitaires (dans le fichier)
  - `toNumber(value)` — normalisation numérique
  - `toDisplayDate(date)` / `convertDisplayToISO(...)` — format de date
  - `parseBonItems(items)` — parser items JSON

- Normalisations locales (variables calculées dans le composant)
  - `normalizedBons` (BonLite[]) — union des bons Comptant / Sortie / Commande
  - `normalizedPayments` (PaymentLite[]) — paiements normalisés
  - `normalizedAvoirsClient`, `normalizedAvoirsFournisseur`


## 2) Filtres appliqués avant agrégations
- Date range : `dateFrom` / `dateTo` (inputs HTML type=date) — la fonction `inDateRange(displayDate)` convertit `jj-mm-aa` -> ISO et compare.
- Type de contact : `contactType` = `all | clients | fournisseurs`
  - `matchContactTypeBon(b: BonLite)` et `matchContactTypePayment(p: PaymentLite)` utilisent `clientIds` / `fournisseurIds` pour décider si un enregistrement appartient au scope.
- Exclusion : les bons avec `statut === 'Annulé'` (ou "Cancelled") sont exclus dans `filteredBons`.
- `filteredBons`, `filteredPayments`, `filteredAvoirs*` sont les collections finales sur lesquelles toutes les métriques sont calculées.

Assomption : les dates stockées dans `BonLite.date` et `PaymentLite.date` sont sous forme `jj-mm-aa` (format normalisé par `toDisplayDate`).


## 3) Règles et formules par métrique / carte
Pour chaque métrique ci‑dessous, je donne : nom UI, variable(s) de code, formule / étapes, remarques.

### A. Bons Clients (Ventes)
- UI: "Bons Clients (Ventes)"
- Variables: `bonsClients` (défini comme `filteredBons.filter(type === 'Sortie' || type === 'Comptant')`)
- Calculs:
  - Nombre de bons: `clientBonsStats.count = bonsClients.length`
  - Montant total: `clientBonsStats.total = sum(bon.montant for bon in bonsClients)`
  - Montant moyen: `clientBonsStats.total / clientBonsStats.count` si count > 0
- Remarques: inclut les bons validés/stauts listés dans `filteredBons` (voir validStatuts). Les avoirs clients ne sont pas soustraits ici ; ils interviennent dans le calcul des revenus nets.


### B. Bons Fournisseurs (Achats)
- UI: "Bons Fournisseurs (Achats)"
- Variables: `bonsFournisseurs = filteredBons.filter(type === 'Commande')`
- Calculs: `fournisseurBonsStats.count`, `fournisseurBonsStats.total`, `fournisseurBonsStats.byType` de façon analogue aux bons clients.


### C. Avoirs (Clients / Fournisseurs)
- UI: "Avoirs Clients" / "Avoirs Fournisseurs"
- Variables: `filteredAvoirsClient`, `filteredAvoirsFournisseur`
- Calculs: `count = filteredAvoirs*.length`, `total = sum(avoir.montant)`
- Remarque: ces montants sont soustraits des revenus / coûts au calcul du bénéfice net.


### D. Paiements (globaux / par relation)
- UI: "Total Paiements" et cartes séparées
- Variables: `filteredPayments` (après filtres), `clientPaymentsStats`, `fournisseurPaymentsStats`
- Calculs:
  - `clientPaymentsStats = { total: sum(p.montant for p in filteredPayments if p.contact_id in clientIds), count: ... }`
  - `fournisseurPaymentsStats` équivalent pour fournisseurs
  - `totalPayments = sum(p.montant for p in filteredPayments)` (UI montre aussi total)
- Remarque: `fournisseurPaymentsStats` est utilisé dans les coûts (voir section bénéfice)


### E. Soldes Clients / Fournisseurs
- Fonctions: `calculateClientTotalSolde(client)` et `calculateFournisseurTotalSolde(fournisseur)`
- Entrées:
  - `soldeDB` = `client.solde_a_recevoir ?? client.solde` (valeur en base)
  - `bonsClient` = somme des `bonsClients` pour ce client (après filtres)
  - `paymentsClient` = somme des `filteredPayments` pour ce client
- Formule client: `soldeDB + bonsClient - paymentsClient`
- Formule fournisseur: `soldeDB + bonsFournisseur - paymentsFournisseur`
- Utilisation: `totalSoldeClients = sum(calculateClientTotalSolde(c) for c in clients)` et idem pour fournisseurs
- Remarque: le calcul prend en compte la période et le type de contact via `filteredBons` et `filteredPayments`.


### F. Bénéfice Net (Regle métier)
- Variables: `totalRevenus`, `totalCouts`, `beneficeNet = totalRevenus - totalCouts`
- Définition (implémentée):
  - Revenus = Bons Clients (Sortie + Comptant) — Avoirs Clients
    - `totalRevenus = sum(bon.montant for bon in bonsClients) - sum(avoir.montant for avoir in filteredAvoirsClient)`
  - Coûts = Commandes (bonsFournisseurs) + Paiements Fournisseurs — Avoirs Fournisseurs
    - `totalCouts = sum(bon.montant for bon in bonsFournisseurs) + fournisseurPaymentsStats.total - sum(avoir.montant for avoir in filteredAvoirsFournisseur)`
- Remarques:
  - Les paiements clients ne rentrent pas dans "coûts".
  - Tous les éléments respectent les filtres (date / contact). Si vous souhaitez inclure tous les paiements sans filtre période, il faut ajuster `filteredPayments`.


### G. Ratios et autres cards
- `bonsByType` : agrégation `{ type => sum(montant) }` sur `filteredBons`
- `paymentsByMode` : agrégation `{ mode => sum(montant) }` sur `filteredPayments`
- Top produits: calcul basé sur `bonsComptant + bonsSortie` (non filtrés par `filteredBons` dans la version actuelle — attention)
  - Produits: `productMetrics` construit à partir des items des bons originaux (`bonsComptant`, `bonsSortie`)
  - Remarque: si vous voulez top produits respectant les filtres (période, contact), il faut remplacer `sourceBons = [...bonsComptant, ...bonsSortie]` par `sourceBons = filteredBons.filter(type==='Sortie' || type==='Comptant')`.


## 4) Fonctions / variables clés dans le code
- `inDateRange(displayDate)` — vérifie `dateFrom/dateTo`
- `matchContactTypeBon`, `matchContactTypePayment` — logic contactType
- `filteredBons`, `filteredPayments`, `filteredAvoirsClient`, `filteredAvoirsFournisseur`
- `bonsClients`, `bonsFournisseurs`
- `clientBonsStats`, `fournisseurBonsStats`, `clientPaymentsStats`, `fournisseurPaymentsStats`
- `calculateClientTotalSolde`, `calculateFournisseurTotalSolde`
- `totalRevenus`, `totalCouts`, `beneficeNet`

Ces symboles se trouvent dans `frontend/src/pages/ReportsPage.tsx`.


## 5) Cas limites et règles de validation
- Dates invalides : si `new Date(iso)` est NaN, l'item est considéré hors période (fonction `inDateRange` renvoie true pour sécurité si date manquante). Vérifier besoin métier.
- Valeurs nulles / texte : `toNumber` force 0 pour valeurs non numériques.
- Contact absent (`contact_id` null) : exclu des calculs où `matchContactType*` est exigé.
- Bons annulés (`Annulé` / `Cancelled`) sont exclus.
- Avoirs : traités séparément et soustraits des revenus/coûts.


## 6) Où modifier le comportement
- Période par défaut / règles de comparaison : `inDateRange` dans `ReportsPage.tsx`.
- Inclusion/exclusion de statuts : liste `validStatuts` dans `filteredBons`.
- Top produits filtrés : modifier `productMetrics` sourceBons.
- Changer si les paiements doivent être considérés globalement (non filtrés) -> ajuster la construction de `filteredPayments`.


## 7) Tests rapides recommandés (unitaires / smoke)
1. Filtre date : définir `dateFrom/dateTo` sur une journée précise et vérifier que `filteredBons` et `filteredPayments` contiennent uniquement les éléments de la date.
2. Relation separation : créer 2 paiements (un client, un fournisseur) dans `payments` et vérifier `clientPaymentsStats.total` / `fournisseurPaymentsStats.total`.
3. Bénéfice net : préparer données simples (1 bon client 100, 1 avoir client 10, 1 commande fournisseur 40, 1 paiement fournisseur 5) et vérifier `totalRevenus = 90`, `totalCouts = 40 + 5`, `beneficeNet = 45`.


## 8) Notes / recommandations
- Documenter clairement dans le README du projet quand un calcul doit ignorer les filtres (ex: soldes en base vs période). Actuellement la plupart des agrégations respectent `dateFrom/dateTo`.
- Si vous voulez des performances meilleures pour grands jeux de données, envisagez d'effectuer certaines agrégations côté backend (requêtes agrégées) au lieu de charger toutes les entités et filtrer côté client.

---

Fichier source à consulter: `frontend/src/pages/ReportsPage.tsx` (fonctions et variables listées ci-dessus).

Si vous voulez, je peux :
- ajouter des tests unitaires (Jest + vitest) pour les helpers `toNumber`, `inDateRange`, et les calculs principaux, ou
- générer une version imprimable en PDF de cette doc.

Fin du document.
