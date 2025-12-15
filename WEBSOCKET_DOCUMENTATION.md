# WebSocket (Socket.IO) Real-Time Notifications System

## Overview
This system provides **real-time notifications** for artisan approval requests using **Socket.IO**, eliminating the need for polling. PDG users receive instant updates when:
- New artisan requests are created
- Requests are approved
- Requests are rejected

---

## Architecture

### Backend (Node.js + Express)

#### 1. **Socket Server** (`backend/socket/socketServer.js`)
- **Port**: Same as HTTP server (default: **3001**)
- **Path**: `/socket.io/`
- **Transport**: WebSocket (with polling fallback)

**Key Functions:**
- `initializeSocketServer(httpServer)` - Initialize Socket.IO with HTTP server
- `getIO()` - Get Socket.IO instance
- `emitToPDG(event, data)` - Broadcast to all PDG users
- `emitToUser(userId, event, data)` - Send to specific user

#### 2. **Authentication Middleware**
Socket connections require JWT token:
```javascript
socket.handshake.auth.token
```

The middleware:
1. Verifies JWT token
2. Loads user from `contacts` table
3. Checks if user is PDG (from `employees` table)
4. Joins PDG users to `pdg-notifications` room

#### 3. **Event Emissions**

**Events Emitted:**

| Event | When | To | Data |
|-------|------|-----|------|
| `artisan-request:new` | User registers as Artisan | PDG room | contact details |
| `artisan-request:approved` | PDG approves request | PDG room | contact_id, nom_complet, email |
| `artisan-request:rejected` | PDG rejects request | PDG room | contact_id |

**Emission Points:**
- `backend/routes/users.js` - Registration (line ~155)
- `backend/routes/notifications.js` - Approve/Reject handlers

---

### Frontend (React + Redux)

#### 1. **Socket Service** (`frontend/src/store/api/socketService.ts`)

**Configuration:**
```typescript
const socket = io('http://localhost:3001', {
  auth: { token },           // JWT authentication
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5
});
```

**Event Listeners:**
- `connect` - Fetch initial notification count
- `artisan-request:new` - Refresh count and requests
- `artisan-request:approved` - Remove from list
- `artisan-request:rejected` - Remove from list

#### 2. **Socket Hook** (`frontend/src/hooks/useSocketConnection.ts`)

Manages socket lifecycle:
- **Connects** when PDG user logs in
- **Disconnects** on logout
- **Auto-reconnects** on connection loss

Usage in `App.tsx`:
```typescript
const AppContent = () => {
  useSocketConnection(); // Automatic management
  // ...
};
```

#### 3. **Redux Integration**

**Actions dispatched by socket events:**
- `setCount(number)` - Update badge count
- `setRequests(array)` - Update requests list
- `removeRequest(id)` - Remove approved/rejected request

---

## Flow Diagrams

### 1. New Artisan Registration

```
User Registration
       ↓
Register as "Artisan/Promoteur"
       ↓
Backend creates contact with demande_artisan=TRUE
       ↓
Socket emits "artisan-request:new" → PDG room
       ↓
All PDG users receive event
       ↓
Frontend fetches updated count & requests
       ↓
Badge updates in real-time ✅
```

### 2. Approve Request

```
PDG clicks "Approuver"
       ↓
POST /api/notifications/artisan-requests/:id/approve
       ↓
Backend updates database
       ↓
Socket emits "artisan-request:approved" → PDG room
       ↓
All PDG users receive event
       ↓
Request removed from dropdown
       ↓
Badge count decrements ✅
```

---

## Connection Details

### Ports
- **HTTP/REST API**: Port **3001** (`http://localhost:3001`)
- **WebSocket**: Port **3001** (`ws://localhost:3001`)
- **Socket.IO Path**: `/socket.io/`

### Authentication
1. User logs in → receives JWT token
2. Token stored in Redux (`state.auth.token`)
3. Socket connects with token in `auth` handshake
4. Backend verifies token and loads user

### Rooms
- `user:{userId}` - Personal room for each user
- `pdg-notifications` - All PDG users join this room

---

## Testing

### 1. Test Socket Connection
Open browser console and check for:
```
🔌 Initializing Socket.IO connection...
✅ Socket.IO connected: <socket-id>
```

### 2. Test New Request Notification

**Terminal 1** (Backend logs):
```bash
npm run dev
```

**Terminal 2** (Register new artisan):
```bash
curl -X POST http://localhost:3001/api/users/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "prenom": "Test",
    "nom": "Artisan",
    "email": "test@example.com",
    "password": "password123",
    "confirm_password": "password123",
    "type_compte": "Artisan/Promoteur"
  }'
```

**Expected in Browser Console:**
```
📢 New artisan request received: { contact_id: 123, ... }
```

**Expected in Backend Logs:**
```
📢 Emitted artisan-request:new to PDG room: { contact_id: 123, ... }
```

### 3. Test Approve/Reject

Click approve/reject in the frontend → check console for events.

---

## Advantages Over Polling

| Feature | Polling (30s) | WebSocket |
|---------|---------------|-----------|
| Latency | Up to 30 seconds | **Instant** |
| Server Load | High (constant requests) | **Low** (push only) |
| Bandwidth | Wastes bandwidth | **Efficient** |
| Scalability | Poor | **Excellent** |
| Real-time | No | **Yes** |

---

## Configuration

### Backend Environment Variables
```env
# .env
PORT=3001
FRONTEND_URL=http://localhost:5173  # CORS for Socket.IO
JWT_SECRET=your-secret-key
```

### Frontend Environment Variables
```env
# .env
VITE_API_BASE_URL=http://localhost:3001
```

---

## Deployment Notes

### Production Considerations

1. **HTTPS/WSS**: Use secure WebSocket (`wss://`) in production
   ```javascript
   const socket = io('https://yourdomain.com', {
     transports: ['websocket', 'polling']
   });
   ```

2. **Load Balancing**: Use sticky sessions for Socket.IO
   - Nginx: `ip_hash` or cookie-based routing
   - AWS ALB: Enable sticky sessions

3. **Redis Adapter** (for multiple servers):
   ```javascript
   import { createAdapter } from '@socket.io/redis-adapter';
   io.adapter(createAdapter(pubClient, subClient));
   ```

4. **CORS Configuration**:
   ```javascript
   io = new Server(httpServer, {
     cors: {
       origin: process.env.FRONTEND_URL,
       credentials: true
     }
   });
   ```

---

## Troubleshooting

### Socket Not Connecting
- Check JWT token is valid
- Verify `VITE_API_BASE_URL` is correct
- Check browser console for errors
- Ensure backend server is running

### Events Not Received
- Check user is PDG role
- Verify socket is connected (`socket.connected`)
- Check backend logs for emission
- Ensure user is in `pdg-notifications` room

### Multiple Connections
- Socket should auto-disconnect on logout
- Check `useSocketConnection` hook cleanup

---

## Code References

### Backend Files
- `/backend/socket/socketServer.js` - Socket.IO server setup
- `/backend/index.js` - Server initialization (lines 1-8, 217-231)
- `/backend/routes/notifications.js` - Event emissions
- `/backend/routes/users.js` - Registration event

### Frontend Files
- `/frontend/src/store/api/socketService.ts` - Socket client logic
- `/frontend/src/hooks/useSocketConnection.ts` - Lifecycle hook
- `/frontend/src/components/NotificationBell.tsx` - UI component
- `/frontend/src/App.tsx` - Socket initialization

---

## Summary

✅ **Real-time notifications** for artisan requests  
✅ **Instant updates** when requests are approved/rejected  
✅ **Automatic reconnection** on connection loss  
✅ **PDG-only access** with JWT authentication  
✅ **Scalable architecture** ready for production  

**No more polling!** 🎉
