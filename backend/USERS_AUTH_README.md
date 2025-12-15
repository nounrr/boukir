# E-Commerce User Authentication System

## Overview
Complete authentication system for e-commerce platform with support for:
- Traditional email/password registration and login
- Google OAuth SSO
- Facebook OAuth SSO
- Secure JWT-based authentication
- Account security features (login attempts, account locking)

---

## Database Schema

### `users` Table
Created by migration: `2025-12-10-create-users-table.sql`

**Key Fields:**
- `id` - Primary key
- `prenom`, `nom` - First and last name
- `email` - Unique email address
- `telephone` - Phone number (optional)
- `type_compte` - Account type: 'Client' or 'Artisan/Promoteur'
- `password` - Bcrypt hashed (NULL for SSO-only accounts)
- `auth_provider` - 'local', 'google', or 'facebook'
- `google_id`, `facebook_id` - SSO provider IDs
- `avatar_url` - Profile picture URL
- `email_verified` - Email verification status
- `is_active`, `is_blocked` - Account status flags
- `login_attempts`, `locked_until` - Security features

---

## API Endpoints

### Base URL: `/api/users/auth`

All endpoints are **PUBLIC** (no JWT token required for authentication endpoints)

---

### 1. **Traditional Registration**
```http
POST /api/users/auth/register
```

**Request Body:**
```json
{
  "prenom": "Ahmed",
  "nom": "Benali",
  "email": "ahmed.benali@example.com",
  "telephone": "0612345678",
  "type_compte": "Client",
  "password": "SecurePass123",
  "confirm_password": "SecurePass123"
}
```

**Success Response (201):**
```json
{
  "message": "Compte créé avec succès",
  "user": {
    "id": 1,
    "prenom": "Ahmed",
    "nom": "Benali",
    "email": "ahmed.benali@example.com",
    "telephone": "0612345678",
    "type_compte": "Client",
    "auth_provider": "local",
    "email_verified": false,
    "avatar_url": null,
    "locale": "fr"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**
- `400` - Validation errors (missing fields, invalid email, weak password)
- `409` - Email already exists

---

### 2. **Traditional Login**
```http
POST /api/users/auth/login
```

**Request Body:**
```json
{
  "email": "ahmed.benali@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200):**
```json
{
  "message": "Connexion réussie",
  "user": {
    "id": 1,
    "prenom": "Ahmed",
    "nom": "Benali",
    "email": "ahmed.benali@example.com",
    "telephone": "0612345678",
    "type_compte": "Client",
    "auth_provider": "local",
    "email_verified": false,
    "avatar_url": null,
    "locale": "fr"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**
- `401` - Invalid credentials
- `403` - Account is SSO-only (error_type: "SSO_ACCOUNT_ONLY")
- `403` - Account locked or blocked

**Special Case - SSO Account:**
```json
{
  "message": "Ce compte a été créé avec Google. Veuillez vous connecter avec Google.",
  "error_type": "SSO_ACCOUNT_ONLY",
  "sso_provider": "google"
}
```

---

### 3. **Google OAuth Login/Register**
```http
POST /api/users/auth/google
```

**Request Body:**
```json
{
  "credential": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjRkOGE...",
  "access_token": "ya29.a0AfH6SMBx..."
}
```

**How to get the credential:**
Use Google Sign-In JavaScript library:
```javascript
// Frontend code
google.accounts.id.initialize({
  client_id: 'YOUR_GOOGLE_CLIENT_ID',
  callback: async (response) => {
    // Send response.credential to backend
    const result = await fetch('/api/users/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        credential: response.credential 
      })
    });
  }
});
```

**Success Response (200):**
```json
{
  "message": "Connexion réussie avec Google",
  "user": {
    "id": 2,
    "prenom": "Ahmed",
    "nom": "Benali",
    "email": "ahmed.benali@gmail.com",
    "telephone": null,
    "type_compte": "Client",
    "auth_provider": "google",
    "email_verified": true,
    "avatar_url": "https://lh3.googleusercontent.com/a/...",
    "locale": "fr"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**
- `401` - Invalid Google token
- `409` - Email exists with different auth method

---

### 4. **Facebook OAuth Login/Register**
```http
POST /api/users/auth/facebook
```

**Request Body:**
```json
{
  "accessToken": "EAABwzLixnjYBAOZBZC...",
  "userID": "10223456789012345"
}
```

**How to get the credentials:**
Use Facebook JavaScript SDK:
```javascript
// Frontend code
FB.login(function(response) {
  if (response.authResponse) {
    const result = await fetch('/api/users/auth/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: response.authResponse.accessToken,
        userID: response.authResponse.userID
      })
    });
  }
}, {scope: 'public_profile,email'});
```

**Success Response (200):**
```json
{
  "message": "Connexion réussie avec Facebook",
  "user": {
    "id": 3,
    "prenom": "Ahmed",
    "nom": "Benali",
    "email": "ahmed.benali@facebook.com",
    "telephone": null,
    "type_compte": "Client",
    "auth_provider": "facebook",
    "email_verified": true,
    "avatar_url": "https://platform-lookaside.fbsbx.com/...",
    "locale": "fr"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**
- `400` - Facebook email not provided
- `401` - Invalid Facebook token
- `409` - Email exists with different auth method

---

### 5. **Get Current User**
```http
GET /api/users/auth/me
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "user": {
    "id": 1,
    "prenom": "Ahmed",
    "nom": "Benali",
    "email": "ahmed.benali@example.com",
    "telephone": "0612345678",
    "type_compte": "Client",
    "auth_provider": "local",
    "email_verified": false,
    "avatar_url": null,
    "locale": "fr",
    "last_login_at": "2025-12-10T10:30:00.000Z",
    "created_at": "2025-12-10T08:00:00.000Z"
  }
}
```

**Error Responses:**
- `401` - Missing or invalid token
- `404` - User not found

---

### 6. **Logout**
```http
POST /api/users/auth/logout
```

**Response (200):**
```json
{
  "message": "Déconnexion réussie"
}
```

Note: JWT logout is primarily client-side (remove token from storage)

---

## Security Features

### 1. **Account Locking**
- After 5 failed login attempts, account is locked for 15 minutes
- `locked_until` field stores lock expiration time
- Automatic unlock after timeout

### 2. **Password Requirements**
- Minimum 8 characters
- Stored as bcrypt hash (cost factor: 10)
- NULL for SSO-only accounts

### 3. **SSO Account Protection**
If a user creates an account via Google/Facebook:
- Their password field is NULL
- Attempting to login with email/password returns:
  ```json
  {
    "message": "Ce compte a été créé avec Google. Veuillez vous connecter avec Google.",
    "error_type": "SSO_ACCOUNT_ONLY",
    "sso_provider": "google"
  }
  ```

### 4. **Email Uniqueness**
- Each email can only have ONE authentication method
- If email exists with 'local', cannot create Google/Facebook account
- If email exists with 'google', cannot create local/Facebook account
- Clear error messages guide users to correct login method

### 5. **IP Tracking**
- `last_login_ip` stores last successful login IP
- Can be used for security monitoring

---

## Environment Variables Setup

### Required Variables
Add these to your `.env` file:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5174/auth/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=your-app-id
FACEBOOK_APP_SECRET=your-app-secret
FACEBOOK_REDIRECT_URI=http://localhost:5174/auth/facebook/callback

# JWT (should already exist)
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
```

### Getting OAuth Credentials

**Google:**
1. Go to https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable "Google+ API"
4. Go to Credentials → Create Credentials → OAuth client ID
5. Application type: Web application
6. Add authorized JavaScript origins: `http://localhost:5174`
7. Add authorized redirect URIs: `http://localhost:5174/auth/google/callback`
8. Copy Client ID and Client Secret

**Facebook:**
1. Go to https://developers.facebook.com/apps/
2. Create a new app → Consumer
3. Add Facebook Login product
4. Settings → Basic: Copy App ID and App Secret
5. Facebook Login Settings:
   - Valid OAuth Redirect URIs: `http://localhost:5174/auth/facebook/callback`
   - Allowed Domains for the JavaScript SDK: `localhost`

---

## Migration Instructions

### 1. Run the Migration
```bash
# Connect to MySQL
mysql -u root -p boukir < backend/migrations/2025-12-10-create-users-table.sql
```

Or use your preferred MySQL client.

### 2. Verify Table Creation
```sql
DESCRIBE users;
SELECT * FROM users;
```

---

## Testing the API

### 1. Test Traditional Registration
```bash
curl -X POST http://localhost:3001/api/users/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "prenom": "Test",
    "nom": "User",
    "email": "test@example.com",
    "telephone": "0612345678",
    "type_compte": "Client",
    "password": "password123",
    "confirm_password": "password123"
  }'
```

### 2. Test Traditional Login
```bash
curl -X POST http://localhost:3001/api/users/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 3. Test Get Current User
```bash
curl -X GET http://localhost:3001/api/users/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Frontend Integration Examples

### React with Fetch API

```javascript
// Registration
const register = async (userData) => {
  const response = await fetch('http://localhost:3001/api/users/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  const data = await response.json();
  if (response.ok) {
    localStorage.setItem('token', data.token);
    return data;
  }
  throw new Error(data.message);
};

// Login
const login = async (email, password) => {
  const response = await fetch('http://localhost:3001/api/users/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  
  if (response.status === 403 && data.error_type === 'SSO_ACCOUNT_ONLY') {
    // Show message: "This account uses Google/Facebook login"
    alert(`This account was created with ${data.sso_provider}. Please use ${data.sso_provider} to login.`);
    return;
  }
  
  if (response.ok) {
    localStorage.setItem('token', data.token);
    return data;
  }
  throw new Error(data.message);
};

// Google Login
const loginWithGoogle = (credential) => {
  return fetch('http://localhost:3001/api/users/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential })
  })
  .then(res => res.json())
  .then(data => {
    localStorage.setItem('token', data.token);
    return data;
  });
};

// Facebook Login
const loginWithFacebook = (accessToken, userID) => {
  return fetch('http://localhost:3001/api/users/auth/facebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, userID })
  })
  .then(res => res.json())
  .then(data => {
    localStorage.setItem('token', data.token);
    return data;
  });
};
```

---

## Error Handling Guide

### Common Error Types

| Error Code | error_type | Description | User Action |
|------------|------------|-------------|-------------|
| 403 | SSO_ACCOUNT_ONLY | Account uses SSO | Login with SSO provider |
| 403 | ACCOUNT_BLOCKED | Admin blocked account | Contact support |
| 403 | ACCOUNT_LOCKED | Too many failed attempts | Wait 15 minutes |
| 403 | ACCOUNT_INACTIVE | Account deactivated | Contact support |
| 409 | EMAIL_EXISTS_LOCAL | Email used with password | Login with email/password |
| 409 | EMAIL_EXISTS_GOOGLE | Email used with Google | Login with Google |
| 409 | EMAIL_EXISTS_FACEBOOK | Email used with Facebook | Login with Facebook |

---

## Next Steps

1. ✅ Database migration created and ready
2. ✅ Backend routes implemented
3. ✅ OAuth integration ready
4. 🔲 Add environment variables to `.env`
5. 🔲 Run the migration
6. 🔲 Set up Google OAuth credentials
7. 🔲 Set up Facebook OAuth credentials
8. 🔲 Create frontend registration/login pages
9. 🔲 Integrate Google Sign-In button
10. 🔲 Integrate Facebook Login button

---

## Support

For issues or questions, refer to:
- Google OAuth: https://developers.google.com/identity/protocols/oauth2
- Facebook Login: https://developers.facebook.com/docs/facebook-login/web
- JWT: https://jwt.io/
