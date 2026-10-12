# Correction des prix de vente des variantes

## Constat et reproduction

La production a renvoyé KK129 (produit 6190, variante 93) à 0 DH, puis à
140 DH après modification manuelle du stock. Le résultat SQL fourni par
l'utilisateur montrait le snapshot 9214 à 0 / 0 avec une date de correction.

Le défaut reproduit est dans le choix de l'action envoyée par le backoffice.
La page peut afficher le prix du parent (140 / 140) quand le catalogue de la
variante et ses snapshots sont à zéro. Auparavant, saisir 140 / 140 envoyait
`confirm` puisque le montant était égal au prix affiché. Le serveur mettait
alors uniquement à jour la date de traitement, sans écrire les prix.

Le correctif envoie `apply` dès qu'un des deux prix est choisi explicitement,
y compris un prix suggéré, saisi ou appliqué à une sélection. `confirm` reste
réservé au choix explicite « Garder » pour les deux prix. L'aperçu de la ligne
et le compteur de modifications suivent la même règle.

Un autre correctif prépare le choix par défaut de la variante e-commerce :
privilégier une variante en stock avec un prix positif au lieu de la première
variante alphabétique à zéro. Les prix des autres variantes restent distincts.

## Vérifications

Résultats : 18 tests unitaires, les 5 scénarios MySQL ci-dessous, ESLint ciblé,
vérification syntaxique des routes et compilation Vite du backoffice réussis.

Tests MySQL sur tables TEMPORARY, connexion locale uniquement, sans changer
les données métier :

- Reproduction de `confirm` : marqueur traité présent, catalogue et stock à 0.
- Correction explicite 140 / 140 : variante et tous ses snapshots à 140 / 140,
  lecture du prix public à 140, variante voisine inchangée.
- Correction multiple avec des PV et PV2 distincts.
- Application au produit et à ses variantes actives.
- Conflit de prix : rollback de tout le lot, prix et marqueurs compris.

Commande PowerShell :

```powershell
$env:RUN_SALE_PRICE_DB_TESTS='1'
node --test backend/routes/products.salePriceCorrections.integration.test.js
```

Le test est ignoré sans cette variable. Il crée des tables temporaires sur
sa connexion et les détruit à la fermeture ; il n'écrit pas en production.

## Mise en service

Déployer le backoffice reconstruit (`npm run build`) et le backend avec le
nouveau module `backend/utils/ecommerceDefaultVariant.js`, puis redémarrer
le processus backend habituel. Le correctif n'a pas été déployé par l'agent.

Pour les variantes déjà classées « Traités » avec des prix erronés : les
sélectionner, utiliser « Remettre à corriger », saisir les bons PV/PV2 puis
« Corriger » (ou faire approuver la demande selon le compte). Le correctif
ne réécrit pas automatiquement les anciennes corrections, dont les montants
souhaités ne sont pas tous connus.
