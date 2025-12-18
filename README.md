# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

# Application de Gestion Commerciale

Une application React.js complète de gestion commerciale avec authentification JWT, gestion des employés, stock, contacts, commandes et paiements.

## 🚀 Technologies utilisées

- **Frontend**: React.js 18 + TypeScript + Vite
- **État global**: Redux Toolkit + RTK Query
- **Routage**: React Router v6 avec routes protégées
- **Styling**: Tailwind CSS + @tailwindcss/forms
- **Formulaires**: Formik + Yup pour la validation
- **Icons**: Lucide React
- **Authentification**: JWT simulé avec localStorage

## 📋 Fonctionnalités

### 🔐 Authentification
- Login par CIN + mot de passe
- Gestion des rôles (PDG / Employé)
- Routes protégées avec redirection automatique
- Persistance de session

### 👨‍💼 Gestion des Employés
- CRUD complet (accessible uniquement aux PDG)
- Validation du CIN unique
- Traçabilité des actions (`created_by`, `updated_by`)

### 📦 Gestion du Stock
- Catalogue de produits avec prix et quantités
- Alertes de stock faible
- Catégorisation des produits
- Gestion des fournisseurs

### 📇 Gestion des Contacts
- Clients et fournisseurs
- Informations complètes (téléphone, email, adresse, CIN/ICE)
- Recherche et filtrage

### 🧾 Gestion des Bons
- Types : Commandes, Sorties, Comptant, Avoirs, Devis
- Gestion des lignes de produits
- **Nouveau (Dec 2025)** : Support des Variantes (Taille, Couleur...) et Unités Multiples (m3, Sac, Kg...)
  - Sélection dynamique dans les formulaires de bons.
  - Ajustement automatique des prix selon la variante ou l'unité choisie.
  - Stockage des `variant_id` et `unit_id` dans la base de données pour chaque ligne.

## 📦 Structure des Données (Variantes & Unités)

### Base de Données
Les tables de lignes de documents (`sortie_items`, `commande_items`, etc.) ont été mises à jour avec deux nouvelles colonnes :
- `variant_id` (INT, Nullable) : Référence vers `product_variants`.
- `unit_id` (INT, Nullable) : Référence vers `product_units`.

### Flux d'Enregistrement
1. **Frontend (`BonFormModal`)** :
   - L'utilisateur sélectionne un produit.
   - Si le produit a des variantes/unités, des listes déroulantes apparaissent.
   - Lors de la soumission, l'objet item contient `{ product_id, quantite, ..., variant_id, unit_id }`.
2. **Backend (API Routes)** :
   - Les routes (`POST /sorties`, `PUT /commandes`, etc.) extraient ces IDs.
   - Les requêtes SQL `INSERT` incluent désormais ces champs.


- Calcul automatique des montants
- Statuts de suivi

### 💵 Caisse et Paiements
- Enregistrement des paiements
- Modes : Espèces, Chèque, Virement, Carte
- Liaison avec les bons
- Historique des transactions

## 🔑 Comptes de test

### PDG (Accès complet)
- **CIN**: BK123456
- **Mot de passe**: pdg123

### Employé (Accès limité)
- **CIN**: BK789012
- **Mot de passe**: emp123

## 🛠️ Installation et démarrage

### Prérequis
- Node.js 20+ 
- npm ou yarn

### Installation
```bash
# Installer les dépendances
npm install

# Démarrer le serveur de développement
npm run dev
```

L'application sera disponible sur `http://localhost:5174`

## 📁 Structure du projet

```
frontend/
  └── src/
├── components/           # Composants réutilisables
│   ├── auth/            # Authentification (Login, ProtectedRoute)
│   └── layout/          # Layout (Header, Sidebar, Layout)
├── pages/               # Pages principales
│   └── Dashboard.tsx    # Tableau de bord
├── store/               # Redux Toolkit
│   ├── api/             # RTK Query endpoints
│   │   ├── apiSlice.ts  # Configuration de base
│   │   ├── authApi.ts   # API d'authentification
│   │   ├── employeesApi.ts
│   │   ├── productsApi.ts
│   │   └── contactsApi.ts
│   ├── slices/          # Redux slices
│   │   └── authSlice.ts # Gestion de l'état d'authentification
│   └── index.ts         # Configuration du store
├── types/               # Types TypeScript
├── data/                # Données de test (fake data)
├── utils/               # Utilitaires (permissions, validation)
├── hooks/               # Hooks personnalisés
└── App.tsx              # Composant principal
```

## 🔒 Système de permissions

### Rôle PDG
- ✅ Gestion complète des employés
- ✅ Accès à tous les modules
- ✅ Suppression d'éléments
- ✅ Rapports avancés

### Rôle Employé
- ❌ Pas d'accès à la gestion des employés
- ✅ Gestion du stock
- ✅ Gestion des contacts
- ✅ Gestion des bons
- ✅ Gestion de la caisse
- ❌ Pas de suppression
- ❌ Pas d'accès aux rapports

## 📊 Traçabilité des actions

Toutes les actions de création et modification incluent automatiquement :
- `created_by`: ID de l'employé qui a créé l'élément
- `updated_by`: ID de l'employé qui a modifié l'élément
- Horodatage des actions

## 🎨 Interface utilisateur

- Design moderne avec Tailwind CSS
- Interface responsive (mobile-first)
- Sidebar rétractable
- Header avec informations utilisateur
- Feedback visuel pour les actions
- Alertes et notifications

## 🔄 Données simulées

L'application utilise des données de test stockées en mémoire :
- 4 employés de test
- Catalogue de produits variés
- Clients et fournisseurs
- Bons et paiements d'exemple

## 📄 Scripts disponibles

```bash
npm run dev          # Démarrage en mode développement
npm run build        # Build de production
npm run preview      # Aperçu du build de production
```

## 📲 Envoi WhatsApp (sans Twilio)

L'application envoie les messages WhatsApp via un service local basé sur `whatsapp-web.js` (`whtsp-service/`). Twilio a été retiré.

1) Lancer le service WhatsApp et scanner le QR une fois:

```bash
cd whtsp-service
npm install
npm start
```

Variables d'environnement du service (fichier `whtsp-service/.env`):

- `WA_API_KEY`: clé API utilisée par le backend (header `x-api-key`)
- `DEFAULT_CC`: indicatif pays (ex: 212)
- `HOST`: 127.0.0.1 (par défaut)
- `PORT`: 3000 (par défaut)

2) Configurer le backend pour appeler le service:

Créer/éditer `backend/.env` et ajouter:

```
WHTSP_SERVICE_BASE_URL=http://127.0.0.1:3000
WHTSP_SERVICE_API_KEY=<même clé que WA_API_KEY>
PUBLIC_BASE_URL=https://votre-domaine-public-ou-tunnel
```

`PUBLIC_BASE_URL` est utilisé pour construire des liens PDF accessibles depuis le téléphone.

3) Optionnel: Meta (WhatsApp Cloud API)

Si vous souhaitez aussi activer l'envoi via l'API Cloud de Meta (fallback), ajoutez:

```
FACEBOOK_WHATSAPP_TOKEN=EAA...
WHATSAPP_PHONE_NUMBER_ID=1234567890
META_WHATSAPP_TEMPLATE_NAME=nom_du_template
META_WHATSAPP_TEMPLATE_LANG=fr
```

Dans ce mode, le backend utilisera prioritairement `whtsp-service`. S'il n'est pas configuré, il tentera Meta.

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
# boukir

## Backend (Express + MySQL)

Un serveur Express minimal est inclus (dossier `backend/`) pour démarrer la partie backend par la table `employees`.

1) Copier `backend/.env.example` en `backend/.env` et ajuster les variables MySQL.

2) Créer la base de données et la table `employees` en important `backend/schema.sql`.

3) Installer les dépendances puis lancer le front et l'API ensemble:

```bash
npm install
npm run dev:full
```

En mode dev, le front appelle `/api/*` et Vite proxie vers `http://localhost:3001` (configuré dans `vite.config.ts`).

## Intégration ChatGPT (OpenAI)

### Configuration
- Ajoutez `OPENAI_API_KEY` dans `backend/.env`.

Exemple:

```
OPENAI_API_KEY=sk_...votre_clef...
```

### Installation SDK

```
npm install openai
```

### Endpoint backend
- `POST /api/ai/chat`
- Body: `{ prompt: string }` ou `{ messages: { role, content }[] }`
- Options: `model` (par défaut `gpt-4o-mini`), `temperature`

Exemple cURL:

```
curl -X POST http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "prompt": "Explique la TVA au Maroc en 2 phrases" }'
```

### Service frontend
`frontend/src/services/ai.ts` expose `chat()`:

```
import { chat } from './services/ai';

async function demo() {
  const res = await chat('Bonjour, donne une blague courte.');
  console.log(res.content);
}
```

### Lancement
- Dev complet: `npm run dev:full`
- Backend seul: `npm run server`

Si 500 avec message clé manquante, vérifiez `OPENAI_API_KEY`.

