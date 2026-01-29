# Documentation : Système de Détection des Utilisateurs Non Payés

**Date de création :** 19 Janvier 2026  
**Fichier concerné :** `frontend/src/pages/ContactsPage.tsx`

---

## 📋 Vue d'ensemble

Le système détecte automatiquement les contacts (clients/fournisseurs) en retard de paiement et les affiche en priorité dans la liste avec un code couleur rouge.

---

## 🔍 Règle de Détection : Fonction `isOverdueContact`

### Critères d'identification d'un contact en retard

Un contact est considéré **EN RETARD DE PAIEMENT** si **TOUTES** les conditions suivantes sont remplies :

#### ✅ Condition 0 : Contact actif
```typescript
if ((contact as any).deleted_at || (contact as any).archived || (contact as any).is_active === false) {
  return false;
}
```
- Les contacts **archivés ou supprimés** sont **automatiquement exclus**
- Seuls les contacts actifs peuvent être en retard
- Vérifie les champs : `deleted_at`, `archived`, ou `is_active`

#### ✅ Condition 1 : Solde positif
```typescript
if (solde <= 0) return false;
```
- Le solde du contact doit être **strictement supérieur à 0**
- Si solde ≤ 0 → le contact n'est PAS en retard
- Le solde est calculé à partir de `solde_cumule` (backend) ou calculé localement

#### ✅ Condition 2 : Vérification des paiements
```typescript
const contactPayments = allPayments.filter((p: any) => 
  p.contact_id === contact.id && isAllowedStatut(p.statut)
);

if (contactPayments.length === 0) return true;
```
- Le système recherche **tous les paiements** du contact
- Si le contact **n'a aucun paiement**, on ne conclut pas tout de suite : on vérifie aussi le **dernier bon** (voir Condition 3)
- Seuls les paiements avec statut 'Validé' ou 'En attente' sont pris en compte

#### ✅ Condition 3 : Période écoulée depuis la DERNIÈRE ACTIVITÉ (Paiement ou Bon)

Afin d'éviter les faux positifs, la page calcule la **dernière activité** du contact comme suit :

- `lastPaymentDate` : date du dernier paiement (statut **Validé** / **En attente**)
- `lastBonDate` : date du dernier bon créé
  - **Client** : dernier **Bon Sortie** ou **Bon Comptant**
  - **Fournisseur** : dernière **Commande**
- `lastActivityDate = max(lastPaymentDate, lastBonDate)`

➡️ Le contact est **EN RETARD** si `solde > 0` ET que la période configurée est écoulée depuis `lastActivityDate`.

Le système trouve le **paiement le plus récent** (si présent) et le **bon le plus récent** (si présent), puis calcule le temps écoulé depuis la date la plus récente :

```typescript
// Trier par date de création (plus récent en premier)
const sortedPayments = [...contactPayments].sort((a, b) => {
  const dateA = new Date(a.date_creation || a.created_at);
  const dateB = new Date(b.date_creation || b.created_at);
  return dateB.getTime() - dateA.getTime();
});

const lastPayment = sortedPayments[0];
const lastPaymentDate = new Date(lastPayment.date_creation);

// lastBonDate: dépend du type contact (client/fournisseur)
// lastActivityDate = max(lastPaymentDate, lastBonDate)
```

Puis calcule la différence entre la dernière activité et aujourd'hui :

**Mode JOURS :**
```typescript
if (overdueUnit === 'days') {
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= overdueValue;
}
```
- Convertit la différence en nombre de jours
- Compare avec la valeur configurée (`overdueValue`)

**Mode MOIS :**
```typescript
else {
  const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
  return diffMonths >= overdueValue;
}
```
- Convertit la différence en nombre de mois (approximatif : 30 jours/mois)
- Compare avec la valeur configurée (`overdueValue`)

---

## ⚙️ Configuration de la Période

### Paramètres stockés dans localStorage

| Paramètre | Clé localStorage | Valeur par défaut | Description |
|-----------|------------------|-------------------|-------------|
| `overdueValue` | `contacts-overdue-value` | **4** | Nombre d'unités (jours/mois) |
| `overdueUnit` | `contacts-overdue-unit` | **'months'** | Unité de temps ('days' ou 'months') |

### Configuration par défaut
**4 mois sans paiement + solde > 0 = CONTACT EN RETARD**

### Code de configuration
```typescript
const [overdueValue, setOverdueValue] = useState(() => {
  const saved = localStorage.getItem('contacts-overdue-value');
  return saved ? parseInt(saved) : 4;
});

const [overdueUnit, setOverdueUnit] = useState<'days' | 'months'>(() => {
  const saved = localStorage.getItem('contacts-overdue-unit');
  return (saved as 'days' | 'months') || 'months';
});
```

---

## 🎨 Affichage Visuel

### Mise en forme des contacts en retard

Les contacts en retard de paiement ont un style distinctif :

```tsx
className={`hover:bg-gray-50 cursor-pointer ${isOverdue ? 'bg-red-50 border-l-4 border-red-500' : ''}`}
```

**Caractéristiques visuelles :**
- 🔴 **Fond rouge clair** : `bg-red-50`
- 🔴 **Bordure rouge épaisse à gauche** : `border-l-4 border-red-500`
- 📍 **Positionnement prioritaire** : toujours en haut de la liste

### Bandeau d'alerte

Un message d'avertissement s'affiche en haut de la liste si au moins un contact est en retard :

```tsx
<div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
  <div className="flex items-center">
    <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
    <div className="text-sm">
      <p className="text-red-800">
        <strong>Priorité d'affichage :</strong> Les contacts en retard de paiement 
        (solde > 0 depuis {overdueValue} {overdueUnit === 'days' ? 'jour(s)' : 'mois'}) 
        sont affichés en rouge et en priorité dans la liste.
      </p>
    </div>
  </div>
</div>
```

---

## 📊 Tri Prioritaire

### Logique de tri

Les contacts en retard ont **PRIORITÉ ABSOLUE** dans le tri, avant tout autre critère :

```typescript
const sortedContacts = useMemo(() => {
  const sorted = [...filteredContacts].sort((a, b) => {
    // 🔥 PRIORITÉ ABSOLUE : Contacts en retard toujours en premier
    const aOverdue = isOverdueContact(a);
    const bOverdue = isOverdueContact(b);

    // Si l'un est en retard et pas l'autre
    if (aOverdue && !bOverdue) return -1;  // a vient en premier
    if (!aOverdue && bOverdue) return 1;   // b vient en premier

    // Si même statut, appliquer le tri normal (nom, solde, etc.)
    // ...
  });
  return sorted;
}, [filteredContacts, sortField, sortDirection, ...]);
```

**Ordre de tri :**
1. **Contacts en retard** (en rouge)
2. **Contacts à jour** (tri normal selon colonnes)

---

## 🔧 Comment Vérifier Manuellement

### Étapes de vérification

#### 1. Vérifier le solde
- Ouvrir la base de données
- Consulter la table `contacts` (clients/fournisseurs)
- Vérifier le champ `solde` ou le calcul du `solde_cumule`
- **Condition :** solde > 0

#### 2. Vérifier la date du dernier paiement
- Consulter la table `payments` ou `paiements`
- Filtrer les paiements pour le contact spécifique (`contact_id`)
- Trouver le paiement le plus récent (date la plus haute)
- Si aucun paiement → **automatiquement EN RETARD**

#### 3. Calculer la différence de temps
```javascript
// Trouver le dernier paiement
const contactPayments = payments.filter(p => 
  p.contact_id === contact.id && (p.statut === 'Validé' || p.statut === 'En attente')
);

if (contactPayments.length === 0) {
  // AUTOMATIQUEMENT EN RETARD
}

const lastPayment = contactPayments.sort((a, b) => 
  new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime()
)[0];

const lastPaymentDate = new Date(lastPayment.date_creation);
const now = new Date();
const diffMs = now.getTime() - lastPaymentDate.getTime();
```

#### 4. Appliquer la règle
**En jours :**
```javascript
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
// EN RETARD si : diffDays >= overdueValue
```

**En mois :**
```javascript
const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
// EN RETARD si : diffMonths >= overdueValue
```

---

## 📝 Exemples Pratiques

### Exemple 1 : Contact EN RETARD ✅

**Données du contact :**
- **Nom :** Ahmed Bennani
- **Solde :** 5 000 DH (> 0) ✅
- **Dernier paiement :** 2025-08-15
- **Date actuelle :** 2026-01-19
- **Configuration :** 4 mois

**Calcul :**
```
Différence = 2026-01-19 - 2025-08-15 = ~5 mois
5 mois >= 4 mois ✅
```

**Résultat :** 🔴 **CONTACT EN RETARD**

---

### Exemple 2 : Contact À JOUR ✅

**Données du contact :**
- **Nom :** Fatima El Alami
- **Solde :** 3 500 DH (> 0) ✅
- **Dernier paiement :** 2025-12-20
- **Date actuelle :** 2026-01-19
- **Configuration :** 4 mois

**Calcul :**
```
Différence = 2026-01-19 - 2025-12-20 = ~1 mois
1 mois < 4 mois ❌
```

**Résultat :** ✅ **Contact À JOUR** (paiement récent)

---

### Exemple 3 : Contact avec solde négatif ✅

**Données du contact :**
- **Nom :** Mohamed Tazi
- **Solde :** -2 000 DH (< 0) ❌
- **Date `updated_at` :** 2025-05-01
- **Configuration :** 4 mois

**Calcul :**
```
Solde <= 0 → PAS EN RETARD (même si ancienne date)
```

**Résultat :** ✅ **Contact À JOUR** (solde négatif = client en avance de paiement)

---

### Exemple 4 : Contact sans paiement ⚠️

**Données du contact :**
- **Nom :** Karim Idrissi
- **Solde :** 1 200 DH (> 0) ✅
- **Paiements :** Aucun paiement enregistré ⚠️
- **Configuration :** 4 mois

**Résultat :** 🔴 **AUTOMATIQUEMENT EN RETARD** (aucun paiement)

---

### Exemple 5 : Contact archivé 🗑️

**Données du contact :**
- **Nom :** Youssef Alami
- **Solde :** 10 000 DH (> 0) ✅
- **Dernier paiement :** 2025-01-01 (il y a 1 an)
- **Statut :** `deleted_at` = 2025-12-01 (archivé/supprimé)
- **Configuration :** 4 mois

**Calcul :**
```
Contact archivé → AUTOMATIQUEMENT EXCLU
```

**Résultat :** ✅ **IGNORÉ** (contact archivé, même avec solde élevé et ancien paiement)

---

## 🛠️ Calcul du Solde

### Source du solde

Le système utilise deux méthodes pour obtenir le solde :

#### Méthode 1 : Backend (prioritaire)
```typescript
const backend = (contact as any).solde_cumule;
if (backend != null) {
  solde = Number(backend) || 0;
}
```

#### Méthode 2 : Calcul local (fallback)
```typescript
const base = Number(contact.solde) || 0;
// Calcul basé sur les bons et paiements
solde = base;
```

### Pour les CLIENTS
```
Solde final = Solde de base + Total ventes - Total paiements
```

**Composantes des ventes :**
- Bons de sortie validés
- Bons comptant validés
- **Moins** les avoirs clients (remboursements)

### Pour les FOURNISSEURS
```
Solde final = Solde de base + Total achats - Total paiements
```

**Composantes des achats :**
- Bons de commande validés
- **Moins** les avoirs fournisseurs (remboursements)

---

## 🔍 Points Importants

### Gestion des contacts archivés
- Les contacts avec `deleted_at` non-null sont **automatiquement exclus**
- Les contacts avec `archived = true` sont **automatiquement exclus**
- Les contacts avec `is_active = false` sont **automatiquement exclus**
- **Les contacts archivés ne peuvent JAMAIS être en retard** (même avec un solde > 0)

### Gestion des paiements
- Seuls les paiements avec statut **'Validé'** ou **'En attente'** sont pris en compte
- Les autres statuts (annulé, brouillon, etc.) sont ignorés
- Le système recherche dans le champ `date_creation` ou `created_at` des paiements

### Gestion des dates invalides
```typescript
if (isNaN(lastPaymentDate.getTime())) {
  console.warn('Date de paiement invalide pour contact:', contact.id, lastPayment);
  return true; // Considérer comme en retard si date invalide
}
```

### Gestion des erreurs
```typescript
try {
  // Calcul de la date du dernier paiement
} catch (error) {
  console.error('Erreur calcul date dernier paiement pour contact:', contact.id, error);
  return true; // En cas d'erreur, considérer comme en retard
}
```

### Statuts de bons autorisés
Seuls les bons avec ces statuts sont pris en compte :
- ✅ 'Validé' / 'Valide'
- ✅ 'En attente' / 'Attente'

```typescript
const isAllowedStatut = (s: any) => {
  if (!s) return false;
  const norm = String(s).toLowerCase();
  return norm === 'validé' || norm === 'valide' || norm === 'en attente' || norm === 'attente';
};
```

---

## 📌 Résumé de la Règle

### Un contact est EN RETARD si :

1. ✅ **Contact actif** (non archivé, non supprimé)
2. ✅ **Solde > 0** (doit de l'argent)
3. ✅ **Aucun paiement enregistré** OU **Dernier paiement ≥ Configuration**
4. ✅ **Configuration par défaut :** 4 mois sans paiement

### Un contact est À JOUR si :

1. ❌ **Contact archivé** (deleted_at, archived, ou is_active = false)
2. ❌ **Solde ≤ 0** (rien à payer ou en avance)
3. ❌ **Dernier paiement < Configuration** (paiement récent)

---

## 🎯 Configuration Recommandée

| Situation | Valeur | Unité | Résultat |
|-----------|--------|-------|----------|
| **Standard** | 4 | mois | Détection après 4 mois |
| **Stricte** | 2 | mois | Détection après 2 mois |
| **Très stricte** | 30 | jours | Détection après 1 mois |
| **Souple** | 6 | mois | Détection après 6 mois |

---

## 📧 Support Technique

Pour toute question ou modification de la logique de détection, contactez l'équipe de développement.

**Fichier source :** `frontend/src/pages/ContactsPage.tsx`  
**Fonction principale :** `isOverdueContact(contact: Contact): boolean`  
**Lignes :** 59-103

---

**Fin de la documentation**
