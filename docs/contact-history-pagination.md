# Historique des contacts — pagination du 4 novembre 2026

## Copies antérieures

Les fichiers suivants proviennent du commit Git `5d32677`, avant cette modification :

- `frontend/src/pages/client copy.tsx` : ancien `ClientsPage.tsx`.
- `frontend/src/pages/fournisseur copy.tsx` : ancien `FournisseursPage.tsx`.
- `frontend/src/pages/charge copy.tsx` : ancien `ChargesPage.tsx`.

Ils sont accessibles depuis le menu Tiers sous « Client copy », « Fournisseur
copy » et « Charge copy », avec les routes `/clients-copy`, `/fournisseurs-copy`
et `/charges-copy` et leurs détails `/:id`. Seuls les chemins de navigation dans
ces fichiers ont été adaptés pour rester dans la copie. Les calculs et requêtes
d'origine sont conservés. Les tests de régression exécutent leurs fonctions de
calcul afin de comparer les anciens soldes détaillés aux nouveaux.

## Contrat de calcul

Le paramètre `ledger=client|fournisseur|charge` active le nouveau contrat sur
`GET /api/contacts/:id/history`. Les autres utilisateurs de l'ancienne API restent
sur le contrat précédent.

Le serveur calcule toutes les opérations admissibles dans l'ordre chronologique
avant de filtrer et de paginer. Chaque document et chaque article transporte son
solde absolu (`ledgerBalance`) et sa remise cumulée (`ledgerRemiseBalance`).
`ledgerTotals.finalSolde` est indépendant de la page et des filtres.

- Client : solde initial + sorties − avoirs − paiements.
- Fournisseur : solde initial + commandes − ventes au fournisseur − avoirs
  fournisseur + avoirs de ventes au fournisseur − paiements ordinaires
  + paiements inversés (`payment=1`).
- Charge : solde initial + charges + sorties + comptants − avoirs − paiements,
  conformément aux anciennes lignes détaillées. Le résumé utilise désormais le
  même signe que ces lignes, au lieu de mélanger le signe de l'ancien endpoint.
- Les paiements participent au solde avec leur montant total, y compris la part
  ignorée. La colonne du montant payé conserve sa présentation hors part ignorée.
- Un document sans articles utilise son montant d'en-tête. Lorsque tous ses
  articles totalisent zéro, ce montant est affecté à la dernière ligne, comme dans
  l'ancienne page. Sinon, les montants des articles font foi. Le mode résumé et le
  mode détaillé partagent désormais le même solde.
- Les statuts annulés, supprimés, brouillons, refusés et expirés sont exclus.
- Les montants cumulés sont transmis avec une précision de trois décimales.

## Pagination, filtres et impression

Une page contient 25, 50 ou 100 documents/paiements, sans couper les articles d'un
bon. Les dates, la recherche produit, les onglets et le tri des paiements sont
appliqués avant le découpage. La sélection est effacée au changement de page ou
de filtre. Les sous-totaux de tableaux sont ceux de la page affichée.

Dans le détail client, la pagination est intégrée au pied du tableau et la
dernière page est demandée par défaut (`page=last`). Les boutons permettent ensuite
de choisir explicitement une autre page.

L'impression complète utilise `all=true` uniquement à la demande et garde les
filtres. Une sélection imprime uniquement les éléments sélectionnés, avec le
cumul propre à cette sélection comme auparavant. Sur mobile, les cartes sont
également paginées ; l'aperçu d'impression ne s'ouvre plus automatiquement.

L'API ne charge que les familles de documents utiles au type d'historique. Les
libellés de variantes et d'unités accompagnent les lignes : le navigateur ne
télécharge plus tout le catalogue produits. L'attribution des modifications est
recherchée uniquement pour les documents de la page.

Le calcul serveur parcourt encore l'historique complet pour garantir les cumuls.
Il ne s'agit pas d'une pagination SQL des agrégats financiers : le gain porte sur
les requêtes inutiles, la taille de la réponse et le travail du navigateur.

## Vérifications

`node --test backend/utils/contactLedger.test.js`

Avec une base locale configurée, ajouter `RUN_DB_TESTS=1` pour vérifier aussi les
premières et dernières pages des trois endpoints (lecture seule).

Scénarios navigateur vérifiés avec données de test : deuxième page, recherche
d'un produit sur la dernière page, impression de 125 opérations depuis une page
de 50, et affichage mobile à 390 px des trois pages.

## Édition depuis une valeur de l'historique

Dans les détails client et fournisseur, le curseur pointer signale les quantités
et prix modifiables. Un double-clic remplace la valeur par un champ dans la cellule.
Entrée ou ✓ enregistre, Échap ou ✕ annule. La sauvegarde recharge le bon complet,
vérifie que les lignes source n'ont pas changé et utilise la mutation existante
pour conserver les contrôles de stock et actualiser les soldes. Les quantités
regroupées sont réparties proportionnellement entre leurs lots d'origine ; les
autres lignes et les frais d'en-tête sont conservés.

Dans le détail charge, le double-clic ouvre le formulaire existant du bon et
sélectionne le champ de la ligne concernée. Entrée/F2 fonctionne au clavier ; une
pression tactile ouvre également le formulaire. L'identification repose sur la
ligne source et le produit/variant, jamais sur la position dans la page filtrée.

Le bon complet est rechargé avant édition. La sauvegarde utilise les mutations
existantes, avec leurs contrôles de stock et invalidation des soldes. Le formulaire
conserve son regroupement habituel des lots FIFO. Les bons validés/annulés et les
droits de modification gardent les mêmes restrictions. Les prix des produits en
charge restent automatiques au coût de revient ; les lignes libres restent
éditables. Les anciennes copies sont inchangées.
