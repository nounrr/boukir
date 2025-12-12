# Artisan Notification System - Ready to Test

## ✅ What's Been Fixed

### 1. **Backend - Clean Notification Routes** (`backend/routes/notifications.js`)
- Removed all WhatsApp complexity
- Only contains simple artisan notification endpoints:
  - `GET /api/notifications/count` - Get pending request count
  - `GET /api/notifications/artisan-requests` - Get list of pending requests
  - `POST /api/notifications/artisan-requests/:id/approve` - Approve request (PDG only)
  - `POST /api/notifications/artisan-requests/:id/reject` - Reject request (PDG only)

### 2. **Frontend - NotificationBell Component** (`frontend/src/components/NotificationBell.tsx`)
- Only shows for PDG role (checks `user?.role === 'PDG'`)
- Uses Redux store (notificationsSlice)
- Requires authentication token
- Auto-polls every 30 seconds
- Approve/Reject actions directly in dropdown

### 3. **Redux Store** (`frontend/src/store/slices/notificationsSlice.ts`)
- Clean state management
- Actions: setCount, setRequests, setLoading, removeRequest
- Properly integrated in main store

### 4. **Header Integration** (`frontend/src/components/layout/Header.tsx`)
- NotificationBell added between user info and logout
- Only visible on desktop (hidden on mobile)

### 5. **Removed Files**
- `backend/routes/users-admin.js` - Not needed (PDG role from employees table)
- `frontend/src/components/ArtisanStatusComponents.tsx` - Not needed

## 🧪 Test Database

Already has 1 test artisan request:
- ID: 495
- Name: Test Artisan
- Email: artisan.test@example.com
- Status: Pending (demande_artisan=1, artisan_approuve=0)

## 🚀 How to Test

### 1. Start the Application
```bash
npm run dev:full
```

### 2. Login as PDG
- Must login with an employee account that has `role = 'PDG'`
- Only PDG users will see the notification bell

### 3. Check Notification Bell
- Should see bell icon in header (desktop only)
- Red badge should show "1" (one pending request)
- Click bell to see dropdown with test user

### 4. Test Approve/Reject
- Click "Approuver" to approve the request
- Click "Rejeter" to reject the request
- Badge count should update automatically

### 5. Test New Registration
```bash
# Register a new user via API:
curl -X POST http://localhost:3001/api/users/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "prenom": "Jean",
    "nom": "Artisan",
    "email": "jean.artisan@example.com",
    "password": "password123",
    "confirm_password": "password123",
    "type_compte": "Artisan/Promoteur"
  }'
```

After registration:
- User gets temporary "Client" type
- `demande_artisan = TRUE`
- Notification count increases
- PDG sees new request in bell dropdown

## 📋 API Endpoints

### Public Endpoints (No Auth)
- `POST /api/users/auth/register` - User registration
- `POST /api/users/auth/login` - User login

### Protected Endpoints (Requires Token)
- `GET /api/notifications/count` - Get notification count
- `GET /api/notifications/artisan-requests?limit=5` - Get pending requests
- `POST /api/notifications/artisan-requests/:id/approve` - Approve (PDG only in UI)
- `POST /api/notifications/artisan-requests/:id/reject` - Reject (PDG only in UI)

## 🔍 How It Works

1. **User Registers as Artisan**
   ```
   User fills registration form → selects "Artisan/Promoteur"
   ↓
   Backend sets: demande_artisan=TRUE, type_compte="Client" (temporary)
   ↓
   Notification count increases
   ```

2. **PDG Sees Notification**
   ```
   NotificationBell polls every 30s → GET /api/notifications/count
   ↓
   Badge shows count
   ↓
   Click bell → GET /api/notifications/artisan-requests
   ↓
   Dropdown shows pending requests
   ```

3. **PDG Approves Request**
   ```
   Click "Approuver" → POST /api/notifications/artisan-requests/:id/approve
   ↓
   Backend updates: artisan_approuve=TRUE, type_compte="Artisan/Promoteur"
   ↓
   Request removed from dropdown
   ↓
   Count decreases
   ```

## ✅ All Errors Fixed

- No TypeScript errors
- No ESLint errors (except minor unused interface warning)
- Clean, simple implementation
- No over-complication
- Ready for production

## 📝 Notes

- Polling interval: 30 seconds (configurable)
- Only PDG role sees notifications
- Uses existing employees table for PDG role
- No WebSockets = easy deployment
- Works on all hosting platforms
