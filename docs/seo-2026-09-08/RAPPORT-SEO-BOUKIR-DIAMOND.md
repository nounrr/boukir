# Audit SEO — Boukir Diamond

**Site : https://boukirdiamond.com · Tanger / Maroc · 8 septembre 2026**

L’[annexe des 201 expressions candidates](<C:/Users/med/Desktop/burequ (3)/boukitComplet/bpukir/docs/seo-2026-09-08/ANNEXE-MOTS-CLES.md>) distingue 55 expressions retrouvées dans les suggestions Google et 146 propositions à mesurer.

**Conclusion : la priorité est de réparer les signaux d’indexation et l’accès au catalogue, puis de construire des pages commerciales en français et en arabe.** Vous avez déjà un catalogue important et des produits correspondant aux recherches souhaitées. Cependant, le site public envoie actuellement à Google des adresses `localhost`, et les catégories commerciales passent par des filtres non indexables.

L’objectif proposé est de devenir une référence locale à Tanger, puis de développer la visibilité nationale sur les produits réellement expédiables. Une première place générale sur tous les mots-clés, partout au Maroc, ne peut pas être garantie. Il faut mesurer la progression par famille de produits, langue, zone et ventes obtenues.

## 1. Ce qui a été examiné

- Code local de la partie `ecom` et recherche interne dans `backend/routes/ecommerce`.
- 14 URL publiques : accueil français/arabe, boutique, filtres, pagination, contact, robots, sitemap et fiches produits.
- Navigation réelle avec et sans `www`, réseau et rendu JavaScript.
- API publique : catégories, première page de 20 produits et échantillons ciblés ciment, sable, bitume, carrelage et Soprema.
- Suggestions Google pour **22 expressions de départ**, paramètres Maroc (`gl=ma`) et français/arabe. Les réponses brutes et leurs URL sont conservées.
- Recherche web de concurrents et consultation des recommandations officielles Google.

**Limites :** aucun accès à Search Console, Google Ads, Analytics ou aux statistiques de la fiche Google Business Profile. Les positions Google locales et volumes mensuels sont donc **non mesurés**. La page de résultats Google interrogée directement a renvoyé un blocage 429/CAPTCHA. La recherche web complémentaire n’est pas présentée comme un relevé Google géolocalisé à Tanger. Les suggestions restent accessibles ; elles peuvent inclure des résultats hors Maroc et leur ordre n’est pas un classement des volumes.

Les nombres de produits ci-dessous viennent de votre API, et ne représentent ni les pages indexées ni un inventaire physique vérifié. L’audit décrit un instant donné. Le dépôt local contient des modifications en cours : les observations du code sont distinguées des vérifications publiques. Aucun changement de la boutique n’a été effectué pour ce rapport.

## 2. Les problèmes à traiter en premier

| Priorité | Constat vérifié | Conséquence / action |
|---|---|---|
| **P0 — immédiat** | Les pages contrôlées déclarent des canonical et `hreflang` vers `http://localhost:3000/...`. | Configurer une origine publique HTTPS unique, reconstruire/redéployer et vérifier le HTML. Google peut ignorer ces signaux incohérents ; cela ne prouve pas une désindexation totale. |
| **P0 — immédiat** | `robots.txt` annonce `Sitemap: http://localhost:3000/sitemap.xml`. Le sitemap public contient 20 URL, toutes sur localhost. | Produire des URL publiques et inclure les produits/catégories admissibles à l’indexation. Soumettre ensuite le bon sitemap à Search Console. |
| **P0 — immédiat** | Avec `www`, plusieurs prérequêtes API `OPTIONS` renvoient 403. L’accueil affiche des erreurs ; une navigation vers la boutique a déclenché une exception côté client. Sans `www`, catégories et produits se chargent en 200. | Préférer ici `https://boukirdiamond.com`, qui fonctionne dans le test, puis rediriger durablement `www` vers ce domaine. Vérifier CORS/proxy et toutes les origines réellement nécessaires. |
| **P1 — semaine 1** | Aucune fiche produit dans le sitemap ; l’API annonce 3 737 produits. | Créer un sitemap produits issu des produits publics, avec dates réelles de modification. Ne pas inclure les brouillons, URL en erreur ou pages `noindex`. |
| **P1 — semaine 1** | Les catégories/marques sont des liens `/shop?category_id=...` et `/shop?brand_id=...`, rendus `noindex` par le code. | Créer des pages catégories stables, indexables et liées depuis le menu. Garder une gestion séparée des recherches et filtres combinés. |
| **P1 — semaine 1** | `/shop?page=2` est `noindex` et possède le même canonical que la première page ; les commandes de pagination sont des boutons JavaScript. | Rendre la pagination explorable avec de vrais liens. Chaque page de catalogue distincte doit avoir son URL propre et son canonical correspondant. |
| **P1 — semaine 1** | Dans le HTML initial contrôlé, accueil/boutique/fiches n’ont pas de H1 principal rendu ni de liste de liens produits pour le catalogue. Le contenu arrive après JavaScript ; `/api/` est interdit dans robots. | Rendre côté serveur le contenu commercial essentiel et les liens. Vérifier ensuite le rendu Google avec l’inspection d’URL, notamment les ressources bloquées. |
| **P1 — contenu** | Accueil et boutique décrivent principalement entretien, hygiène et nettoyage. | Recentrer titres, descriptions et contenu visible sur matériaux de construction, outillage, étanchéité et Tanger. |
| **P1 — arabe** | 72 catégories sur les 79 renvoyées n’ont pas de `nom_ar`. Les 20 produits de la première page n’ont pas de désignation arabe renseignée. | Traduire d’abord les catégories et les produits commerciaux prioritaires, avec termes marocains validés. Cet échantillon ne permet pas d’estimer le taux de traduction des 3 737 produits. |
| **P1 — données marchandes** | 13 des 20 produits de la première page ont un prix API égal à 0 ; des prix 0 apparaissent dans la boutique. `InStock` est constant dans le schéma produit du code local. | Distinguer prix réel, prix manquant, devis et disponibilité. Ne pas publier un prix nul comme prix de vente lorsque le tarif est inconnu. |
| **P2 — confiance** | Aide, retours, CGV et confidentialité pointent vers `#`. Les liens sociaux pointent vers les accueils des plateformes. | Publier les vraies pages commerciales et les liens des comptes Boukir. Afficher conditions de livraison, retours et moyens de paiement réellement opérationnels. |

### Détails utiles pour le développeur

Le fallback `localhost` vient de [metadata.ts](<C:/Users/med/Desktop/burequ (3)/boukitComplet/bpukir/ecom/src/lib/seo/metadata.ts:99>), fonction `getSiteUrl()`. Il dépend de `NEXT_PUBLIC_SITE_URL`. L’absence ou l’invalidité de cette configuration en production doit provoquer une erreur explicite, plutôt que publier des URL locales. Ne pas copier les paramètres localhost du développement en production.

Le site répond sur les deux hôtes observés. Choisir un hôte, rediriger l’autre en 301/308 en conservant chemin et paramètres, et aligner liens internes, canonical, sitemap, données structurées et partage social. La redirection de langue reste un sujet distinct : `/fr` et `/ar` doivent demeurer directement accessibles.

Le sitemap est défini dans `ecom/app/sitemap.ts`. Son code gère aussi les services et artisans ; **le fichier public observé ne contenait que les 20 entrées statiques**. Le rafraîchissement automatique de `lastModified` à chaque génération doit être remplacé par une date de changement du contenu. Les valeurs `priority` et `changeFrequency` ne sont pas un levier pour gagner des positions. [Google : construire un sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=fr).

La politique de filtres se trouve dans `ecom/app/[locale]/(shop)/shop/page.tsx`, et les boutons de pagination dans `ecom/src/components/shop/products-list.tsx`, vers la ligne 264. Ne pas rendre toutes les combinaisons de filtres indexables. Créer les catégories éditorialisées séparément, et prévoir une règle spécifique pour la pagination. [Google : pagination e-commerce](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading?hl=fr).

Google sait exécuter du JavaScript ; l’absence de contenu initial ne signifie donc pas automatiquement « invisible ». Ici, cette dépendance s’ajoute aux API bloquées et à l’absence de produits dans le sitemap. Pour les robots, `Disallow: /api/` peut empêcher le chargement des données de catalogue nécessaires au rendu. Vérifier ce point avec Google ; ne pas ouvrir les routes privées pour contourner le problème. Le rendu serveur des contenus publics constitue la priorité. [Google : SEO JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=fr).

Les métadonnées et le JSON-LD des fiches sont déjà générés côté serveur : c’est une base à conserver. Toutefois, le produit 6376 contient des URL localhost et une image relative dans le schéma. Le produit 6696 affichait un prix de schéma égal à 0 lors d’un premier GET ; une lecture ultérieure dans le navigateur donnait 89,78 MAD dans le contenu **et** dans le schéma. Il s’agit d’une divergence entre captures à diagnostiquer — cache, fraîcheur ou chemin de récupération — et non d’une erreur permanente démontrée. La fiche indique aussi l’unité `m` alors que le nom évoque un rouleau : clarifier mètre, m² et rouleau avant comparaison de prix.

Le chemin produit inexistant testé, `/fr/product/999999999`, renvoie un statut HTTP 200 avec titre « Produit introuvable » et `noindex`. Prévoir une vraie réponse 404 pour une absence confirmée ; une panne API ne doit pas transformer les produits existants en produits supprimés.

Le schéma `Product/Offer` doit correspondre au prix, à l’unité et à la disponibilité réellement visibles. Compléter images publiques absolues, marque/référence fiable et politiques de livraison/retour quand pertinentes. Ne pas inventer de GTIN ni d’avis. Contrôler ensuite avec le test de résultats enrichis. [Google : fiches de marchand](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing?hl=fr).

## 3. Ce que Google suggère réellement

Ces expressions ont été obtenues dans les réponses Google le jour de l’audit. **Il s’agit de suggestions observées, sans volume mensuel et sans garantie de popularité relative.** Les réponses complètes sont dans `preuves-suggestions-google.json` et l’annexe de mots-clés.

| Besoin | Suggestions françaises observées | Suggestions arabes observées |
|---|---|---|
| Magasin proche | droguerie tanger ; droguerie tanger ouvert actuellement | دروكري طنجة ; عقاقير طنجة |
| Matériaux | matériaux de construction tanger | مواد البناء طنجة ; بيع مواد البناء طنجة |
| Ciment | ciment tanger ; prix ciment 45 maroc ; prix ciment 35 maroc ; prix ciment blanc maroc ; prix sac ciment maroc | ثمن الاسمنت في المغرب ; ثمن الاسمنت بالمغرب 2026 ; ثمن الاسمنت الابيض في المغرب |
| Sable | prix sable m3 maroc ; prix sable lavé maroc ; prix sable construction maroc ; prix camion sable maroc | ثمن الرملة بالمغرب ; ثمن الرملة في المغرب بالدرهم ; ثمن فياج الرملة ; ثمن خنشة الرملة بالمغرب |
| Carrelage | carrelage tanger prix ; magasin carrelage tanger ; grossiste carrelage tanger ; carrelage piscine tanger | سيراميك طنجة ; بيع زليج طنجة ; ثمن الزليج 60/60 ; ثمن الزليج 120 60 |
| Étanchéité | etancheite toit terrasse tanger ; rouleau bitume toiture prix maroc ; bitume liquide maroc ; fournisseur bitume maroc | زفت السطح ; زفت الاسطح ; ثمن زفت السطح في المغرب ; زفت المنيوم |

**Enseignements commerciaux :** travailler prix + unité, produit + ville, magasin/grossiste, et livraison. En arabe marocain, la présence de « الرملة », « فياج », « خنشة » et « زفت » justifie de les intégrer naturellement aux explications et à la recherche interne.

**Attention aux ambiguïtés observées :** « sable tanger » renvoie aussi à des expressions immobilières « Sable d’Or ». « carrelage maroc » fait remonter des idées de carrelage marocain traditionnel et d’enseignes étrangères. « زفت » seul contient des résultats de traduction ou sans intention d’achat. Préférer « sable de construction Tanger », « prix sable m³ », « زفت السطح » et les expressions précisant le besoin. Les combinaisons nouvelles proposées ne sont pas toutes des suggestions Google observées.

La recherche « عزل الاسطح المغرب » n’a renvoyé aucune suggestion dans ce test. Cela **ne signifie pas zéro recherche**. Il faut la conserver comme candidate à mesurer, surtout face à « زفت السطح » et aux recherches par produit.

### Quels sont les mots « les plus utilisés » ?

À ce stade, **il serait inexact de donner un classement chiffré**. Les suggestions confirment du vocabulaire ; la présence de concurrents confirme des pages sur le sujet ; aucune des deux ne donne le nombre de recherches.

La première liste commerciale à mesurer est : **droguerie tanger, matériaux de construction tanger, carrelage tanger, ciment tanger, prix ciment maroc, prix sable m3 maroc, rouleau bitume prix maroc**, puis leurs équivalents **مواد البناء طنجة، ثمن الاسمنت في المغرب، ثمن الرملة بالمغرب، زليج طنجة، ثمن زفت السطح في المغرب**. Cet ordre est un choix de travail, pas un classement de popularité.

## 4. Positionnement français, arabe et darija

Séparer le **matériau consommé** — ciment, sable, carrelage, membrane — du **matériel utilisé** — coupe-carrelage, disque diamant, bétonnière, chalumeau. Ces besoins doivent conduire vers des pages différentes.

| Famille | Terme principal français | Arabe / darija à utiliser selon le contexte |
|---|---|---|
| Commerce | Droguerie, quincaillerie, magasin de matériaux | عقاقير، دروكري، دروجري، محل مواد البناء |
| Matériaux | Matériaux de construction | مواد البناء، لوازم البناء |
| Matériel | Matériel de construction, outillage | معدات البناء، أدوات البناء، لوازم الورش |
| Ciment | Ciment, ciment blanc, CPJ 35/45 | إسمنت، أسمنت، اسمنت، سيما، إسمنت أبيض |
| Sable | Sable de construction, sable lavé | رمل، رملة، رمل مغسول، رملة مغسولة |
| Granulats | Gravette, gravier | حصى، حصى البناء — préciser la granulométrie demandée |
| Carrelage | Carrelage, céramique, grès cérame | بلاط، سيراميك، زليج، زليج الأرضيات |
| Pose | Colle carrelage, joints, clips nivelants | لاصق البلاط، كولا الزليج، فواصل البلاط، كليبس الزليج |
| Étanchéité | Étanchéité toiture/terrasse | العزل المائي للأسطح، عزل السطح، منع تسرب الماء |
| Bitume | Membrane bitumineuse, rouleau de bitume | بيتومين، بيتومين للعزل، زفت السطح، رولو زفت |
| Peinture | Peinture bâtiment | صباغة، دهان، صباغة الحيطان |
| Plomberie | Plomberie, raccords, tuyaux | سباكة، بلومبري، أنابيب، لوازم السباكة |

**« Zeft = bitume » :** oui comme passerelle commerciale dans votre contexte d’étanchéité. Votre propre catalogue emploie déjà « زفت » dans certaines fiches. L’utiliser avec une désignation technique précise : « membrane bitumineuse / لفافة بيتومين للعزل المائي (رولو زفت) ». Ne pas présenter bitume, goudron, enrobé routier, membrane acoustique et membrane d’étanchéité comme des produits interchangeables. Le catalogue contient notamment une référence DANOSA MAD 4 à usage acoustique : elle ne doit pas être automatiquement poussée pour toute recherche de protection contre la pluie.

De même, « زليج » peut désigner le carrelage courant dans l’usage commercial local ; « زليج بلدي » implique un besoin plus spécifique. Ne pas classer les carreaux industriels comme zellige artisanal.

Les variantes « ciment/cimant », « carrelage/carelage », « étanchéité/etancheite », « zeft/زفت », « sima/سيما » servent surtout aux alias de recherche interne. Rédiger les titres publics correctement ; ne pas créer une page par faute d’orthographe. Google n’utilise pas la balise `meta keywords` pour le classement web : l’effort doit porter sur le contenu, les liens et la pertinence des pages. [Google : meta keywords](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag).

## 5. Pages à construire et mots-clés à attribuer

Les URL ci-dessous sont **des propositions**, pas des pages existantes. Préserver les URL produits numériques actuelles si elles sont déjà utilisées ; un changement de slug seul n’est pas prioritaire. Créer une URL canonique par intention principale et par langue.

| Priorité commerciale | Page proposée | Requêtes françaises | Requêtes arabes candidates |
|---|---|---|---|
| A | `/fr` + `/ar` | matériaux de construction Tanger, droguerie Tanger | مواد البناء طنجة، عقاقير طنجة |
| A | `/fr/materiaux-construction/ciment` | ciment Tanger, ciment CPJ 45 prix, ciment blanc Tanger | إسمنت طنجة، ثمن السيما، إسمنت أبيض طنجة |
| A | `/fr/materiaux-construction/sable-gravette` | sable construction Tanger, livraison sable Tanger, prix sable m³ | رملة طنجة، ثمن فياج الرملة، توصيل الرمل طنجة |
| A | `/fr/etancheite/bitume-membranes` | rouleau bitume Tanger, membrane bitumineuse Maroc | رولو زفت طنجة، بيتومين للعزل، ثمن زفت السطح |
| A | `/fr/outillage-carreleur` | matériel carreleur Tanger, coupe carrelage Maroc | أدوات الزليج، آلة قطع الزليج، كليبس الزليج |
| A sous réserve du catalogue | `/fr/carrelage-ceramique` | carrelage Tanger, céramique Tanger, carrelage 60x60 prix | زليج طنجة، سيراميك طنجة، ثمن الزليج 60/60 |
| B | `/fr/colles-joints-carrelage` | colle carrelage Tanger, mortier colle, joint carrelage | كولا الزليج، لاصق البلاط، فواصل البلاط |
| B | `/fr/etancheite` | produits étanchéité Tanger, étanchéité terrasse Maroc | مواد العزل المائي، عزل السطح من الماء |
| B | `/fr/outillage/disques-diamant` | disque diamant carrelage, disque béton Maroc | ديسك الزليج، قرص ألماس لقطع السيراميك |
| B | `/fr/peinture` | peinture bâtiment Tanger, peinture façade Maroc | صباغة طنجة، صباغة الواجهات |
| B | `/fr/plomberie` | plomberie Tanger, raccord PPR, pompe à eau Maroc | لوازم السباكة طنجة، مضخة ماء |
| B | `/fr/marques/danosa` | Danosa Maroc, Danosa Tanger | دانوزا، زفت دانوزا |
| B | `/fr/marques/soprema` | Soprema Maroc, Soprema Tanger | سوبريما، عزل سوبريما |
| A | `/fr/livraison-tanger` | livraison matériaux construction Tanger, devis matériaux Tanger | توصيل مواد البناء طنجة، أثمنة مواد البناء طنجة |

**A/B signifie priorité proposée selon l’intention commerciale et le catalogue observé, pas volume ou difficulté mesurée.** Les équivalents arabes peuvent garder les mêmes slugs sous `/ar` ; ce n’est pas le script du slug qui remplace la traduction du contenu.

L’échantillon « carrelage » contient surtout des outils et accessoires. Avant de publier une grande page de vente de carreaux, vérifier les références de céramique réellement commercialisées, formats, photos et disponibilité. La vente d’outillage de carreleur est déjà attestée ; il faut la traiter comme une offre distincte.

Chaque catégorie doit présenter une sélection de produits accessible, une introduction utile, les unités de vente, le fonctionnement des prix, la livraison, les critères de choix et quelques questions fréquentes. Lier l’accueil aux grandes familles, les familles aux sous-catégories et celles-ci aux produits. Ajouter un fil d’Ariane et ses données structurées cohérentes.

Pour les filtres ordinaires, garder des URL maîtrisées et exclues du sitemap. Ne créer une page « carrelage 60x60 » indexable que si le stock, le contenu et la demande le justifient. Éviter qu’une catégorie, un filtre et un guide visent exactement le même besoin d’achat.

### Exemples de textes prêts à adapter

**Accueil français — title :** Matériaux de construction à Tanger | Boukir Diamond

**H1 :** Matériaux de construction et outillage à Tanger

**Description :** Ciment, sable, étanchéité et outillage chez Boukir Diamond à Tanger. Consultez les produits et demandez votre prix avec livraison sur chantier.

**Accueil arabe — title :** مواد البناء والعقاقير بطنجة | Boukir Diamond

**H1 :** مواد البناء ولوازم الورش بطنجة

**Description :** إسمنت ورمل ومواد العزل المائي وأدوات البناء لدى بوكير دايموند بطنجة. اكتشف المنتجات واطلب الثمن مع توصيل مواد البناء إلى الورش.

**Page bitume — title :** Bitume et membranes d’étanchéité à Tanger | Boukir

**Équivalent arabe :** زفت السطح ولفائف العزل المائي بطنجة | بوكير دايموند

**Question commerciale en darija :** « بشحال رولو الزفت؟ واش الثمن بالمتر ولا بالرولو؟ » Répondre avec l’unité exacte du produit et la surface utile réellement documentée.

Valider les services annoncés avant publication. Ne pas promettre livraison gratuite, délai 24 h, pose ou statut de revendeur officiel sans preuve.

## 6. Concurrence observée sur le Web

Ces sites ont été retrouvés par recherche web ; **l’ordre du tableau n’est pas leur position Google**. Leurs affirmations commerciales ne sont pas auditées ni garanties.

| Acteur | Ce qui est visible | Réponse proposée pour Boukir |
|---|---|---|
| [ALOUATDIS, tarifs Tanger](https://www.alouatdis.ma/prices.html) | Page dédiée aux prix des matériaux à Tanger, unités, livraison et devis WhatsApp. | Afficher vos tarifs datés, leurs unités et le coût livré. Ne pas reprendre les prix d’un concurrent comme tarifs Boukir. |
| [Droguerie Tafraout](https://www.drg-tafraout.ma/) | Présentation locale, peintures, matériel, prestations, adresse et horaires. | Mieux expliciter votre offre construction et votre stock, avec pages françaises et arabes. |
| [Skal Cerame](https://skalcerame.com/) | Ciblage explicite « carrelage Tanger », photos de réalisations et marques présentées. | Construire une page carrelage documentée avec formats et sélection réellement disponible. |
| [Mirage Ceramica](https://mirageceramica.com/) | Catalogue carrelage/sanitaire, marques, dimensions et adresse à Tanger. | Clarifier produits, dimensions, prix au m²/boîte, retrait et devis. |
| [Rifaa, membranes bitumineuses](https://rifaa.ma/materiaux/etancheite-drainage/membranes-bitumineuses/) | Catégorie spécialisée, références, épaisseurs et informations de livraison nationale. | Détailler vos propres membranes, conditionnements et accessoires, avec traduction arabe pertinente. |
| [2HL Étanchéité](https://2hletancheite.com/etancheite/) | Familles bitume, primaires et accessoires ; plusieurs marques nommées. | Relier membrane, primaire et accessoires compatibles, après validation technique. |
| [Telecontact, matériaux Tanger](https://www.telecontact.ma/liens/materiaux-de-construction-distribution-detail/tanger.php) | Annuaire local de fournisseurs. | Vérifier l’existence et la cohérence de votre propre fiche ; rechercher quelques citations locales fiables. |

Votre opportunité proposée : **un catalogue achetable et fiable, des contenus arabe/français adaptés aux expressions marocaines, et un devis de chantier transparent à Tanger**. Il ne suffit pas de répéter « Tanger » davantage que les autres.

## 7. Français/arabe : ce qu’il faut réellement traduire

Prioriser FR et AR avant d’élargir les efforts éditoriaux en anglais/chinois. Les quatre langues existantes ne constituent pas en elles-mêmes un problème ; le contenu principal doit être exact et maintenu dans chaque version publiée.

Traduire noms de catégories, désignations produits, descriptions, attributs, titres SEO, descriptions SEO, textes alternatifs pertinents, livraison et questions fréquentes. Conserver les marques et codes fabricants sans les déformer. Corriger les taxonomies telles que « MATIERE DE CONSTRUCTION », « MATERIAL DE CONSTRUCTION » et `UNCATEGORIZED` dans les parcours commerciaux.

Chaque page `/ar/...` doit avoir son canonical propre sur le vrai domaine. Les liens `hreflang` FR/AR doivent être réciproques et pointer vers les pages correspondantes. `fr`/`ar` sont valides ; `fr-MA`/`ar-MA` peuvent convenir au ciblage marocain sans être indispensables. Ne pas utiliser un code de région seule ni inventer `darija-MA`. Un `x-default` peut compléter une page de sélection ou d’accueil appropriée. [Google : versions localisées](https://developers.google.com/search/docs/specialty/international/localized-versions?hl=fr).

Pour la recherche interne, ajouter un dictionnaire validé : `bitume ↔ بيتومين ↔ زفت`, `ciment ↔ إسمنت ↔ اسمنت ↔ سيما`, `sable ↔ رمل ↔ رملة`, `carrelage ↔ بلاط ↔ سيراميك ↔ زليج`. Ce dictionnaire est une aide à la recherche : il doit rester sensible aux usages, notamment bitume acoustique/étanchéité et zellige traditionnel/carrelage industriel.

Le code actuel traite des correspondances textuelles et une normalisation des accents latins ; aucun dictionnaire métier de synonymes n’a été repéré dans les routes examinées. Ajouter normalisation arabe raisonnable, alias par catégorie/produit, tolérance aux fautes et suivi des recherches sans résultat. Cela améliore la conversion interne ; cela ne constitue pas à lui seul une action de classement Google.

## 8. Être fort à Tanger, puis au Maroc

**Tanger :** compléter et vérifier la fiche Google Business Profile existante : nom réel de l’enseigne, bonne catégorie disponible correspondant à l’activité principale, adresse exacte, téléphone, horaires normaux/exceptionnels, site canonique et photos récentes de magasin, produits et livraisons. Vérifier le nom affiché « CONSTUCTION » aperçu dans le lien Maps par rapport à l’enseigne réelle. Ne pas ajouter artificiellement des mots-clés au nom commercial.

Demander des avis honnêtes après les commandes, sans contrepartie ni sélection des seuls clients satisfaits ; y répondre. La pertinence, la distance et la notoriété influencent le classement local : une fiche peut bien ressortir dans un quartier et moins dans un autre. Le nombre d’avis seul ne garantit pas la première place. [Google : classement local](https://support.google.com/business/answer/7091?hl=fr).

**Livraison :** expliquer la zone réellement desservie, prix/frais, minimum de commande, accès du camion, déchargement, quantité et unités. Utiliser l’adresse et un repère de chantier. Pour le sable, un « camion » ou « فياج » ne définit pas un volume unique. Pour le carrelage, indiquer pièces/boîte et m²/boîte ; pour le ciment, poids du sac ; pour une membrane, largeur, longueur et unité facturée.

**Maroc :** privilégier d’abord les familles dont le transport reste commercialement viable : outils, disques, accessoires de pose, certains produits d’étanchéité selon conditions. Étendre les matériaux lourds uniquement avec une logistique et des prix livrés maîtrisés. Ne pas annoncer partout au Maroc la même promesse pour un disque diamant et un camion de sable.

Créer une page locale supplémentaire uniquement lorsqu’elle décrit une desserte, une offre ou un établissement réel avec informations spécifiques. Des dizaines de pages clonées « ciment + ville » n’apportent pas de valeur et peuvent relever des pages satellites. Éviter les achats de liens destinés à manipuler le classement et les textes remplis de mots-clés. [Google : règles antispam](https://developers.google.com/search/docs/essentials/spam-policies?hl=fr).

La fiche contact possède déjà un schéma `LocalBusiness`. Corriger ses URL et compléter ville, pays, horaires et identifiant stable de l’établissement, avec des données vérifiées. Relier uniquement les vrais profils sociaux. Le choix d’un sous-type d’activité approprié peut préciser l’activité ; il ne garantit aucun classement.

## 9. Contenus et fonctions qui peuvent vous différencier

| Contenu proposé | Requête/besoin | Lien commercial |
|---|---|---|
| Prix du ciment à Tanger : sac, marque, livraison | prix ciment Tanger ; ثمن السيما بطنجة | Catégorie ciment et devis |
| Commander du sable : m³, sac ou camion | prix sable m3 ; ثمن فياج الرملة | Sable + devis transport |
| Prix du carrelage : différence m² / boîte | carrelage prix ; ثمن الزليج للمتر | Formats réellement vendus |
| Bitume, membrane et « zeft » : comment identifier le produit | ثمن زفت السطح ; rouleau bitume | Membranes et accessoires |
| Quels outils pour poser un carrelage grand format ? | matériel carreleur ; أدوات الزليج | Coupe-carrelage, clips, ventouses |
| Étanchéité sous carrelage : questions avant achat | étanchéité terrasse carrelée | Systèmes compatibles du catalogue |
| Préparer un devis de chantier à Tanger | devis matériaux construction | Formulaire + demande WhatsApp |
| Cas client local documenté | achat/rénovation à Tanger | Produits utilisés et preuves réelles |

Les guides techniques doivent être relus par une personne compétente et fondés sur les notices des références réellement vendues. Donner les critères de choix, pas des dosages ou garanties inventés. Une FAQ utile est intéressante pour les visiteurs ; ne pas promettre un résultat enrichi FAQ pour ce commerce.

Propositions fonctionnelles : liste de chantier partageable, panier/devis avec quantités et unités, calculateur m² vers boîtes selon le produit, calculateur volume de sable sans conversion arbitraire tonnes/m³, disponibilités réelles, fiches techniques et photos propres. Lier la vente de produits à un service de Maalem seulement lorsque le service existe, en distinguant clairement achat du matériel et prestation de pose.

Après fiabilisation des prix et politiques commerciales, examiner un flux Merchant Center et l’éligibilité effective du compte/pays aux surfaces gratuites. Les fiches structurées et un flux cohérent peuvent compléter la visibilité ; ils ne garantissent pas un affichage enrichi. [Google : données produits et flux](https://developers.google.com/search/docs/appearance/structured-data/product).

## 10. Comment obtenir le véritable classement des recherches

Dans Keyword Planner, charger les expressions de l’annexe et mesurer séparément **Tanger ville**, **région Tanger-Tétouan-Al Hoceïma** et **Maroc**. Choisir Google comme réseau lorsque possible, les 12 derniers mois complets, et conserver le paramétrage exact dans l’export. Comparer les termes français et arabes ; ne pas additionner des volumes regroupant déjà les mêmes variantes proches.

Exporter : mot-clé, recherches mensuelles moyennes, série mensuelle, localisation, période, concurrence publicitaire et enchères indicatives. La concurrence Google Ads mesure les annonceurs, **pas la difficulté SEO**. Les estimations restent des estimations ; selon le compte, leur précision peut varier. [Google : statistiques Keyword Planner](https://support.google.com/google-ads/answer/3022575?hl=fr).

Dans Search Console, comparer requêtes/pages/pays/appareils, FR/AR et marque/hors marque sur 3 à 16 mois selon données disponibles. Les impressions concernent les apparitions de votre site ; elles ne mesurent pas tout le marché. La Search Console ne fournit pas un filtre ville Tanger équivalent au ciblage Google Ads. Pour le local, compléter avec les performances de la fiche établissement et un suivi de positions à points géographiques fixes.

Google Trends peut servir à comparer la saisonnalité des groupes ciment, sable, carrelage, étanchéité, zellige et équivalents arabes, en gardant une requête de référence entre groupes. Son indice relatif n’est pas un nombre de recherches ; les termes locaux faibles peuvent manquer de données. Aucune courbe Trends n’a été mesurée dans cet audit. [Google : comprendre Trends](https://support.google.com/trends/answer/4365533?hl=fr).

Ne pas utiliser le nombre de résultats `site:boukirdiamond.com` comme total de pages indexées. Vérifier l’indexation avec les rapports Search Console et un échantillon d’URL. [Google : limites de l’opérateur site](https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site?hl=fr).

Une fois les chiffres disponibles, prioriser par **demande mesurée × adéquation au catalogue × marge × faisabilité de livraison × capacité à créer une meilleure page**. Un terme plus petit mais très acheteur peut produire davantage de commandes qu’un mot générique très large.

## 11. Plan de réalisation sur 90 jours

| Échéance | Responsable conseillé | Livrable | Critère de validation |
|---|---|---|---|
| J0–J3 | Développeur / hébergement | Domaine unique, URL SEO publiques, correction `www`/API | Aucun localhost dans canonical/hreflang/sitemap/schémas des URL contrôlées ; ancien hôte redirigé ; catalogue fonctionnel |
| J4–J10 | Développeur | Rendu serveur catalogue/produits, pagination, sitemap produits, vrais statuts | Produits et liens présents dans HTML ; pagination explorable ; 404 réelle pour absence confirmée ; sitemap public cohérent |
| J4–J14 | Responsable catalogue + traducteur | 8 familles prioritaires FR/AR et nomenclature propre | Aucun nom vide ni catégorie fourre-tout sur la sélection prioritaire ; prix et unités vérifiés |
| J8–J21 | Responsable magasin | Fiche établissement, photos, livraison, retours et contacts | Informations identiques et exploitables sur site/fiche ; vrais liens de confiance |
| J15–J30 | Catalogue + SEO | 40 fiches commerciales prioritaires FR/AR | Texte distinct, attributs, images, unité, stock et prix cohérents ; schémas validés sur échantillon |
| J15–J30 | SEO / propriétaire des comptes | Exports Ads/Search Console et mesure conversions | Tableau des recherches mesurées ; suivi devis/WhatsApp/achat sans confondre clic et vente |
| J31–J60 | Rédacteur + expert métier | 6 à 8 guides utiles, cas locaux, maillage | Chaque contenu sert un besoin distinct et mène à une offre réelle |
| J61–J90 | SEO + équipe commerciale | Amélioration des pages qui obtiennent des impressions ; extension des familles rentables | Arbitrages fondés sur clics, demandes qualifiées et marge ; extension nationale selon logistique |

Ces quantités sont des objectifs de production proposés, adaptables à l’équipe. **90 jours constituent un cycle de travail et de mesure, pas une promesse d’être premier.**

Suivre mensuellement : produits/catégories indexables et indexés, clics hors marque FR/AR, requêtes nouvelles, demandes de devis qualifiées, clics WhatsApp puis ventes rapprochées, achats/revenus/marge organiques, recherches internes sans résultat et complétude du catalogue. Fixer une référence au démarrage, puis des objectifs commerciaux après lecture des données.

Mesurer les performances mobiles sur accueil, catégories et produits réels avec données de terrain quand disponibles. Cibles Google : LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1, au 75e percentile. Aucun score PageSpeed ni Core Web Vitals de terrain n’a été produit ici ; les durées HTTP du dossier de preuves ne sont pas ces métriques. [Google : Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals?hl=fr).

## 12. Dossier de preuves et suite opérationnelle

- `preuves-http.json` : 14 URL, statuts, canonical, robots, hreflang, schémas, HTML textuel et URL du sitemap.
- `preuves-catalogue.json` : catégories, total déclaré, échantillon récent et recherches ciblées. Les nombres de résultats de recherche interne ne sont pas des nombres de catégories exactes.
- `preuves-suggestions-google.json` : 22 requêtes de départ, réponses Google, langue et URL source.
- `preuves-reseau.txt` : prérequêtes API refusées sur le parcours `www` et GET réussis sur le parcours sans `www`.
- `preuve-produit-rendu.json` : fiche DANOSA 6696 rendue et schéma lors de la seconde observation.
- `boutique-www-erreur.png` et `boutique-sans-www.png` : captures des deux parcours.
- `ANNEXE-MOTS-CLES.md` : propositions regroupées par besoin, variantes FR/arabe/darija et suggestions Google retenues, avec leurs sources.

**La prochaine réalisation utile est le lot J0–J3**, suivi des pages catégories françaises/arabes et de la qualité des fiches. Acheter des liens ou rédiger des dizaines d’articles avant ces corrections laisserait les problèmes d’accès et d’indexation en place.
