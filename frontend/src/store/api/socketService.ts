import { io, Socket } from 'socket.io-client';
import type { AppDispatch } from '../index';
import { setCount, setRequests, setLoading, removeRequest } from '../slices/notificationsSlice';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

let socket: Socket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Initialize socket connection
 */
export function initializeSocket(token: string, dispatch: AppDispatch) {
  // Disconnect existing socket if any
  if (socket?.connected) {
    console.log('🔌 Disconnecting existing socket...');
    socket.disconnect();
  }

  console.log('🔌 Initializing Socket.IO connection...');
  console.log(`  → Server: ${API_BASE_URL}`);

  socket = io(API_BASE_URL, {
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    timeout: 10000,
  });

  console.log('  → Transport: websocket, polling');
  console.log('  → Reconnection enabled (max 5 attempts)');

  // Connection success
  socket.on('connect', () => {
    console.log('✅ Socket.IO connected:', socket?.id);
    reconnectAttempts = 0;
    
    // Fetch initial notification count
    console.log('📊 Fetching initial notification count...');
    fetchNotificationCount(token, dispatch);
  });

  // Connection error
  socket.on('connect_error', (error) => {
    console.error('❌ Socket.IO connection error:', error.message);
    reconnectAttempts++;
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached. Please refresh the page.');
    }
  });

  // Disconnection
  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket.IO disconnected:', reason);
  });

  // Listen for new artisan requests
  socket.on('artisan-request:new', (data) => {
    console.log('📢 New artisan request received:', data);
    console.log('  → Refreshing notification count and requests...');
    
    // Fetch updated count and requests
    fetchNotificationCount(token, dispatch);
    fetchNotificationRequests(token, dispatch);
  });

  // Listen for approved requests
  socket.on('artisan-request:approved', (data) => {
    console.log('✅ Artisan request approved:', data);
    
    // Remove from list and decrement count
    dispatch(removeRequest(data.contact_id));
  });

  // Listen for rejected requests
  socket.on('artisan-request:rejected', (data) => {
    console.log('❌ Artisan request rejected:', data);
    
    // Remove from list and decrement count
    dispatch(removeRequest(data.contact_id));
  });

  // Ping/pong for testing
  socket.on('pong', (data) => {
    console.log('🏓 Pong received:', data);
  });

  return socket;
}

/**
 * Disconnect socket
 */
export function disconnectSocket() {
  if (socket?.connected) {
    console.log('🔌 Disconnecting socket...');
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get current socket instance
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Emit ping event (for testing)
 */
export function sendPing() {
  if (socket?.connected) {
    socket.emit('ping');
  }
}

/**
 * Fetch notification count from API
 */
async function fetchNotificationCount(token: string, dispatch: AppDispatch) {
  try {
    console.log('  → Fetching count from API...');
    const response = await fetch(`${API_BASE_URL}/api/notifications/count`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      const count = data.pending_artisan_requests || 0;
      console.log(`  ✅ Notification count: ${count}`);
      dispatch(setCount(count));
    } else {
      console.error('  ❌ Failed to fetch count:', response.status);
    }
  } catch (error) {
    console.error('  ❌ Error fetching notification count:', error);
  }
}

/**
 * Fetch notification requests from API
 */
async function fetchNotificationRequests(token: string, dispatch: AppDispatch) {
  try {
    dispatch(setLoading(true));
    
    const response = await fetch(`${API_BASE_URL}/api/notifications/artisan-requests?limit=5`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      dispatch(setRequests(data));
    }
  } catch (error) {
    console.error('Error fetching notification requests:', error);
  } finally {
    dispatch(setLoading(false));
  }
}

/**
 * Manual refresh of notifications
 */
export async function refreshNotifications(token: string, dispatch: AppDispatch) {
  await fetchNotificationCount(token, dispatch);
  await fetchNotificationRequests(token, dispatch);
}
