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

