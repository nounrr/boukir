# Calcul des remises: Bons et E-commerce

Ce document explique uniquement:

- comment la remise est calculee dans la partie Bons
- comment la remise est calculee dans la partie E-commerce
- quelles tables sont utilisees

Il ne decrit pas le workflow complet.

## 1. Partie Bons

## Types concernes

Dans la page Bon, la remise par ligne est utilisee surtout pour:

- `Sortie`
- `Comptant`

Les champs existent aussi sur d'autres lignes (`Avoir`, `AvoirComptant`), mais dans l'ecran de saisie Bon, le panneau remise est prevu pour `Sortie` et `Comptant`.

## Champs utilises

Au niveau ligne article:

- `remise_montant`: remise unitaire en DH par unite
- `remise_pourcentage`: champ stocke aussi, mais le calcul principal du bon se base surtout sur `remise_montant`
- `quantite`
- `prix_unitaire`

Au niveau entete bon:

- `remise_is_client`
- `remise_id`

Ces 2 champs servent a dire a quel compte remise rattacher le bon. Ils ne changent pas eux-memes le montant de la ligne.

## Formule de calcul dans la saisie Bon

### Montant total du bon

Le montant total du bon est calcule ainsi:

$$
Montant\ total\ bon = \sum (quantite \times prix\_unitaire)
$$

Point important:

- dans `BonFormModal`, la remise ne diminue pas directement `montant_total`
- la remise est calculee a part

Donc pour `Sortie` et `Comptant`:

$$
Montant\ total\ affiche = \sum (quantite \times prix\_unitaire)
$$

et non:

$$
\sum (quantite \times (prix\_unitaire - remise))
$$

### Total remises du bon

Le total remises est affiche a part, avec cette formule:

$$
Total\ remises = \sum (quantite \times remise\_montant)
$$

`remise_montant` est donc une remise unitaire par ligne.

### Impact sur le mouvement / profit

Dans les calculs de mouvement, la remise est soustraite du profit net:

$$
Profit\ net\ ligne = ((prix\_unitaire - cout) \times quantite) - (remise\_montant \times quantite)
$$

Cela s'applique dans les types suivants:

- `Sortie`
- `Comptant`
- `Avoir`
- `AvoirComptant`

## Tables utilisees dans la partie Bons

### Pour les bons Sortie

- `bons_sortie`: entete du bon
- `sortie_items`: lignes articles

Champs remise utilises:

- `bons_sortie.remise_is_client`
- `bons_sortie.remise_id`
- `sortie_items.remise_pourcentage`
- `sortie_items.remise_montant`
- `sortie_items.total`

### Pour les bons Comptant

- `bons_comptant`: entete du bon
- `comptant_items`: lignes articles

Champs remise utilises:

- `bons_comptant.remise_is_client`
- `bons_comptant.remise_id`
- `comptant_items.remise_pourcentage`
- `comptant_items.remise_montant`
- `comptant_items.total`

### Pour le rattachement a un compte remise

- `client_remises`: compte remise cible

Si `remise_is_client = 1`, le backend peut resoudre le compte remise a partir du client du bon.

Si `remise_is_client = 0`, le backend utilise `remise_id`.

## Resume Bons

- la remise du bon est stockee par ligne dans `remise_montant`
- le total remise est `quantite x remise_montant`
- le montant total du bon reste base sur `quantite x prix_unitaire`
- la remise agit surtout sur le suivi remise et le profit, pas sur `montant_total` du bon dans cet ecran

## 2. Partie E-commerce

Dans l'e-commerce, il y a 2 logiques distinctes:

- remise fidelite / remise gagnee
- remise manuelle par article depuis la page Bons

Ce document parle des 2, mais pas des promo codes.

## 2.1 Remise fidelite gagnee automatiquement

## Base de calcul

La remise gagnee depend du type de compte du client:

- si `contacts.type_compte = 'Artisan/Promoteur'` alors on prend `products.remise_artisan`
- sinon on prend `products.remise_client`

Ici, la valeur produit est utilisee comme montant de remise par unite.

### Formule par article

$$
Remise\ article = quantite \times remise\_par\_unite
$$

ou:

$$
remise\_par\_unite =
\begin{cases}
products.remise\_artisan & si\ type\_compte = Artisan/Promoteur \\
products.remise\_client & sinon
\end{cases}
$$

### Formule commande e-commerce

$$
Remise\ gagnee\ commande = \sum remise\_article
$$

Cette valeur est ensuite creditee dans le solde remise du contact.

### Solde remise du contact

$$
contacts.remise\_balance = contacts.remise\_balance + remise\_gagnee\_commande
$$

## Tables utilisees pour la remise fidelite e-commerce

- `products`
  - `remise_client`
  - `remise_artisan`
- `contacts`
  - `type_compte`
  - `remise_balance`
- `ecommerce_orders`
  - `user_id`
  - `remise_earned_amount`
  - `remise_earned_at`
  - `remise_used_amount`
- `ecommerce_order_items`
  - `quantity`
  - `unit_price`
  - `subtotal`
  - `remise_percent_applied`
  - `remise_amount`

## Important

Dans `computeOrderItemRemiseBreakdown`, le champ `remise_percent_applied` est garde pour compatibilite, mais il represente en pratique la valeur de remise par unite, pas un vrai pourcentage.

## 2.2 Remise manuelle par article dans la page Bons pour un bon E-commerce

Depuis la page Bons, un admin peut ouvrir l'editeur de remises d'une commande e-commerce et modifier la remise article par article.

La base de calcul de chaque article est:

- `subtotal` de `ecommerce_order_items`

## Si on saisit un pourcentage

Le montant est calcule comme suit:

$$
Remise\ montant = subtotal \times \frac{remise\_pourcentage}{100}
$$

## Si on saisit un montant

Le pourcentage est recalcule comme suit:

$$
Remise\ pourcentage =
\begin{cases}
\frac{remise\_montant}{subtotal} \times 100 & si\ subtotal > 0 \\
0 & sinon
\end{cases}
$$

Le backend borne ensuite les valeurs:

- pourcentage entre `0` et `100`
- montant minimum `0`

## Recalcul total commande e-commerce

Apres mise a jour des articles:

$$
Nouvelle\ remise\ commande = \sum ecommerce\_order\_items.remise\_amount
$$

Cette somme est stockee dans:

- `ecommerce_orders.remise_earned_amount`

## Ajustement du solde remise du contact

Si la commande avait deja credite le client auparavant (`remise_earned_at` non nul), alors le backend ajuste seulement le delta:

$$
Delta = nouvelle\_remise - ancienne\_remise
$$

$$
contacts.remise\_balance = contacts.remise\_balance + Delta
$$

## Tables utilisees pour la remise manuelle e-commerce

- `ecommerce_order_items`
  - `subtotal`
  - `remise_percent_applied`
  - `remise_amount`
- `ecommerce_orders`
  - `remise_earned_amount`
  - `remise_earned_at`
  - `user_id`
- `contacts`
  - `remise_balance`

## Resume E-commerce

- la remise fidelite automatique vient de `products.remise_client` ou `products.remise_artisan`
- la formule automatique est `quantite x remise par unite`
- la remise manuelle admin peut etre saisie en `%` ou en `DH`
- dans l'edition admin, la base est `ecommerce_order_items.subtotal`
- le total commande est toujours la somme des `remise_amount` des lignes

## 3. Difference principale entre Bons et E-commerce

### Bons

- la remise est surtout une remise unitaire par ligne (`remise_montant`)
- le total remise est calcule a part
- le `montant_total` du bon reste base sur le prix de vente, sans soustraire directement la remise dans cet ecran

### E-commerce

- la remise est stockee directement au niveau des lignes de commande e-commerce
- le total commande remise est la somme des `remise_amount`
- cette valeur est synchronisee avec `ecommerce_orders.remise_earned_amount`
- elle peut aussi impacter `contacts.remise_balance`