# Diagnostic Boukir du 11 octobre 2026

## Mesures depuis le serveur, fournies par l'utilisateur

- Mémoire disponible : 3792 Mo sur 7940 Mo ; disque système utilisé à 43 %.
- Logo via Nginx local : 0,068 seconde au total.
- `/api/health` via Nginx local : 0,036 seconde au total.
- `/fr/shop` via Nginx local : 0,845 seconde au total.
- Logo via le domaine public depuis le serveur : 0,084 seconde au total.

Ces mesures n'indiquent pas une saturation permanente. Les compteurs cumulés
de redémarrages PM2 ne permettent pas de conclure à une boucle de plantages.

## Tests API depuis la connexion extérieure de l'agent

GET `/api/ecommerce/products`, page 1, 20 produits par page, stock non limité.

| Filtres | Réponse complète | Résultat vérifié |
| --- | --- | --- |
| INGCO (`brand_id=8`) | HTTP 200, 5,48 s | 20 produits, tous de marque 8 ; 300 au total |
| Échelles (`category_id=83`) | HTTP 200, 8,44 s | 12 produits, tous de catégorie 83 |
| Prix 100–500, tri croissant | HTTP 200, 5,34 s après nouvelle tentative | 20 produits dans la plage et dans l'ordre croissant |
| INGCO + catégorie 103 + prix 100–500, tri croissant | HTTP 200, 8,97 s après nouvelle tentative | 6 produits ; marque, catégorie, plage et ordre conformes |

Les premières tentatives prix/combinées ont expiré après 20 secondes avec
des réponses HTTP 200 partiellement téléchargées. Les réponses complètes ont
été analysées comme JSON et leurs produits vérifiés, pas seulement le statut HTTP.

## Limite du test navigateur

Le HTML du Shop apparaît mais les téléchargements de scripts prennent plusieurs
minutes. Les clics de test n'ont pas produit de requête de filtre observable ni
de changement d'URL dans le délai de test. Le parcours interactif n'est donc pas
validé. Les en-têtes HTTP 200 des scripts ne prouvent pas leur téléchargement
complet ni l'exécution de React. Les délais réseau empêchent de conclure sur
une éventuelle erreur de l'interface.

## Configuration backoffice confirmée

`/etc/nginx/sites-enabled/backoffice.boukirdiamond.com.conf` envoie
`Clear-Site-Data: "cache"` avec `always`. Ce mécanisme invalide le cache navigateur
et contribue aux téléchargements répétés. La correction préparée dans
`fix-backoffice-cache.sh` retire uniquement cette directive, sauvegarde la
configuration, valide Nginx avant rechargement et restaure en cas d'échec de
validation. Elle conserve les autres règles de cache et l'authentification mTLS.
L'utilisateur a exécuté la correction sur le serveur le 11 octobre 2026 à
15:15:33 (heure affichée par le serveur). La validation Nginx et le rechargement
ont réussi. Sauvegarde : `/etc/nginx/backoffice-cache-20261011-151533-128068.bak`.
L'authentification SSH de l'agent reste refusée ; l'exécution a été réalisée
dans la session de l'utilisateur. Les avertissements de configuration Nginx
affichés n'ont pas bloqué la validation ; ils n'ont pas été corrigés par ce script.

## Correction backend locale

Les vérifications du schéma dans `routes/products.js` étaient répétées à chaque
appel faute d'indicateur d'initialisation achevée. `initializeOnce` partage
l'initialisation entre requêtes concurrentes, conserve son succès et autorise
une nouvelle tentative après échec. Les deux tests passent, ainsi que la
vérification syntaxique de la route. Aucun déploiement effectué par l'agent.

## Prochaine mesure depuis le serveur

Mesures exécutées par l'utilisateur via Nginx local :

| Filtres | Statut | Premier octet | Total |
| --- | --- | --- | --- |
| INGCO | 200 | 0,091047 s | 0,091412 s |
| Échelles | 200 | 0,092543 s | 0,092622 s |
| Prix 100–500, tri croissant | 200 | 0,165697 s | 0,166175 s |
| INGCO + catégorie 103 + prix 100–500, tri croissant | 200 | 0,088033 s | 0,088112 s |

Ces quatre appels API sont rapides côté serveur lors des mesures. Leur différence
avec les temps extérieurs oriente vers le chemin réseau extérieur ; elle ne
permet pas d'identifier le segment responsable ni de supposer que la connexion
de l'utilisateur présente exactement les mêmes délais que celle de l'agent.
Pour isoler ce segment, comparer le Shop depuis la connexion habituelle du
visiteur et une autre connexion, ainsi que le temps des requêtes dans son
navigateur. Aucun redémarrage ni changement MySQL n'est justifié par ces mesures.

Après la correction Nginx, une vérification extérieure de la réponse du backoffice
confirme l'absence de `Clear-Site-Data`. Le HTTP 400 attendu sans certificat client
et les autres en-têtes de cache sont conservés.

Commandes utilisées pour ces mesures locales :

```bash
for query in 'brand_id=8' 'category_id=83' 'min_price=100&max_price=500&sort=price_asc' 'brand_id=8&category_id=103&min_price=100&max_price=500&sort=price_asc'; do
  curl --max-time 20 --resolve boukirdiamond.com:443:127.0.0.1 -o /dev/null -sS -w "$query HTTP=%{http_code} debut=%{time_starttransfer}s total=%{time_total}s\n" "https://boukirdiamond.com/api/ecommerce/products?per_page=20&page=1&in_stock_only=false&$query"
done
```
