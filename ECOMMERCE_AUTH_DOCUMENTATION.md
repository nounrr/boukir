# E-Commerce Authentication System with Artisan Approval Workflow

## Overview
This document describes the merged contacts/users authentication system that unifies the Back-Office (BO) contacts with e-commerce user accounts, including SSO support and an Artisan/Promoteur approval workflow.

## Database Architecture

### Unified `contacts` Table
The `contacts` table now serves dual purposes:
1. **Back-Office contacts** (Clients/Fournisseurs) - `auth_provider = 'none'`
2. **E-commerce users** - `auth_provider = 'local' | 'google' | 'facebook'`

### Key Fields

#### Identity Fields
- `nom_complet` - Full name (BO compatibility)
- `prenom` - First name (e-commerce)
- `nom` - Last name (e-commerce)
- `email` - Unique email address
- `telephone` - Phone number

#### Account Classification
- `type` - ENUM('Client', 'Fournisseur') - BO classification
- `type_compte` - ENUM('Client', 'Artisan/Promoteur', 'Fournisseur') - E-commerce account type

#### Artisan/Promoteur Approval Workflow
- `demande_artisan` - BOOLEAN - User requested Artisan status
- `artisan_approuve` - BOOLEAN - Request approved by admin
- `artisan_approuve_par` - INT - Employee ID who approved
- `artisan_approuve_le` - DATETIME - Approval timestamp
- `artisan_note_admin` - TEXT - Admin notes about the request

#### Authentication
- `password` - VARCHAR(255) - Bcrypt hashed (NULL for SSO-only)
- `auth_provider` - ENUM('local', 'google', 'facebook', 'none')
  - `'none'` = BO contact only (no e-commerce access)
  - `'local'` = Email/password authentication
  - `'google'` = Google SSO
  - `'facebook'` = Facebook SSO
- `google_id` - VARCHAR(255) UNIQUE - Google OAuth ID
- `facebook_id` - VARCHAR(255) UNIQUE - Facebook OAuth ID

#### Security
- `is_active` - BOOLEAN - Account active status
- `is_blocked` - BOOLEAN - Admin can block accounts
- `login_attempts` - INT - Failed login counter
- `locked_until` - DATETIME - Temporary lock expiration
- `email_verified` - BOOLEAN - Email verification status

## Artisan/Promoteur Approval Workflow

### User Registration Flow

```
1. User registers with type_compte = 'Artisan/Promoteur'
   ↓
2. Backend sets:
   - type_compte = 'Client' (temporary)
   - demande_artisan = TRUE
   - artisan_approuve = FALSE
   ↓
3. User gets JWT token and can use app as regular Client
   ↓
4. Admin reviews request in BO dashboard
   ↓
5a. APPROVED:
    - artisan_approuve = TRUE
    - type_compte = 'Artisan/Promoteur'
    - artisan_approuve_par = admin_id
    - artisan_approuve_le = NOW()
    ↓
5b. REJECTED:
    - demande_artisan = FALSE
    - artisan_note_admin = 'Reason...'
    - User can request again later
```

### Frontend Display Logic

**While Pending (`demande_artisan = TRUE`, `artisan_approuve = FALSE`):**
- Show yellow banner: "Demande en attente d'approbation"
- Display badge: "Client (Demande Artisan en attente)"
- User has Client-level access only

**After Approval (`artisan_approuve = TRUE`):**
- Show green banner: "Compte Artisan/Promoteur Activé"
- Display badge: "Artisan/Promoteur"
- User has full Artisan privileges

## API Endpoints

### Public Endpoints (No Authentication Required)

#### Register with Email/Password
```http
POST /api/users/auth/register
Content-Type: application/json

{
  "prenom": "Jean",
  "nom": "Dupont",
  "email": "jean@example.com",
  "telephone": "0612345678",
  "password": "SecurePass123!",
  "confirm_password": "SecurePass123!",
  "type_compte": "Artisan/Promoteur"  // or "Client"
}

Response 201:
{
  "message": "Compte créé avec succès. Votre demande pour devenir Artisan/Promoteur est en attente d'approbation.",
  "user": {
    "id": 123,
    "prenom": "Jean",
    "nom": "Dupont",
    "email": "jean@example.com",
    "type_compte": "Client",  // Temporary until approved
    "demande_artisan": true,
    "artisan_approuve": false,
    "auth_provider": "local"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Login with Email/Password
```http
POST /api/users/auth/login
Content-Type: application/json

{
  "email": "jean@example.com",
  "password": "SecurePass123!"
}

Response 200:
{
  "message": "Connexion réussie",
  "user": { ... },
  "token": "..."
}
```

#### Google Sign-In
```http
POST /api/users/auth/google
Content-Type: application/json

{
  "credential": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjI3ZDQ...",
  "access_token": "ya29.a0AfH6SMBx..."  // Optional
}
```

#### Facebook Login
```http
POST /api/users/auth/facebook
Content-Type: application/json

{
  "accessToken": "EAABwzLixnjYBAO...",
  "userID": "1234567890"
}
```

#### Get Current User
```http
GET /api/users/auth/me
Authorization: Bearer <token>

Response 200:
{
  "user": {
    "id": 123,
    "prenom": "Jean",
    "nom": "Dupont",
    "email": "jean@example.com",
    "type_compte": "Client",
    "demande_artisan": true,
    "artisan_approuve": false,
    ...
  }
}
```

### Admin Endpoints (Protected - Requires BO Authentication)

#### Get All Artisan Requests
```http
GET /api/users/admin/artisan-requests?status=pending
Authorization: Bearer <bo_admin_token>

Query Params:
- status: 'pending' | 'approved' | 'all'

Response 200:
[
  {
    "id": 123,
    "nom_complet": "Jean Dupont",
    "email": "jean@example.com",
    "telephone": "0612345678",
    "demande_artisan": true,
    "artisan_approuve": false,
    "created_at": "2025-12-12T10:30:00Z",
    "last_login_at": "2025-12-12T14:20:00Z"
  },
  ...
]
```

#### Approve Artisan Request
```http
POST /api/users/admin/artisan-requests/123/approve
Authorization: Bearer <bo_admin_token>
Content-Type: application/json

{
  "admin_id": 5,  // Employee ID from BO
  "note": "Documents vérifiés, société valide"
}

Response 200:
{
  "message": "Demande Artisan/Promoteur approuvée avec succès",
  "contact": {
    "id": 123,
    "type_compte": "Artisan/Promoteur",
    "artisan_approuve": true,
    "artisan_approuve_le": "2025-12-12T15:00:00Z"
  }
}
```

#### Reject Artisan Request
```http
POST /api/users/admin/artisan-requests/123/reject
Authorization: Bearer <bo_admin_token>
Content-Type: application/json

{
  "admin_id": 5,
  "note": "Documents insuffisants"
}
```

#### Get All E-Commerce Users
```http
GET /api/users/admin/users?type_compte=Client&auth_provider=google
Authorization: Bearer <bo_admin_token>

Query Params:
- type_compte: 'Client' | 'Artisan/Promoteur'
- auth_provider: 'local' | 'google' | 'facebook'
```

#### Block/Unblock User
```http
POST /api/users/admin/users/123/block
Authorization: Bearer <bo_admin_token>
Content-Type: application/json

{
  "block": true,  // or false to unblock
  "admin_id": 5
}
```

## Frontend Implementation

### 1. Registration Page with Account Type Selection

```tsx
import React, { useState } from 'react';
import { ArtisanRequestButton, AccountTypeInfo } from '@/components/ArtisanStatusComponents';

const RegisterPage: React.FC = () => {
  const [formData, setFormData] = useState({
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    password: '',
    confirm_password: '',
    type_compte: 'Client',
  });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const response = await fetch('http://localhost:3001/api/users/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    const data = await response.json();
    
    if (response.ok) {
      // Store token
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Show message if artisan request pending
      if (data.user.demande_artisan && !data.user.artisan_approuve) {
        showNotification('success', data.message);
      }
      
      // Redirect
      window.location.href = '/dashboard';
    }
  };

  return (
    <form onSubmit={handleRegister}>
      {/* Form fields ... */}
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Type de compte
        </label>
        <select
          value={formData.type_compte}
          onChange={(e) => setFormData({ ...formData, type_compte: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="Client">Client</option>
          <option value="Artisan/Promoteur">Artisan/Promoteur</option>
        </select>
        
        {formData.type_compte === 'Artisan/Promoteur' && (
          <p className="mt-2 text-sm text-yellow-600">
            ⚠️ Votre demande sera examinée par notre équipe. 
            Vous aurez accès Client en attendant l'approbation.
          </p>
        )}
      </div>

      <AccountTypeInfo showArtisanBenefits />
      
      <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg">
        S'inscrire
      </button>
    </form>
  );
};
```

### 2. Dashboard with Status Banner

```tsx
import React, { useEffect, useState } from 'react';
import { ArtisanStatusBanner, ArtisanStatusBadge } from '@/components/ArtisanStatusComponents';

const Dashboard: React.FC = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Load user from token
    const token = localStorage.getItem('authToken');
    fetch('http://localhost:3001/api/users/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setUser(data.user));
  }, []);

  if (!user) return <div>Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Status Banner */}
      <ArtisanStatusBanner
        demandeArtisan={user.demande_artisan}
        artisanApprouve={user.artisan_approuve}
      />

      {/* User Profile Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {user.prenom} {user.nom}
            </h1>
            <p className="text-gray-600">{user.email}</p>
          </div>
          <ArtisanStatusBadge
            typeCompte={user.type_compte}
            demandeArtisan={user.demande_artisan}
            artisanApprouve={user.artisan_approuve}
            size="lg"
          />
        </div>
      </div>

      {/* Dashboard content */}
    </div>
  );
};
```

### 3. Back-Office Admin Panel

```tsx
const AdminArtisanRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'all'>('pending');

  useEffect(() => {
    loadRequests();
  }, [filter]);

  const loadRequests = async () => {
    const token = localStorage.getItem('boAuthToken');
    const res = await fetch(
      `http://localhost:3001/api/users/admin/artisan-requests?status=${filter}`,
      { headers: { 'Authorization': `Bearer ${token}` }}
    );
    const data = await res.json();
    setRequests(data);
  };

  const handleApprove = async (id: number) => {
    const adminId = getCurrentAdminId(); // From BO auth context
    const note = prompt('Note (optionnel):');
    
    await fetch(
      `http://localhost:3001/api/users/admin/artisan-requests/${id}/approve`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('boAuthToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ admin_id: adminId, note }),
      }
    );
    
    loadRequests();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Demandes Artisan/Promoteur</h1>
      
      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('pending')}
          className={filter === 'pending' ? 'bg-yellow-500 text-white' : 'bg-gray-200'}
        >
          En attente ({requests.filter(r => !r.artisan_approuve).length})
        </button>
        <button
          onClick={() => setFilter('approved')}
          className={filter === 'approved' ? 'bg-green-500 text-white' : 'bg-gray-200'}
        >
          Approuvées
        </button>
        <button
          onClick={() => setFilter('all')}
          className={filter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200'}
        >
          Toutes
        </button>
      </div>

      {/* Requests table */}
      <table className="w-full bg-white rounded-lg shadow">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-4 py-3 text-left">Nom</th>
            <th className="px-4 py-3 text-left">Email</th>
            <th className="px-4 py-3 text-left">Téléphone</th>
            <th className="px-4 py-3 text-left">Date demande</th>
            <th className="px-4 py-3 text-left">Statut</th>
            <th className="px-4 py-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map(request => (
            <tr key={request.id} className="border-t">
              <td className="px-4 py-3">{request.nom_complet}</td>
              <td className="px-4 py-3">{request.email}</td>
              <td className="px-4 py-3">{request.telephone}</td>
              <td className="px-4 py-3">{formatDate(request.created_at)}</td>
              <td className="px-4 py-3">
                {request.artisan_approuve ? (
                  <span className="text-green-600 font-medium">✓ Approuvé</span>
                ) : (
                  <span className="text-yellow-600 font-medium">⏳ En attente</span>
                )}
              </td>
              <td className="px-4 py-3">
                {!request.artisan_approuve && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(request.id)}
                      className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                    >
                      Approuver
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Rejeter
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

## Migration Instructions

### 1. Run the Database Migration

```bash
# Connect to MySQL
mysql -u root -p boukir

# Run the migration
source backend/migrations/2025-12-12-merge-contacts-users-ecommerce.sql
```

### 2. Verify Migration

```sql
-- Check new columns exist
DESCRIBE contacts;

-- Verify existing contacts are preserved
SELECT COUNT(*) FROM contacts WHERE auth_provider = 'none';

-- Check no e-commerce users exist yet
SELECT COUNT(*) FROM contacts WHERE auth_provider != 'none';
```

### 3. Restart Backend

```bash
cd backend
npm run server
```

### 4. Test Authentication Flow

1. Register new user with Artisan request
2. Verify user gets `demande_artisan = TRUE`, `type_compte = 'Client'`
3. Login to BO as admin
4. Approve the request
5. User logs in again and sees Artisan status

## Important Notes

### Backward Compatibility
- **All existing BO contacts are preserved** with `auth_provider = 'none'`
- BO contacts are **excluded from e-commerce authentication** queries
- `nom_complet` field maintained for BO compatibility
- All existing BO functionality continues to work unchanged

### Security Considerations
- Artisan approval requires BO admin authentication
- E-commerce users cannot access BO endpoints
- BO users cannot access e-commerce auth endpoints
- Separate JWT tokens for BO and e-commerce sessions

### Email Uniqueness
- Email must be unique across entire contacts table
- A user cannot register with SSO if email exists as local account
- A user cannot register locally if email exists as SSO account
- BO contacts can be converted to e-commerce users by setting `auth_provider`

## Future Enhancements

1. **Email Notifications**
   - Send email when artisan request is approved/rejected
   - Welcome email on registration
   - Password reset functionality

2. **Document Upload**
   - Allow artisans to upload business documents
   - Store in `backend/uploads/artisan-docs/`
   - Link to `demande_artisan` requests

3. **Approval History**
   - Track all approval/rejection events
   - Admin audit log for artisan decisions

4. **Artisan-Specific Features**
   - Custom pricing tiers
   - Project management dashboard
   - Bulk ordering capabilities
   - Priority support tickets

## Support

For questions or issues with the authentication system:
- Check backend logs: `backend/logs/`
- Review audit logs: `SELECT * FROM audit_logs WHERE table_name = 'contacts'`
- Test endpoints with Postman collection (TBD)
