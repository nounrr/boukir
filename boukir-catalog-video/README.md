# Catalogue Boukir Diamond — Kerakoll

Vidéo Remotion 1548 × 516, 30 images/seconde, MP4 H.264, 96 secondes.

Sélection authentique : https://boukirdiamond.com/en/shop?category_id=107&brand_id=1
Relevé du 11 octobre 2026. Quatre vidéos fournies : 6140, 6190, 1284 et 1354, associées par référence exacte. Les trois autres articles utilisent leurs véritables images animées. Logo fourni : `C:\Users\med\Desktop\Design - Sources\logo.png`, copié sans modification dans `public/branding/logo.png` et affiché à l'ouverture et dans chaque scène.

## Ouvrir et exporter

Depuis ce dossier :

```powershell
npm install
npm run dev
npm run render
```

Studio : http://localhost:3100/BoukirCatalogue
Résultat : `out/boukir-kerakoll-1548x516.mp4`.
Le rendu régénère le rapport `out/rapport-videos.md` et vérifie les ressources avant l'export.

## Pièces jointes vidéo, sans copie manuelle

Transmettre directement les vidéos dans le chat Codex. L'agent utilise les chemins des pièces jointes disponibles et lance :

```powershell
npm run videos:import -- 'C:\chemin\de\la\piece-jointe\6140.mp4' 'C:\chemin\de\la\piece-jointe\1285.mov'
npm run render
```

Un dossier de pièces jointes explicite peut aussi être passé. Seuls ses fichiers vidéo immédiats sont lus. Les références authentiques de cette sélection sont **6140, 6190, 1285, 1284, 1286, 1354, 7059**. Un nom `6140__prise2.mp4` est accepté pour plusieurs prises. Aucun rapprochement par nom commercial, couleur ou numéro approchant.

Le script copie les originaux dans `public/product-videos/originals`, vérifie le flux avec FFprobe et convertit au plus 12 secondes en H.264. Les quatre clips de 10 secondes sont montrés intégralement, puis l'image réelle prend le relais pendant 2 secondes, sans répétition ni ralenti. Le son des clips est coupé pour préserver un catalogue homogène. Un fichier non lisible ou sans référence exacte est signalé dans le rapport et laisse le produit en mode image. Les autres prises restent disponibles.

En cas de plusieurs prises, renseigner un score éditorial après visionnage dans `data/video-policy.json`, `reviewedUsageScores`, indexé par nom de fichier. Sans score, le rapport précise le choix technique par durée utile puis résolution; ce choix ne prétend pas juger la qualité de la démonstration.

Si le chat ne fournit aucun chemin vidéo accessible, Codex doit le dire et demander de joindre les vidéos via le bouton de pièces jointes. Un fichier sur le PC peut aussi être utilisé directement avec son chemin absolu : aucune copie manuelle requise.

## Variantes et prix

- Les sept parents du site sont conservés. Les Tetra Fix de couleurs différentes sont des articles distincts; le site ne confirme pas de parent commun.
- Les 68 variantes de Silicone Coloré (6190) restent dans un seul segment de 12 secondes. Leurs images sont présentées par six panneaux. Chaque prix brut et code couleur est conservé dans `data/catalog.json`, le relevé complet dans `data/source.json`.
- Les références commerciales des 68 variantes sont vides dans l'API. Les noms tels que `KK2` et `kk2` sont conservés séparément, sans inventer de références ni les fusionner.
- La fourchette brute est **0–166,17 DH**. Les 53 prix à zéro portent une note « à confirmer ». Les tarifs positifs renseignés sont 140 DH (1 variante), 149,62 DH (13 variantes) et 166,17 DH (kk12). Le film ne présente pas les variantes à zéro comme gratuites.
- Descriptions et fiches techniques vides : aucune performance technique inventée.
- Le partage vidéo est désactivé sans preuve. `sharedApprovals` exige `targetReference`, `sourceReference`, `parentProductId`, `identicalUsage: true` et une `evidence` explicite. La source doit être une variante dont le site confirme le parent. Ne pas renseigner de preuve basée sur la seule similitude commerciale.

## Actualiser et contrôler

```powershell
npm run catalog:refresh
npm run report
npm test
npm run lint
node scripts/validate-catalog.mjs
```

Les images réelles sont téléchargées dans `public/products`. Le récupérateur refuse de changer silencieusement le nombre de parents si le catalogue évolue. Les échecs de téléchargement sont consignés dans `data/image-download-report.json`.

Chronologie : ouverture 0–4 s; articles 4–88 s (12 s chacun); récapitulatif 88–96 s. Les scènes sont disponibles individuellement dans Studio.
