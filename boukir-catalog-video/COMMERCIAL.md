# Publicité Boukir Diamond

Publicité native **1548 × 516 px**, 3:1, 30 FPS, 40 secondes (1200 images), MP4 H.264, YUV 4:2:0, pixels carrés 1:1. Tous les éléments sont composés directement dans ces dimensions. Marges des éléments essentiels : 60 px à gauche/droite et 35 px en haut/bas.

Film : `out/boukir-commercial-1548x516.mp4`.
Contrôle indépendant FFprobe : `out/commercial-verification.json` et `out/commercial-verification.txt`.
Prévisualisation modifiable : http://localhost:3100/BoukirCommercial.

## Chronologie

| Temps | Scène |
| --- | --- |
| 0–6 s | Logo fourni, dessin de chantier, signature français/arabe |
| 6–13 s | Meuleuses XCORT et Bosch |
| 13–20 s | Produits Sika 522 et I 80 |
| 20–27 s | Kerakoll H40 Gel, H40 Icon, silicone coloré |
| 27–34 s | Démonstration animée et simplifiée du catalogue en ligne |
| 34–40 s | Site, téléphone, email et adresse à Tanger |

Images authentiques téléchargées depuis le catalogue officiel. Les photographies sont animées dans la composition ; elles ne constituent pas des démonstrations d’utilisation filmées. Le logo fourni est conservé tel quel. Bande sonore instrumentale originale synthétisée localement, sans enregistrement tiers. Les coordonnées ont été contrôlées sur le site le 11 octobre 2026. Sources conservées dans `data/commercial-source.json` et `src/data/commercial.json`.

## Exporter et vérifier

```powershell
npm run dev
npm run commercial:render
npm run commercial:verify
```

Pour régénérer le son : `node scripts/create-commercial-audio.mjs`.
Pour actualiser les images et la sélection : `node scripts/fetch-commercial.mjs` (vérifier visuellement les éventuels changements du catalogue avant de réexporter).

Les compositions d’origine du catalogue Kerakoll restent disponibles dans Studio.
