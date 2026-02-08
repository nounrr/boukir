# Documentation des Modèles AI Utilisés

Ce document répertorie les modèles d'IA utilisés pour chaque tâche dans le fichier `backend/routes/ai.js`.

## Configuration Globale

Les modèles par défaut sont configurés via les variables d'environnement, avec `gpt-5-mini` comme valeur par défaut pour maximiser la vitesse et réduire les coûts tout en maintenant une qualité suffisante pour les tâches structurées.

| Variable d'Environnement | Défaut | Usage Principal |
|--------------------------|--------|-----------------|
| `AI_CLEAN_MODEL` | `gpt-5-mini` | Nettoyage, Normalisation, Structuration |
| `AI_TR_MODEL` | `gpt-5-mini` | Traduction pure (multilingue) |

---

## Détail par Tâche

### 1. Nettoyage et Normalisation des Titres
**Endpoint:** `POST /api/ai/products/translate`

| Tâche | Modèle Utilisé | Description |
|-------|----------------|-------------|
| **Nettoyage Principal** | `CLEAN_MODEL` | Analyse le titre brut, sépare le Français de l'Arabe/Darija, et normalise le texte sans traduire les "Protected Tokens" (SKUs, unités). |
| **Inférence FR depuis AR** | `CLEAN_MODEL` | Si aucun titre français n'est trouvé, génère une traduction technique du titre Arabe/Darija vers le Français. |
| **Correction Mixte** | `CLEAN_MODEL` | Si le titre est mixte (Marque Latin + Complément Arabe), traduit la partie Arabe pour compléter le titre Français. |

### 2. Traduction des Titres
**Endpoint:** `POST /api/ai/products/translate`

| Tâche | Modèle Utilisé | Description |
|-------|----------------|-------------|
| **Traduction Titres** | `TR_MODEL` | Traduit le titre nettoyé vers les langues cibles manquantes (AR, EN, ZH) en respectant le vocabulaire "Droguerie/Quincaillerie". |
| **Traduction Variantes** | `TR_MODEL` | Traduit les valeurs des variantes (Couleurs, Tailles) en batch. |
| **Correction Variantes FR** | `TR_MODEL` | Normalise les variantes mal saisies (ex: script Arabe "روج" -> "Rouge") vers le Français standard. |

### 3. Génération de Fiches Techniques
**Endpoint:** `POST /api/ai/products/generate-specs`

| Tâche | Modèle Utilisé | Description |
|-------|----------------|-------------|
| **Recherche & Création** | `CLEAN_MODEL` * | Analyse le Titre/Ref pour extraire les faits (dimensions), simule une recherche pour combler les manques, et génère le JSON `fiche_technique` + `description` HTML. |
| **Traduction Description** | `TR_MODEL` | Traduit la description HTML générée vers les autres langues (AR, EN, ZH) en préservant le balisage. |
| **Traduction Fiche JSON** | `gpt-5-mini` ** | Traduit spécifiquement les valeurs textuelles de l'objet JSON `fiche_technique` tout en préservant la structure et les clés. |

*\* Note: Peut être surchargé par le paramètre `model` dans le corps de la requête.*
*\*\* Note: Hardcodé à `gpt-5-mini` pour cette tâche spécifique de structure JSON.*
